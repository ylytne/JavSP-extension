"""Tests for scanner, nfo, cropper, image, and organizer modules."""

import base64
import io
from pathlib import Path
from PIL import Image
import pytest

from app.config import get_config
from app.core.cropper.interface import DefaultCropper, get_cropper
from app.core.image import process_cover_image
from app.core.models import MovieInfo
from app.core.nfo import generate_nfo_content, write_nfo
from app.core.organizer import organize_movie, replace_illegal_chars
from app.core.scanner import scan_directory


def create_dummy_image_base64(width=800, height=533, color="blue") -> str:
    """生成测试用纯色图片的 Base64 编码字符串。"""
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def test_replace_illegal_chars():
    cleaned = replace_illegal_chars("Test: <File>? *Name* | /\\")
    assert ":" not in cleaned
    assert "<" not in cleaned
    assert ">" not in cleaned
    assert "?" not in cleaned
    assert "*" not in cleaned
    assert "|" not in cleaned
    assert "/" not in cleaned
    assert "\\" not in cleaned


def test_cropper():
    cropper = get_cropper()
    assert isinstance(cropper, DefaultCropper)
    # 800x533 horizontal fanart cropped to 2:3 ratio (1.5)
    img = Image.new("RGB", (800, 533), color="red")
    poster = cropper.crop(img, ratio=1.5)
    # poster width should be ~ 533 / 1.5 = 355
    assert poster.height == 533
    assert poster.width == int(533 / 1.5)


def test_cropper_standard_fanza_two_step():
    """验证 800x538 标准海报的两步优化居中裁剪与坐标精确性。"""
    cropper = DefaultCropper()
    # 创建 800x538 图片，背景全黑
    img = Image.new("RGB", (800, 538), color=(0, 0, 0))

    # 在 x=435 涂红 (在 431..789 两步裁剪框内，但在 442..800 传统贴右框外)
    for y in range(538):
        img.putpixel((435, y), (255, 0, 0))

    # 在 x=795 涂绿 (在 442..800 传统贴右框内，但在 431..789 两步裁剪框外)
    for y in range(538):
        img.putpixel((795, y), (0, 255, 0))

    # 1. 开启 standard_fanza_crop
    poster_opt = cropper.crop(img, ratio=1.5, standard_fanza_crop=True)
    assert poster_opt.size == (358, 538)
    # 验证红色像素点保留 (在 poster 坐标系中 x = 435 - 431 = 4)
    assert poster_opt.getpixel((4, 10)) == (255, 0, 0)
    # 验证绿色像素点已被安全剔除 (避开了右侧出血位)
    row_colors = [poster_opt.getpixel((x, 10)) for x in range(358)]
    assert (0, 255, 0) not in row_colors

    # 2. 关闭 standard_fanza_crop (走传统靠右贴边裁剪)
    poster_legacy = cropper.crop(img, ratio=1.5, standard_fanza_crop=False)
    assert poster_legacy.size == (358, 538)
    # 验证传统靠右模式下绿色像素点被包含 (x = 795 - 442 = 353)
    assert poster_legacy.getpixel((353, 10)) == (0, 255, 0)
    # 验证红色像素点被切掉
    legacy_row_colors = [poster_legacy.getpixel((x, 10)) for x in range(358)]
    assert (255, 0, 0) not in legacy_row_colors


def test_cropper_standard_fanza_scaled_and_fallback():
    """验证等比放缩 (1600x1076) 命中与非标准尺寸 (800x600) 回退。"""
    cropper = DefaultCropper()

    # 1600x1076 高清展开图
    img_hd = Image.new("RGB", (1600, 1076), color="blue")
    poster_hd = cropper.crop(img_hd, ratio=1.5, standard_fanza_crop=True)
    # target_w = int(1076 / 1.5) = 717
    assert poster_hd.size == (717, 1076)

    # 800x600 (宽高比 1.333，超出标准容差，自动回退到常规贴右裁剪)
    img_non_std = Image.new("RGB", (800, 600), color="yellow")
    # 在最右边缘放置绿色标线
    for y in range(600):
        img_non_std.putpixel((799, y), (0, 255, 0))

    poster_fallback = cropper.crop(img_non_std, ratio=1.5, standard_fanza_crop=True)
    # poster_w = int(600 / 1.5) = 400
    assert poster_fallback.size == (400, 600)
    # 由于回退至最右贴边，最右边缘必定被保留
    assert poster_fallback.getpixel((399, 10)) == (0, 255, 0)


def test_nfo_generation(tmp_path: Path):
    info = MovieInfo(
        dvdid="IPX-177",
        title="测试影片标题",
        ori_title="テスト映画タイトル",
        score="8.50",
        publish_date="2023-01-01",
        duration="120",
        director="测试导演",
        producer="IdeaPocket",
        serial="相思相愛",
        actress=["相沢みなみ"],
        actress_pics={"相沢みなみ": "https://example.com/actress.jpg"},
        genre=["高清", "中文字幕"],
        cover="https://example.com/cover.jpg",
        preview_video="https://example.com/preview.m3u8",
    )
    xml_str = generate_nfo_content(info)
    assert "<title>IPX-177 测试影片标题</title>" in xml_str
    assert "<rating>8.50</rating>" in xml_str
    assert "<uniqueid type=\"num\" default=\"true\">IPX-177</uniqueid>" in xml_str
    assert "<studio>IdeaPocket</studio>" in xml_str
    assert "<actor>" in xml_str
    assert "<name>相沢みなみ</name>" in xml_str
    # 核心安全规范：默认模式下彻底杜绝外部 URL 写入，防止 Jellyfin 产生网络挂起卡死
    assert "<thumb>" not in xml_str
    assert "https://example.com/actress.jpg" not in xml_str

    # 预告片默认关闭：绝不向 NFO 写入外部不稳定/失效的 m3u8
    assert "<trailer>" not in xml_str

    # 验证显式开启 include_trailer 时正确写入 <trailer>
    cfg_trailer = get_config().model_copy(deep=True)
    cfg_trailer.summarizer.nfo.include_trailer = True
    xml_trailer = generate_nfo_content(info, config=cfg_trailer)
    assert "<trailer>https://example.com/preview.m3u8</trailer>" in xml_trailer

    # 验证 local 模式下，当提供 local_actors 时写入本地相对路径
    cfg_local = get_config().model_copy(deep=True)
    cfg_local.summarizer.nfo.actress_thumb_mode = "local"
    xml_local = generate_nfo_content(info, config=cfg_local, local_actors=["相沢みなみ"])
    assert "<thumb>.actors/相沢みなみ.jpg</thumb>" in xml_local

    nfo_file = tmp_path / "movie.nfo"
    written = write_nfo(info, nfo_file)
    assert Path(written).exists()


def test_process_cover_image(tmp_path: Path):
    b64 = create_dummy_image_base64(800, 533)
    fanart_path, poster_path = process_cover_image(
        cover_base64=b64,
        save_dir=tmp_path,
        hard_sub=True,
        uncensored=True,
    )
    assert Path(fanart_path).exists()
    assert Path(poster_path).exists()


def test_scanner_and_organizer(tmp_path: Path, monkeypatch):
    # 临时调小 minimum_size 方便测试
    cfg = get_config()
    monkeypatch.setattr(cfg.scanner, "minimum_size", 100)

    # 在 tmp_path 中创建测试文件
    movie_folder = tmp_path / "incoming"
    movie_folder.mkdir()
    f1 = movie_folder / "IPX-177-CD1.mp4"
    f2 = movie_folder / "IPX-177-CD2.mp4"
    f1.write_bytes(b"dummy video content 1" * 10)
    f2.write_bytes(b"dummy video content 2" * 10)

    scanned = scan_directory(movie_folder)
    assert len(scanned) == 1
    item = scanned[0]
    assert item.dvdid == "IPX-177"
    assert len(item.files) == 2

    # 执行整理
    meta = MovieInfo(
        dvdid="IPX-177",
        title="纯情女友",
        actress=["相沢みなみ"],
        cover="https://example.com/cover.jpg",
    )
    b64 = create_dummy_image_base64(800, 533)
    out_dir = organize_movie(
        files=item.files,
        metadata=meta,
        cover_base64=b64,
        base_output_dir=tmp_path / "organized",
    )
    assert Path(out_dir).exists()
    organized_files = [p.name for p in Path(out_dir).iterdir()]
    assert any("IPX-177-CD1.mp4" in name for name in organized_files)
    assert any("IPX-177-CD2.mp4" in name for name in organized_files)
    assert any(name.endswith(".nfo") for name in organized_files)
    assert any("fanart.jpg" in name for name in organized_files)
    assert any("poster.jpg" in name for name in organized_files)


def test_organizer_hardsub_and_step_callback(tmp_path: Path):
    movie_folder = tmp_path / "in"
    movie_folder.mkdir()
    f1 = movie_folder / "STARS-256.mp4"
    f1.write_bytes(b"dummy video data")

    steps_recorded = []

    def on_step(step, msg):
        steps_recorded.append((step, msg))

    meta = MovieInfo(
        dvdid="STARS-256",
        title="花痴女友",
        actress=["相澤南"],  # should be canonicalized to 相沢みなみ via actress_alias.json
        cover="https://example.com/cover.jpg",
    )
    b64 = create_dummy_image_base64(800, 533)
    out_dir = organize_movie(
        files=[str(f1)],
        metadata=meta,
        cover_base64=b64,
        base_output_dir=tmp_path / "out",
        hard_sub=True,
        uncensored=False,
        on_step=on_step,
    )
    assert Path(out_dir).exists()
    assert "[STARS-256-C]" in out_dir
    # Actress alias resolved:
    assert "相沢みなみ" in out_dir
    files_in_out = [p.name for p in Path(out_dir).iterdir()]
    assert "STARS-256-C.mp4" in files_in_out
    assert any(step == "ORGANIZING_FILES" for step, _ in steps_recorded)
    assert any(step == "WRITING_NFO" for step, _ in steps_recorded)
    assert any(step == "CROPPING_POSTER" for step, _ in steps_recorded)


def test_organizer_actress_alias_and_deduplication(tmp_path: Path):
    """验证包含中日双语多别名的同一女优在归档目录与 NFO 中能正确去重并保留头像。"""
    movie_folder = tmp_path / "in_abf"
    movie_folder.mkdir()
    f1 = movie_folder / "ABF-358.mp4"
    f1.write_bytes(b"dummy video data abf 358")

    meta = MovieInfo(
        dvdid="ABF-358",
        title="究極のぬるぬるオーガズム",
        actress=["涼森玲夢", "涼森れむ"],  # 繁简/中文与日文同女优别名
        actress_pics={"涼森れむ": "https://example.com/remu.jpg"},
        cover="https://example.com/cover.jpg",
    )
    b64 = create_dummy_image_base64(800, 533)
    out_dir = organize_movie(
        files=[str(f1)],
        metadata=meta,
        cover_base64=b64,
        actress_pics_base64={"涼森玲夢": b64},  # 用别名传入头像 Base64
        base_output_dir=tmp_path / "out_abf",
        hard_sub=True,
        uncensored=False,
    )
    p_out = Path(out_dir)
    assert p_out.exists()
    # 目录中必须仅出现一次 涼森れむ，绝不能出现 涼森れむ,涼森れむ
    assert "涼森れむ" in out_dir
    assert "涼森れむ,涼森れむ" not in out_dir
    assert "涼森玲夢" not in out_dir

    # 验证元数据实例同步清洗规整
    assert meta.actress == ["涼森れむ"]
    assert "涼森れむ" in meta.actress_pics

    # 验证生成的 NFO XML 文件（默认不写入有毒外链，彻底杜绝外网卡死）
    nfo_file = p_out / "movie.nfo"
    assert nfo_file.exists()
    nfo_text = nfo_file.read_text(encoding="utf-8")
    assert nfo_text.count("<actor>") == 1
    assert "<name>涼森れむ</name>" in nfo_text
    assert "<thumb>" not in nfo_text
    assert "https://example.com/remu.jpg" not in nfo_text
    assert "<name>涼森玲夢</name>" not in nfo_text

    # 验证本地 .actors/ 目录及别名规范化落盘
    actors_dir = p_out / ".actors"
    assert actors_dir.is_dir()
    assert (actors_dir / "涼森れむ.jpg").is_file()
    assert not (actors_dir / "涼森玲夢.jpg").exists()


def test_scanner_unrecognized_video(tmp_path: Path, monkeypatch):
    cfg = get_config()
    monkeypatch.setattr(cfg.scanner, "minimum_size", 10)

    scan_dir = tmp_path / "unrec"
    scan_dir.mkdir()
    unrec_file = scan_dir / "random_home_video_no_id.mp4"
    unrec_file.write_bytes(b"test data 123456789012345")

    results = scan_directory(scan_dir)
    assert len(results) == 1
    assert results[0].status == "error"
    assert "无法从文件名推测番号" in results[0].errorMsg
    assert results[0].files == [str(unrec_file.resolve())]


def test_scanner_strm_file(tmp_path: Path):
    # .strm pointer file should not be skipped even with default 232MiB minimum_size
    strm_dir = tmp_path / "strm_movies"
    strm_dir.mkdir()
    strm_file = strm_dir / "MIDE-888.strm"
    strm_file.write_text("http://example.com/stream.m3u8", encoding="utf-8")

    results = scan_directory(strm_dir)
    assert len(results) == 1
    assert results[0].dvdid == "MIDE-888"
    assert results[0].status == "pending"


def test_nfo_unknown_placeholder_safe(monkeypatch):
    cfg = get_config()
    monkeypatch.setattr(cfg.summarizer.nfo, "custom_genres_fields", ["{genre}", "{custom_unknown_tag}"])
    info = MovieInfo(
        dvdid="ABC-123",
        title="测试",
        cover="http://example.com/c.jpg",
        genre=["科幻"],
    )
    xml_str = generate_nfo_content(info)
    assert "<genre>科幻</genre>" in xml_str
    assert "{custom_unknown_tag}" in xml_str


def test_organizer_corrupt_image_graceful(tmp_path: Path):
    in_dir = tmp_path / "in"
    in_dir.mkdir()
    vid = in_dir / "IPX-999.mp4"
    vid.write_bytes(b"video data")

    meta = MovieInfo(
        dvdid="IPX-999",
        title="测试优雅容错",
        cover="http://example.com/c.jpg",
    )

    # 传入破损/非法的 Base64 图片数据
    out_dir = organize_movie(
        files=[str(vid)],
        metadata=meta,
        cover_base64="not_a_valid_image_base64_data",
        base_output_dir=tmp_path / "out",
    )

    assert Path(out_dir).exists()
    out_files = [p.name for p in Path(out_dir).iterdir()]
    assert any("IPX-999.mp4" in f for f in out_files)
    assert any(f.endswith(".nfo") for f in out_files)


def test_save_actress_avatars_and_local_thumb(tmp_path: Path):
    """验证女优头像落盘至 .actors/ 隐藏目录、损坏数据跳过及 local 模式下的 NFO 渲染。"""
    from app.core.organizer import save_actress_avatars

    target_dir = tmp_path / "movie_item"
    target_dir.mkdir()

    valid_b64 = create_dummy_image_base64(200, 200)
    pics = {
        "相沢みなみ": valid_b64,
        "涼森玲夢": valid_b64,  # 别名应规整为 涼森れむ
        "破损女优": "corrupted_base64_data",
    }

    saved = save_actress_avatars(pics, target_dir)
    assert "相沢みなみ" in saved
    assert "涼森れむ" in saved
    assert "破损女优" not in saved

    actors_dir = target_dir / ".actors"
    assert actors_dir.is_dir()
    assert (actors_dir / "相沢みなみ.jpg").is_file()
    assert (actors_dir / "涼森れむ.jpg").is_file()
    assert not (actors_dir / "涼森玲夢.jpg").exists()

    # 验证 local 模式下的 NFO
    info = MovieInfo(
        dvdid="TEST-001",
        title="测试",
        actress=["相沢みなみ", "涼森れむ", "无头像女优"],
        cover="http://example.com/c.jpg",
    )
    cfg_local = get_config().model_copy(deep=True)
    cfg_local.summarizer.nfo.actress_thumb_mode = "local"

    xml_text = generate_nfo_content(info, config=cfg_local, local_actors=saved)
    assert "<thumb>.actors/相沢みなみ.jpg</thumb>" in xml_text
    assert "<thumb>.actors/涼森れむ.jpg</thumb>" in xml_text
    # 无本地头像的女优绝不包含 <thumb>
    assert "<actor>\n    <name>无头像女优</name>\n  </actor>" in xml_text
    # 彻底杜绝外网 URL
    assert "http://" not in xml_text and "https://" not in xml_text


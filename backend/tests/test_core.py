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


def test_organizer_actress_alias_and_deduplication(tmp_path: Path, monkeypatch):
    """验证包含中日双语多别名的同一女优在归档目录与 NFO 中能正确去重并保留头像。"""
    cfg = get_config()
    monkeypatch.setattr(cfg.summarizer.actress_avatar, "enabled", True)

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


def test_scanner_small_invalid_files_ignored(tmp_path: Path, monkeypatch):
    """验证子目录下小于阈值的无关/广告/无效小视频不会被错误识别为主影片并引起冲突。"""
    cfg = get_config()
    monkeypatch.setattr(cfg.scanner, "minimum_size", 100)

    movie_dir = tmp_path / "PFES-121"
    movie_dir.mkdir()
    (movie_dir / "有效文件@PFES-121.mp4").write_bytes(b"x" * 200)
    (movie_dir / "应该被排除的无效文件.mp4").write_bytes(b"x" * 50)
    (movie_dir / "应该被排除的无效文件2.mp4").write_bytes(b"x" * 40)
    (movie_dir / "广告.txt").write_text("ad info", encoding="utf-8")

    results = scan_directory(tmp_path)
    assert len(results) == 1
    assert results[0].dvdid == "PFES-121"
    assert results[0].status == "pending"
    assert results[0].errorMsg is None
    assert len(results[0].files) == 1
    assert results[0].files[0].endswith("有效文件@PFES-121.mp4")


def test_scanner_small_slice_merged(tmp_path: Path, monkeypatch):
    """验证多分片影片中体积小于阈值的子片仍能正常合流为多分片影片。"""
    cfg = get_config()
    monkeypatch.setattr(cfg.scanner, "minimum_size", 100)

    movie_dir = tmp_path / "incoming_slices"
    movie_dir.mkdir()
    f1 = movie_dir / "IPX-177-cd1.mp4"
    f2 = movie_dir / "IPX-177-cd2.mp4"
    f1.write_bytes(b"x" * 200)  # >= 100
    f2.write_bytes(b"x" * 50)   # < 100

    results = scan_directory(movie_dir)
    assert len(results) == 1
    assert results[0].dvdid == "IPX-177"
    assert results[0].status == "pending"
    assert len(results[0].files) == 2
    assert results[0].files[0].endswith("IPX-177-cd1.mp4")
    assert results[0].files[1].endswith("IPX-177-cd2.mp4")


def test_scanner_small_trailer_does_not_break_movie(tmp_path: Path, monkeypatch):
    """验证同目录下带有番号特征但小于阈值的预告片/样片不会导致主影片分片冲突报错。"""
    cfg = get_config()
    monkeypatch.setattr(cfg.scanner, "minimum_size", 100)

    movie_dir = tmp_path / "incoming_trailer"
    movie_dir.mkdir()
    f_main = movie_dir / "IPX-177.mp4"
    f_trailer = movie_dir / "IPX-177-trailer.mp4"
    f_main.write_bytes(b"x" * 200)      # >= 100
    f_trailer.write_bytes(b"x" * 50)   # < 100

    results = scan_directory(movie_dir)
    assert len(results) == 1
    assert results[0].dvdid == "IPX-177"
    assert results[0].status == "pending"
    assert len(results[0].files) == 1
    assert results[0].files[0].endswith("IPX-177.mp4")


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


def test_split_by_punc():
    """测试基于常见全半角标点符号的标题断句分割。"""
    from app.core.organizer import split_by_punc

    s1 = "标题的第一句 这应该是标题的第二句话，这应该是标题的第三句。"
    parts1 = split_by_punc(s1)
    assert len(parts1) == 3
    assert parts1[0] == "标题的第一句 "
    assert parts1[1] == "这应该是标题的第二句话，"
    assert parts1[2] == "这应该是标题的第三句。"

    s2 = "没有任何标点的单句标题"
    parts2 = split_by_punc(s2)
    assert parts2 == ["没有任何标点的单句标题"]


def test_truncate_title_for_path_length(tmp_path):
    """测试路径长度限制下的标题智能截短逻辑，绝不返回 None。"""
    from app.core.organizer import truncate_title_for_path_length

    base_folder = tmp_path / "very" / "long" / "nested" / "output" / "directory"
    template = "[{num}] {title}"
    info = {"num": "SNOS-074-C", "title": "短标题"}

    # 1. 正常不超长情况
    res = truncate_title_for_path_length(base_folder, template, info, max_len=500)
    assert res == "短标题"

    # 2. 超长标题，且有标点符号 (split_by_punc 生效)
    long_title_punc = "标题的第一句！这应该是标题的第二句话，这应该是标题的第三句。"
    info_punc = {"num": "SNOS-074-C", "title": long_title_punc}
    # 设定较短 max_len，强制触发截断
    res_punc = truncate_title_for_path_length(
        base_folder, template, info_punc, max_len=len(str(base_folder).encode("utf-8")) + 35
    )
    assert res_punc is not None
    assert "None" not in res_punc
    assert "标题的第一句！" in res_punc

    # 3. 超长标题，无标点符号，无 title_break，强制触发字符循环削减
    long_title_no_punc = "这是一段完全没有任何标点符号的非常非常非常非常非常非常非常非常非常长的影片标题"
    info_no_punc = {"num": "SNOS-074-C", "title": long_title_no_punc}
    res_no_punc = truncate_title_for_path_length(
        base_folder, template, info_no_punc, max_len=len(str(base_folder).encode("utf-8")) + 30
    )
    # 必须成功截短且带省略号，绝不能返回 None
    assert res_no_punc is not None
    assert res_no_punc != "None"
    assert res_no_punc.endswith("…")
    assert len(res_no_punc) < len(long_title_no_punc)


def test_organize_movie_with_ultra_long_title(tmp_path):
    """测试当影片标题导致路径超出限制时，归档目录名不会变成 None，且 NFO 保留完整真实标题。"""
    video_file = tmp_path / "snos-074.mp4"
    video_file.write_bytes(b"dummy video content")

    ultra_long_title = "一二三四五六七八 一二三四五六七八九十一二三四五六七八九十一二三四" * 5
    info = MovieInfo(
        dvdid="SNOS-074",
        title=ultra_long_title,
        actress=["相沢みなみ"],
        cover="http://example.com/cover.jpg",
    )

    out_base = tmp_path / "organized_root"
    out_dir = organize_movie(
        files=[str(video_file)],
        metadata=info,
        base_output_dir=out_base,
        hard_sub=True,  # 会追加 -C 后缀变为 SNOS-074-C
    )

    out_path = Path(out_dir)
    dir_name = out_path.name
    # 验证目录名包含番号 SNOS-074-C 且绝对不包含 "None"
    assert "SNOS-074-C" in dir_name
    assert "None" not in dir_name
    assert dir_name.startswith("[SNOS-074-C]")

    # 验证 NFO 中的 <title> 依然完整保留了原始标题，未被截断或损坏
    nfo_file = out_path / "movie.nfo"
    assert nfo_file.is_file()
    nfo_content = nfo_file.read_text(encoding="utf-8")
    assert f"<title>SNOS-074-C {ultra_long_title}</title>" in nfo_content or ultra_long_title in nfo_content



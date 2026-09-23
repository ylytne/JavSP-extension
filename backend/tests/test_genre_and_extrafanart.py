"""Tests for GenreMap, clean_movie_genres, and extra_fanarts features."""

import base64
import io
from pathlib import Path
from PIL import Image
import pytest

from app.config import get_config, SummarizerExtraFanartsConfig, parse_duration_seconds
from app.core.genre import GenreMap, get_genre_map, clean_movie_genres
from app.core.models import MovieInfo
from app.core.nfo import generate_nfo_content
from app.core.organizer import organize_movie, save_extra_fanarts


def create_dummy_image_data_uri(width=200, height=150, color="green") -> str:
    """生成测试用纯色图片的 Data URI Base64 字符串。"""
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    b64_str = base64.b64encode(buf.getvalue()).decode("utf-8")
    return f"data:image/jpeg;base64,{b64_str}"


def test_genre_map_csv_loading():
    """测试 GenreMap 加载真实 CSV 并正确执行映射与无效项剔除。"""
    g_map = get_genre_map("javbus")
    assert len(g_map) > 0

    # 2h -> 69
    assert g_map.get("2h") == "69"
    # 66 的 translate 为空，在 mapping 中应当被剔除
    assert g_map.get("66") == ""

    test_input = ["2h", "66", "未知分类标签", "2h", " "]
    cleaned = g_map.map(test_input)

    # 66 和空白项被剔除，2h 转换为 69 且去重，保留未知标签
    assert cleaned == ["69", "未知分类标签"]


def test_genre_map_alias_translation():
    """测试通过日文/繁体别名标签直接规范化。"""
    g_map = get_genre_map("javbus")
    # 'シックスナイン' -> '69'
    res = g_map.map(["シックスナイン"])
    assert res == ["69"]


def test_clean_movie_genres():
    """测试 MovieInfo 经过 clean_movie_genres 后的规范化。"""
    info = MovieInfo(
        dvdid="TEST-001",
        title="测试作品",
        cover="https://example.com/cover.jpg",
        genre_id=["2h", "66"],
        genre=["シックスナイン", "独占作品"],
    )
    cleaned = clean_movie_genres(info)
    # 2h 与 シックスナイン 都映射为 69，66 为空剔除，独占作品保留
    assert "69" in cleaned
    assert "独占作品" in cleaned
    assert "66" not in cleaned
    assert info.genre_norm == cleaned
    assert info.genre == cleaned


def test_nfo_contains_cleaned_genres():
    """测试生成的 NFO 中包含清洗规范化后的标签分类。"""
    info = MovieInfo(
        dvdid="TEST-002",
        title="测试作品2",
        cover="https://example.com/cover.jpg",
        genre_id=["2h"],
        genre=["66"],  # 66 为空项应被清洗掉
    )
    xml_content = generate_nfo_content(info)
    assert "<genre>69</genre>" in xml_content
    assert "<genre>66</genre>" not in xml_content


def test_genre_canonical_deduplication_traditional_and_simplified():
    """测试多源合并时繁体与简体分类（如 單體作品 vs 单体作品）能够被精准统一规范化并去重。"""
    info = MovieInfo(
        dvdid="TEST-003",
        title="测试作品3",
        cover="https://example.com/cover.jpg",
        genre_id=["f", "tags?c7=28"],
        genre=["單體作品", "单体作品"],
    )
    cleaned = clean_movie_genres(info)
    assert cleaned == ["单体作品"]
    assert "單體作品" not in cleaned

    xml_content = generate_nfo_content(info)
    assert "<genre>单体作品</genre>" in xml_content
    assert "<tag>单体作品</tag>" in xml_content
    assert "<genre>單體作品</genre>" not in xml_content
    assert "<tag>單體作品</tag>" not in xml_content


def test_extra_fanarts_config_parsing():
    """测试 extra_fanarts 配置模型与时间字符串解析。"""
    assert parse_duration_seconds(0.5) == 0.5
    assert parse_duration_seconds("PT1.5S") == 1.5
    assert parse_duration_seconds("PT2S") == 2.0
    assert parse_duration_seconds("3") == 3.0

    cfg = SummarizerExtraFanartsConfig(enabled=True, scrap_interval="PT2S")
    assert cfg.enabled is True
    assert cfg.scrap_interval_seconds == 2.0
    assert cfg.uniform_sampling is True

    cfg_custom = SummarizerExtraFanartsConfig(uniform_sampling=False)
    assert cfg_custom.uniform_sampling is False


def test_save_extra_fanarts_base64(tmp_path: Path):
    """测试使用 Base64 数据保存剧照并转为 0.jpg, 1.jpg。"""
    pic1 = create_dummy_image_data_uri(160, 90, "blue")
    pic2 = create_dummy_image_data_uri(160, 90, "yellow")
    pics = [pic1, pic2, "invalid-b64-string"]

    saved = save_extra_fanarts(
        extra_fanarts_base64=pics,
        target_dir=tmp_path,
    )
    assert saved == 2

    extrafanart_dir = tmp_path / "extrafanart"
    assert extrafanart_dir.is_dir()

    f0 = extrafanart_dir / "0.jpg"
    f1 = extrafanart_dir / "1.jpg"
    assert f0.is_file()
    assert f1.is_file()

    with Image.open(f0) as im:
        assert im.format == "JPEG"
        assert im.size == (160, 90)


def test_organize_movie_with_extrafanart(tmp_path: Path, monkeypatch):
    """测试 organize_movie 整合前端传输的剧照 Base64 落地。"""
    cfg = get_config()
    monkeypatch.setattr(cfg.summarizer.extra_fanarts, "enabled", True)

    # 准备视频源文件
    source_dir = tmp_path / "incoming"
    source_dir.mkdir()
    video_file = source_dir / "MIDE-001.mp4"
    video_file.write_bytes(b"dummy video content")

    pic1 = create_dummy_image_data_uri(100, 100, "pink")
    info = MovieInfo(
        dvdid="MIDE-001",
        title="剧照测试电影",
        cover="https://example.com/cover.jpg",
        genre_id=["2h"],
        preview_pics=[pic1],
    )

    organized_dir_str = organize_movie(
        files=[str(video_file)],
        metadata=info,
        extra_fanarts_base64=[pic1],
        base_output_dir=tmp_path / "out",
    )
    organized_dir = Path(organized_dir_str)
    assert organized_dir.is_dir()

    # 检查 extrafanart 目录
    extra_dir = organized_dir / "extrafanart"
    assert extra_dir.is_dir()
    assert (extra_dir / "0.jpg").is_file()

    # 检查 NFO 中的分类已被规范化
    nfo_file = organized_dir / "movie.nfo"
    assert nfo_file.is_file()
    nfo_text = nfo_file.read_text(encoding="utf-8")
    assert "<genre>69</genre>" in nfo_text


def test_unmapped_genre_id_fallback_to_text():
    """测试未在字典收录的 genre_id 优先回退到人类可读文本，不泄漏内部 ID 字符串。"""
    info = MovieInfo(
        dvdid="TEST-FALLBACK-01",
        title="测试回退",
        cover="https://example.com/cover.jpg",
        genre_id=["2h", "66", "unmapped_tag_slug_123"],
        genre=["69", "AV OPEN 2014 スーパーヘビー", "独家新分类"],
    )
    cleaned = clean_movie_genres(info)
    # 2h -> 69
    assert "69" in cleaned
    # 66 -> 显式剔除，对应的 AV OPEN 也被剔除
    assert "66" not in cleaned
    assert "AV OPEN 2014 スーパーヘビー" not in cleaned
    # unmapped_tag_slug_123 -> 回退至 '独家新分类'，不得出现 slug
    assert "独家新分类" in cleaned
    assert "unmapped_tag_slug_123" not in cleaned
    assert cleaned == ["69", "独家新分类"]


def test_unified_genre_map_priority_javbus_over_javlib():
    """测试统一映射表遵循爬虫站点优先级，JavBus 高优先级定义不被后加载覆盖。"""
    unified_map = get_genre_map("unified")
    # 'dy' 在 javbus 为 '运动员'，在 javlib 为 '各种职业'
    assert unified_map.get("dy") == "运动员"


def test_save_extra_fanarts_rejects_html_and_maintains_consecutive_indices(tmp_path: Path):
    """测试剧照下载时校验图片合法性，拦截 HTML 假图，且无空洞连续编号 (0.jpg, 1.jpg)。"""
    pic1 = create_dummy_image_data_uri(100, 100, "red")
    # 假冒图片的 HTML 文本
    pic2_html_b64 = "data:text/html;base64," + base64.b64encode(b"<html><title>403 Blocked</title></html>").decode("utf-8")
    pic3 = create_dummy_image_data_uri(100, 100, "green")

    saved = save_extra_fanarts(
        extra_fanarts_base64=[pic1, pic2_html_b64, pic3],
        target_dir=tmp_path,
    )
    # pic1 (合法图片) 成功, pic2 (HTML 伪造图片) 校验拦截, pic3 (合法图片) 成功
    assert saved == 2

    extra_dir = tmp_path / "extrafanart"
    f0 = extra_dir / "0.jpg"
    f1 = extra_dir / "1.jpg"
    f2 = extra_dir / "2.jpg"

    assert f0.is_file()
    assert f1.is_file()
    assert not f2.exists(), "不应产生不连续的 2.jpg 或残留无效图片"

    # 验证保存的均是合法 JPEG 图片
    with Image.open(f0) as im0, Image.open(f1) as im1:
        assert im0.format == "JPEG"
        assert im1.format == "JPEG"


def test_save_extra_fanarts_cleans_stale_files(tmp_path: Path):
    """测试重新整理剧照时自动清理旧的残留文件。"""
    extra_dir = tmp_path / "extrafanart"
    extra_dir.mkdir()
    # 模拟上一轮留下的 0.jpg, 1.jpg, 2.jpg
    (extra_dir / "0.jpg").write_bytes(b"old")
    (extra_dir / "1.jpg").write_bytes(b"old")
    (extra_dir / "2.jpg").write_bytes(b"old")

    pic1 = create_dummy_image_data_uri(80, 80, "cyan")
    saved = save_extra_fanarts(
        extra_fanarts_base64=[pic1],
        target_dir=tmp_path,
    )
    assert saved == 1
    assert (extra_dir / "0.jpg").is_file()
    assert not (extra_dir / "1.jpg").exists(), "残留的 1.jpg 应被清理"
    assert not (extra_dir / "2.jpg").exists(), "残留的 2.jpg 应被清理"


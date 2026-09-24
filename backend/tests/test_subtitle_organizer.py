"""同名字幕归档与重命名功能测试套件。"""

from pathlib import Path
import pytest

from app.config import get_config
from app.core.models import MovieInfo
from app.core.organizer import find_associated_subtitles, organize_movie


def test_find_associated_subtitles(tmp_path: Path):
    """测试 find_associated_subtitles 匹配规则：支持严格同名与语言后缀，忽略无关文件。"""
    video = tmp_path / "111777@IPX-111.mp4"
    video.write_bytes(b"dummy video")

    s1 = tmp_path / "111777@IPX-111.srt"
    s1.write_text("1\n00:00:01 --> 00:00:02\nTest", encoding="utf-8")
    s2 = tmp_path / "111777@IPX-111.zh.ass"
    s2.write_text("[Script Info]", encoding="utf-8")
    s3 = tmp_path / "111777@IPX-111.chs.forced.vtt"
    s3.write_text("WEBVTT", encoding="utf-8")
    s4 = tmp_path / "111777@IPX-111.idx"
    s4.write_text("VobSub", encoding="utf-8")
    s5 = tmp_path / "111777@IPX-111.sub"
    s5.write_bytes(b"\x00\x01\x02")

    # 无关文件
    other_sub = tmp_path / "OTHER-999.srt"
    other_sub.write_text("other", encoding="utf-8")
    other_similar = tmp_path / "111777@IPX-1111.srt"  # 多了个 1
    other_similar.write_text("similar", encoding="utf-8")
    nfo_file = tmp_path / "111777@IPX-111.nfo"
    nfo_file.write_text("<movie/>", encoding="utf-8")

    sub_exts = [".srt", ".vtt", ".ass", ".ssa", ".sbv", ".idx", ".sub"]
    found = find_associated_subtitles(video, sub_exts)

    found_map = {p.name: remainder for p, remainder in found}
    assert "111777@IPX-111.srt" in found_map
    assert found_map["111777@IPX-111.srt"] == ".srt"

    assert "111777@IPX-111.zh.ass" in found_map
    assert found_map["111777@IPX-111.zh.ass"] == ".zh.ass"

    assert "111777@IPX-111.chs.forced.vtt" in found_map
    assert found_map["111777@IPX-111.chs.forced.vtt"] == ".chs.forced.vtt"

    assert "111777@IPX-111.idx" in found_map
    assert found_map["111777@IPX-111.idx"] == ".idx"

    assert "111777@IPX-111.sub" in found_map
    assert found_map["111777@IPX-111.sub"] == ".sub"

    assert "OTHER-999.srt" not in found_map
    assert "111777@IPX-1111.srt" not in found_map
    assert "111777@IPX-111.nfo" not in found_map


def test_organize_movie_with_single_subtitle_exact_match(tmp_path: Path):
    """测试单个视频文件与严格同名字幕文件的移动与重命名归档。"""
    src_dir = tmp_path / "src"
    src_dir.mkdir()
    video = src_dir / "111777@IPX-111.mp4"
    video.write_bytes(b"dummy video data")
    subtitle = src_dir / "111777@IPX-111.srt"
    subtitle.write_text("sub content", encoding="utf-8")

    meta = MovieInfo(
        dvdid="IPX-111",
        title="纯情女友",
        actress=["相沢みなみ"],
        cover="http://example.com/cover.jpg",
    )

    out_base = tmp_path / "out"
    final_dir = organize_movie(
        files=[str(video)],
        metadata=meta,
        base_output_dir=out_base,
    )

    p_final = Path(final_dir)
    assert p_final.exists()
    assert (p_final / "IPX-111.mp4").is_file()
    assert (p_final / "IPX-111.srt").is_file()
    assert (p_final / "IPX-111.srt").read_text(encoding="utf-8") == "sub content"

    # 源文件已被移走，源文件夹已清空并自动删除
    assert not video.exists()
    assert not subtitle.exists()
    assert not src_dir.exists()


def test_organize_movie_with_language_tag_subtitles(tmp_path: Path):
    """测试带有语言标识及变体后缀的外挂字幕多文件同步归档。"""
    src_dir = tmp_path / "src_multi_sub"
    src_dir.mkdir()
    video = src_dir / "111777@IPX-222.mkv"
    video.write_bytes(b"dummy video")
    sub_zh = src_dir / "111777@IPX-222.zh-CN.srt"
    sub_zh.write_text("zh srt", encoding="utf-8")
    sub_ass = src_dir / "111777@IPX-222.chs.ass"
    sub_ass.write_text("chs ass", encoding="utf-8")

    meta = MovieInfo(
        dvdid="IPX-222",
        title="测试多语言字幕",
        cover="http://example.com/c.jpg",
    )

    final_dir = organize_movie(
        files=[str(video)],
        metadata=meta,
        base_output_dir=tmp_path / "out",
    )
    p_final = Path(final_dir)
    assert (p_final / "IPX-222.mkv").is_file()
    assert (p_final / "IPX-222.zh-CN.srt").is_file()
    assert (p_final / "IPX-222.zh-CN.srt").read_text(encoding="utf-8") == "zh srt"
    assert (p_final / "IPX-222.chs.ass").is_file()
    assert (p_final / "IPX-222.chs.ass").read_text(encoding="utf-8") == "chs ass"


def test_organize_movie_multi_cd_subtitles(tmp_path: Path):
    """测试多分片视频 (-cd1, -cd2) 对应分片字幕的精准归档。"""
    src_dir = tmp_path / "src_cd"
    src_dir.mkdir()
    v1 = src_dir / "111777@IPX-333-cd1.mp4"
    v1.write_bytes(b"v1")
    v2 = src_dir / "111777@IPX-333-cd2.mp4"
    v2.write_bytes(b"v2")

    s1 = src_dir / "111777@IPX-333-cd1.srt"
    s1.write_text("sub1", encoding="utf-8")
    s2 = src_dir / "111777@IPX-333-cd2.srt"
    s2.write_text("sub2", encoding="utf-8")

    meta = MovieInfo(
        dvdid="IPX-333",
        title="分片测试",
        cover="http://example.com/c.jpg",
    )

    final_dir = organize_movie(
        files=[str(v1), str(v2)],
        metadata=meta,
        base_output_dir=tmp_path / "out",
    )
    p_final = Path(final_dir)
    assert (p_final / "IPX-333-CD1.mp4").is_file()
    assert (p_final / "IPX-333-CD2.mp4").is_file()
    assert (p_final / "IPX-333-CD1.srt").is_file()
    assert (p_final / "IPX-333-CD1.srt").read_text(encoding="utf-8") == "sub1"
    assert (p_final / "IPX-333-CD2.srt").is_file()
    assert (p_final / "IPX-333-CD2.srt").read_text(encoding="utf-8") == "sub2"


def test_organize_movie_multi_cd_shared_subtitle(tmp_path: Path):
    """测试多分片视频共用单个总字幕 (如 111777@IPX-444.srt) 的归档行为。"""
    src_dir = tmp_path / "src_shared_sub"
    src_dir.mkdir()
    v1 = src_dir / "111777@IPX-444-cd1.mp4"
    v1.write_bytes(b"v1")
    v2 = src_dir / "111777@IPX-444-cd2.mp4"
    v2.write_bytes(b"v2")

    s_all = src_dir / "111777@IPX-444.srt"
    s_all.write_text("shared sub", encoding="utf-8")

    meta = MovieInfo(
        dvdid="IPX-444",
        title="共用总字幕测试",
        cover="http://example.com/c.jpg",
    )

    final_dir = organize_movie(
        files=[str(v1), str(v2)],
        metadata=meta,
        base_output_dir=tmp_path / "out",
    )
    p_final = Path(final_dir)
    assert (p_final / "IPX-444.srt").is_file()
    assert (p_final / "IPX-444.srt").read_text(encoding="utf-8") == "shared sub"


def test_organize_movie_subtitles_disabled(tmp_path: Path, monkeypatch):
    """测试当 subtitle.enabled = False 时，外挂字幕不随视频移动。"""
    cfg = get_config()
    monkeypatch.setattr(cfg.summarizer.subtitle, "enabled", False)

    src_dir = tmp_path / "src_disabled"
    src_dir.mkdir()
    video = src_dir / "IPX-555.mp4"
    video.write_bytes(b"video")
    sub = src_dir / "IPX-555.srt"
    sub.write_text("sub stay", encoding="utf-8")

    meta = MovieInfo(
        dvdid="IPX-555",
        title="字幕关闭测试",
        cover="http://example.com/c.jpg",
    )

    final_dir = organize_movie(
        files=[str(video)],
        metadata=meta,
        base_output_dir=tmp_path / "out",
    )
    p_final = Path(final_dir)
    assert (p_final / "IPX-555.mp4").is_file()
    assert not (p_final / "IPX-555.srt").exists()

    # 原字幕保留在原目录中
    assert sub.is_file()
    assert sub.read_text(encoding="utf-8") == "sub stay"


def test_organize_movie_hard_link_mode(tmp_path: Path, monkeypatch):
    """测试硬链接模式下，字幕与视频同步创建硬链接，原文件完整保留。"""
    cfg = get_config()
    monkeypatch.setattr(cfg.summarizer.path, "hard_link", True)

    src_dir = tmp_path / "src_hardlink"
    src_dir.mkdir()
    video = src_dir / "IPX-666.mp4"
    video.write_bytes(b"video data for link")
    sub = src_dir / "IPX-666.srt"
    sub.write_text("sub data for link", encoding="utf-8")

    meta = MovieInfo(
        dvdid="IPX-666",
        title="硬链接模式测试",
        cover="http://example.com/c.jpg",
    )

    final_dir = organize_movie(
        files=[str(video)],
        metadata=meta,
        base_output_dir=tmp_path / "out",
    )
    p_final = Path(final_dir)
    dest_video = p_final / "IPX-666.mp4"
    dest_sub = p_final / "IPX-666.srt"

    assert dest_video.is_file()
    assert dest_sub.is_file()

    # 原目录文件依然健在（保种无损）
    assert video.is_file()
    assert sub.is_file()


def test_organize_movie_auto_c_suffix_enabled_and_disabled(tmp_path: Path, monkeypatch):
    """测试 auto_c_suffix 可选配置：开启时为番号与字幕加 -C，关闭时保持原番号。"""
    cfg = get_config()

    # 1. auto_c_suffix = True
    monkeypatch.setattr(cfg.summarizer.subtitle, "auto_c_suffix", True)
    src_dir1 = tmp_path / "src_auto_c"
    src_dir1.mkdir()
    v1 = src_dir1 / "IPX-777.mp4"
    v1.write_bytes(b"v1")
    s1 = src_dir1 / "IPX-777.srt"
    s1.write_text("s1", encoding="utf-8")

    meta1 = MovieInfo(
        dvdid="IPX-777",
        title="自动中字测试",
        cover="http://example.com/c.jpg",
    )
    out1 = organize_movie(
        files=[str(v1)],
        metadata=meta1,
        base_output_dir=tmp_path / "out1",
    )
    p_out1 = Path(out1)
    assert (p_out1 / "IPX-777-C.mp4").is_file()
    assert (p_out1 / "IPX-777-C.srt").is_file()

    # 2. auto_c_suffix = False (默认)
    monkeypatch.setattr(cfg.summarizer.subtitle, "auto_c_suffix", False)
    src_dir2 = tmp_path / "src_no_c"
    src_dir2.mkdir()
    v2 = src_dir2 / "IPX-888.mp4"
    v2.write_bytes(b"v2")
    s2 = src_dir2 / "IPX-888.srt"
    s2.write_text("s2", encoding="utf-8")

    meta2 = MovieInfo(
        dvdid="IPX-888",
        title="无中字后缀测试",
        cover="http://example.com/c.jpg",
    )
    out2 = organize_movie(
        files=[str(v2)],
        metadata=meta2,
        base_output_dir=tmp_path / "out2",
    )
    p_out2 = Path(out2)
    assert (p_out2 / "IPX-888.mp4").is_file()
    assert (p_out2 / "IPX-888.srt").is_file()

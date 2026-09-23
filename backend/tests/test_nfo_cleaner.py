"""NFO 标签清理工具单元测试。"""

from __future__ import annotations

from pathlib import Path
import pytest

from app.core.nfo_cleaner import (
    CleanFileResult,
    CleanSummary,
    clean_nfo_content,
    clean_nfo_directory,
    clean_nfo_file,
    main,
)

SAMPLE_NFO = """<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
  <title>MIDV-404...</title>
  <originaltitle>...</originaltitle>
  <rating>8.66</rating>
  <plot>...</plot>
  <runtime>120</runtime>
  <mpaa>NC-17</mpaa>
  <uniqueid type="num" default="true">MIDV-404</uniqueid>
  <uniqueid type="cid">midv00404</uniqueid>
  <genre>有码</genre>
  <tag>内嵌字幕</tag>
  <country>日本</country>
  <director>ドラゴン西川</director>
  <premiered>2023-06-30</premiered>
  <studio>ムーディーズ</studio>
  <trailer>xxx.mp4</trailer>
  <actor>
    <name>八木奈々</name>
    <thumb>xxx.jpg</thumb>
  </actor>
</movie>
"""


def test_clean_nfo_content_both():
    """测试同时清理 trailer 和 actor.thumb。"""
    cleaned, trailer_cnt, thumb_cnt = clean_nfo_content(
        SAMPLE_NFO,
        clean_trailer=True,
        clean_actor_thumb=True,
    )
    assert trailer_cnt == 1
    assert thumb_cnt == 1
    assert "<trailer>" not in cleaned
    assert "xxx.mp4" not in cleaned
    assert "<thumb>" not in cleaned
    assert "xxx.jpg" not in cleaned
    assert "<actor>" in cleaned
    assert "<name>八木奈々</name>" in cleaned
    assert "<title>MIDV-404...</title>" in cleaned
    assert '<uniqueid type="num" default="true">MIDV-404</uniqueid>' in cleaned
    assert cleaned.startswith('<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>')


def test_clean_nfo_content_only_trailer():
    """测试仅清理 trailer。"""
    cleaned, trailer_cnt, thumb_cnt = clean_nfo_content(
        SAMPLE_NFO,
        clean_trailer=True,
        clean_actor_thumb=False,
    )
    assert trailer_cnt == 1
    assert thumb_cnt == 0
    assert "<trailer>" not in cleaned
    # actor.thumb 应当完整保留
    assert "<thumb>xxx.jpg</thumb>" in cleaned
    assert "<name>八木奈々</name>" in cleaned


def test_clean_nfo_content_only_thumb():
    """测试仅清理 actor.thumb。"""
    cleaned, trailer_cnt, thumb_cnt = clean_nfo_content(
        SAMPLE_NFO,
        clean_trailer=False,
        clean_actor_thumb=True,
    )
    assert trailer_cnt == 0
    assert thumb_cnt == 1
    # trailer 应当完整保留
    assert "<trailer>xxx.mp4</trailer>" in cleaned
    # thumb 应当被移除
    assert "<thumb>" not in cleaned
    assert "<name>八木奈々</name>" in cleaned


def test_clean_nfo_content_none():
    """测试两者都不清理。"""
    cleaned, trailer_cnt, thumb_cnt = clean_nfo_content(
        SAMPLE_NFO,
        clean_trailer=False,
        clean_actor_thumb=False,
    )
    assert trailer_cnt == 0
    assert thumb_cnt == 0
    assert cleaned == SAMPLE_NFO


def test_clean_nfo_content_no_target_tags():
    """测试原本就不包含目标标签的 XML。"""
    xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
  <title>MIDV-404</title>
  <actor>
    <name>八木奈々</name>
  </actor>
</movie>
"""
    cleaned, trailer_cnt, thumb_cnt = clean_nfo_content(xml)
    assert trailer_cnt == 0
    assert thumb_cnt == 0
    assert cleaned == xml


def test_clean_nfo_multiple_actors_and_trailers():
    """测试多个演员与多个预告片标签的场景。"""
    xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
  <title>Test Multi</title>
  <trailer>http://trailer1.mp4</trailer>
  <trailer>http://trailer2.mp4</trailer>
  <actor>
    <name>Actor 1</name>
    <thumb>http://thumb1.jpg</thumb>
  </actor>
  <actor>
    <name>Actor 2</name>
  </actor>
  <actor>
    <name>Actor 3</name>
    <role>Main</role>
    <thumb>http://thumb3.jpg</thumb>
  </actor>
</movie>
"""
    cleaned, trailer_cnt, thumb_cnt = clean_nfo_content(xml)
    assert trailer_cnt == 2
    assert thumb_cnt == 2
    assert "<trailer>" not in cleaned
    assert "<thumb>" not in cleaned
    assert "<name>Actor 1</name>" in cleaned
    assert "<name>Actor 2</name>" in cleaned
    assert "<name>Actor 3</name>" in cleaned
    assert "<role>Main</role>" in cleaned


def test_clean_nfo_file_write_and_backup(tmp_path: Path):
    """测试单个文件清理、写入与备份功能。"""
    nfo_file = tmp_path / "test.nfo"
    nfo_file.write_text(SAMPLE_NFO, encoding="utf-8")

    res = clean_nfo_file(nfo_file, backup=True)
    assert res.changed is True
    assert res.trailer_removed == 1
    assert res.actor_thumb_removed == 1
    assert res.error is None

    # 检查原文件内容已修改
    updated_content = nfo_file.read_text(encoding="utf-8")
    assert "<trailer>" not in updated_content
    assert "<thumb>" not in updated_content

    # 检查备份文件已生成且内容为原内容
    bak_file = tmp_path / "test.nfo.bak"
    assert bak_file.is_file()
    assert "<trailer>xxx.mp4</trailer>" in bak_file.read_text(encoding="utf-8")


def test_clean_nfo_file_dry_run(tmp_path: Path):
    """测试 dry-run 模式下不修改磁盘文件。"""
    nfo_file = tmp_path / "test.nfo"
    nfo_file.write_text(SAMPLE_NFO, encoding="utf-8")

    res = clean_nfo_file(nfo_file, dry_run=True)
    assert res.changed is True
    assert res.trailer_removed == 1
    assert res.actor_thumb_removed == 1

    # 验证磁盘内容保持不变
    content_after = nfo_file.read_text(encoding="utf-8")
    assert "<trailer>xxx.mp4</trailer>" in content_after
    assert "<thumb>xxx.jpg</thumb>" in content_after


def test_clean_nfo_file_invalid_or_missing(tmp_path: Path):
    """测试异常文件（不存在、非 XML、空文件）。"""
    # 1. 不存在
    not_exist = tmp_path / "missing.nfo"
    res = clean_nfo_file(not_exist)
    assert res.error is not None

    # 2. 空文件
    empty_file = tmp_path / "empty.nfo"
    empty_file.write_text("", encoding="utf-8")
    res = clean_nfo_file(empty_file)
    assert res.error == "文件内容为空"

    # 3. 非 XML 语法错误
    bad_xml = tmp_path / "bad.nfo"
    bad_xml.write_text("THIS IS NOT XML <<>>", encoding="utf-8")
    res = clean_nfo_file(bad_xml)
    assert res.error is not None


def test_clean_nfo_directory_recursive(tmp_path: Path):
    """测试目录递归扫描与清理统计。"""
    # 构造目录树
    sub1 = tmp_path / "dir1"
    sub2 = tmp_path / "dir2" / "nested"
    sub1.mkdir(parents=True)
    sub2.mkdir(parents=True)

    f1 = sub1 / "movie1.nfo"
    f1.write_text(SAMPLE_NFO, encoding="utf-8")

    f2 = sub2 / "movie2.NFO"  # 大写扩展名
    f2.write_text(SAMPLE_NFO, encoding="utf-8")

    f3 = tmp_path / "clean.nfo"  # 无需修改
    f3.write_text("<movie><title>Already Clean</title></movie>", encoding="utf-8")

    f4 = tmp_path / "ignore.txt"  # 非 nfo 文件
    f4.write_text("text", encoding="utf-8")

    summary = clean_nfo_directory(tmp_path, recursive=True)
    assert summary.scanned_files == 3
    assert summary.modified_files == 2
    assert summary.total_trailer_removed == 2
    assert summary.total_actor_thumb_removed == 2
    assert summary.error_files == 0
    assert summary.has_changes is True

    # 再次扫描，应为 0 处修改
    summary2 = clean_nfo_directory(tmp_path, recursive=True)
    assert summary2.scanned_files == 3
    assert summary2.modified_files == 0
    assert summary2.has_changes is False


def test_clean_nfo_directory_non_recursive(tmp_path: Path):
    """测试非递归扫描。"""
    sub = tmp_path / "subdir"
    sub.mkdir()

    top_nfo = tmp_path / "top.nfo"
    top_nfo.write_text(SAMPLE_NFO, encoding="utf-8")

    sub_nfo = sub / "sub.nfo"
    sub_nfo.write_text(SAMPLE_NFO, encoding="utf-8")

    summary = clean_nfo_directory(tmp_path, recursive=False)
    # 仅扫描顶层 top.nfo
    assert summary.scanned_files == 1
    assert summary.modified_files == 1
    assert summary.total_trailer_removed == 1

    # 子目录中的文件应保持未修改
    assert "<trailer>xxx.mp4</trailer>" in sub_nfo.read_text(encoding="utf-8")


def test_clean_nfo_cli(tmp_path: Path, capsys: pytest.CaptureFixture):
    """测试命令行执行。"""
    nfo_file = tmp_path / "test.nfo"
    nfo_file.write_text(SAMPLE_NFO, encoding="utf-8")

    ret = main([str(tmp_path), "--dry-run"])
    assert ret == 0
    captured = capsys.readouterr().out
    assert "预览模式(dry-run): 是" in captured
    assert "涉及修改文件: 1 (未实际写入)" in captured
    assert "移除 trailer 标签数: 1" in captured
    assert "移除 actor.thumb 标签数: 1" in captured

    # 实际执行仅清理 trailer
    ret2 = main([str(tmp_path), "--no-thumb"])
    assert ret2 == 0
    captured2 = capsys.readouterr().out
    assert "移除 trailer 标签数: 1" in captured2
    assert "移除 actor.thumb 标签数: 0" in captured2

    # 验证文件
    content = nfo_file.read_text(encoding="utf-8")
    assert "<trailer>" not in content
    assert "<thumb>xxx.jpg</thumb>" in content

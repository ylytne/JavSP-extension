"""NFO 元数据清理工具。

用于扫描指定目录下的 .nfo 文件，选择性清理其中的 <trailer> 标签与 <actor> 下的 <thumb> 标签。
"""

from __future__ import annotations

import argparse
import logging
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

import lxml.etree as etree

logger = logging.getLogger(__name__)

__all__ = [
    "CleanFileResult",
    "CleanSummary",
    "clean_nfo_content",
    "clean_nfo_file",
    "clean_nfo_directory",
    "main",
]


@dataclass
class CleanFileResult:
    """单个 NFO 文件的清理结果。"""

    path: Path
    changed: bool = False
    trailer_removed: int = 0
    actor_thumb_removed: int = 0
    error: str | None = None


@dataclass
class CleanSummary:
    """清理任务的汇总统计。"""

    scanned_files: int = 0
    modified_files: int = 0
    total_trailer_removed: int = 0
    total_actor_thumb_removed: int = 0
    error_files: int = 0
    results: list[CleanFileResult] = field(default_factory=list)

    @property
    def has_changes(self) -> bool:
        """是否存在修改。"""
        return self.modified_files > 0


def clean_nfo_content(
    content: str | bytes,
    clean_trailer: bool = True,
    clean_actor_thumb: bool = True,
) -> tuple[str, int, int]:
    """清理 NFO XML 内容中的 trailer 与 actor.thumb 标签。

    Args:
        content: XML 文本字符串或字节流。
        clean_trailer: 是否清理 <trailer> 标签。
        clean_actor_thumb: 是否清理 <actor> 下的 <thumb> 标签。

    Returns:
        tuple[str, int, int]: (清理后的 XML 文本, 移除的 trailer 数量, 移除的 actor thumb 数量)

    Raises:
        etree.XMLSyntaxError: 当内容不是有效的 XML 时抛出。
    """
    if not clean_trailer and not clean_actor_thumb:
        if isinstance(content, bytes):
            return content.decode("utf-8", errors="replace"), 0, 0
        return content, 0, 0

    if isinstance(content, str):
        raw_bytes = content.encode("utf-8")
    else:
        raw_bytes = content

    parser = etree.XMLParser(remove_blank_text=True)
    root = etree.fromstring(raw_bytes, parser=parser)

    trailer_count = 0
    actor_thumb_count = 0

    if clean_trailer:
        for elem in root.xpath("//trailer"):
            parent = elem.getparent()
            if parent is not None:
                parent.remove(elem)
                trailer_count += 1

    if clean_actor_thumb:
        for elem in root.xpath("//actor/thumb"):
            parent = elem.getparent()
            if parent is not None:
                parent.remove(elem)
                actor_thumb_count += 1

    # 若未找到任何匹配标签，则不重新格式化，保持原文本
    if trailer_count == 0 and actor_thumb_count == 0:
        if isinstance(content, bytes):
            return content.decode("utf-8", errors="replace"), 0, 0
        return content, 0, 0

    etree.indent(root, space="  ")
    xml_text = etree.tostring(
        root,
        encoding="unicode",
        pretty_print=True,
        doctype='<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
    )
    if not xml_text.endswith("\n"):
        xml_text += "\n"

    return xml_text, trailer_count, actor_thumb_count


def clean_nfo_file(
    file_path: str | Path,
    clean_trailer: bool = True,
    clean_actor_thumb: bool = True,
    dry_run: bool = False,
    backup: bool = False,
) -> CleanFileResult:
    """清理单个 NFO 文件。

    Args:
        file_path: NFO 文件的路径。
        clean_trailer: 是否清理 <trailer> 标签。
        clean_actor_thumb: 是否清理 <actor> 下的 <thumb> 标签。
        dry_run: 是否仅模拟执行，不实际修改文件。
        backup: 是否在写入前备份原文件（生成 .bak 文件）。

    Returns:
        CleanFileResult 实例。
    """
    path = Path(file_path).resolve()
    if not path.is_file():
        return CleanFileResult(path=path, error="文件不存在或不是普通文件")

    try:
        raw_bytes = path.read_bytes()
        if not raw_bytes.strip():
            return CleanFileResult(path=path, error="文件内容为空")

        new_text, trailer_cnt, thumb_cnt = clean_nfo_content(
            raw_bytes,
            clean_trailer=clean_trailer,
            clean_actor_thumb=clean_actor_thumb,
        )

        changed = trailer_cnt > 0 or thumb_cnt > 0

        if changed and not dry_run:
            if backup:
                bak_path = path.with_suffix(path.suffix + ".bak")
                shutil.copy2(path, bak_path)
            path.write_text(new_text, encoding="utf-8")

        return CleanFileResult(
            path=path,
            changed=changed,
            trailer_removed=trailer_cnt,
            actor_thumb_removed=thumb_cnt,
        )
    except Exception as e:
        logger.warning("处理 NFO 文件失败 [%s]: %s", path, e)
        return CleanFileResult(path=path, error=str(e))


def clean_nfo_directory(
    dir_path: str | Path,
    clean_trailer: bool = True,
    clean_actor_thumb: bool = True,
    recursive: bool = True,
    dry_run: bool = False,
    backup: bool = False,
) -> CleanSummary:
    """扫描指定目录下所有 .nfo 文件并清理指定标签。

    Args:
        dir_path: 目标目录路径。
        clean_trailer: 是否清理 <trailer> 标签。
        clean_actor_thumb: 是否清理 <actor> 下的 <thumb> 标签。
        recursive: 是否递归扫描子目录。
        dry_run: 是否仅预览而不实际写入文件。
        backup: 修改前是否创建 .bak 备份。

    Returns:
        CleanSummary 汇总统计。
    """
    base_dir = Path(dir_path).resolve()
    summary = CleanSummary()
    if not base_dir.is_dir():
        summary.error_files = 1
        summary.results.append(CleanFileResult(path=base_dir, error="目标目录不存在或不是文件夹"))
        return summary

    nfo_files: set[Path] = set()
    pattern = "**/*" if recursive else "*"
    for p in base_dir.glob(pattern):
        if p.is_file() and p.suffix.lower() == ".nfo":
            parts = p.relative_to(base_dir).parts
            if any(part.startswith(".") and part not in (".", "..") for part in parts[:-1]):
                continue
            nfo_files.add(p)

    sorted_files = sorted(nfo_files)
    summary.scanned_files = len(sorted_files)

    for nfo_p in sorted_files:
        res = clean_nfo_file(
            nfo_p,
            clean_trailer=clean_trailer,
            clean_actor_thumb=clean_actor_thumb,
            dry_run=dry_run,
            backup=backup,
        )
        summary.results.append(res)
        if res.error:
            summary.error_files += 1
        else:
            if res.changed:
                summary.modified_files += 1
            summary.total_trailer_removed += res.trailer_removed
            summary.total_actor_thumb_removed += res.actor_thumb_removed

    return summary


def parse_args(args: Sequence[str] | None = None) -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(
        description="扫描指定目录下所有 NFO 文件，清理其中的 <trailer> 标签和 <actor.thumb> 标签。",
    )
    parser.add_argument(
        "directory",
        type=str,
        help="要扫描的目标目录路径",
    )
    parser.add_argument(
        "--no-trailer",
        action="store_true",
        default=False,
        help="不清理 <trailer> 标签（默认清理）",
    )
    parser.add_argument(
        "--no-thumb",
        action="store_true",
        default=False,
        help="不清理 <actor> 下的 <thumb> 标签（默认清理）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="预览模式：仅检查并显示将要修改的文件，不实际写入磁盘",
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        default=False,
        help="在修改文件前生成 .bak 备份文件",
    )
    parser.add_argument(
        "--no-recursive",
        action="store_true",
        default=False,
        help="不递归扫描子目录，仅扫描指定目录顶层",
    )
    return parser.parse_args(args)


def main(args: Sequence[str] | None = None) -> int:
    """命令行主执行函数。"""
    parsed = parse_args(args)

    target_dir = Path(parsed.directory)
    clean_trailer = not parsed.no_trailer
    clean_actor_thumb = not parsed.no_thumb
    recursive = not parsed.no_recursive
    dry_run = parsed.dry_run
    backup = parsed.backup

    print("=" * 60)
    print("  NFO 标签清理工具")
    print("=" * 60)
    print(f"目标目录: {target_dir}")
    print(f"清理选项: 清理 <trailer>: {'是' if clean_trailer else '否'} | 清理 <actor.thumb>: {'是' if clean_actor_thumb else '否'}")
    print(f"运行参数: 递归子目录: {'是' if recursive else '否'} | 预览模式(dry-run): {'是' if dry_run else '否'} | 备份原文件: {'是' if backup else '否'}")
    print("-" * 60)

    if not clean_trailer and not clean_actor_thumb:
        print("提示：已同时指定 --no-trailer 与 --no-thumb，无需要清理的标签，程序退出。")
        return 0

    if not target_dir.is_dir():
        print(f"错误: 目标目录不存在或不是文件夹: {target_dir}")
        return 1

    summary = clean_nfo_directory(
        target_dir,
        clean_trailer=clean_trailer,
        clean_actor_thumb=clean_actor_thumb,
        recursive=recursive,
        dry_run=dry_run,
        backup=backup,
    )

    for item in summary.results:
        if item.error:
            print(f"[错误] {item.path}: {item.error}")
        elif item.changed:
            action_tag = "[预览修改]" if dry_run else "[已修改]"
            details = []
            if item.trailer_removed:
                details.append(f"trailer x{item.trailer_removed}")
            if item.actor_thumb_removed:
                details.append(f"actor.thumb x{item.actor_thumb_removed}")
            detail_str = ", ".join(details)
            print(f"{action_tag} {item.path} ({detail_str})")

    print("-" * 60)
    print("扫描完成统计:")
    print(f"  - 扫描文件总数: {summary.scanned_files}")
    print(f"  - 涉及修改文件: {summary.modified_files}{' (未实际写入)' if dry_run else ''}")
    print(f"  - 移除 trailer 标签数: {summary.total_trailer_removed}")
    print(f"  - 移除 actor.thumb 标签数: {summary.total_actor_thumb_removed}")
    print(f"  - 失败异常文件数: {summary.error_files}")
    print("=" * 60)

    return 0 if summary.error_files == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

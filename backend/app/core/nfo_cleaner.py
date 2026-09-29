"""NFO 元数据清理与重写替换工具。

支持基于通用规则引擎（RewriteRule）对 NFO XML 进行清理与自定义替换：
1. 节点删除（如移除 <art>, <trailer>, <actor><thumb>, <fileinfo> 等）；
2. 节点重命名与属性重构（如将 <numid> 转换为 <uniqueid type="num" default="true">）；
3. 文本内容精准替换（如全局或限定在 <actor><name> 内将 '相沢みなみ' 替换为 '相澤南'）。
"""

from __future__ import annotations

import argparse
import copy
import logging
import re
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Sequence

import lxml.etree as etree

logger = logging.getLogger(__name__)

__all__ = [
    "RewriteRule",
    "CleanContentResult",
    "CleanFileResult",
    "CleanSummary",
    "normalize_tag_to_xpath",
    "parse_replacement_tag",
    "apply_rewrite_rules",
    "clean_nfo_content",
    "clean_nfo_file",
    "clean_nfo_directory",
    "main",
]


@dataclass
class RewriteRule:
    """NFO 规则重写定义。

    Attributes:
        id: 规则唯一标识。
        name: 规则名称/简短描述。
        rule_type: 规则类型:
            - 'remove_node': 移除指定标签节点（如 //art, //trailer）。
            - 'replace_node': 重命名/重构节点标签及属性（如将 //numid 重命名为 uniqueid 并注入属性）。
            - 'replace_text': 替换文本内容（如将 '相沢みなみ' 替换为 '相澤南'）。
            - 'append_node': 向匹配的父节点内追加子标签（如向 //actor 追加 <type>Actor</type>）。
        target: 匹配目标（XPath、XML标签片段、或待替换文本）。
        replacement: 替换目标（XML标签片段、或替换后的文本；为空则表示删除）。
        scope: 仅适用于 replace_text，可选限定 XPath 作用域（如 '//actor/name'）。
        enabled: 是否启用该规则。
    """

    id: str
    name: str
    rule_type: Literal["remove_node", "replace_node", "replace_text", "append_node"]
    target: str
    replacement: str = ""
    scope: str | None = None
    enabled: bool = True


def normalize_tag_to_xpath(target: str | None) -> str:
    """将用户输入的 XML 标签片段、简写路径或原生 XPath 规范化为有效 XPath。

    示例：
    - '<art></art>' 或 '<art>' -> '//art'
    - '<actor><thumb></thumb></actor>' 或 '<actor><thumb>' -> '//actor/thumb'
    - 'actor/thumb' -> '//actor/thumb'
    - 'trailer' -> '//trailer'
    - '//fileinfo' -> '//fileinfo' (原生 XPath 直接保留)
    """
    if not target or not target.strip():
        return ""
    s = target.strip()
    if s.startswith("//") or s.startswith("/"):
        return s

    # 提取所有起始标签 <tag ...>
    tags = re.findall(r"<([a-zA-Z0-9_\-]+)(?:\s[^>]*)?>", s)
    if tags:
        return "//" + "/".join(tags)

    # 简写路径语法: e.g. "actor/thumb" 或 "art"
    parts = [p.strip() for p in s.split("/") if p.strip()]
    if parts:
        return "//" + "/".join(parts)

    return "//" + s


def parse_replacement_tag(replacement: str) -> tuple[str, dict[str, str]]:
    """解析替换目标中的标签名和属性。

    示例:
    - '<uniqueid type="num" default="true">' -> ('uniqueid', {'type': 'num', 'default': 'true'})
    - 'uniqueid' -> ('uniqueid', {})
    """
    s = replacement.strip()
    m = re.match(r"^<([a-zA-Z0-9_\-]+)([^>]*)>", s)
    if m:
        tag_name = m.group(1)
        raw_attrs = m.group(2)
        attrs = dict(re.findall(r'([a-zA-Z0-9_\-]+)=["\']([^"\']*)["\']', raw_attrs))
        return tag_name, attrs
    clean_tag = re.sub(r"[</>]", "", s).strip()
    return clean_tag, {}


def apply_rewrite_rules(
    root: etree._Element,
    rules: Sequence[RewriteRule],
) -> dict[str, int]:
    """对 XML DOM 树按顺序应用重写与清洗规则。

    Returns:
        dict[str, int]: 各规则命中的修改计数（key 为 rule.id，value 为修改数量）。
    """
    rule_hits: dict[str, int] = {}

    for rule in rules:
        if not rule.enabled:
            continue

        hit_count = 0
        r_type = rule.rule_type

        if r_type == "remove_node":
            xpath_expr = normalize_tag_to_xpath(rule.target)
            if xpath_expr:
                try:
                    for elem in root.xpath(xpath_expr):
                        parent = elem.getparent()
                        if parent is not None:
                            parent.remove(elem)
                            hit_count += 1
                except Exception as e:
                    logger.warning("执行 remove_node 规则 [%s] 出错 (%s): %s", rule.name, xpath_expr, e)

        elif r_type == "replace_node":
            xpath_expr = normalize_tag_to_xpath(rule.target)
            if xpath_expr:
                try:
                    new_tag, new_attrs = parse_replacement_tag(rule.replacement)
                    for elem in root.xpath(xpath_expr):
                        if new_tag:
                            elem.tag = new_tag
                        for k, v in new_attrs.items():
                            elem.attrib[k] = v
                        hit_count += 1
                except Exception as e:
                    logger.warning("执行 replace_node 规则 [%s] 出错: %s", rule.name, e)

        elif r_type == "replace_text":
            find_str = rule.target
            replace_str = rule.replacement
            if find_str:
                scope_xpath = normalize_tag_to_xpath(rule.scope) if rule.scope else ""
                try:
                    if scope_xpath:
                        # 仅在限定标签内替换文本
                        for elem in root.xpath(scope_xpath):
                            if elem.text and find_str in elem.text:
                                occurrences = elem.text.count(find_str)
                                elem.text = elem.text.replace(find_str, replace_str)
                                hit_count += occurrences
                    else:
                        # 全局文本安全替换（遍历元素 text 与 tail，避免破坏 XML 标签）
                        for elem in root.iter():
                            if elem.text and find_str in elem.text:
                                occurrences = elem.text.count(find_str)
                                elem.text = elem.text.replace(find_str, replace_str)
                                hit_count += occurrences
                            if elem.tail and find_str in elem.tail:
                                occurrences = elem.tail.count(find_str)
                                elem.tail = elem.tail.replace(find_str, replace_str)
                                hit_count += occurrences
                except Exception as e:
                    logger.warning("执行 replace_text 规则 [%s] 出错: %s", rule.name, e)

        elif r_type == "append_node":
            parent_xpath = normalize_tag_to_xpath(rule.target)
            if parent_xpath and rule.replacement.strip():
                try:
                    child_elem = etree.fromstring(rule.replacement.strip())
                    child_tag = child_elem.tag
                    for parent_elem in root.xpath(parent_xpath):
                        existing = parent_elem.find(child_tag)
                        if existing is None:
                            # 父节点内无该子节点，安全追加
                            parent_elem.append(copy.deepcopy(child_elem))
                            hit_count += 1
                        elif existing.text != child_elem.text:
                            # 已有但文本不同（或为空），更新为期望内容
                            existing.text = child_elem.text
                            hit_count += 1
                except Exception as e:
                    logger.warning("执行 append_node 规则 [%s] 出错: %s", rule.name, e)

        rule_hits[rule.id] = hit_count

    return rule_hits


class CleanContentResult(tuple):
    """NFO 内容清理/重写结果。

    继承自 tuple 以保持向后兼容 (cleaned_text, trailer_removed, thumb_removed)，
    同时提供详细的 rule_hits 与 total_hits 属性。
    """

    xml_text: str
    trailer_count: int
    thumb_count: int
    art_count: int
    rule_hits: dict[str, int]
    total_hits: int

    def __new__(
        cls,
        xml_text: str,
        trailer_count: int,
        thumb_count: int,
        art_count: int = 0,
        rule_hits: dict[str, int] | None = None,
    ):
        hits = rule_hits or {}
        obj = super().__new__(cls, (xml_text, trailer_count, thumb_count))
        obj.xml_text = xml_text
        obj.trailer_count = trailer_count
        obj.thumb_count = thumb_count
        obj.art_count = art_count
        obj.rule_hits = hits
        obj.total_hits = sum(hits.values())
        return obj


@dataclass
class CleanFileResult:
    """单个 NFO 文件的清理结果。"""

    path: Path
    changed: bool = False
    trailer_removed: int = 0
    actor_thumb_removed: int = 0
    art_removed: int = 0
    rule_hits: dict[str, int] = field(default_factory=dict)
    error: str | None = None


@dataclass
class CleanSummary:
    """清理任务的汇总统计。"""

    scanned_files: int = 0
    modified_files: int = 0
    total_trailer_removed: int = 0
    total_actor_thumb_removed: int = 0
    total_art_removed: int = 0
    total_rule_hits: dict[str, int] = field(default_factory=dict)
    error_files: int = 0
    results: list[CleanFileResult] = field(default_factory=list)

    @property
    def has_changes(self) -> bool:
        """是否存在修改。"""
        return self.modified_files > 0


def build_default_rules(
    clean_trailer: bool = True,
    clean_actor_thumb: bool = True,
    clean_art: bool = False,
) -> list[RewriteRule]:
    """根据传统布尔选项构造默认重写规则列表。"""
    rules: list[RewriteRule] = []
    if clean_trailer:
        rules.append(
            RewriteRule(
                id="preset_trailer",
                name="清理预告片 <trailer>",
                rule_type="remove_node",
                target="//trailer",
                enabled=True,
            )
        )
    if clean_actor_thumb:
        rules.append(
            RewriteRule(
                id="preset_actor_thumb",
                name="清理演员外链头像 <actor><thumb>",
                rule_type="remove_node",
                target="//actor/thumb",
                enabled=True,
            )
        )
    if clean_art:
        rules.append(
            RewriteRule(
                id="preset_art",
                name="清理绝对路径海报/背景图 <art>",
                rule_type="remove_node",
                target="//art",
                enabled=True,
            )
        )
    return rules


def clean_nfo_content(
    content: str | bytes,
    clean_trailer: bool = True,
    clean_actor_thumb: bool = True,
    clean_art: bool = False,
    rules: Sequence[RewriteRule] | None = None,
) -> CleanContentResult:
    """清理并重写 NFO XML 内容。

    支持传统 clean_trailer / clean_actor_thumb / clean_art 选项，同时支持自定义 rules 规则列表。

    Returns:
        CleanContentResult: 兼容 3 元组 (cleaned_text, trailer_count, thumb_count)，
        并包含 art_count、rule_hits、total_hits 扩展属性。
    """
    if rules is not None:
        active_rules = list(rules)
    else:
        active_rules = build_default_rules(
            clean_trailer=clean_trailer,
            clean_actor_thumb=clean_actor_thumb,
            clean_art=clean_art,
        )

    orig_str = content.decode("utf-8", errors="replace") if isinstance(content, bytes) else content

    if not any(r.enabled for r in active_rules):
        return CleanContentResult(orig_str, 0, 0, 0, {})

    raw_bytes = content.encode("utf-8") if isinstance(content, str) else content

    parser = etree.XMLParser(remove_blank_text=True)
    root = etree.fromstring(raw_bytes, parser=parser)

    rule_hits = apply_rewrite_rules(root, active_rules)
    total_hits = sum(rule_hits.values())

    # 计算兼容字段
    trailer_count = sum(v for k, v in rule_hits.items() if "trailer" in k.lower())
    thumb_count = sum(v for k, v in rule_hits.items() if "thumb" in k.lower())
    art_count = sum(v for k, v in rule_hits.items() if "art" in k.lower())

    if total_hits == 0:
        return CleanContentResult(orig_str, 0, 0, 0, rule_hits)

    etree.indent(root, space="  ")
    xml_text = etree.tostring(
        root,
        encoding="unicode",
        pretty_print=True,
        doctype='<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
    )
    if not xml_text.endswith("\n"):
        xml_text += "\n"

    return CleanContentResult(xml_text, trailer_count, thumb_count, art_count, rule_hits)


def clean_nfo_file(
    file_path: str | Path,
    clean_trailer: bool = True,
    clean_actor_thumb: bool = True,
    clean_art: bool = False,
    rules: Sequence[RewriteRule] | None = None,
    dry_run: bool = False,
    backup: bool = False,
) -> CleanFileResult:
    """清理/重写单个 NFO 文件。"""
    path = Path(file_path).resolve()
    if not path.is_file():
        return CleanFileResult(path=path, error="文件不存在或不是普通文件")

    try:
        raw_bytes = path.read_bytes()
        if not raw_bytes.strip():
            return CleanFileResult(path=path, error="文件内容为空")

        res = clean_nfo_content(
            raw_bytes,
            clean_trailer=clean_trailer,
            clean_actor_thumb=clean_actor_thumb,
            clean_art=clean_art,
            rules=rules,
        )

        changed = res.total_hits > 0

        if changed and not dry_run:
            if backup:
                bak_path = path.with_suffix(path.suffix + ".bak")
                shutil.copy2(path, bak_path)
            path.write_text(res.xml_text, encoding="utf-8")

        return CleanFileResult(
            path=path,
            changed=changed,
            trailer_removed=res.trailer_count,
            actor_thumb_removed=res.thumb_count,
            art_removed=res.art_count,
            rule_hits=res.rule_hits,
        )
    except Exception as e:
        logger.warning("处理 NFO 文件失败 [%s]: %s", path, e)
        return CleanFileResult(path=path, error=str(e))


def clean_nfo_directory(
    dir_path: str | Path,
    clean_trailer: bool = True,
    clean_actor_thumb: bool = True,
    clean_art: bool = False,
    rules: Sequence[RewriteRule] | None = None,
    recursive: bool = True,
    dry_run: bool = False,
    backup: bool = False,
) -> CleanSummary:
    """扫描指定目录下所有 .nfo 文件并应用清理与重写规则。"""
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
            clean_art=clean_art,
            rules=rules,
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
            summary.total_art_removed += res.art_removed
            for r_id, count in res.rule_hits.items():
                summary.total_rule_hits[r_id] = summary.total_rule_hits.get(r_id, 0) + count

    return summary


def parse_args(args: Sequence[str] | None = None) -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(
        description="扫描指定目录下所有 NFO 文件，执行标签清理与重写替换。",
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
        "--art",
        action="store_true",
        default=False,
        help="清理 <art> 标签（清除绝对路径海报/背景图）",
    )
    parser.add_argument(
        "--rule",
        "-r",
        action="append",
        dest="custom_rules",
        default=[],
        help="自定义规则，例如: --rule '<art></art>' 或 --rule '<numid>=<uniqueid type=\"num\" default=\"true\">' 或 --rule 'text:相沢みなみ=相澤南'",
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


def parse_cli_rule(raw_str: str, index: int) -> RewriteRule:
    """将命令行传入的规则字符串解析为 RewriteRule 对象。"""
    s = raw_str.strip()
    # 格式0: append:parent=child (append_node)
    if s.startswith("append:"):
        rest = s[len("append:"):]
        if "=" in rest:
            target_s, repl_s = rest.split("=", 1)
        else:
            target_s, repl_s = rest, ""
        return RewriteRule(
            id=f"cli_append_{index}",
            name=f"追加节点: {target_s} -> {repl_s}",
            rule_type="append_node",
            target=target_s.strip(),
            replacement=repl_s.strip(),
        )

    # 格式1: text:find=replace 或 text://actor/name:find=replace
    if s.startswith("text:"):
        rest = s[len("text:"):]
        scope = None
        if ":" in rest and not rest.startswith("//"):
            parts = rest.split(":", 1)
            scope = parts[0].strip()
            rest = parts[1]
        elif rest.startswith("//"):
            parts = rest.split(":", 1)
            scope = parts[0].strip()
            rest = parts[1] if len(parts) > 1 else ""

        if "=" in rest:
            find_s, repl_s = rest.split("=", 1)
        else:
            find_s, repl_s = rest, ""
        return RewriteRule(
            id=f"cli_text_{index}",
            name=f"文本替换: {find_s} -> {repl_s}",
            rule_type="replace_text",
            target=find_s,
            replacement=repl_s,
            scope=scope,
        )

    # 格式2: target=replacement (replace_node)
    if "=" in s:
        target_s, repl_s = s.split("=", 1)
        return RewriteRule(
            id=f"cli_replace_{index}",
            name=f"节点重命名: {target_s} -> {repl_s}",
            rule_type="replace_node",
            target=target_s.strip(),
            replacement=repl_s.strip(),
        )

    # 格式3: 纯目标 (remove_node)
    return RewriteRule(
        id=f"cli_remove_{index}",
        name=f"删除节点: {s}",
        rule_type="remove_node",
        target=s,
        replacement="",
    )


def main(args: Sequence[str] | None = None) -> int:
    """命令行主执行函数。"""
    parsed = parse_args(args)

    target_dir = Path(parsed.directory)
    clean_trailer = not parsed.no_trailer
    clean_actor_thumb = not parsed.no_thumb
    clean_art = parsed.art
    recursive = not parsed.no_recursive
    dry_run = parsed.dry_run
    backup = parsed.backup

    rules: list[RewriteRule] = build_default_rules(
        clean_trailer=clean_trailer,
        clean_actor_thumb=clean_actor_thumb,
        clean_art=clean_art,
    )
    for idx, r_str in enumerate(parsed.custom_rules or []):
        rules.append(parse_cli_rule(r_str, idx + 1))

    print("=" * 60)
    print("  NFO 标签清理与重写工具")
    print("=" * 60)
    print(f"目标目录: {target_dir}")
    print(f"规则总数: {len(rules)} 条")
    for r in rules:
        print(f"  - [{r.rule_type}] {r.name} (target: {r.target})")
    print(f"运行参数: 递归子目录: {'是' if recursive else '否'} | 预览模式(dry-run): {'是' if dry_run else '否'} | 备份原文件: {'是' if backup else '否'}")
    print("-" * 60)

    if not rules:
        print("提示：无有效规则需要执行，程序退出。")
        return 0

    if not target_dir.is_dir():
        print(f"错误: 目标目录不存在或不是文件夹: {target_dir}")
        return 1

    summary = clean_nfo_directory(
        target_dir,
        rules=rules,
        recursive=recursive,
        dry_run=dry_run,
        backup=backup,
    )

    for item in summary.results:
        if item.error:
            print(f"[错误] {item.path}: {item.error}")
        elif item.changed:
            action_tag = "[预览修改]" if dry_run else "[已修改]"
            details = [f"{k} x{v}" for k, v in item.rule_hits.items() if v > 0]
            detail_str = ", ".join(details)
            print(f"{action_tag} {item.path} ({detail_str})")

    print("-" * 60)
    print("扫描完成统计:")
    print(f"  - 扫描文件总数: {summary.scanned_files}")
    print(f"  - 涉及修改文件: {summary.modified_files}{' (未实际写入)' if dry_run else ''}")
    print(f"  - 移除 trailer 标签数: {summary.total_trailer_removed}")
    print(f"  - 移除 actor.thumb 标签数: {summary.total_actor_thumb_removed}")
    if summary.total_art_removed:
        print(f"  - 移除 art 标签数: {summary.total_art_removed}")
    for r_id, count in summary.total_rule_hits.items():
        if count > 0 and r_id not in ("preset_trailer", "preset_actor_thumb", "preset_art"):
            print(f"  - 规则命中 [{r_id}]: {count}")
    print(f"  - 失败异常文件数: {summary.error_files}")
    print("=" * 60)

    return 0 if summary.error_files == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

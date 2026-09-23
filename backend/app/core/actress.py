"""JavSP 女优别名规范化与清洗模块 (ActressMap)."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from app.core.models import MovieInfo

logger = logging.getLogger(__name__)

_actress_alias_map: dict[str, list[str]] | None = None


def get_actress_alias_map() -> dict[str, list[str]]:
    """加载女优别名映射表 (actress_alias.json)。"""
    global _actress_alias_map
    if _actress_alias_map is None:
        alias_file = Path(__file__).resolve().parent.parent.parent / "data" / "actress_alias.json"
        if alias_file.is_file():
            try:
                with open(alias_file, "r", encoding="utf-8") as f:
                    _actress_alias_map = json.load(f)
            except Exception as e:
                logger.warning("加载女优别名映射文件失败: %s", e)
                _actress_alias_map = {}
        else:
            _actress_alias_map = {}
    return _actress_alias_map


def resolve_actress_alias(name: str) -> str:
    """根据映射字典将女优别名规整为主名（主规范名）。

    Args:
        name: 待规整的女优名称或别名。

    Returns:
        若存在对应的主名则返回主名，否则返回去除首尾空格后的原始名称。
    """
    clean_name = name.strip()
    if not clean_name:
        return ""
    alias_map = get_actress_alias_map()
    for canonical, aliases in alias_map.items():
        if clean_name == canonical or clean_name in aliases:
            return canonical
    return clean_name


def clean_movie_actresses(info: MovieInfo) -> list[str]:
    """对 MovieInfo 中的演员列表及头像字典进行别名规范化与去重清洗。

    1. 将别名（繁体/中文译名/其他别名）规整为主名（主规范名）；
    2. 过滤空白，有序去重（保留首现顺序）；
    3. 规整 actress_pics 的 key 为主规范名，确保头像正常关联；
    4. 同步回写 MovieInfo 实例的 actress 与 actress_pics。

    Args:
        info: 待清洗的 MovieInfo 实例。

    Returns:
        清洗规范化且去重后的演员列表。
    """
    cleaned_actresses: list[str] = []
    seen: set[str] = set()

    if info.actress:
        for act in info.actress:
            canonical = resolve_actress_alias(act)
            if canonical and canonical not in seen:
                seen.add(canonical)
                cleaned_actresses.append(canonical)

    info.actress = cleaned_actresses

    if info.actress_pics:
        new_pics: dict[str, str] = {}
        for act_name, pic_url in info.actress_pics.items():
            canonical = resolve_actress_alias(act_name)
            if canonical and canonical not in new_pics:
                new_pics[canonical] = pic_url
        info.actress_pics = new_pics

    return cleaned_actresses

"""JavSP 标签分类规范化与清洗模块 (GenreMap)."""

from __future__ import annotations

import csv
import logging
from pathlib import Path
from typing import Sequence

from app.core.models import MovieInfo

logger = logging.getLogger(__name__)

_genre_map_cache: dict[str, GenreMap] = {}


def get_data_dir() -> Path:
    """获取存放 genre_*.csv 字典文件的目录绝对路径。"""
    curr = Path(__file__).resolve().parent
    candidates = [
        curr.parent.parent / "data",            # backend/data
        curr.parent.parent.parent / "data",     # root/data
        Path.cwd() / "data",
        Path.cwd() / "backend" / "data",
    ]
    for c in candidates:
        if c.is_dir() and any(c.glob("genre_*.csv")):
            return c
    return curr.parent.parent / "data"


class GenreMap(dict[str, str]):
    """影片分类与标签的映射清洗表。
    
    继承自 dict，支持将各抓取源的原始分类 ID 或站点多语言标签名称，
    统一规范为标准的中文分类名称，同时自动剔除译文为空的无效标签。
    通过规范化传递闭包（canonicalize），彻底解决多源数据合并时繁简并存（如單體作品与单体作品）的问题。
    """

    def __init__(self, file_path: str | Path | None = None) -> None:
        super().__init__()
        self.id_to_genre: dict[str, str] = {}
        self.alias_to_genre: dict[str, str] = {}
        if file_path:
            self.load_csv(file_path)

    def load_csv(self, file_path: str | Path, overwrite: bool = True) -> None:
        """从指定的 UTF-8/UTF-8-SIG CSV 文件载入分类映射关系。
        
        Args:
            file_path: CSV 文件路径。
            overwrite: 若为 False，已存在的键不会被新值覆盖，用于保证高优先级站点映射优先。
        """
        path = Path(file_path)
        if not path.is_file():
            logger.warning("分类映射 CSV 文件不存在: %s", path)
            return

        try:
            with open(path, newline="", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    raw_id = (row.get("id") or "").strip()
                    translate = (row.get("translate") or "").strip()

                    # 1. 记录站点原始分类 ID 映射 (id -> translate)
                    if raw_id:
                        if overwrite or raw_id not in self.id_to_genre:
                            self.id_to_genre[raw_id] = translate

                    # 2. 收录原始语言别名列（如 zh_tw, zh_cn, ja, en, translate）
                    for col in ("zh_tw", "zh_cn", "ja", "en", "translate"):
                        alias = (row.get(col) or "").strip()
                        if alias:
                            if overwrite or alias not in self.alias_to_genre:
                                self.alias_to_genre[alias] = translate
        except Exception as e:
            logger.error("读取分类映射文件 %s 失败: %s", path, e)

    def resolve_canonical(self, name: str) -> str:
        """递归解析别名直至收敛到最简/最标准名称，防止死循环。"""
        curr = name.strip()
        visited: set[str] = set()
        while curr in self.alias_to_genre and curr not in visited:
            visited.add(curr)
            nxt = self.alias_to_genre[curr].strip()
            if not nxt:
                return ""  # 明确标记剔除的无效标签
            if nxt == curr:
                break
            curr = nxt
        return curr

    def canonicalize(self) -> None:
        """在所有 CSV 文件载入完成后执行全量传递闭包规范化。
        
        例如：
        genre_javdb.csv 中 tags?c7=28 -> 單體作品
        genre_javbus.csv 中 單體作品 -> 单体作品
        经 canonicalize 处理后，tags?c7=28 直接解析为 单体作品，單體作品 亦解析为 单体作品，
        彻底消除因为多源合并而导致繁简并存的冗余问题。
        """
        for k in list(self.alias_to_genre.keys()):
            self.alias_to_genre[k] = self.resolve_canonical(self.alias_to_genre[k])
        for k in list(self.id_to_genre.keys()):
            self.id_to_genre[k] = self.resolve_canonical(self.id_to_genre[k])

        self.clear()
        self.update(self.alias_to_genre)
        self.update(self.id_to_genre)

    def map(self, ls: Sequence[str] | None) -> list[str]:
        """将列表 ls 按照内置映射进行替换。
        
        规则：
        1. 优先根据原始分类 ID 转换，次之根据标签文字别名规范化；
        2. 删除映射结果为空字符串的键（过滤标签）；
        3. 保留映射表中完全不存在的独立键；
        4. 自动去重并保留原有出现顺序。
        """
        if not ls:
            return []

        cleaned: list[str] = []
        for item in ls:
            s = item.strip()
            if not s:
                continue
            if s in self.id_to_genre:
                target = self.id_to_genre[s]
            elif s in self.alias_to_genre:
                target = self.alias_to_genre[s]
            else:
                target = s
            mapped_val = self.resolve_canonical(target)
            if mapped_val and mapped_val not in cleaned:
                cleaned.append(mapped_val)
        return cleaned


def get_genre_map(site: str = "unified") -> GenreMap:
    """获取指定站点或全局汇总的分类映射表单例。
    
    Args:
        site: 站点名称，如 'javbus', 'javdb', 'avsox', 'javlib'，或 'unified'。
    """
    global _genre_map_cache
    site_key = site.lower().strip()
    if site_key in _genre_map_cache:
        return _genre_map_cache[site_key]

    data_dir = get_data_dir()
    new_map = GenreMap()

    if site_key == "unified":
        # 按照爬虫站点优先级加载 (javbus > javdb > avsox > javlib)，后加载文件不覆盖先加载的高优先级映射
        priority_files = ["genre_javbus.csv", "genre_javdb.csv", "genre_avsox.csv", "genre_javlib.csv"]
        loaded_files: set[Path] = set()
        for fname in priority_files:
            csv_path = data_dir / fname
            if csv_path.is_file():
                new_map.load_csv(csv_path, overwrite=False)
                loaded_files.add(csv_path)

        for csv_file in sorted(data_dir.glob("genre_*.csv")):
            if csv_file not in loaded_files:
                new_map.load_csv(csv_file, overwrite=False)
    else:
        target_csv = data_dir / f"genre_{site_key}.csv"
        if target_csv.is_file():
            new_map.load_csv(target_csv, overwrite=True)
        else:
            logger.warning("未找到站点 %s 的分类文件: %s", site_key, target_csv)

    new_map.canonicalize()
    _genre_map_cache[site_key] = new_map
    return new_map


def clean_movie_genres(info: MovieInfo, site: str | None = None) -> list[str]:
    """对 MovieInfo 中的分类标签执行清洗与规范化转换。
    
    规则与优先级：
    1. 优先使用原始分类 ID (genre_id) 进行精准规范化：
       - 若 ID 在字典中映射值非空，规范为标准分类名并加入候选；
       - 若 ID 映射结果为空字符串，表示该分类应当被明确剔除（如 66 AV OPEN 奖项标签）；
       - 若 ID 未收录，且存在对应的文字标签列表，则不将未识别的 ID slug 写入分类，等待文字标签处理；
       - 若完全无文字标签，才保留未识别的 ID。
    2. 对文字标签 (genre) 进行别名规范化与清洗：
       - 若在字典中（如日文/繁体别名），规范化为统一名称；
       - 若在字典中映射为空（如 AV OPEN 别名），自动剔除；
       - 若不在字典中，保留原文本标签（如独占新分类）。
    3. 自动去重并保持原有出现顺序；
    4. 规范化结果同步写入 info.genre_norm 与 info.genre。
    
    Args:
        info: 影片结构化数据。
        site: 可选的优先来源站点。
        
    Returns:
        清洗规范化后的分类列表。
    """
    g_map = get_genre_map(site) if site else get_genre_map("unified")

    candidates: list[str] = []
    has_text_genres = bool(info.genre)

    # 1. 优先使用原始分类 ID (genre_id)
    if info.genre_id:
        for raw_gid in info.genre_id:
            gid = raw_gid.strip()
            if not gid:
                continue

            if gid in g_map.id_to_genre:
                mapped_val = g_map.resolve_canonical(g_map.id_to_genre[gid])
                if mapped_val and mapped_val not in candidates:
                    candidates.append(mapped_val)
            elif not has_text_genres:
                # 仅在没有任何文字标签可用时，才将未映射的 ID 保留
                if gid not in candidates:
                    candidates.append(gid)

    # 2. 对已有的文字标签 (genre) 进行别名规范化与清洗
    if info.genre:
        for item in info.genre:
            name = item.strip()
            if not name:
                continue

            if name in g_map.alias_to_genre:
                target = g_map.alias_to_genre[name]
            elif name in g_map.id_to_genre:
                target = g_map.id_to_genre[name]
            else:
                target = name

            mapped_val = g_map.resolve_canonical(target)
            if mapped_val and mapped_val not in candidates:
                candidates.append(mapped_val)

    # 3. 若 genre_id 与 genre 均为空，仅有此前设置的 genre_norm 时
    if not candidates and not info.genre_id and not info.genre and info.genre_norm:
        for item in info.genre_norm:
            name = item.strip()
            if not name:
                continue
            if name in g_map.alias_to_genre:
                target = g_map.alias_to_genre[name]
            elif name in g_map.id_to_genre:
                target = g_map.id_to_genre[name]
            else:
                target = name

            mapped_val = g_map.resolve_canonical(target)
            if mapped_val and mapped_val not in candidates:
                candidates.append(mapped_val)

    # 同步回写 MovieInfo 实例
    info.genre_norm = list(candidates)
    info.genre = list(candidates)
    return candidates


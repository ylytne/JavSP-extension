"""本地磁盘扫描引擎模块。"""

from __future__ import annotations

import itertools
import logging
import os
from pathlib import Path
import re
from typing import Callable
import uuid

from app.config import get_config
from app.core.avid import detect_special_attr, get_cid, get_id, guess_av_type
from app.core.models import ScanMovieItem

logger = logging.getLogger(__name__)

_SPECIAL_CHARS_MAP = {i: "\\" + chr(i) for i in b"()[]{}?*+|^$\\."}


def re_escape(s: str) -> str:
    """对字符串进行转义，用于安全构造正则表达式。"""
    return s.translate(_SPECIAL_CHARS_MAP)


def try_merge_slices(files: list[str]) -> list[str] | None:
    """尝试将同一目录下的多个文件按多分片规则验证并排序。

    Args:
        files: 待验证的文件路径列表。

    Returns:
        若符合多分片规则，返回按分片顺序排好序的文件列表；否则返回 None。
    """
    if len(files) <= 1:
        return files

    # 检查是否位于不同目录（不同目录的同番号文件视为冲突）
    parent_dirs = set(os.path.dirname(f) for f in files)
    if len(parent_dirs) > 1:
        return None

    basenames = [os.path.basename(f) for f in files]
    prefix = os.path.commonprefix(basenames)
    try:
        pattern_expr = re_escape(prefix) + r"\s*([a-z\d])\s*"
        pattern = re.compile(pattern_expr, flags=re.IGNORECASE)
    except re.error:
        return None

    remaining = [pattern.sub(r"\1", b).lower() for b in basenames]
    postfixes = [r[1:] for r in remaining]
    slices = [r[0] for r in remaining]

    if len(set(postfixes)) != 1 or len(slices) != len(set(slices)):
        return None

    sorted_slices = sorted(slices)
    first, last = sorted_slices[0], sorted_slices[-1]
    if first not in ("0", "1", "a") or (ord(last) != (ord(first) + len(sorted_slices) - 1)):
        return None

    return [files[slices.index(s)] for s in sorted_slices]


def scan_directory(
    root_dir: str | Path,
    on_progress: Callable[[int, int], None] | None = None,
) -> list[ScanMovieItem]:
    """遍历目标文件夹，筛选影片、识别番号、合并分片，生成 ScanMovieItem 列表。

    Args:
        root_dir: 待扫描的根目录。
        on_progress: 可选的扫描进度回调 (current_scanned_files, total_movies_found)。

    Returns:
        待处理影片任务列表。
    """
    config = get_config()
    root_path = Path(root_dir).resolve()
    if not root_path.exists() or not root_path.is_dir():
        logger.error("扫描路径不存在或非目录: %s", root_path)
        return []

    exts = set(ext.lower() for ext in config.scanner.filename_extensions)
    min_size = config.scanner.minimum_size_bytes
    skip_nfo = config.scanner.skip_nfo_dir
    ignored_folder_patterns = [
        re.compile(pat, re.IGNORECASE) for pat in config.scanner.ignored_folder_name_pattern
    ]

    # 存储 avid -> [文件绝对路径列表]
    avid_files_map: dict[str, list[str]] = {}
    small_videos: dict[str, list[str]] = {}
    unrecognized_videos: list[str] = []

    scanned_file_counter = 0

    for dirpath, dirnames, filenames in os.walk(root_path):
        # 过滤忽略的子文件夹
        for name in list(dirnames):
            if any(pat.search(name) for pat in ignored_folder_patterns):
                dirnames.remove(name)
                continue
            if skip_nfo:
                sub_dir = os.path.join(dirpath, name)
                try:
                    if any(f.lower().endswith(".nfo") for f in os.listdir(sub_dir)):
                        dirnames.remove(name)
                        continue
                except OSError:
                    pass

        # 检查当前目录本身是否已有 nfo（如果当前就是已整理目录）
        if skip_nfo and any(f.lower().endswith(".nfo") for f in filenames):
            continue

        for filename in filenames:
            ext = os.path.splitext(filename)[1].lower()
            if ext not in exts:
                continue

            scanned_file_counter += 1
            fullpath = os.path.join(dirpath, filename)
            try:
                filesize = os.path.getsize(fullpath)
            except OSError:
                continue

            if ext != ".strm" and filesize < min_size:
                small_videos.setdefault(filename, []).append(fullpath)
                continue

            dvdid = get_id(fullpath, stop_dir=root_path)
            cid = get_cid(fullpath)
            avid = cid if cid else dvdid

            if avid:
                avid_files_map.setdefault(avid, []).append(fullpath)
            else:
                unrecognized_videos.append(fullpath)

            if on_progress and (scanned_file_counter % 10 == 0):
                on_progress(scanned_file_counter, len(avid_files_map))

    # 处理多分片影片中体积小于阈值的子分片文件
    # 仅从文件名推测番号，绝不向上推测父目录（防止将同目录下的预览/广告/无效小视频误识别为主影片番号）
    avid_small_candidates: dict[str, list[str]] = {}
    for name, s_files in small_videos.items():
        dvdid = get_id(name)
        cid = get_cid(name)
        avid = cid if cid else dvdid
        for sf in s_files:
            if avid:
                if avid in avid_files_map:
                    avid_small_candidates.setdefault(avid, []).append(sf)
            else:
                # 仅当文件名未包含番号时，才检查同目录下是否存在已识别番号的主影片（应对类似 cd1, cd2 但无番号的场景）
                sf_dir = os.path.dirname(sf)
                for m_avid, m_files in avid_files_map.items():
                    if any(os.path.dirname(mf) == sf_dir for mf in m_files):
                        avid_small_candidates.setdefault(m_avid, []).append(sf)

    for avid, candidates in avid_small_candidates.items():
        # 去重并按文件名排序，确保 cd1, cd2 顺序递增尝试
        unique_candidates = sorted(set(candidates), key=lambda p: os.path.basename(p).lower())
        current_files = avid_files_map[avid]
        for sf in unique_candidates:
            # 只有当小视频文件与已有影片文件能成功构成连续分片时才合入
            merged = try_merge_slices([*current_files, sf])
            if merged is not None:
                current_files = merged
        avid_files_map[avid] = current_files

    # 多分片智能合并与排序
    non_slice_dup: dict[str, list[str]] = {}
    for avid, files in list(avid_files_map.items()):
        if len(files) == 1:
            continue

        merged = try_merge_slices(files)
        if merged is not None:
            avid_files_map[avid] = merged
        else:
            non_slice_dup[avid] = files
            del avid_files_map[avid]

    # 构造 ScanMovieItem 结果对象
    results: list[ScanMovieItem] = []
    for avid, files in avid_files_map.items():
        av_type = guess_av_type(avid)
        data_src = "fc2" if av_type == "fc2" else ("cid" if av_type == "cid" else "normal")

        # 特殊属性检测（结合全部关联分片及番号）
        attrs = set()
        for f in files:
            attr = detect_special_attr(f, avid)
            for c in attr:
                attrs.add(c)

        dvdid = avid if data_src != "cid" else (get_id(files[0], stop_dir=root_path) or avid)
        cid = avid if data_src == "cid" else None

        item = ScanMovieItem(
            taskId=str(uuid.uuid4()),
            dvdid=dvdid,
            cid=cid,
            files=files,
            data_src=data_src,
            hard_sub="C" in attrs,
            uncensored="U" in attrs,
            status="pending",
            errorMsg=None,
        )
        results.append(item)

    # 包含冲突的多分片或重复番号项目（以错误状态呈现）
    for avid, files in non_slice_dup.items():
        av_type = guess_av_type(avid)
        data_src = "fc2" if av_type == "fc2" else ("cid" if av_type == "cid" else "normal")
        results.append(
            ScanMovieItem(
                taskId=str(uuid.uuid4()),
                dvdid=avid,
                files=files,
                data_src=data_src,
                status="error",
                errorMsg=f"同番号冲突文件或分片未完全连续 ({len(files)}个文件)",
            )
        )

    # 包含未能识别番号的视频文件（以错误状态呈现，方便用户查看与排查）
    for unrec_file in unrecognized_videos:
        fname = os.path.basename(unrec_file)
        results.append(
            ScanMovieItem(
                taskId=str(uuid.uuid4()),
                dvdid="",
                files=[unrec_file],
                data_src="normal",
                status="error",
                errorMsg=f"无法从文件名推测番号: {fname}",
            )
        )

    if on_progress:
        on_progress(scanned_file_counter, len(results))

    return results

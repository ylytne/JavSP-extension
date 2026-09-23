"""AV 番号提取与分类算法模块。"""

from __future__ import annotations

import os
from pathlib import Path
import re
from app.config import get_config

__all__ = ["get_id", "get_cid", "guess_av_type", "detect_special_attr"]

_CD_POSTFIX = re.compile(r"([-_]\w|cd\d)$", re.IGNORECASE)
_SPECIAL_ATTR_PATTERN = re.compile(
    r"(uncen(sor(ed)?)?([- _\s]*leak(ed)?)?|[无無][码碼](流出|破解))",
    flags=re.IGNORECASE,
)
_SUB_FOLDER_PATTERN = re.compile(
    r"^(cd|disc|disk|part|sub|extra|bdmv|stream|video_ts|audio_ts)[\s_-]*\d*$",
    re.IGNORECASE,
)


def get_id(
    filepath_str: str | Path,
    ignored_patterns: list[str] | None = None,
    stop_dir: str | Path | None = None,
) -> str:
    """从给定的文件路径或文件名中提取番号（DVD ID）。

    Args:
        filepath_str: 文件完整路径或文件名字符串。
        ignored_patterns: 可选的预先过滤正则列表，默认从全局配置读取。
        stop_dir: 向上推断父目录时的终止目录。若提供，推断范围不会超出该目录。

    Returns:
        提取出的标准番号字符串，未识别时返回空字符串。
    """
    if not filepath_str:
        return ""

    filepath = Path(filepath_str)

    # 获取要忽略的文件名特征模式
    if ignored_patterns is None:
        try:
            ignored_patterns = get_config().scanner.ignored_id_pattern
        except Exception:
            ignored_patterns = [
                r"(144|240|360|480|720|1080)[Pp]",
                r"[24][Kk]",
                r"\w+2048\.com",
                r"Carib(beancom)?",
                r"[^a-z\d](f?hd|lt)[^a-z\d]",
            ]

    # 去除扩展名并使用正则清洗
    base_name = filepath.stem if filepath.name else str(filepath)
    if ignored_patterns:
        ignore_regex = re.compile("|".join(ignored_patterns), re.IGNORECASE)
        norm = ignore_regex.sub("", base_name).upper()
    else:
        norm = base_name.upper()

    if "FC2" in norm:
        # FC2 编号通常为 5-7 个数字
        match = re.search(r"FC2[^A-Z\d]{0,5}(PPV[^A-Z\d]{0,5})?(\d{5,7})", norm, re.IGNORECASE)
        if match:
            return f"FC2-{match.group(2)}"
    elif "HEYDOUGA" in norm:
        match = re.search(r"(HEYDOUGA)[-_]*(\d{4})[-_]0?(\d{3,5})", norm, re.IGNORECASE)
        if match:
            return "-".join(match.groups())
    elif "GETCHU" in norm:
        match = re.search(r"GETCHU[-_]*(\d+)", norm, re.IGNORECASE)
        if match:
            return f"GETCHU-{match.group(1)}"
    elif "GYUTTO" in norm:
        match = re.search(r"GYUTTO-(\d+)", norm, re.IGNORECASE)
        if match:
            return f"GYUTTO-{match.group(1)}"
    elif "259LUXU" in norm:
        match = re.search(r"259LUXU-(\d+)", norm, re.IGNORECASE)
        if match:
            return f"259LUXU-{match.group(1)}"
    else:
        # 先尝试移除可疑域名进行匹配
        no_domain = re.sub(r"\w{3,10}\.(COM|NET|APP|XYZ)", "", norm, flags=re.IGNORECASE)
        if no_domain != norm:
            avid = get_id(no_domain, ignored_patterns, stop_dir=stop_dir)
            if avid:
                return avid

        # 匹配缩写成 hey 的 heydouga
        match = re.search(r"(?:HEY)[-_]*(\d{4})[-_]0?(\d{3,5})", norm, re.IGNORECASE)
        if match:
            return f"HEYDOUGA-{'-'.join(match.groups())}"

        # 匹配片商 MUGEN
        match = re.search(
            r"(MKB?D)[-_]*(S\d{2,3})|(MK3D2DBD|S2M|S2MBD)[-_]*(\d{2,3})",
            norm,
            re.IGNORECASE,
        )
        if match:
            if match.group(1) is not None:
                return f"{match.group(1)}-{match.group(2)}"
            return f"{match.group(3)}-{match.group(4)}"

        # 匹配 IBW 带有后缀 z 的番号
        match = re.search(r"(IBW)[-_](\d{2,5}z)", norm, re.IGNORECASE)
        if match:
            return f"{match.group(1)}-{match.group(2)}"

        # 普通番号，优先尝试匹配带分隔符的（如 ABC-123）
        match = re.search(r"([A-Z]{2,10})[-_](\d{2,5})", norm)
        if match:
            return f"{match.group(1)}-{match.group(2)}"

        # 匹配东热的 red, sky, ex 三个不带分隔符的系列
        match = re.search(r"(RED[01]\d\d|SKY[0-3]\d\d|EX00[01]\d)", norm)
        if match:
            return match.group(1)

        # 视作缺失了 '-' 分隔符的普通番号 (如 IPX177 -> IPX-177)
        match = re.search(r"([A-Z]{2,})(\d{2,5})", norm)
        if match:
            return f"{match.group(1)}-{match.group(2)}"

    # 尝试匹配 TMA 制作的影片（如 T28-557）
    match = re.search(r"(T[23]8[-_]\d{3})", norm)
    if match:
        return match.group(1)

    # 尝试匹配东热 N, K 系列
    match = re.search(r"(N\d{4}|K\d{4})", norm, re.IGNORECASE)
    if match:
        return match.group(1)

    # 尝试匹配 R18-XXX 的番号
    match = re.search(r"R18-?\d{3}", norm, re.IGNORECASE)
    if match:
        return match.group(1)

    # 尝试匹配纯数字番号（无码影片，如 123456-789）
    match = re.search(r"(\d{6}[-_]\d{2,3})", norm)
    if match:
        return match.group(1)

    # 尝试将 ')(' 替换为 '-' 后匹配
    if ")(" in norm:
        avid = get_id(norm.replace(")(", "-"), ignored_patterns, stop_dir=stop_dir)
        if avid:
            return avid

    # 如果文件名本身无法匹配，尝试借助上级目录名称推断
    if filepath.parent and filepath.parent.name:
        parent_path = filepath.parent

        # 检查是否超出 stop_dir 边界或到达 stop_dir 根目录本身
        if stop_dir is not None:
            try:
                stop_resolved = Path(stop_dir).resolve()
                parent_resolved = parent_path.resolve()
                if parent_resolved == stop_resolved or stop_resolved not in parent_resolved.parents:
                    return ""
            except Exception:
                pass

        # 1. 尝试直接从直接父目录名称中提取番号
        parent_avid = get_id(parent_path.name, ignored_patterns=ignored_patterns)
        if parent_avid:
            return parent_avid

        # 2. 若直接父目录未能识别出番号，且为分片/子光盘等目录（如 cd1, disc1, sub 等），继续向上追溯
        if _SUB_FOLDER_PATTERN.match(parent_path.name):
            return get_id(parent_path, ignored_patterns=ignored_patterns, stop_dir=stop_dir)

    return ""


def get_cid(filepath: str) -> str:
    """尝试将给定的文件名匹配为 DMM CID (Content ID)。

    Args:
        filepath: 文件路径或文件名。

    Returns:
        匹配成功的 CID 字符串，否则返回空字符串。
    """
    basename = os.path.splitext(os.path.basename(filepath))[0]
    # 移除末尾可能带有的分段影片序号
    possible = _CD_POSTFIX.sub("", basename)

    # CID 仅由数字、小写字母和下划线组成
    match = re.match(r"^([a-z\d_]+)$", possible, re.ASCII)
    if match:
        possible = match.group(1)
        if "_" not in possible:
            match = re.match(r"^[a-z\d]{7,19}$", possible)
            if match:
                return possible
        else:
            match2 = re.match(
                r"^h_\d{3,4}[a-z]{1,10}\d{2,5}[a-z\d]{0,8}$"
                r"|^\d{3}_\d{4,5}$"
                r"|^402[a-z]{3,6}\d*_[a-z]{3,8}\d{5,6}$"
                r"|^h_\d{3,4}wvr\d\w\d{4,5}[a-z\d]{0,8}$",
                possible,
            )
            if match2:
                return possible
    return ""


def guess_av_type(avid: str) -> str:
    """识别给定的番号所属的分类 ('normal', 'fc2', 'cid', 'getchu', 'gyutto')。"""
    if not avid:
        return "normal"
    if re.match(r"^FC2-\d{5,7}$", avid, re.IGNORECASE):
        return "fc2"
    if re.match(r"^GETCHU-(\d+)", avid, re.IGNORECASE):
        return "getchu"
    if re.match(r"^GYUTTO-(\d+)", avid, re.IGNORECASE):
        return "gyutto"
    cid = get_cid(avid)
    if cid == avid:
        return "cid"
    return "normal"


def detect_special_attr(filepath: str, avid: str | None = None) -> str:
    """通过文件名检测影片是否有特殊属性（内嵌字幕 -C、无码流出/破解 -U）。

    Args:
        filepath: 文件绝对路径或相对路径。
        avid: 可选的番号字符串，用于辅助识别。

    Returns:
        特殊属性标识字符串: '', 'U', 'C', 'UC'。
    """
    result = ""
    base = os.path.splitext(os.path.basename(filepath))[0].upper()

    # 正则识别无码关键词
    match = _SPECIAL_ATTR_PATTERN.search(base)
    if match:
        result += "U"

    # 尝试匹配 -C / -U / -UC 后缀
    postfix = base.split("-")[-1]
    if postfix in ("U", "C", "UC"):
        result += postfix
    elif avid:
        pattern_str = re.sub(r"[_-]", r"[_-]*", avid) + r"(UC|U|C)\b"
        match = re.search(pattern_str, base, flags=re.IGNORECASE)
        if match:
            result += match.group(1)

    # 格式化去重并降序排列保证稳定 (如 'UC')
    unique_sorted = "".join(sorted(set(result), reverse=True))
    return unique_sorted

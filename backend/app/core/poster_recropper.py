"""海报批量重裁剪工具。

扫描指定目录下文件名包含 "fanart" 的横版封面图片，
按大厂标准两步居中优化裁剪算法，重新批量生成对应的竖版 poster 文件。
"""

from __future__ import annotations

from dataclasses import dataclass, field
import logging
import os
from pathlib import Path
import re
import shutil
import time
from typing import Sequence
from PIL import Image, ImageOps

from app.core.cropper.interface import DefaultCropper, is_standard_fanza_ratio

logger = logging.getLogger(__name__)

__all__ = [
    "RecropItemResult",
    "RecropSummary",
    "derive_poster_path",
    "backup_file",
    "recrop_directory_posters",
]

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def derive_poster_path(fanart_path: Path) -> Path:
    """根据 fanart 文件名推导对应的 poster 文件名，保持命名前缀与风格一致。

    例如：
    - fanart.jpg -> poster.jpg
    - Fanart.jpg -> Poster.jpg
    - IPX-111-fanart.jpg -> IPX-111-poster.jpg
    - s1_001_FANART.jpeg -> s1_001_POSTER.jpeg
    - movie_fanart_high.png -> movie_poster_high.png
    """
    stem = fanart_path.stem

    def _replace_match(m: re.Match[str]) -> str:
        text = m.group(0)
        if text.isupper():
            return "POSTER"
        if text[0].isupper():
            return "Poster"
        return "poster"

    new_stem = re.sub(r"fanart", _replace_match, stem, flags=re.IGNORECASE)
    # 若原文件名未包含 fanart，则拼接 -poster 后缀
    if new_stem == stem:
        new_stem = f"{stem}-poster"

    return fanart_path.parent / f"{new_stem}{fanart_path.suffix}"


def backup_file(path: Path) -> Path:
    """备份现有文件，若已有 .bak 文件则自动递增索引。"""
    bak_base = path.with_suffix(path.suffix + ".bak")
    if not bak_base.exists():
        shutil.copy2(path, bak_base)
        return bak_base

    idx = 1
    while True:
        candidate = path.parent / f"{path.name}.bak.{idx}"
        if not candidate.exists():
            shutil.copy2(path, candidate)
            return candidate
        idx += 1


@dataclass
class RecropItemResult:
    """单个图片的重裁剪处理结果。"""

    fanart_path: Path
    poster_path: Path
    width: int = 0
    height: int = 0
    aspect_ratio: float = 0.0
    is_standard_fanza: bool = False
    status: str = "success"  # "success" | "skipped" | "error"
    message: str = ""
    backed_up: bool = False
    backup_path: Path | None = None


@dataclass
class RecropSummary:
    """批量重裁剪任务汇总统计。"""

    directory: Path
    scanned_files: int = 0
    matched_files: int = 0
    cropped_files: int = 0
    skipped_files: int = 0
    backed_up_files: int = 0
    error_files: int = 0
    dry_run: bool = False
    results: list[RecropItemResult] = field(default_factory=list)


def recrop_directory_posters(
    dir_path: Path | str,
    recursive: bool = True,
    dry_run: bool = False,
    backup: bool = True,
    only_standard_fanza: bool = True,
    tolerance: float = 0.02,
    ratio: float = 1.5,
) -> RecropSummary:
    """扫描指定目录下所有 fanart 图片并批量重新裁剪生成对应的 poster。

    Args:
        dir_path: 目标目录路径。
        recursive: 是否递归扫描子目录。
        dry_run: 是否仅预检扫描（不实际写磁盘）。
        backup: 是否备份已有的 poster 文件。
        only_standard_fanza: 是否只处理满足 FANZA 标准比例 (800x538 及容差) 的图片。
        tolerance: 比例误差阈值。
        ratio: 目标海报高宽比 (默认 1.5 即 2:3)。
    """
    base_dir = Path(dir_path).resolve()
    summary = RecropSummary(directory=base_dir, dry_run=dry_run)

    if not base_dir.exists() or not base_dir.is_dir():
        return summary

    # 1. 发现包含 fanart 的图片候选文件
    candidates: list[Path] = []
    walker = base_dir.rglob("*") if recursive else base_dir.glob("*")
    for p in walker:
        if not p.is_file():
            continue
        if p.name.startswith("."):
            continue
        if p.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        # 排除备份文件
        if ".bak" in p.name.lower():
            continue
        # 文件名包含 fanart（忽略大小写）
        if "fanart" in p.stem.lower():
            candidates.append(p)

    candidates.sort()
    summary.scanned_files = len(candidates)
    cropper = DefaultCropper()

    # 2. 逐一检查并处理
    for fanart_file in candidates:
        poster_file = derive_poster_path(fanart_file)
        try:
            with Image.open(fanart_file) as raw_img:
                raw_img = ImageOps.exif_transpose(raw_img)
                w, h = raw_img.size
                aspect = w / h if h > 0 else 0.0
                is_std = is_standard_fanza_ratio(w, h, tolerance=tolerance)

                # 判定是否符合裁剪要求
                if only_standard_fanza and not is_std:
                    summary.skipped_files += 1
                    summary.results.append(
                        RecropItemResult(
                            fanart_path=fanart_file,
                            poster_path=poster_file,
                            width=w,
                            height=h,
                            aspect_ratio=round(aspect, 4),
                            is_standard_fanza=False,
                            status="skipped",
                            message=f"尺寸 {w}x{h} (宽高比 {aspect:.3f}) 超出标准展开图容差，已跳过",
                        )
                    )
                    continue

                summary.matched_files += 1

                # 若是预览模式 (dry_run)
                if dry_run:
                    summary.results.append(
                        RecropItemResult(
                            fanart_path=fanart_file,
                            poster_path=poster_file,
                            width=w,
                            height=h,
                            aspect_ratio=round(aspect, 4),
                            is_standard_fanza=is_std,
                            status="success",
                            message="[预检] 待裁剪为 2:3 竖版海报",
                            backed_up=poster_file.exists(),
                        )
                    )
                    continue

                # 正式裁剪模式：处理已有 poster 备份
                bak_path: Path | None = None
                has_backup = False
                if poster_file.exists() and backup:
                    try:
                        bak_path = backup_file(poster_file)
                        has_backup = True
                        summary.backed_up_files += 1
                    except Exception as bak_err:
                        logger.warning("备份旧海报失败: %s (%s)", poster_file, bak_err)

                # 执行裁剪
                poster_img = cropper.crop(
                    raw_img.convert("RGB"),
                    ratio=ratio,
                    standard_fanza_crop=True,
                )

                try:
                    # 原子安全写盘：先写入隐藏临时文件，写入校验成功后再原子替换，杜绝断电/中止时产生 0 字节损坏海报
                    fmt = "PNG" if poster_file.suffix.lower() == ".png" else "JPEG"
                    tmp_poster = poster_file.with_name(f".{poster_file.name}.tmp_{os.getpid()}_{time.time_ns()}")
                    try:
                        poster_img.save(tmp_poster, format=fmt, quality=95)
                        os.replace(tmp_poster, poster_file)
                    except Exception:
                        if tmp_poster.exists():
                            tmp_poster.unlink(missing_ok=True)
                        raise

                    summary.cropped_files += 1
                    pw, ph = poster_img.size
                    summary.results.append(
                        RecropItemResult(
                            fanart_path=fanart_file,
                            poster_path=poster_file,
                            width=w,
                            height=h,
                            aspect_ratio=round(aspect, 4),
                            is_standard_fanza=is_std,
                            status="success",
                            message=f"已成功裁剪输出海报 ({pw}x{ph})",
                            backed_up=has_backup,
                            backup_path=bak_path,
                        )
                    )
                finally:
                    poster_img.close()

        except Exception as e:
            logger.error("处理封面失败: %s (%s)", fanart_file, e)
            summary.error_files += 1
            summary.results.append(
                RecropItemResult(
                    fanart_path=fanart_file,
                    poster_path=poster_file,
                    status="error",
                    message=f"处理异常: {e}",
                )
            )

    return summary

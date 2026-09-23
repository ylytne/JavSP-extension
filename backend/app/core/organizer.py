"""文件重命名、路径生成与归档处理模块。"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
from pathlib import Path
import re
import shutil
import sys
from typing import Callable, Sequence

from PIL import Image

from app.config import get_config
from app.core.actress import clean_movie_actresses, get_actress_alias_map, resolve_actress_alias
from app.core.genre import clean_movie_genres
from app.core.image import process_cover_image
from app.core.models import MovieInfo, SafeDict
from app.core.nfo import write_nfo

logger = logging.getLogger(__name__)

_PARDIR_REPLACE = re.compile(r"\.{2,}")


def replace_illegal_chars(name: str) -> str:
    """将不能用于文件或文件夹名的非法字符替换为形近全角/Unicode安全字符。"""
    if sys.platform == "win32":
        charmap = {
            "<": "❮",
            ">": "❯",
            ":": "：",
            '"': "″",
            "/": "／",
            "\\": "＼",
            "|": "｜",
            "?": "？",
            "*": "꘎",
        }
        for c, rep in charmap.items():
            name = name.replace(c, rep)
    elif sys.platform == "darwin":
        name = name.replace(":", "：")
    else:
        name = name.replace("/", "／")

    if ".." in name:
        name = _PARDIR_REPLACE.sub("…", name)

    # 剔除换行及回车符
    name = name.replace("\r", "").replace("\n", " ").strip()
    return name


def truncate_title_for_path_length(
    base_folder: Path,
    folder_template: str,
    info_dict: dict[str, str],
    max_len: int = 250,
    by_byte: bool = True,
    title_break: list[str] | None = None,
) -> str:
    """若完整路径超过最大限制，智能截短标题字符串。"""
    title = info_dict.get("title", "")
    current_dict = dict(info_dict)

    def calc_len(t: str) -> int:
        current_dict["title"] = t
        subfolder = folder_template.format_map(SafeDict(current_dict))
        full_p = str(base_folder / subfolder)
        return len(full_p.encode("utf-8")) if by_byte else len(full_p)

    if calc_len(title) <= max_len:
        return title

    # 若有断句信息，尝试按句子边界从后向前截断
    if title_break and len(title_break) > 1:
        for end in range(len(title_break) - 1, 0, -1):
            candidate = "".join(title_break[:end]).strip()
            if candidate and calc_len(candidate) <= max_len:
                return candidate

    # 循环截断直至满足要求
    while len(title) > 5 and calc_len(title + "…") > max_len:
        title = title[:-2]

    return title + "…"


def organize_movie(
    files: list[str],
    metadata: MovieInfo,
    cover_base64: str | None = None,
    extra_fanarts_base64: Sequence[str] | None = None,
    actress_pics_base64: dict[str, str] | None = None,
    base_output_dir: str | Path | None = None,
    hard_sub: bool = False,
    uncensored: bool = False,
    on_step: Callable[[str, str], None] | None = None,
) -> str:
    """执行单部影片的落盘整理：生成 NFO、保存裁剪海报、移动/硬链接视频文件、保存剧照与女优本地头像。

    Args:
        files: 本地视频文件的原始绝对路径列表。
        metadata: 刮削汇总后的 MovieInfo 结构。
        cover_base64: 可选的 Base64 封面图。
        extra_fanarts_base64: 可选的剧照 Base64 数据 URL 列表（由前端扩展下载并传输）。
        actress_pics_base64: 可选的女优头像 Base64 字典（由前端扩展下载并传输，key 为女优名）。
        base_output_dir: 基础输出目录，若为 None 则使用第一个视频文件的父目录或配置目录。
        hard_sub: 是否有内嵌字幕。
        uncensored: 是否无码。
        on_step: 进度回调 (step_name, message)。

    Returns:
        最终整理生成的影片目录绝对路径。
    """
    config = get_config()
    if not files:
        raise ValueError("没有关联的视频文件待整理")

    first_file = Path(files[0]).resolve()
    if base_output_dir is None:
        base_dir = first_file.parent
    else:
        base_dir = Path(base_output_dir).resolve()

    # 标签分类清洗与规范化
    clean_movie_genres(metadata)
    # 演员别名规范化与去重清洗
    clean_movie_actresses(metadata)
    info_dict = metadata.get_info_dict()

    # 处理 -C / -U 额外属性后缀，确保重命名及输出文件夹中保留标识
    attr_suffix = ""
    if hard_sub and uncensored:
        attr_suffix = "-UC"
    elif hard_sub:
        attr_suffix = "-C"
    elif uncensored:
        attr_suffix = "-U"

    if attr_suffix and not info_dict["num"].upper().endswith(attr_suffix):
        info_dict["num"] = info_dict["num"] + attr_suffix

    # 女优数量截断（已在 clean_movie_actresses 中完成别名规整与全局去重）
    max_actress = config.summarizer.path.max_actress_count
    if metadata.actress:
        info_dict["actress"] = ",".join(metadata.actress[:max_actress])
    else:
        info_dict["actress"] = config.summarizer.default.actress

    # 路径清洗与超长截短
    cleaned_dict = {k: replace_illegal_chars(str(v)) for k, v in info_dict.items()}
    cleaned_dict["title"] = truncate_title_for_path_length(
        base_dir,
        config.summarizer.path.output_folder_pattern,
        cleaned_dict,
        max_len=config.summarizer.path.length_maximum,
        by_byte=config.summarizer.path.length_by_byte,
        title_break=metadata.title_break,
    )

    # 构造目标子文件夹路径
    rel_folder = config.summarizer.path.output_folder_pattern.format_map(SafeDict(cleaned_dict))
    target_dir = (base_dir / rel_folder).resolve()
    target_dir.mkdir(parents=True, exist_ok=True)

    # 构造基础文件名 (如 IPX-177 或 IPX-177-C)
    base_name = config.summarizer.path.basename_pattern.format_map(SafeDict(cleaned_dict))
    base_name = replace_illegal_chars(base_name)

    # 1. 移动或硬链接视频文件
    if on_step:
        on_step("ORGANIZING_FILES", "正在归档与移动视频文件")

    should_move = config.summarizer.move_files
    use_hardlink = config.summarizer.path.hard_link

    old_parents = set(Path(f).parent for f in files)

    for i, file_path_str in enumerate(files, start=1):
        src_path = Path(file_path_str).resolve()
        if not src_path.is_file():
            logger.warning("源视频文件不存在: %s", src_path)
            continue

        ext = src_path.suffix
        slice_suffix = f"-CD{i}" if len(files) > 1 else ""
        dest_filename = f"{base_name}{slice_suffix}{ext}"
        dest_path = target_dir / dest_filename

        # 防覆盖检查
        if dest_path.exists() and dest_path != src_path:
            # 追加数字后缀避免覆盖
            counter = 1
            while dest_path.exists():
                dest_filename = f"{base_name}{slice_suffix}_{counter}{ext}"
                dest_path = target_dir / dest_filename
                counter += 1

        if dest_path != src_path:
            if use_hardlink:
                try:
                    os.link(src_path, dest_path)
                except OSError as e:
                    logger.warning("创建硬链接失败 (%s)，回退至文件复制", e)
                    shutil.copy2(src_path, dest_path)
            elif should_move:
                shutil.move(src_path, dest_path)
            else:
                # 既不移动也不硬链，仅复制或就地保留
                shutil.copy2(src_path, dest_path)

    # 如果移动了文件，且原父目录变为空目录，则清理原空文件夹
    if should_move:
        for p in old_parents:
            try:
                curr = p
                while curr.exists() and curr != target_dir and curr != base_dir and not any(curr.iterdir()):
                    curr.rmdir()
                    curr = curr.parent
            except OSError:
                pass

    # 2. 生成并写入 NFO 文件
    # 2. 保存本地女优头像 (.actors/)
    saved_actors: list[str] = []
    if config.summarizer.actress_avatar.enabled and actress_pics_base64:
        saved_actors = save_actress_avatars(
            actress_pics_base64=actress_pics_base64,
            target_dir=target_dir,
            on_step=on_step,
        )

    # 3. 写入 NFO 文件
    if on_step:
        on_step("WRITING_NFO", "正在写入 NFO 文件")

    nfo_basename = config.summarizer.nfo.basename_pattern
    if "{" in nfo_basename and "}" in nfo_basename:
        nfo_filename = f"{replace_illegal_chars(nfo_basename.format_map(SafeDict(cleaned_dict)))}.nfo"
    else:
        nfo_filename = f"{nfo_basename}.nfo"

    nfo_path = target_dir / nfo_filename
    write_nfo(metadata, nfo_path, config=config, local_actors=saved_actors)

    # 3. 处理封面图片（fanart 与 poster）
    if cover_base64:
        if on_step:
            on_step("CROPPING_POSTER", "正在裁剪海报并合成角标水印")

        fanart_pat = config.summarizer.fanart.basename_pattern
        poster_pat = config.summarizer.cover.basename_pattern
        fanart_name = (
            f"{replace_illegal_chars(fanart_pat.format_map(SafeDict(cleaned_dict)))}.jpg"
            if "{" in fanart_pat and "}" in fanart_pat
            else f"{fanart_pat}.jpg"
        )
        poster_name = (
            f"{replace_illegal_chars(poster_pat.format_map(SafeDict(cleaned_dict)))}.jpg"
            if "{" in poster_pat and "}" in poster_pat
            else f"{poster_pat}.jpg"
        )

        try:
            process_cover_image(
                cover_base64=cover_base64,
                save_dir=target_dir,
                hard_sub=hard_sub,
                uncensored=uncensored,
                cropper_ratio=config.summarizer.cover.crop.ratio,
                cropper_engine=config.summarizer.cover.crop.engine,
                standard_fanza_crop=config.summarizer.cover.crop.standard_fanza_crop,
                add_label=config.summarizer.cover.add_label,
                fanart_name=fanart_name,
                poster_name=poster_name,
            )
        except Exception as img_err:
            logger.warning("封面处理失败: %s", img_err)
            if on_step:
                on_step("CROPPING_POSTER", f"封面处理异常 ({img_err})，已跳过图片生成")

    # 4. 保存剧照 (extrafanart)
    if config.summarizer.extra_fanarts.enabled and extra_fanarts_base64:
        save_extra_fanarts(
            extra_fanarts_base64=extra_fanarts_base64,
            target_dir=target_dir,
            on_step=on_step,
        )

    return str(target_dir)


def save_extra_fanarts(
    extra_fanarts_base64: Sequence[str],
    target_dir: Path,
    on_step: Callable[[str, str], None] | None = None,
) -> int:
    """将前端扩展下载并传输的剧照 Base64 数据保存到 target_dir/extrafanart/ 目录。

    严格遵循双端协同架构职责边界：
    网络请求、过盾与图片下载全部在前端浏览器扩展中执行，
    后端只负责本地文件 I/O、图片完整性校验与归档落盘，绝不直接对外网发起网络请求。

    Args:
        extra_fanarts_base64: 剧照 Base64 数据 URL 列表。
        target_dir: 影片根目录。
        on_step: 步骤回调通知。

    Returns:
        成功保存的剧照数量。
    """
    if not extra_fanarts_base64:
        return 0

    extrafanart_dir = target_dir / "extrafanart"
    extrafanart_dir.mkdir(parents=True, exist_ok=True)

    total = len(extra_fanarts_base64)
    saved_count = 0

    if on_step:
        on_step("SAVING_EXTRAFANARTS", f"正在落盘保存剧照 (共 {total} 张)")

    for idx, b64_item in enumerate(extra_fanarts_base64):
        item_str = b64_item.strip() if isinstance(b64_item, str) else ""
        if not item_str:
            continue

        raw_bytes: bytes | None = None
        try:
            if ";base64," in item_str:
                raw_bytes = base64.b64decode(item_str.split(";base64,", 1)[1])
            else:
                raw_bytes = base64.b64decode(item_str)
        except Exception as b64_err:
            logger.warning("剧照 %d Base64 解码失败: %s", idx, b64_err)
            continue

        if not raw_bytes:
            continue

        # 严格校验图片完整性并统一转换为 0.jpg, 1.jpg... 无空洞连续编号保存
        dest_file = extrafanart_dir / f"{saved_count}.jpg"
        try:
            with Image.open(io.BytesIO(raw_bytes)) as img:
                img.convert("RGB").save(dest_file, "JPEG", quality=95)
            saved_count += 1
        except Exception as img_err:
            logger.warning("剧照 %d 数据不是有效图片或转换失败: %s", idx, img_err)
            if dest_file.exists():
                try:
                    dest_file.unlink()
                except OSError:
                    pass

    # 清理可能残留的超出本次有效保存数量的旧剧照文件 (如 0.jpg, 1.jpg 之后的旧 2.jpg)
    stale_idx = saved_count
    while True:
        stale_file = extrafanart_dir / f"{stale_idx}.jpg"
        if stale_file.exists():
            try:
                stale_file.unlink()
            except OSError:
                pass
            stale_idx += 1
        else:
            break

    # 若未成功保存任何图片，清理生成的空目录
    if saved_count == 0 and extrafanart_dir.is_dir():
        try:
            if not any(extrafanart_dir.iterdir()):
                extrafanart_dir.rmdir()
        except OSError:
            pass

    if on_step:
        on_step("SAVING_EXTRAFANARTS", f"剧照保存完成，成功落盘 {saved_count}/{total} 张")

    return saved_count


def save_actress_avatars(
    actress_pics_base64: dict[str, str],
    target_dir: Path,
    on_step: Callable[[str, str], None] | None = None,
) -> list[str]:
    """将前端扩展下载并传输的女优头像 Base64 数据保存到 target_dir/.actors/ 目录。

    严格遵循双端协同架构职责边界：
    网络请求、过盾与图片下载全部在前端浏览器扩展中执行，
    后端只负责本地文件 I/O、图片完整性校验与归档落盘，绝不直接对外网发起网络请求。

    Args:
        actress_pics_base64: 演员头像 Base64 字典，key 为演员名字，value 为 Base64 字符串。
        target_dir: 影片根目录。
        on_step: 步骤回调通知。

    Returns:
        成功落盘头像的女优主规范名列表。
    """
    if not actress_pics_base64:
        return []

    actors_dir = target_dir / ".actors"
    actors_dir.mkdir(parents=True, exist_ok=True)

    total = len(actress_pics_base64)
    saved_actresses: list[str] = []

    if on_step:
        on_step("SAVING_ACTRESS_AVATARS", f"正在落盘保存女优本地头像 (共 {total} 位)")

    for raw_name, b64_item in actress_pics_base64.items():
        canonical_name = resolve_actress_alias(str(raw_name).strip())
        if not canonical_name:
            continue

        item_str = b64_item.strip() if isinstance(b64_item, str) else ""
        if not item_str:
            continue

        raw_bytes: bytes | None = None
        try:
            if ";base64," in item_str:
                raw_bytes = base64.b64decode(item_str.split(";base64,", 1)[1])
            else:
                raw_bytes = base64.b64decode(item_str)
        except Exception as b64_err:
            logger.warning("女优 %s 头像 Base64 解码失败: %s", canonical_name, b64_err)
            continue

        if not raw_bytes:
            continue

        # 严格校验图片完整性并统一转换为 .actors/{canonical_name}.jpg 保存
        safe_filename = replace_illegal_chars(canonical_name)
        dest_file = actors_dir / f"{safe_filename}.jpg"
        try:
            with Image.open(io.BytesIO(raw_bytes)) as img:
                img.convert("RGB").save(dest_file, "JPEG", quality=95)
            if canonical_name not in saved_actresses:
                saved_actresses.append(canonical_name)
        except Exception as img_err:
            logger.warning("女优 %s 头像图片格式无效或损坏，跳过保存: %s", canonical_name, img_err)
            if dest_file.is_file():
                try:
                    dest_file.unlink()
                except OSError:
                    pass

    # 若未成功保存任何图片，清理生成的空目录
    if not saved_actresses and actors_dir.is_dir():
        try:
            if not any(actors_dir.iterdir()):
                actors_dir.rmdir()
        except OSError:
            pass

    if on_step:
        on_step(
            "SAVING_ACTRESS_AVATARS",
            f"女优头像保存完成，成功落盘 {len(saved_actresses)}/{total} 位",
        )

    return saved_actresses



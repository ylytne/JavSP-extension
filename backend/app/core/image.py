"""图像处理与角标合成模块。"""

from __future__ import annotations

import base64
from enum import Enum
import io
import logging
from pathlib import Path
from PIL import Image, ImageOps

from app.core.cropper.interface import get_cropper

logger = logging.getLogger(__name__)


class LabelPosition(Enum):
    """水印/角标位置枚举。"""
    TOP_LEFT = 1
    TOP_RIGHT = 2
    BOTTOM_LEFT = 3
    BOTTOM_RIGHT = 4


def valid_pic(pic_path: str | Path) -> bool:
    """检查本地图片文件是否完整可读。"""
    try:
        with Image.open(pic_path) as img:
            img = ImageOps.exif_transpose(img)
            img.load()
        return True
    except Exception as e:
        logger.debug("图片损坏或无法读取: %s (%s)", pic_path, e)
        return False


def get_pic_size(pic_path: str | Path) -> tuple[int, int]:
    """获取图片文件的实际分辨率 (width, height)。"""
    with Image.open(pic_path) as pic:
        pic = ImageOps.exif_transpose(pic)
        return pic.size


def add_label_to_poster(
    poster: Image.Image,
    mark_img: Image.Image,
    pos: LabelPosition = LabelPosition.TOP_LEFT,
) -> Image.Image:
    """向海报图层中粘贴角标水印（自动支持透明通道）。"""
    mark_rgba = mark_img.convert("RGBA")
    _, _, _, alpha = mark_rgba.split()

    pw, ph = poster.size
    mw, mh = mark_rgba.size

    # 如果角标尺寸过大，按海报宽度等比缩小（最多占海报宽度的 30%）
    if mw > pw * 0.35:
        target_w = max(int(pw * 0.3), 1)
        target_h = max(int(mh * (target_w / mw)), 1)
        mark_rgba = mark_rgba.resize((target_w, target_h), Image.Resampling.LANCZOS)
        _, _, _, alpha = mark_rgba.split()
        mw, mh = mark_rgba.size

    if pos == LabelPosition.TOP_LEFT:
        box = (0, 0)
    elif pos == LabelPosition.TOP_RIGHT:
        box = (pw - mw, 0)
    elif pos == LabelPosition.BOTTOM_LEFT:
        box = (0, ph - mh)
    elif pos == LabelPosition.BOTTOM_RIGHT:
        box = (pw - mw, ph - mh)
    else:
        box = (0, 0)

    poster = poster.copy()
    poster.paste(mark_rgba, box=box, mask=alpha)
    return poster


def find_watermark_path(name: str) -> Path | None:
    """寻找角标水印资源文件路径。"""
    base_dir = Path(__file__).resolve().parent.parent.parent
    candidates = [
        base_dir / "data" / "images" / name,
        base_dir.parent / "JavSP" / "image" / name,
    ]
    for c in candidates:
        if c.is_file():
            return c
    return None


def process_cover_image(
    cover_base64: str,
    save_dir: Path | str,
    hard_sub: bool = False,
    uncensored: bool = False,
    cropper_ratio: float = 1.5,
    cropper_engine: str | None = None,
    standard_fanza_crop: bool = True,
    add_label: bool = True,
    fanart_name: str = "fanart.jpg",
    poster_name: str = "poster.jpg",
) -> tuple[str, str]:
    """处理 Base64 图片，落盘保存横版封面 fanart.jpg 与裁剪后的竖版 poster.jpg。

    Args:
        cover_base64: Base64 编码的图片数据（可包含 'data:image/...;base64,' 前缀）。
        save_dir: 保存文件的目标目录。
        hard_sub: 是否包含内嵌中文字幕 (-C)。
        uncensored: 是否为无码流出/破解 (-U)。
        cropper_ratio: 竖版海报高宽比，默认 1.5 (2:3)。
        cropper_engine: 裁剪引擎 ('slimeface' 或 None)。
        standard_fanza_crop: 是否针对 800x538 标准比例展开图启用两步优化裁剪。
        add_label: 是否添加角标。
        fanart_name: 横版图文件名。
        poster_name: 竖版海报文件名。

    Returns:
        (fanart_path, poster_path) 绝对路径元组。
    """
    dest_dir = Path(save_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    # 清理 Base64 前缀
    if "," in cover_base64:
        cover_base64 = cover_base64.split(",", 1)[1]

    img_data = base64.b64decode(cover_base64)
    original_img = Image.open(io.BytesIO(img_data))
    original_img = ImageOps.exif_transpose(original_img).convert("RGB")

    fanart_path = dest_dir / fanart_name
    poster_path = dest_dir / poster_name

    # 1. 保存横版 fanart
    original_img.save(fanart_path, format="JPEG", quality=95)

    # 2. 裁剪竖版海报
    cropper = get_cropper(cropper_engine)
    poster_img = cropper.crop(original_img, cropper_ratio, standard_fanza_crop=standard_fanza_crop)

    # 3. 合成角标
    if add_label:
        if hard_sub:
            sub_path = find_watermark_path("sub_mark.png")
            if sub_path:
                with Image.open(sub_path) as sub_img:
                    poster_img = add_label_to_poster(poster_img, sub_img, LabelPosition.TOP_LEFT)

        if uncensored:
            unc_path = find_watermark_path("unc_mark.png")
            if unc_path:
                with Image.open(unc_path) as unc_img:
                    # 如果已有字幕角标在左上，无码角标放置在右上
                    pos = LabelPosition.TOP_RIGHT if hard_sub else LabelPosition.TOP_LEFT
                    poster_img = add_label_to_poster(poster_img, unc_img, pos)

    poster_img.save(poster_path, format="JPEG", quality=95)

    return str(fanart_path), str(poster_path)

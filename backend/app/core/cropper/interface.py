"""图像裁剪引擎接口与实现。"""

from __future__ import annotations

from abc import ABC, abstractmethod
from PIL import Image


# 标准 FANZA/DMM 展开图基准尺寸与参数
STD_FANZA_WIDTH = 800
STD_FANZA_HEIGHT = 538
STD_FANZA_RATIO = STD_FANZA_WIDTH / STD_FANZA_HEIGHT  # 约 1.4869888...
STD_FRONT_START_X = 421  # 800 宽图下的正面起始 X 坐标
STD_FRONT_START_RATIO = STD_FRONT_START_X / STD_FANZA_WIDTH  # 0.52625


def is_standard_fanza_ratio(width: int, height: int, tolerance: float = 0.02) -> bool:
    """判定图片宽高比是否满足大厂标准展开图 (800x538) 及容差范围。"""
    if height <= 0:
        return False
    aspect = width / height
    return abs(aspect - STD_FANZA_RATIO) <= tolerance


class Cropper(ABC):
    """海报裁剪抽象基类。"""

    @abstractmethod
    def crop_specific(
        self,
        fanart: Image.Image,
        ratio: float,
        standard_fanza_crop: bool = True,
    ) -> Image.Image:
        """根据指定高宽比执行图片裁剪。"""
        pass

    def crop(
        self,
        fanart: Image.Image,
        ratio: float | None = None,
        standard_fanza_crop: bool = True,
    ) -> Image.Image:
        """裁剪海报。

        Args:
            fanart: 待裁剪的原始横版封面 PIL Image。
            ratio: 高宽比 (height / width)，2:3 纵向海报标准值为 1.5。
            standard_fanza_crop: 是否针对 800x538 标准比例展开图启用两步优化裁剪。
        """
        if ratio is None:
            ratio = 1.5
        return self.crop_specific(fanart, ratio, standard_fanza_crop=standard_fanza_crop)


class DefaultCropper(Cropper):
    """默认比例裁剪引擎（支持 FANZA 800x538 两步居中优化裁剪，及传统右侧裁剪）。"""

    def _crop_standard_fanza(self, fanart: Image.Image, ratio: float) -> Image.Image:
        """针对 800x538 及等比例海报执行两步优化裁剪（先定位正面，再居中切 2:3）。"""
        fanart_w, fanart_h = fanart.size

        # 1. 第一步：以 421/800 比例计算正面起始 X 坐标并确定正面主体区域
        front_start_x = round(fanart_w * STD_FRONT_START_RATIO)
        front_w = fanart_w - front_start_x
        front_h = fanart_h

        # 2. 第二步：在正面主体区域内，按 ratio 居中裁剪为竖版海报
        target_w = int(front_h / ratio)
        if front_w >= target_w:
            # 正常情况：正面宽度充足，水平居中裁剪（避开左侧书脊与右侧出血位）
            dx = (front_w - target_w) // 2
            left = front_start_x + dx
            right = left + target_w
            box = (left, 0, right, front_h)
        else:
            # 异常情况：正面宽度不足以达到目标高宽比，垂直居中
            target_h = int(front_w * ratio)
            dy = (front_h - target_h) // 2
            box = (front_start_x, dy, fanart_w, dy + target_h)

        return fanart.crop(box)

    def _crop_fallback_right(self, fanart: Image.Image, ratio: float) -> Image.Image:
        """传统右侧区域裁剪。"""
        fanart_w, fanart_h = fanart.size
        if fanart_h / fanart_w < ratio:
            poster_w = int(fanart_h / ratio)
            poster_h = fanart_h
        else:
            poster_w = fanart_w
            poster_h = int(fanart_w * ratio)

        dh = int((fanart_h - poster_h) / 2)
        # 裁剪框取右侧区域 (fanart_w - poster_w, dh, fanart_w, poster_h + dh)
        box = (fanart_w - poster_w, dh, fanart_w, poster_h + dh)
        return fanart.crop(box)

    def crop_specific(
        self,
        fanart: Image.Image,
        ratio: float,
        standard_fanza_crop: bool = True,
    ) -> Image.Image:
        """根据封面尺寸按比例裁剪出海报。

        若开启 standard_fanza_crop 且原图符合 800x538 标准比例，则采用两步居中裁剪；
        否则平滑降级为传统的靠右裁剪。
        """
        fanart_w, fanart_h = fanart.size
        if standard_fanza_crop and is_standard_fanza_ratio(fanart_w, fanart_h):
            return self._crop_standard_fanza(fanart, ratio)
        return self._crop_fallback_right(fanart, ratio)


class SlimefaceCropper(Cropper):
    """Slimeface AI 人脸/人体识别智能裁剪引擎（未安装模型时优雅降级到 DefaultCropper）。"""

    def crop_specific(
        self,
        fanart: Image.Image,
        ratio: float,
        standard_fanza_crop: bool = True,
    ) -> Image.Image:
        try:
            from slimeface import detectRGB  # type: ignore

            bbox_confs = detectRGB(fanart.width, fanart.height, fanart.convert("RGB").tobytes())
            if not bbox_confs:
                return DefaultCropper().crop_specific(fanart, ratio, standard_fanza_crop)

            bbox_confs.sort(key=lambda conf_bbox: -conf_bbox[4])  # 按置信度降序
            face = bbox_confs[0][:-1]  # (fx, fy, fw, fh)

            # 计算目标 poster 宽高
            fanart_w, fanart_h = fanart.size
            if fanart_h / fanart_w < ratio:
                poster_w = int(fanart_h / ratio)
                poster_h = fanart_h
            else:
                poster_w = fanart_w
                poster_h = int(fanart_w * ratio)

            fx, fy, fw, fh = face
            cx = fx + fw / 2

            poster_left = max(cx - poster_w / 2, 0)
            poster_left = min(poster_left, fanart_w - poster_w)
            poster_left = int(poster_left)

            return fanart.crop((poster_left, 0, poster_left + poster_w, poster_h))
        except Exception:
            return DefaultCropper().crop_specific(fanart, ratio, standard_fanza_crop)


def get_cropper(engine: str | None = None) -> Cropper:
    """获取指定的裁剪器实例。"""
    if engine and engine.lower() == "slimeface":
        return SlimefaceCropper()
    return DefaultCropper()

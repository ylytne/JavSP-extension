"""数据契约模型定义 (MovieInfo 与 ScanMovieItem)."""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


class MovieInfo(BaseModel):
    """影片结构化元数据契约（对齐前端 MovieInfo 与原 JavSP 数据格式）。"""
    dvdid: str
    cid: str | None = None
    url: str | None = None
    title: str
    ori_title: str | None = None
    title_break: list[str] = Field(default_factory=list)
    ori_title_break: list[str] = Field(default_factory=list)
    plot: str | None = None
    ori_plot: str | None = None
    cover: str
    big_cover: str | None = None
    covers: list[str] = Field(default_factory=list)
    big_covers: list[str] = Field(default_factory=list)
    score: str | None = None
    publish_date: str | None = None
    duration: str | None = None
    director: str | None = None
    producer: str | None = None
    publisher: str | None = None
    serial: str | None = None
    genre: list[str] = Field(default_factory=list)
    genre_id: list[str] = Field(default_factory=list)
    genre_norm: list[str] = Field(default_factory=list)
    actress: list[str] = Field(default_factory=list)
    actress_pics: dict[str, str] = Field(default_factory=dict)
    preview_pics: list[str] = Field(default_factory=list)
    preview_video: str | None = None
    uncensored: bool | None = None
    magnet: list[str] = Field(default_factory=list)

    def get_info_dict(self) -> dict[str, str]:
        """生成用于命名与模板变量插值的字典映射。"""
        num_str = self.dvdid or self.cid or ""
        date_str = self.publish_date or "0000-00-00"
        year_str = date_str.split("-")[0] if "-" in date_str else "0000"
        num_items = num_str.split("-")
        label_str = num_items[0] if len(num_items) > 1 else "---"

        genres = self.genre_norm if self.genre_norm else self.genre

        try:
            from app.config import get_config
            censor_reps = get_config().summarizer.censor_options_representation
        except Exception:
            censor_reps = ["无码", "有码", "打码情况未知"]

        if self.uncensored is True:
            censor_str = censor_reps[0] if len(censor_reps) > 0 else "无码"
        elif self.uncensored is False:
            censor_str = censor_reps[1] if len(censor_reps) > 1 else "有码"
        else:
            censor_str = censor_reps[2] if len(censor_reps) > 2 else "打码情况未知"

        return {
            "num": num_str,
            "dvdid": self.dvdid or "",
            "cid": self.cid or "",
            "title": self.title,
            "rawtitle": self.ori_title or self.title,
            "actress": ",".join(dict.fromkeys(a.strip() for a in self.actress if a.strip())) if self.actress else "#未知女优",
            "score": self.score or "0",
            "censor": censor_str,
            "serial": self.serial or "#未知系列",
            "director": self.director or "#未知导演",
            "producer": self.producer or "#未知制作商",
            "studio": self.producer or "#未知制作商",
            "publisher": self.publisher or "#未知发行商",
            "date": date_str,
            "year": year_str,
            "label": label_str,
            "genre": ",".join(genres) if genres else "",
        }


class SafeDict(dict):
    """安全字典，缺失键时回退为保留原始占位符字符串，避免模板插值抛出 KeyError。"""
    def __missing__(self, key: str) -> str:
        return f"{{{key}}}"


class ScanMovieItem(BaseModel):
    """磁盘扫描出的单部待处理影片任务模型。"""
    taskId: str
    dvdid: str
    cid: str | None = None
    files: list[str]
    data_src: Literal["normal", "fc2", "cid"] = "normal"
    hard_sub: bool = False
    uncensored: bool = False
    status: Literal["pending", "scraping", "organizing", "completed", "error"] = "pending"
    errorMsg: str | None = None

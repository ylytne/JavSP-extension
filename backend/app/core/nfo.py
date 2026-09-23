"""Kodi / Jellyfin / Emby XML NFO 元数据生成器。"""

from __future__ import annotations

import re
from pathlib import Path
from lxml.builder import E
from lxml.etree import tostring

from app.config import get_config, AppConfig
from app.core.actress import clean_movie_actresses
from app.core.genre import clean_movie_genres
from app.core.models import MovieInfo, SafeDict

__all__ = ["write_nfo", "generate_nfo_content"]


def generate_nfo_content(
    info: MovieInfo,
    config: AppConfig | None = None,
    local_actors: set[str] | list[str] | None = None,
) -> str:
    """根据 MovieInfo 实例构造符合 Kodi / Jellyfin / Emby 规范的 NFO XML 字符串。"""
    # 标签分类清洗与规范化
    clean_movie_genres(info)
    # 演员列表清洗与规范化
    clean_movie_actresses(info)

    cfg = config or get_config()
    info_dict = info.get_info_dict()
    safe_dict = SafeDict(info_dict)

    movie_elem = E.movie()

    # 1. 标题处理
    nfo_title = cfg.summarizer.nfo.title_pattern.format_map(safe_dict)
    movie_elem.append(E.title(nfo_title))

    # 2. 原始标题 (过滤纯数字、空白等异常数据)
    if info.ori_title and info.ori_title.strip() and not re.fullmatch(r"[\d\s]+", info.ori_title):
        movie_elem.append(E.originaltitle(info.ori_title))

    # 3. 评分
    if info.score:
        movie_elem.append(E.rating(str(info.score)))

    # 4. 剧情简介
    if info.plot:
        movie_elem.append(E.plot(info.plot))

    # 5. 时长
    if info.duration:
        movie_elem.append(E.runtime(str(info.duration)))

    # 6. 分级 (固定 NC-17)
    movie_elem.append(E.mpaa("NC-17"))

    # 7. uniqueid (dvdid 与 cid)
    if info.dvdid:
        movie_elem.append(E.uniqueid(info.dvdid, type="num", default="true"))
    if info.cid:
        if not info.dvdid:
            movie_elem.append(E.uniqueid(info.cid, type="cid", default="true"))
        else:
            movie_elem.append(E.uniqueid(info.cid, type="cid"))

    # 8. 分类 (genre)
    base_genres = info.genre_norm if info.genre_norm else info.genre
    genres: list[str] = list(base_genres) if base_genres else []
    for g_tmpl in cfg.summarizer.nfo.custom_genres_fields:
        formatted = g_tmpl.format_map(safe_dict).strip()
        if formatted:
            for part in formatted.split(","):
                part_clean = part.strip()
                if part_clean and part_clean not in genres:
                    genres.append(part_clean)

    for g in genres:
        movie_elem.append(E.genre(g))

    # 9. 标签 (tag)
    tags: list[str] = []
    for t_tmpl in cfg.summarizer.nfo.custom_tags_fields:
        formatted = t_tmpl.format_map(safe_dict).strip()
        if formatted:
            for part in formatted.split(","):
                part_clean = part.strip()
                if part_clean and part_clean not in tags:
                    tags.append(part_clean)

    for t in tags:
        movie_elem.append(E.tag(t))

    # 10. 国家
    movie_elem.append(E.country("日本"))

    # 11. 发行日期
    if info.publish_date:
        movie_elem.append(E.premiered(info.publish_date))

    # 12. 制作商 / 片商
    if info.producer:
        movie_elem.append(E.studio(info.producer))

    # 13. 导演
    if info.director:
        movie_elem.append(E.director(info.director))

    # 14. 系列
    if info.serial:
        movie_elem.append(E.set(E.name(info.serial)))

    # 15. 预告片 (仅在配置显式开启时写入，默认关闭以避免外部失效/被墙的 m3u8 导致 Jellyfin 卡死)
    if cfg.summarizer.nfo.include_trailer and info.preview_video:
        movie_elem.append(E.trailer(info.preview_video))

    # 16. 演员与头像
    # 核心安全规范：代码层面彻底杜绝写入外部 HTTP(S) URL，防止 Jellyfin 等媒体服务器并发抓取外网图床导致前端彻底卡死及 403 阻断。
    thumb_mode = cfg.summarizer.nfo.actress_thumb_mode
    local_actors_set = set(local_actors or [])

    if info.actress:
        for act in info.actress:
            act_clean = act.strip()
            if not act_clean:
                continue
            # 仅当显式配置为 local 且本地存在该女优头像（落盘于 .actors/）时，才写入相对路径
            if thumb_mode == "local" and act_clean in local_actors_set:
                rel_thumb = f".actors/{act_clean}.jpg"
                movie_elem.append(E.actor(E.name(act_clean), E.thumb(rel_thumb)))
            else:
                # 默认 'none' 模式或本地未落盘：仅保留规范演员名，完全依靠播放器自动识别同级 .actors/ 或媒体库全局人物库
                movie_elem.append(E.actor(E.name(act_clean)))

    xml_text = tostring(
        movie_elem,
        encoding="unicode",
        pretty_print=True,
        doctype='<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>',
    )
    return xml_text


def write_nfo(
    info: MovieInfo,
    nfo_path: str | Path,
    config: AppConfig | None = None,
    local_actors: set[str] | list[str] | None = None,
) -> str:
    """生成 NFO 并写入文件。

    Args:
        info: MovieInfo 实例。
        nfo_path: 输出的 .nfo 文件绝对路径。
        config: 可选的应用配置实例。
        local_actors: 可选的已在本地 .actors/ 目录下保存头像的女优主规范名列表。

    Returns:
        写入的 NFO 文件绝对路径。
    """
    path = Path(nfo_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    content = generate_nfo_content(info, config=config, local_actors=local_actors)
    path.write_text(content, encoding="utf-8")
    return str(path)

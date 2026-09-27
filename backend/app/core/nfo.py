"""Kodi / Jellyfin / Emby XML NFO 元数据生成器。"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from lxml.builder import E
from lxml.etree import tostring

from app.config import get_config, AppConfig
from app.core.actress import clean_movie_actresses
from app.core.genre import clean_movie_genres
from app.core.models import MovieInfo, SafeDict

__all__ = ["write_nfo", "generate_nfo_content", "clean_plot_text"]


def clean_plot_text(
    plot: str | None,
    num: str | None = None,
    config: AppConfig | None = None,
    safe_dict: SafeDict | dict[str, Any] | None = None,
) -> str:
    """清洗剧情简介 (plot) 文本。

    1. 若未开启 clean_plot，直接返回原文本（去除首尾空白）；
    2. 若开启 clean_plot_num 且提供了番号 num：
       识别并剥离简介开头的番号（包含各类全半角括号变体、冒号、连字符，以及紧随的空格）；
    3. 遍历 plot_clean_patterns 规则列表：
       支持模板插值（如 {num} 等）；
       对于普通文本模式，支持前后空白容差匹配；对于正则模式直接正则替换；
    4. 执行最终 strip()，消除末尾残留空格。
    """
    if not plot or not isinstance(plot, str):
        return ""

    cfg = config or get_config()
    nfo_cfg = cfg.summarizer.nfo

    if not nfo_cfg.clean_plot:
        return plot.strip()

    text = plot.strip()

    # 1. 清洗简介开头出现的番号
    if nfo_cfg.clean_plot_num and num and num.strip():
        clean_num = num.strip()
        num_parts = [re.escape(clean_num)]
        # 若番号中包含 '-' 或 '_'，同时兼容无连字符的形式（例如 SNOS-030 与 SNOS030）
        num_no_sep = re.sub(r"[\-_]", "", clean_num)
        if num_no_sep and num_no_sep != clean_num:
            num_parts.append(re.escape(num_no_sep))

        num_regex = "|".join(num_parts)
        # 匹配开头的可选括号、番号本身、可选的闭括号、可选的冒号/连字符/下划线、以及紧随其后的任意数量空白字符
        leading_num_pattern = re.compile(
            rf"^\s*(?:[\[\(【（]?\s*(?:{num_regex})\s*[\]\)】）]?)\s*[:：\-—_]?\s*",
            re.IGNORECASE,
        )
        text = leading_num_pattern.sub("", text)

    # 2. 清洗自定义规则列表 (plot_clean_patterns)
    patterns = nfo_cfg.plot_clean_patterns or []
    for pat in patterns:
        if not pat or not pat.strip():
            continue

        # 模板变量插值 (如包含 {num} 等)
        if safe_dict is not None:
            try:
                formatted_pat = pat.format_map(safe_dict)
            except Exception:
                formatted_pat = pat
        elif num:
            formatted_pat = pat.replace("{num}", num)
        else:
            formatted_pat = pat

        # 判断是否为正则表达式语法
        is_regex = any(ch in formatted_pat for ch in ("^", "$", "\\", ".*", ".+", "(?", "|"))
        if not is_regex:
            # 智能空白容差：提取去空白后的纯净子串，前后允许匹配可选空白 \s*
            # 这样输入 ' - airav.io' 或 '- airav.io' 均能彻底匹配并移除，不会残留末尾空格
            core_text = formatted_pat.strip()
            if core_text:
                regex_tolerant = re.compile(rf"\s*{re.escape(core_text)}\s*", re.IGNORECASE)
                text = regex_tolerant.sub("", text)
        else:
            try:
                text = re.sub(formatted_pat, "", text, flags=re.IGNORECASE)
            except re.error:
                text = text.replace(formatted_pat, "")

    return text.strip()


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

    # 4. 剧情简介 (经由 clean_plot_text 清洗番号前缀与脏文本)
    if info.plot:
        cleaned_plot = clean_plot_text(
            info.plot,
            num=info.dvdid or info.cid,
            config=cfg,
            safe_dict=safe_dict,
        )
        if cleaned_plot:
            movie_elem.append(E.plot(cleaned_plot))

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

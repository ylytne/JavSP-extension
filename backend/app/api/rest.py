"""REST API 端点定义。"""

from __future__ import annotations

from typing import Any
from pathlib import Path
import anyio
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from urllib.parse import urlparse
from app import __version__
from app.api.auth import verify_api_token
from app.config import (
    AppConfig,
    get_config,
    get_default_config,
    get_raw_config_text,
    save_config,
    save_raw_config_text,
    is_running_in_docker,
)
from app.api.ws import manager
from app.core.nfo_cleaner import clean_nfo_directory, clean_nfo_content
from app.core.poster_recropper import recrop_directory_posters

router = APIRouter(prefix="/api", dependencies=[Depends(verify_api_token)])


class RawConfigRequest(BaseModel):
    """原始 YAML 文本请求体。"""
    yaml: str


class TabBridgeHostRequest(BaseModel):
    """添加 Tab 桥接站点域名请求体。"""
    host: str


class CleanNfoRequest(BaseModel):
    """NFO 标签清理请求体。"""
    directory: str
    clean_trailer: bool = True
    clean_actor_thumb: bool = True
    recursive: bool = True
    dry_run: bool = False
    backup: bool = False


class CleanNfoFileResultItem(BaseModel):
    """单个 NFO 清理详情。"""
    path: str
    changed: bool
    trailer_removed: int
    actor_thumb_removed: int
    error: str | None = None


class CleanNfoResponse(BaseModel):
    """NFO 标签清理响应体。"""
    status: str = "ok"
    directory: str
    scanned_files: int
    modified_files: int
    total_trailer_removed: int
    total_actor_thumb_removed: int
    error_files: int
    dry_run: bool
    results: list[CleanNfoFileResultItem]


class PreviewNfoRequest(BaseModel):
    """单个 NFO 对比预览请求体。"""
    path: str
    clean_trailer: bool = True
    clean_actor_thumb: bool = True


class PreviewNfoResponse(BaseModel):
    """单个 NFO 对比预览响应体。"""
    status: str = "ok"
    path: str
    original: str
    cleaned: str
    trailer_removed: int
    actor_thumb_removed: int
    changed: bool



@router.get("/ping")
async def ping() -> dict[str, Any]:
    """健康探测端点，供前端初始化或断线重连时探测服务存活。"""
    return {
        "status": "ok",
        "version": __version__,
        "is_docker": is_running_in_docker(),
    }


@router.get("/config")
async def get_configuration() -> dict[str, Any]:
    """获取当前完整配置树，并附带向后兼容属性。"""
    config = get_config()
    data = config.model_dump()
    data["is_docker"] = is_running_in_docker()

    # 补充向后兼容的旧版扁平属性
    data["input_directory"] = config.scanner.input_directory
    data["move_files"] = config.summarizer.move_files
    data["hard_link"] = config.summarizer.path.hard_link
    data["length_maximum"] = config.summarizer.path.length_maximum
    data["extra_fanarts"] = {
        "enabled": config.summarizer.extra_fanarts.enabled,
        "scrap_interval": config.summarizer.extra_fanarts.scrap_interval_seconds,
        "timeout": config.summarizer.extra_fanarts.timeout,
        "max_count": config.summarizer.extra_fanarts.max_count,
        "uniform_sampling": config.summarizer.extra_fanarts.uniform_sampling,
    }
    return data


@router.put("/config")
async def update_configuration(new_config: AppConfig) -> dict[str, Any]:
    """在线更新配置，校验合法性后写回 config.yml 并热更新，通知全客户端。"""
    saved = save_config(new_config)
    dumped = saved.model_dump()
    await manager.broadcast("CONFIG_UPDATED", {"config": dumped})
    return {
        "status": "ok",
        "message": "配置更新成功并已热生效",
        "config": dumped,
    }


@router.get("/config/raw")
async def get_raw_configuration() -> dict[str, str]:
    """获取当前 config.yml 的原始纯文本内容。"""
    return {
        "yaml": get_raw_config_text(),
    }


@router.put("/config/raw")
async def update_raw_configuration(req: RawConfigRequest) -> dict[str, Any]:
    """提交原始 YAML 纯文本，校验语法与结构后保存并热更新。"""
    try:
        saved = save_raw_config_text(req.yaml)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    dumped = saved.model_dump()
    await manager.broadcast("CONFIG_UPDATED", {"config": dumped})
    return {
        "status": "ok",
        "message": "YAML 配置已验证并保存",
        "config": dumped,
    }


@router.post("/config/reset")
async def reset_configuration() -> dict[str, Any]:
    """恢复为默认预设配置并持久化写入。"""
    default_cfg = get_default_config()
    saved = save_config(default_cfg)
    dumped = saved.model_dump()
    await manager.broadcast("CONFIG_UPDATED", {"config": dumped})
    return {
        "status": "ok",
        "message": "已恢复为系统默认配置",
        "config": dumped,
    }


@router.post("/config/tab-bridge-hosts")
async def add_tab_bridge_host(req: TabBridgeHostRequest) -> dict[str, Any]:
    """将指定域名加入永久 TabBridge 绕过名单并写回 config.yml。"""
    raw_host = req.host.strip().lower()
    if "://" in raw_host:
        raw_host = urlparse(raw_host).hostname or raw_host
    raw_host = raw_host.split("/")[0].strip()

    if not raw_host:
        raise HTTPException(status_code=400, detail="域名不能为空")

    cfg = get_config()
    current_hosts = list(cfg.crawler.tab_bridge_hosts)
    if raw_host not in current_hosts:
        current_hosts.append(raw_host)
        cfg.crawler.tab_bridge_hosts = current_hosts
        save_config(cfg)
        await manager.broadcast("CONFIG_UPDATED", {"config": cfg.model_dump()})

    return {
        "status": "ok",
        "tab_bridge_hosts": cfg.crawler.tab_bridge_hosts,
    }


@router.delete("/config/tab-bridge-hosts/{host}")
async def remove_tab_bridge_host(host: str) -> dict[str, Any]:
    """从永久 TabBridge 绕过名单中移除指定域名并写回 config.yml。"""
    raw_host = host.strip().lower()
    if "://" in raw_host:
        raw_host = urlparse(raw_host).hostname or raw_host
    raw_host = raw_host.split("/")[0].strip()

    cfg = get_config()
    current_hosts = list(cfg.crawler.tab_bridge_hosts)
    if raw_host in current_hosts:
        current_hosts.remove(raw_host)
        cfg.crawler.tab_bridge_hosts = current_hosts
        save_config(cfg)
        await manager.broadcast("CONFIG_UPDATED", {"config": cfg.model_dump()})

    return {
        "status": "ok",
        "tab_bridge_hosts": cfg.crawler.tab_bridge_hosts,
    }




@router.get("/image")
async def get_image(
    path: str | None = Query(default=None, description="图片绝对路径"),
    dir: str | None = Query(default=None, description="影片整理输出目录路径"),
) -> FileResponse:
    """读取本地磁盘中保存的图片并流式返回给前端。

    优先通过 dir 参数自动寻找目标目录下的横版 fanart 或 poster。
    """
    target_file: Path | None = None

    if path:
        target_file = Path(path).resolve()
    elif dir:
        dir_path = Path(dir).resolve()
        if dir_path.is_dir():
            # 优先寻找横版海报/背景图（fanart），其次寻找 poster，最后寻找目录下任意 jpg/png/webp
            for name in ["fanart.jpg", "fanart.png", "poster.jpg", "poster.png"]:
                candidate = dir_path / name
                if candidate.is_file():
                    target_file = candidate
                    break

            if not target_file:
                for f in dir_path.iterdir():
                    if f.is_file() and f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
                        if "fanart" in f.stem.lower():
                            target_file = f
                            break
                        if not target_file:
                            target_file = f

    if not target_file or not target_file.is_file():
        raise HTTPException(status_code=404, detail="图片文件未找到")

    suffix = target_file.suffix.lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }
    media_type = media_types.get(suffix)
    if not media_type:
        raise HTTPException(status_code=400, detail="不支持的图片格式")

    return FileResponse(
        target_file,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.post("/tools/clean-nfo", response_model=CleanNfoResponse)
async def clean_nfo_endpoint(req: CleanNfoRequest) -> dict[str, Any]:
    """扫描指定目录下所有 NFO 文件，清理其中的 trailer 标签和 actor.thumb 标签。"""
    target_path = Path(req.directory).resolve()
    if not target_path.exists() or not target_path.is_dir():
        raise HTTPException(status_code=400, detail=f"目标目录不存在或不是有效文件夹: {req.directory}")

    summary = await anyio.to_thread.run_sync(
        clean_nfo_directory,
        target_path,
        req.clean_trailer,
        req.clean_actor_thumb,
        req.recursive,
        req.dry_run,
        req.backup,
    )

    return {
        "status": "ok",
        "directory": str(target_path),
        "scanned_files": summary.scanned_files,
        "modified_files": summary.modified_files,
        "total_trailer_removed": summary.total_trailer_removed,
        "total_actor_thumb_removed": summary.total_actor_thumb_removed,
        "error_files": summary.error_files,
        "dry_run": req.dry_run,
        "results": [
            {
                "path": str(r.path),
                "changed": r.changed,
                "trailer_removed": r.trailer_removed,
                "actor_thumb_removed": r.actor_thumb_removed,
                "error": r.error,
            }
            for r in summary.results
        ],
    }


@router.post("/tools/preview-nfo", response_model=PreviewNfoResponse)
async def preview_nfo_endpoint(req: PreviewNfoRequest) -> dict[str, Any]:
    """单文件按需对比预览：获取该 NFO 文件在清理前与清理后的内容对比。"""
    target_file = Path(req.path).resolve()
    if not target_file.exists() or not target_file.is_file():
        raise HTTPException(status_code=400, detail=f"文件不存在或不是普通文件: {req.path}")

    try:
        raw_bytes = target_file.read_bytes()
        orig_text = raw_bytes.decode("utf-8", errors="replace")
        cleaned_text, trailer_cnt, thumb_cnt = clean_nfo_content(
            raw_bytes,
            clean_trailer=req.clean_trailer,
            clean_actor_thumb=req.clean_actor_thumb,
        )
        changed = trailer_cnt > 0 or thumb_cnt > 0
        return {
            "status": "ok",
            "path": str(target_file),
            "original": orig_text,
            "cleaned": cleaned_text,
            "trailer_removed": trailer_cnt,
            "actor_thumb_removed": thumb_cnt,
            "changed": changed,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"无法解析该 NFO 文件: {exc}") from exc


class RecropPostersRequest(BaseModel):
    """海报批量重裁剪请求体。"""
    directory: str
    recursive: bool = True
    dry_run: bool = False
    backup: bool = True
    only_standard_fanza: bool = True
    tolerance: float = 0.02
    ratio: float = 1.5


class RecropItemResponse(BaseModel):
    """单个海报重裁剪详情项。"""
    fanart_path: str
    poster_path: str
    width: int
    height: int
    aspect_ratio: float
    is_standard_fanza: bool
    status: str  # "success" | "skipped" | "error"
    message: str
    backed_up: bool
    backup_path: str | None = None


class RecropPostersResponse(BaseModel):
    """海报批量重裁剪汇总响应体。"""
    status: str = "ok"
    directory: str
    scanned_files: int
    matched_files: int
    cropped_files: int
    skipped_files: int
    backed_up_files: int
    error_files: int
    dry_run: bool
    results: list[RecropItemResponse]


@router.post("/tools/recrop-posters", response_model=RecropPostersResponse)
async def recrop_posters_endpoint(req: RecropPostersRequest) -> dict[str, Any]:
    """批量扫描指定目录下的 fanart 横版封面，按标准大厂两步居中算法重新裁剪 poster 海报。"""
    target_path = Path(req.directory).resolve()
    if not target_path.exists() or not target_path.is_dir():
        raise HTTPException(status_code=400, detail=f"目标目录不存在或不是有效文件夹: {req.directory}")

    summary = await anyio.to_thread.run_sync(
        recrop_directory_posters,
        target_path,
        req.recursive,
        req.dry_run,
        req.backup,
        req.only_standard_fanza,
        req.tolerance,
        req.ratio,
    )

    return {
        "status": "ok",
        "directory": str(target_path),
        "scanned_files": summary.scanned_files,
        "matched_files": summary.matched_files,
        "cropped_files": summary.cropped_files,
        "skipped_files": summary.skipped_files,
        "backed_up_files": summary.backed_up_files,
        "error_files": summary.error_files,
        "dry_run": req.dry_run,
        "results": [
            {
                "fanart_path": str(r.fanart_path),
                "poster_path": str(r.poster_path),
                "width": r.width,
                "height": r.height,
                "aspect_ratio": r.aspect_ratio,
                "is_standard_fanza": r.is_standard_fanza,
                "status": r.status,
                "message": r.message,
                "backed_up": r.backed_up,
                "backup_path": str(r.backup_path) if r.backup_path else None,
            }
            for r in summary.results
        ],
    }




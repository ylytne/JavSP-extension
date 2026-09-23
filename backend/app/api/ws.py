"""WebSocket 事件处理器 (/ws)。"""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
from typing import Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import get_config, get_expected_token
from app.core.models import MovieInfo, ScanMovieItem
from app.core.organizer import organize_movie
from app.core.scanner import scan_directory

logger = logging.getLogger(__name__)

router = APIRouter()

# 存储活跃任务状态: taskId -> ScanMovieItem
_task_registry: dict[str, ScanMovieItem] = {}


_last_scan_dir: str | None = None


class ConnectionManager:
    """WebSocket 多连接管理器，支持单播与全局广播。"""

    def __init__(self) -> None:
        self.active_connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        """接收并注册新的客户端连接。"""
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        """注销已断开的客户端连接。"""
        self.active_connections.discard(websocket)

    async def broadcast(
        self,
        event: str,
        data: dict[str, Any],
        task_id: str | None = None,
    ) -> None:
        """向所有活跃的客户端广播符合信封规范的消息。"""
        payload = {
            "event": event,
            "taskId": task_id,
            "data": data,
        }
        text = json.dumps(payload, ensure_ascii=False)
        disconnected: list[WebSocket] = []
        for conn in list(self.active_connections):
            try:
                await conn.send_text(text)
            except Exception:
                disconnected.append(conn)
        for conn in disconnected:
            self.active_connections.discard(conn)

    async def send_personal(
        self,
        websocket: WebSocket,
        event: str,
        data: dict[str, Any],
        task_id: str | None = None,
    ) -> None:
        """向指定客户端单播消息。"""
        payload = {
            "event": event,
            "taskId": task_id,
            "data": data,
        }
        await websocket.send_text(json.dumps(payload, ensure_ascii=False))


manager = ConnectionManager()


async def send_ws_event(
    websocket: WebSocket,
    event: str,
    data: dict[str, Any],
    task_id: str | None = None,
) -> None:
    """向客户端发送符合信封规范的 WebSocket 消息（保留向后兼容）。"""
    await manager.send_personal(websocket, event, data, task_id)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """双向 WebSocket 通信通道，处理扫描触发与单部整理提交。"""
    global _last_scan_dir

    expected_token = get_expected_token()
    if expected_token:
        token_param = websocket.query_params.get("token", "").strip()
        auth_header = websocket.headers.get("authorization", "").strip()
        x_token = websocket.headers.get("x-api-token", "").strip()

        provided: str = token_param
        if not provided and auth_header:
            parts = auth_header.split()
            provided = parts[1] if len(parts) == 2 and parts[0].lower() == "bearer" else parts[0]
        elif not provided and x_token:
            provided = x_token

        if not provided or not hmac.compare_digest(provided, expected_token):
            logger.warning("WebSocket 连接鉴权失败，拒绝接入: client=%s", websocket.client)
            await websocket.close(code=4001, reason="Unauthorized: Invalid or missing API token")
            return

    await manager.connect(websocket)
    loop = asyncio.get_running_loop()

    try:
        while True:
            raw_text = await websocket.receive_text()
            try:
                message = json.loads(raw_text)
            except json.JSONDecodeError:
                logger.warning("收到非法 JSON 消息: %s", raw_text)
                continue

            event = message.get("event")
            task_id = message.get("taskId")
            data = message.get("data") or {}

            # 心跳保活响应
            if event == "PING":
                await manager.send_personal(websocket, "PONG", {"time": data.get("time")})
                continue

            # 触发磁盘目录扫描
            if event == "SCAN_START":
                scan_dir = data.get("directory")
                if not scan_dir:
                    scan_dir = get_config().scanner.input_directory

                if not scan_dir:
                    await manager.broadcast(
                        "SCAN_RESULT",
                        {"movies": [], "error": "未指定扫描文件夹且配置中无默认路径"},
                    )
                    continue

                _last_scan_dir = scan_dir

                # 进度回调桥接（全客户端广播）
                def on_progress(scanned_files: int, total_found: int) -> None:
                    asyncio.run_coroutine_threadsafe(
                        manager.broadcast(
                            "SCAN_PROGRESS",
                            {"current": total_found, "scanned_files": scanned_files},
                        ),
                        loop,
                    )

                # 在后台线程执行阻塞的磁盘 IO 遍历
                def run_scan() -> list[ScanMovieItem]:
                    return scan_directory(scan_dir, on_progress=on_progress)

                try:
                    movies = await asyncio.to_thread(run_scan)
                    # 注册任务到内存注册表
                    for m in movies:
                        _task_registry[m.taskId] = m

                    await manager.broadcast(
                        "SCAN_RESULT",
                        {"movies": [m.model_dump() for m in movies]},
                    )
                except Exception as e:
                    logger.exception("扫描目录异常: %s", e)
                    await manager.broadcast(
                        "SCAN_RESULT",
                        {"movies": [], "error": str(e)},
                    )

            # 提交单部影片刮削结果并请求落盘归档
            elif event == "ORGANIZATION_SUBMIT":
                submit_task_id = task_id or data.get("taskId")
                metadata_raw = data.get("metadata")
                cover_base64 = data.get("coverBase64")

                if not submit_task_id or not metadata_raw:
                    await manager.broadcast(
                        "TASK_FINISHED",
                        {"taskId": submit_task_id, "success": False, "error": "缺少 taskId 或 metadata"},
                        task_id=submit_task_id,
                    )
                    continue

                task_item = _task_registry.get(submit_task_id)
                # 优先使用提交数据中携带的最新参数（更正或重新刮削），回退使用注册表缓存
                files = data.get("files") or (task_item.files if task_item else [])
                hard_sub = (
                    data.get("hard_sub")
                    if data.get("hard_sub") is not None
                    else (task_item.hard_sub if task_item else False)
                )
                uncensored = (
                    data.get("uncensored")
                    if data.get("uncensored") is not None
                    else (task_item.uncensored if task_item else False)
                )
                base_out_dir = data.get("base_output_dir") or _last_scan_dir
                extra_fanarts_base64 = data.get("extra_fanarts_base64") or data.get("extraFanartsBase64") or []
                actress_pics_base64 = data.get("actress_pics_base64") or data.get("actressPicsBase64") or {}

                if not files:
                    await manager.broadcast(
                        "TASK_FINISHED",
                        {"taskId": submit_task_id, "success": False, "error": "未找到待整理的文件列表"},
                        task_id=submit_task_id,
                    )
                    continue

                try:
                    metadata = MovieInfo.model_validate(metadata_raw)
                except Exception as e:
                    await manager.broadcast(
                        "TASK_FINISHED",
                        {"taskId": submit_task_id, "success": False, "error": f"元数据格式校验失败: {e}"},
                        task_id=submit_task_id,
                    )
                    continue

                # 异步执行整理落盘流程
                async def run_organize_flow() -> None:
                    try:
                        def on_step_callback(step: str, message: str) -> None:
                            asyncio.run_coroutine_threadsafe(
                                manager.broadcast(
                                    "STEP_PROGRESS",
                                    {"taskId": submit_task_id, "step": step, "message": message},
                                    task_id=submit_task_id,
                                    ),
                                loop,
                            )

                        final_path = await asyncio.to_thread(
                            organize_movie,
                            files=files,
                            metadata=metadata,
                            cover_base64=cover_base64,
                            extra_fanarts_base64=extra_fanarts_base64,
                            actress_pics_base64=actress_pics_base64,
                            base_output_dir=base_out_dir,
                            hard_sub=hard_sub,
                            uncensored=uncensored,
                            on_step=on_step_callback,
                        )

                        if task_item:
                            task_item.status = "completed"

                        await manager.broadcast(
                            "TASK_FINISHED",
                            {"taskId": submit_task_id, "success": True, "error": None, "finalPath": final_path},
                            task_id=submit_task_id,
                        )
                    except Exception as err:
                        logger.exception("整理影片任务失败: %s", err)
                        if task_item:
                            task_item.status = "error"
                            task_item.errorMsg = str(err)

                        await manager.broadcast(
                            "TASK_FINISHED",
                            {"taskId": submit_task_id, "success": False, "error": str(err), "finalPath": None},
                            task_id=submit_task_id,
                        )

                asyncio.create_task(run_organize_flow())

    except WebSocketDisconnect:
        logger.info("WebSocket 客户端断开连接")
    except Exception as e:
        logger.error("WebSocket 连接异常: %s", e)
    finally:
        manager.disconnect(websocket)

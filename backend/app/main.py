"""JavSP 本地服务主入口 (FastAPI + WebSocket 网关)。"""

from __future__ import annotations

import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.api.rest import router as rest_router
from app.api.ws import router as ws_router
from app.config import get_config, get_expected_token, is_running_in_docker, find_config_path

# 配置日志格式
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("javsp-backend")

app = FastAPI(
    title="JavSP Local Backend",
    description="Local service gateway for JavSP Chrome Extension",
    version="0.1.0",
)

# 允许跨域请求（包括 Chrome 扩展的 chrome-extension:// 来源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(rest_router)
app.include_router(ws_router)


def run() -> None:
    """启动本地服务。"""
    config = get_config()
    host = os.environ.get("JAVSP_HOST", config.server.host)
    port = int(os.environ.get("JAVSP_PORT", str(config.server.port)))
    token = get_expected_token()

    if is_running_in_docker():
        logger.info(
            "\n"
            "======================================================================\n"
            "🐳 JavSP 后端服务已于 Docker 容器环境中启动\n"
            "🌐 内部监听: http://%s:%d\n"
            "🔑 API 访问令牌: %s\n"
            "📁 配置文件路径: %s\n"
            "💡 说明: 若手欠关了日志，可随时在挂载目录中查看 API_TOKEN.txt\n"
            "   或在终端执行 `docker exec <容器名> python -m app.cli token` 随时查改\n"
            "======================================================================",
            host,
            port,
            token if token else "(未设置 - 处于无鉴权模式)",
            find_config_path(),
        )
    else:
        logger.info("启动 JavSP 本地后端服务: http://%s:%d", host, port)
        if token:
            masked = token[:3] + "***" if len(token) > 3 else "***"
            logger.info("API 访问令牌鉴权已启用 (Token: %s)", masked)
        elif host in ("0.0.0.0", "::"):
            logger.warning(
                "⚠️  [安全警告] 服务当前监听 %s (全部网络接口) 且未配置访问 Token！"
                "若此设备处于公网或不受信局域网，存在被恶意扫描、读取或篡改文件的风险！"
                "强烈建议在 config.yml 中配置 server.token 设置密钥。",
                host,
            )

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=False,
    )


if __name__ == "__main__":
    run()

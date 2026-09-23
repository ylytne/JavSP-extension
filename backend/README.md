# JavSP Backend Service

JavSP 双端架构的轻量级 Python 本地/服务端，负责磁盘扫描、番号推测、标签清洗、NFO 节点构造、海报智能裁切与水印、以及文件重命名与归档落盘。

---

## 🚀 部署与运行

### 方式一：Docker Compose 容器化部署（推荐 NAS / 服务器）

1. **进入 backend 目录**：
   ```bash
   cd backend
   ```

2. **配置环境变量（可选）**：
   ```bash
   cp .env.example .env
   ```
   可根据需要修改 `.env` 中的路径：
   - `JAVSP_CONFIG_DIR`：宿主机配置目录（默认 `./config`，首次启动容器会自动在此目录下生成 `config.yml` 和 `API_TOKEN.txt`）；
   - `JAVSP_MEDIA_DIR`：宿主机待整理与归档的影视媒体路径（例如群晖 `/volume1/video`）；
   - `JAVSP_PORT`：对外映射端口（默认 `8765`）。

3. **启动容器**：
   ```bash
   docker compose up -d
   ```

4. **获取安全访问令牌 (API Token)**：
   - **方式 A（文件查看）**：在宿主机配置目录下直接打开 **`API_TOKEN.txt`** 或 **`config.yml`** 查看自动生成的密码；
   - **方式 B（命令行查看）**：执行 `docker exec javsp-backend python -m app.cli token`；
   - **方式 C（日志查看）**：执行 `docker logs javsp-backend` 查看启动横幅；
   - **重设密码**：执行 `docker exec javsp-backend python -m app.cli token set <新密码>` 或在前端设置面板中在线修改。

5. **健康检查**：
   访问 `http://<IP>:8765/api/ping`，返回 `{"status": "ok", "version": "0.1.0", "is_docker": true}` 即表示启动成功。

---

### 方式二：本地 Python 源码运行（开发与调试）

本项目使用 `uv` 进行环境与依赖管理（Python 3.12+）：

1. **安装依赖**：
   ```bash
   uv sync
   ```

2. **初始化配置**：
   首次运行将 `config.default.yml` 复制为 `config.yml`：
   ```bash
   cp config.default.yml config.yml
   ```

3. **启动服务**：
   ```bash
   uv run python -m app.main
   ```

4. **运行单元测试**：
   ```bash
   uv run pytest
   ```

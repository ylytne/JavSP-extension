# syntax=docker/dockerfile:1
# 基于轻量级 Python 3.12 官方 slim 镜像
FROM python:3.12-slim

# 设置工作目录
WORKDIR /app

# 安装必要的系统运行时依赖与健康检查工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 复制生产依赖清单并使用原生 pip 安装
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用核心代码及默认配置模板，并初始化默认运行配置
COPY app/ ./app/
COPY config.default.yml .
RUN cp config.default.yml config.yml

# 暴露服务默认端口
EXPOSE 8765

# 环境变量：确保 Python 进程实时刷新日志并监听 0.0.0.0，且标记当前为 Docker 运行环境
ENV PYTHONUNBUFFERED=1 \
    JAVSP_IN_DOCKER=1 \
    JAVSP_HOST=0.0.0.0 \
    JAVSP_PORT=8765


# 容器健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://127.0.0.1:8765/api/ping || exit 1

# 启动服务
CMD ["python", "-m", "app.main"]

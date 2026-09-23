"""Tests for REST and WebSocket API endpoints."""

import base64
import io
from pathlib import Path
from PIL import Image
import pytest
from starlette.testclient import TestClient

from app.config import get_config
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def create_test_image_b64():
    img = Image.new("RGB", (600, 400), color="green")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def test_rest_ping(client):
    response = client.get("/api/ping")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"
    assert "is_docker" in data
    assert isinstance(data["is_docker"], bool)


def test_is_running_in_docker(monkeypatch):
    from app.config import is_running_in_docker
    # 模拟容器环境变量
    monkeypatch.setenv("JAVSP_IN_DOCKER", "1")
    assert is_running_in_docker() is True

    monkeypatch.delenv("JAVSP_IN_DOCKER", raising=False)
    # 本机通常无 /.dockerenv，返回 bool
    assert isinstance(is_running_in_docker(), bool)



def test_rest_config(client):
    response = client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert "crawlers" in data
    assert isinstance(data["crawlers"], list)
    assert len(data["crawlers"]) > 0
    assert "network" in data
    assert data["network"]["retry"] == 3
    assert data["network"]["timeout"] == 10.0
    assert "crawler" in data
    assert data["crawler"]["sleep_after_scraping"] == 2.0
    assert data["crawler"]["sleep_jitter"] == 2.0
    assert "translator" in data
    assert "fields" in data["translator"]
    assert data["translator"]["fields"]["title"] is True
    assert data["translator"]["fields"]["plot"] is True
    # 验证包含完整的 scanner, summarizer 结构
    assert "scanner" in data
    assert "summarizer" in data


def test_rest_config_put_and_hot_reload(client, tmp_path: Path, monkeypatch):
    test_yaml = tmp_path / "config.yml"
    monkeypatch.setattr("app.config.find_config_path", lambda: test_yaml)

    # 1. 获取当前配置并修改
    resp = client.get("/api/config")
    assert resp.status_code == 200
    cfg_data = resp.json()
    cfg_data["network"]["retry"] = 5
    cfg_data["scanner"]["input_directory"] = str(tmp_path / "custom_input")
    cfg_data["crawlers"] = ["javdb", "javbus"]

    # 2. 发送 PUT 更新
    put_resp = client.put("/api/config", json=cfg_data)
    assert put_resp.status_code == 200
    res_data = put_resp.json()
    assert res_data["status"] == "ok"
    assert res_data["config"]["network"]["retry"] == 5
    assert res_data["config"]["scanner"]["input_directory"] == str(tmp_path / "custom_input")
    assert res_data["config"]["crawlers"] == ["javdb", "javbus"]

    # 3. 验证内存单例热更新
    current_cfg = get_config()
    assert current_cfg.network.retry == 5
    assert current_cfg.scanner.input_directory == str(tmp_path / "custom_input")

    # 4. 验证 YAML 文件落盘
    assert test_yaml.is_file()
    file_content = test_yaml.read_text(encoding="utf-8")
    assert "retry: 5" in file_content
    assert "javdb" in file_content


def test_rest_config_put_invalid(client):
    # 传入非法数据类型（如 timeout 传字符串）
    bad_payload = {"network": {"timeout": "not-a-number"}}
    resp = client.put("/api/config", json=bad_payload)
    assert resp.status_code == 422


def test_rest_config_raw_get_and_put(client, tmp_path: Path, monkeypatch):
    test_yaml = tmp_path / "config.yml"
    monkeypatch.setattr("app.config.find_config_path", lambda: test_yaml)

    # 1. 读取 RAW
    raw_resp = client.get("/api/config/raw")
    assert raw_resp.status_code == 200
    assert "yaml" in raw_resp.json()

    # 2. 写入有效 RAW YAML
    new_yaml = """
scanner:
  input_directory: "E:/RawTestDir"
  minimum_size: 100MB
network:
  retry: 4
  timeout: 15.0
crawlers:
  - javbus
"""
    put_raw_resp = client.put("/api/config/raw", json={"yaml": new_yaml})
    assert put_raw_resp.status_code == 200
    assert put_raw_resp.json()["config"]["network"]["retry"] == 4
    assert test_yaml.read_text(encoding="utf-8") == new_yaml

    # 3. 写入语法错误的 YAML -> 400
    bad_yaml = "scanner: [unbalanced brackets"
    bad_resp = client.put("/api/config/raw", json={"yaml": bad_yaml})
    assert bad_resp.status_code == 400
    assert "YAML 语法格式错误" in bad_resp.json()["detail"]


def test_rest_config_reset(client, tmp_path: Path, monkeypatch):
    test_yaml = tmp_path / "config.yml"
    monkeypatch.setattr("app.config.find_config_path", lambda: test_yaml)

    # 先修改配置
    client.put("/api/config/raw", json={"yaml": "network:\n  retry: 99\n"})
    assert get_config().network.retry == 99

    # 调用 reset 端点
    reset_resp = client.post("/api/config/reset")
    assert reset_resp.status_code == 200
    assert reset_resp.json()["config"]["network"]["retry"] == 3
    assert get_config().network.retry == 3



def test_rest_image(client, tmp_path: Path):
    # 1. 准备测试图片
    img_dir = tmp_path / "movie_dir"
    img_dir.mkdir()
    fanart_file = img_dir / "fanart.jpg"
    img = Image.new("RGB", (800, 538), color="blue")
    img.save(fanart_file, format="JPEG")

    # 2. 通过 path 读取
    resp = client.get("/api/image", params={"path": str(fanart_file)})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/jpeg"
    assert len(resp.content) > 0

    # 3. 通过 dir 自动发现 fanart.jpg
    resp2 = client.get("/api/image", params={"dir": str(img_dir)})
    assert resp2.status_code == 200
    assert resp2.headers["content-type"] == "image/jpeg"
    assert len(resp2.content) == len(resp.content)

    # 4. 不存在的文件 -> 404
    resp_404 = client.get("/api/image", params={"path": str(tmp_path / "not_exist.jpg")})
    assert resp_404.status_code == 404

    # 5. 非法格式 -> 400
    text_file = img_dir / "secret.txt"
    text_file.write_text("not an image")
    resp_400 = client.get("/api/image", params={"path": str(text_file)})
    assert resp_400.status_code == 400



def test_ws_scan_and_organize(client, tmp_path: Path, monkeypatch):
    cfg = get_config()
    monkeypatch.setattr(cfg.scanner, "minimum_size", 10)

    # 准备测试视频文件
    incoming_dir = tmp_path / "incoming"
    incoming_dir.mkdir()
    test_video = incoming_dir / "IPX-177.mp4"
    test_video.write_bytes(b"sample video bytes" * 10)

    with client.websocket_connect("/ws") as ws:
        # 1. 发送 PING
        ws.send_json({"event": "PING", "data": {"time": 123456}})
        resp = ws.receive_json()
        assert resp["event"] == "PONG"

        # 2. 触发扫描
        ws.send_json({"event": "SCAN_START", "data": {"directory": str(incoming_dir)}})
        scan_result = None
        while True:
            msg = ws.receive_json()
            if msg["event"] == "SCAN_RESULT":
                scan_result = msg
                break
            elif msg["event"] == "SCAN_PROGRESS":
                continue

        assert scan_result is not None
        assert scan_result["event"] == "SCAN_RESULT"
        movies = scan_result["data"]["movies"]
        assert len(movies) == 1
        movie_item = movies[0]
        assert movie_item["dvdid"] == "IPX-177"
        task_id = movie_item["taskId"]

        # 3. 提交整理
        b64 = create_test_image_b64()
        submit_data = {
            "taskId": task_id,
            "metadata": {
                "dvdid": "IPX-177",
                "title": "测试单部影片",
                "cover": "https://example.com/cover.jpg",
                "actress": ["相沢みなみ"],
            },
            "coverBase64": b64,
        }
        ws.send_json({"event": "ORGANIZATION_SUBMIT", "data": submit_data})

        # 接收逐步进度通知直到任务完成
        finished = False
        steps = []
        for _ in range(10):
            msg = ws.receive_json()
            if msg["event"] == "STEP_PROGRESS":
                steps.append(msg["data"]["step"])
            elif msg["event"] == "TASK_FINISHED":
                finished = True
                assert msg["data"]["success"] is True
                final_path = msg["data"]["finalPath"]
                assert final_path is not None
                assert Path(final_path).exists()
                break

        assert finished, f"Task did not finish. Steps received: {steps}"


def test_ws_scan_unrecognized_video(client, tmp_path: Path, monkeypatch):
    cfg = get_config()
    monkeypatch.setattr(cfg.scanner, "minimum_size", 10)

    incoming_dir = tmp_path / "unrec_dir"
    incoming_dir.mkdir()
    unrec_video = incoming_dir / "random_clip_without_avid.mp4"
    unrec_video.write_bytes(b"dummy video content 123456789012345")

    with client.websocket_connect("/ws") as ws:
        ws.send_json({"event": "SCAN_START", "data": {"directory": str(incoming_dir)}})
        scan_result = None
        while True:
            msg = ws.receive_json()
            if msg["event"] == "SCAN_RESULT":
                scan_result = msg
                break
            elif msg["event"] == "SCAN_PROGRESS":
                continue

        assert scan_result is not None
        movies = scan_result["data"]["movies"]
        assert len(movies) == 1
        item = movies[0]
        assert item["status"] == "error"
        assert "无法从文件名推测番号" in item["errorMsg"]
        assert item["dvdid"] == ""


def test_main_env_override(monkeypatch):
    """测试通过 JAVSP_HOST 和 JAVSP_PORT 环境变量覆盖监听配置。"""
    monkeypatch.setenv("JAVSP_HOST", "0.0.0.0")
    monkeypatch.setenv("JAVSP_PORT", "9999")
    import app.main
    recorded = {}

    def mock_uvicorn_run(app_str, host, port, reload):
        recorded["host"] = host
        recorded["port"] = port

    monkeypatch.setattr("uvicorn.run", mock_uvicorn_run)
    app.main.run()
    assert recorded["host"] == "0.0.0.0"
    assert recorded["port"] == 9999


def test_api_token_auth(client, monkeypatch):
    """测试 REST 端点的 API Token 鉴权。"""
    monkeypatch.setenv("JAVSP_TOKEN", "secret-token-123")

    # 1. 未提供 Token -> 401
    resp = client.get("/api/ping")
    assert resp.status_code == 401
    assert "Unauthorized" in resp.json()["detail"]

    # 2. 错误 Token -> 401
    resp = client.get("/api/ping", headers={"Authorization": "Bearer wrong-token"})
    assert resp.status_code == 401

    # 3. 正确 Bearer Token -> 200
    resp = client.get("/api/ping", headers={"Authorization": "Bearer secret-token-123"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

    # 4. 正确 X-API-Token -> 200
    resp = client.get("/api/config", headers={"X-API-Token": "secret-token-123"})
    assert resp.status_code == 200

    # 5. Query 参数传递 Token (例如图片) -> 鉴权通过 (此处无该文件返回 404 证明鉴权已放行)
    resp = client.get("/api/image?path=dummy.jpg&token=secret-token-123")
    assert resp.status_code == 404


def test_ws_token_auth(client, monkeypatch):
    """测试 WebSocket 握手阶段的 Token 鉴权。"""
    monkeypatch.setenv("JAVSP_TOKEN", "ws-secret-888")

    # 1. 未提供 Token 握手失败
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws") as ws:
            pass
    assert exc_info.value.code == 4001

    # 2. 错误 Token 握手失败
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws?token=bad-token") as ws:
            pass
    assert exc_info.value.code == 4001

    # 3. 正确 Token 握手成功
    with client.websocket_connect("/ws?token=ws-secret-888") as ws:
        ws.send_json({"event": "PING", "data": {"time": 12345}})
        resp = ws.receive_json()
        assert resp["event"] == "PONG"
        assert resp["data"]["time"] == 12345


def test_empty_env_fallback_to_config_token(client, monkeypatch):
    """测试当环境变量 JAVSP_TOKEN 为空字符串时，能够正确回退至 config.server.token。"""
    from app.config import get_config, get_expected_token
    cfg = get_config()
    orig_token = cfg.server.token
    try:
        cfg.server.token = "config-token-999"
        # 环境变量注入空字符串
        monkeypatch.setenv("JAVSP_TOKEN", "   ")
        assert get_expected_token() == "config-token-999"

        # 未提供 Token -> 401
        resp = client.get("/api/ping")
        assert resp.status_code == 401

        # 提供 config-token-999 -> 200
        resp = client.get("/api/ping", headers={"X-API-Token": "config-token-999"})
        assert resp.status_code == 200
    finally:
        cfg.server.token = orig_token


def test_rest_clean_nfo_endpoint(client, tmp_path: Path):
    """测试 REST 端点 /api/tools/clean-nfo 的功能。"""
    xml_content = """<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
  <title>TEST-001</title>
  <trailer>test.mp4</trailer>
  <actor>
    <name>Test Actress</name>
    <thumb>actress.jpg</thumb>
  </actor>
</movie>
"""
    test_file = tmp_path / "test.nfo"
    test_file.write_text(xml_content, encoding="utf-8")

    # 1. 正常执行清理
    payload = {
        "directory": str(tmp_path),
        "clean_trailer": True,
        "clean_actor_thumb": True,
        "recursive": True,
        "dry_run": False,
        "backup": False,
    }
    resp = client.post("/api/tools/clean-nfo", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["scanned_files"] == 1
    assert data["modified_files"] == 1
    assert data["total_trailer_removed"] == 1
    assert data["total_actor_thumb_removed"] == 1
    assert len(data["results"]) == 1
    assert data["results"][0]["changed"] is True

    # 验证文件已修改
    content = test_file.read_text(encoding="utf-8")
    assert "<trailer>" not in content
    assert "<thumb>" not in content

    # 2. 目标目录不存在时报错 400
    bad_payload = {
        "directory": str(tmp_path / "not_exist_sub_dir"),
    }
    resp_bad = client.post("/api/tools/clean-nfo", json=bad_payload)
    assert resp_bad.status_code == 400


def test_rest_preview_nfo_endpoint(client, tmp_path: Path):
    """测试 REST 端点 /api/tools/preview-nfo 的单文件对比预览功能。"""
    xml_content = """<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>
<movie>
  <title>PREVIEW-001</title>
  <trailer>preview.mp4</trailer>
  <actor>
    <name>Preview Actress</name>
    <thumb>actress.jpg</thumb>
  </actor>
</movie>
"""
    test_file = tmp_path / "preview.nfo"
    test_file.write_text(xml_content, encoding="utf-8")

    # 1. 正常预览请求（不修改磁盘文件）
    payload = {
        "path": str(test_file),
        "clean_trailer": True,
        "clean_actor_thumb": True,
    }
    resp = client.post("/api/tools/preview-nfo", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["changed"] is True
    assert data["trailer_removed"] == 1
    assert data["actor_thumb_removed"] == 1
    assert "<trailer>preview.mp4</trailer>" in data["original"]
    assert "<trailer>" not in data["cleaned"]
    assert "<thumb>" not in data["cleaned"]
    assert "<name>Preview Actress</name>" in data["cleaned"]

    # 验证磁盘原文件保持未修改
    disk_content = test_file.read_text(encoding="utf-8")
    assert "<trailer>preview.mp4</trailer>" in disk_content

    # 2. 文件不存在时返回 400
    bad_resp = client.post("/api/tools/preview-nfo", json={"path": str(tmp_path / "not_found.nfo")})
    assert bad_resp.status_code == 400






"""Tests for TabBridge hosts configuration persistence and endpoints."""

from pathlib import Path
import pytest
from starlette.testclient import TestClient

from app.config import get_config, load_config
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_tab_bridge_hosts_default(client):
    """测试默认配置中包含 airav.io。"""
    response = client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert "crawler" in data
    assert "tab_bridge_hosts" in data["crawler"]
    assert "airav.io" in data["crawler"]["tab_bridge_hosts"]


def test_add_and_remove_tab_bridge_hosts(client, tmp_path: Path, monkeypatch):
    """测试通过 API 动态添加和删除 Tab 桥接站点域名，并持久化到 YAML。"""
    test_yaml = tmp_path / "config.yml"
    monkeypatch.setattr("app.config.find_config_path", lambda: test_yaml)
    load_config(test_yaml)

    # 1. 添加带 https 协议前缀的域名
    res_add = client.post("/api/config/tab-bridge-hosts", json={"host": "https://javdb.com/search"})
    assert res_add.status_code == 200
    hosts = res_add.json()["tab_bridge_hosts"]
    assert "javdb.com" in hosts

    # 验证磁盘 YAML 持久化
    assert test_yaml.exists()
    content = test_yaml.read_text(encoding="utf-8")
    assert "javdb.com" in content

    # 2. 重复添加相同域名（应去重）
    res_repeat = client.post("/api/config/tab-bridge-hosts", json={"host": "javdb.com"})
    assert res_repeat.status_code == 200
    hosts2 = res_repeat.json()["tab_bridge_hosts"]
    assert hosts2.count("javdb.com") == 1

    # 3. 删除域名
    res_del = client.delete("/api/config/tab-bridge-hosts/javdb.com")
    assert res_del.status_code == 200
    hosts3 = res_del.json()["tab_bridge_hosts"]
    assert "javdb.com" not in hosts3

    # 验证磁盘更新
    content2 = test_yaml.read_text(encoding="utf-8")
    assert "javdb.com" not in content2


def test_add_tab_bridge_hosts_empty_error(client):
    """测试空域名抛出 400 校验异常。"""
    res = client.post("/api/config/tab-bridge-hosts", json={"host": "   "})
    assert res.status_code == 400

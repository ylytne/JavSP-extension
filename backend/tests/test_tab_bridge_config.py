"""Tests for Extra Fanarts concurrency and TabBridge config cleanup."""

from pathlib import Path
import pytest
from starlette.testclient import TestClient

from app.config import get_config, load_config
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_extra_fanarts_concurrency_default(client):
    """测试默认配置中包含合法的 extra_fanarts.concurrency (1~8)，且 crawler 不含废弃的 tab_bridge_hosts。"""
    response = client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert "summarizer" in data
    assert "extra_fanarts" in data["summarizer"]
    concurrency = data["summarizer"]["extra_fanarts"]["concurrency"]
    assert isinstance(concurrency, int)
    assert 1 <= concurrency <= 8
    assert "tab_bridge_hosts" not in data.get("crawler", {})


def test_extra_fanarts_concurrency_update(client, tmp_path: Path, monkeypatch):
    """测试通过 API 动态修改 extra_fanarts.concurrency，并持久化到 YAML。"""
    test_yaml = tmp_path / "config.yml"
    monkeypatch.setattr("app.config.find_config_path", lambda: test_yaml)
    load_config(test_yaml)

    # 读取当前配置并修改 concurrency
    res = client.get("/api/config")
    assert res.status_code == 200
    cfg_data = res.json()
    cfg_data["summarizer"]["extra_fanarts"]["concurrency"] = 6

    # 提交保存
    res_save = client.put("/api/config", json=cfg_data)
    assert res_save.status_code == 200
    saved_cfg = res_save.json()["config"]
    assert saved_cfg["summarizer"]["extra_fanarts"]["concurrency"] == 6

    # 验证磁盘 YAML 持久化
    assert test_yaml.exists()
    content = test_yaml.read_text(encoding="utf-8")
    assert "concurrency: 6" in content


def test_crawler_config_ignores_legacy_tab_bridge_hosts(tmp_path: Path, monkeypatch):
    """测试当存量 config.yml 中含有历史遗留的 tab_bridge_hosts 时，安全忽略且不抛出校验异常。"""
    test_yaml = tmp_path / "config.yml"
    legacy_content = """
crawler:
  sleep_after_scraping: 2.0
  tab_bridge_hosts:
    - airav.io
    - custom-waf.com
summarizer:
  extra_fanarts:
    concurrency: 5
"""
    test_yaml.write_text(legacy_content, encoding="utf-8")
    monkeypatch.setattr("app.config.find_config_path", lambda: test_yaml)
    cfg = load_config(test_yaml)

    assert cfg.summarizer.extra_fanarts.concurrency == 5
    assert not hasattr(cfg.crawler, "tab_bridge_hosts")


def test_tab_bridge_hosts_endpoints_removed(client):
    """测试已废弃的 tab-bridge-hosts 增删 REST 接口已被彻底移除并返回 404。"""
    res_post = client.post("/api/config/tab-bridge-hosts", json={"host": "test.com"})
    assert res_post.status_code == 404

    res_delete = client.delete("/api/config/tab-bridge-hosts/test.com")
    assert res_delete.status_code == 404


def test_extra_fanarts_concurrency_validation(client):
    """测试 extra_fanarts.concurrency 数值范围必须为 1~8，超限时触发 422 校验失败。"""
    res = client.get("/api/config")
    assert res.status_code == 200
    cfg_data = res.json()

    # 尝试设置 concurrency = 0 (小于下限 1)
    cfg_data["summarizer"]["extra_fanarts"]["concurrency"] = 0
    res_err0 = client.put("/api/config", json=cfg_data)
    assert res_err0.status_code == 422

    # 尝试设置 concurrency = 9 (大于上限 8)
    cfg_data["summarizer"]["extra_fanarts"]["concurrency"] = 9
    res_err9 = client.put("/api/config", json=cfg_data)
    assert res_err9.status_code == 422


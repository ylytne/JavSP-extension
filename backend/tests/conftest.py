"""Pytest 测试套件全局 Fixture 配置。"""

from __future__ import annotations

import pytest
from app.config import find_default_config_path, load_config


@pytest.fixture(autouse=True)
def isolate_test_config(monkeypatch):
    """确保单元测试始终运行在隔离的默认配置基准下，避免被开发者本地私有 config.yml 污染。"""
    def_path = find_default_config_path()
    monkeypatch.setenv("JAVSP_CONFIG_FILE", str(def_path))
    load_config(config_path=def_path, default_config_path=def_path)
    yield
    load_config(config_path=def_path, default_config_path=def_path)

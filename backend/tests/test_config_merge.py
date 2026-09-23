"""分层配置 (config.default.yml + 本地 config.yml) 与深度合并单元测试。"""

from __future__ import annotations

from pathlib import Path
import yaml
from app.config import (
    deep_merge,
    load_config,
    get_default_config,
    get_raw_config_text,
    init_user_config_if_missing,
)


def test_deep_merge_scalar_and_dict():
    """测试递归合并基础逻辑：标量覆盖、嵌套字典合并、列表替换。"""
    base = {
        "network": {"retry": 3, "timeout": 10.0},
        "crawlers": ["javbus", "javdb"],
        "scanner": {"skip_nfo_dir": True},
    }
    update = {
        "network": {"retry": 5},
        "crawlers": ["javbus"],
        "scanner": {"input_directory": "/custom/path"},
    }
    merged = deep_merge(base, update)

    # 1. 标量值覆盖
    assert merged["network"]["retry"] == 5
    # 2. 嵌套字典中原有默认字段保留
    assert merged["network"]["timeout"] == 10.0
    assert merged["scanner"]["skip_nfo_dir"] is True
    assert merged["scanner"]["input_directory"] == "/custom/path"
    # 3. 列表整体替换（用户指定爬虫源覆盖默认源列表）
    assert merged["crawlers"] == ["javbus"]


def test_auto_init_user_config_if_missing(tmp_path: Path):
    """测试当本地 config.yml 缺失时，自动从 config.default.yml 初始化拷贝。"""
    default_yaml = tmp_path / "config.default.yml"
    user_yaml = tmp_path / "config.yml"

    sample_content = "network:\n  retry: 7\n"
    default_yaml.write_text(sample_content, encoding="utf-8")

    assert not user_yaml.is_file()

    # 执行缺失初始化检查
    initialized = init_user_config_if_missing(user_yaml, default_yaml)
    assert initialized == user_yaml
    assert user_yaml.is_file()
    assert user_yaml.read_text(encoding="utf-8") == sample_content


def test_upstream_new_fields_seamless_fallback(tmp_path: Path):
    """测试老用户的 config.yml 缺少新功能配置项时，能自动从默认模板无缝继承。"""
    default_yaml = tmp_path / "config.default.yml"
    user_yaml = tmp_path / "config.yml"

    # 假设上游模板新增了配置且预设了各种值
    default_data = {
        "network": {"retry": 3, "timeout": 10.0},
        "scanner": {"minimum_size": "232MiB", "skip_nfo_dir": True},
        "crawler": {"sleep_after_scraping": 3.5},
        "translator": {
            "engine": {
                "name": "openai",
                "api_key": "",
                "model": "llama-3.1-70b-versatile",
            }
        },
    }
    default_yaml.write_text(yaml.dump(default_data), encoding="utf-8")

    # 用户早先自定义的精简 config.yml（修改了 retry，填了 api_key，但完全没有写 crawler 和 scanner 字段）
    user_data = {
        "network": {"retry": 9},
        "translator": {
            "engine": {
                "api_key": "sk-my-secret-key",
            }
        },
    }
    user_yaml.write_text(yaml.dump(user_data), encoding="utf-8")

    # 执行加载
    loaded = load_config(config_path=user_yaml, default_config_path=default_yaml)

    # 1. 用户的私有配置生效
    assert loaded.network.retry == 9
    assert loaded.translator.engine["api_key"] == "sk-my-secret-key"

    # 2. 用户没有配置的字段，自动从默认模板平滑继承
    assert loaded.network.timeout == 10.0
    assert loaded.crawler.sleep_after_scraping == 3.5
    assert loaded.scanner.skip_nfo_dir is True
    assert loaded.scanner.minimum_size == "232MiB"


def test_get_raw_config_text_fallback(tmp_path: Path):
    """测试 get_raw_config_text 在本地 config.yml 存在与否时的回退表现。"""
    user_yaml = tmp_path / "config.yml"
    assert not user_yaml.is_file()

    # 本地不存在时，读取到的是默认模板内容
    raw = get_raw_config_text(user_yaml)
    assert "scanner:" in raw
    assert "summarizer:" in raw

    # 用户创建了自己的定制内容
    user_yaml.write_text("network:\n  retry: 42\n", encoding="utf-8")
    assert get_raw_config_text(user_yaml) == "network:\n  retry: 42\n"


def test_docker_auto_init_generates_token_and_file(tmp_path: Path, monkeypatch):
    """测试在 Docker 环境下空配置目录初始化时，自动生成随机 Token 与 API_TOKEN.txt。"""
    monkeypatch.setenv("JAVSP_IN_DOCKER", "1")
    config_dir = tmp_path / "config"
    target_yaml = config_dir / "config.yml"
    default_yaml = tmp_path / "config.default.yml"
    default_yaml.write_text("server:\n  host: 0.0.0.0\n  port: 8765\n  token: ''\n", encoding="utf-8")

    from app.config import init_user_config_if_missing
    initialized = init_user_config_if_missing(target_yaml, default_yaml)

    assert initialized == target_yaml
    assert target_yaml.is_file()

    # 验证生成的 config.yml 中包含自动生成的随机 token
    loaded = yaml.safe_load(target_yaml.read_text(encoding="utf-8"))
    token = loaded["server"]["token"]
    assert token.startswith("javsp_")
    assert len(token) > 10

    # 验证同级生成了 API_TOKEN.txt 说明文件
    token_txt = config_dir / "API_TOKEN.txt"
    assert token_txt.is_file()
    assert token in token_txt.read_text(encoding="utf-8")


def test_cli_token_management(tmp_path: Path, monkeypatch, capsys):
    """测试 python -m app.cli token 命令行查改功能。"""
    from app.cli import main
    from app.config import get_config, load_config
    orig_config = get_config()
    orig_token = orig_config.server.token
    target_yaml = tmp_path / "config.yml"
    target_yaml.write_text("server:\n  host: 0.0.0.0\n  port: 8765\n  token: 'initial-key'\n", encoding="utf-8")
    monkeypatch.setenv("JAVSP_CONFIG_FILE", str(target_yaml))

    try:
        # 1. 查询当前 token
        monkeypatch.setattr("sys.argv", ["cli.py", "token", "get"])
        ret = main()
        assert ret == 0
        captured = capsys.readouterr()
        assert "initial-key" in captured.out

        # 2. 设置新 token
        monkeypatch.setattr("sys.argv", ["cli.py", "token", "set", "new-custom-key"])
        ret = main()
        assert ret == 0
        captured = capsys.readouterr()
        assert "new-custom-key" in captured.out

        # 检查文件是否落盘
        loaded = yaml.safe_load(target_yaml.read_text(encoding="utf-8"))
        assert loaded["server"]["token"] == "new-custom-key"

        # 3. 随机生成 token
        monkeypatch.setattr("sys.argv", ["cli.py", "token", "generate"])
        ret = main()
        assert ret == 0
        loaded = yaml.safe_load(target_yaml.read_text(encoding="utf-8"))
        assert loaded["server"]["token"].startswith("javsp_")
    finally:
        orig_config.server.token = orig_token
        monkeypatch.delenv("JAVSP_CONFIG_FILE", raising=False)
        load_config()


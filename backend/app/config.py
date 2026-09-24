"""JavSP Backend 配置加载器 (基于 Pydantic & YAML)."""

from __future__ import annotations

from pathlib import Path
import re
from typing import Any, Literal
import yaml
from pydantic import BaseModel, Field


def parse_byte_size(size_val: int | str) -> int:
    """将人类可读的文件大小字符串（例如 '232MiB', '10MB'）转换为字节数整型。"""
    if isinstance(size_val, int):
        return size_val
    if not isinstance(size_val, str):
        return int(size_val)

    s = size_val.strip()
    match = re.match(r"^(\d+(?:\.\d+)?)\s*([a-zA-Z]*)$", s)
    if not match:
        try:
            return int(s)
        except ValueError:
            return 243269632  # 默认 232MiB

    val = float(match.group(1))
    unit = match.group(2).lower()

    unit_multipliers = {
        "": 1,
        "b": 1,
        "k": 1024,
        "kb": 1024,
        "kib": 1024,
        "m": 1024 * 1024,
        "mb": 1024 * 1024,
        "mib": 1024 * 1024,
        "g": 1024 * 1024 * 1024,
        "gb": 1024 * 1024 * 1024,
        "gib": 1024 * 1024 * 1024,
    }
    multiplier = unit_multipliers.get(unit, 1)
    return int(val * multiplier)


class ScannerConfig(BaseModel):
    """磁盘扫描器配置项。"""
    ignored_id_pattern: list[str] = Field(default_factory=lambda: [
        r"(144|240|360|480|720|1080)[Pp]",
        r"[24][Kk]",
        r"\w+2048\.com",
        r"Carib(beancom)?",
        r"[^a-z\d](f?hd|lt)[^a-z\d]",
    ])
    input_directory: str | None = None
    filename_extensions: list[str] = Field(default_factory=lambda: [
        ".3gp", ".avi", ".f4v", ".flv", ".iso", ".m2ts", ".m4v", ".mkv",
        ".mov", ".mp4", ".mpeg", ".rm", ".rmvb", ".ts", ".vob", ".webm",
        ".wmv", ".strm", ".mpg"
    ])
    ignored_folder_name_pattern: list[str] = Field(default_factory=lambda: [
        r"^\.", r"^#recycle$", r"^#整理完成$", r"^#不要扫描$"
    ])
    minimum_size: int | str = "232MiB"
    skip_nfo_dir: bool = True

    @property
    def minimum_size_bytes(self) -> int:
        """获取字节整型的最小文件阈值。"""
        return parse_byte_size(self.minimum_size)


class SummarizerPathConfig(BaseModel):
    """路径整理相关配置。"""
    output_folder_pattern: str = "#整理完成/{actress}/[{num}] {title}"
    basename_pattern: str = "{num}"
    length_maximum: int = 250
    length_by_byte: bool = True
    max_actress_count: int = 10
    hard_link: bool = False


class SummarizerTitleConfig(BaseModel):
    """标题处理配置。"""
    remove_trailing_actor_name: bool = True


class SummarizerDefaultConfig(BaseModel):
    """缺省字段替代配置。"""
    title: str = "#未知标题"
    actress: str = "#未知女优"
    series: str = "#未知系列"
    director: str = "#未知导演"
    producer: str = "#未知制作商"
    publisher: str = "#未知发行商"


class SummarizerNfoConfig(BaseModel):
    """NFO 构造配置。"""
    basename_pattern: str = "movie"
    title_pattern: str = "{num} {title}"
    custom_genres_fields: list[str] = Field(default_factory=lambda: ["{genre}", "{censor}"])
    custom_tags_fields: list[str] = Field(default_factory=lambda: ["{genre}", "{censor}"])
    actress_thumb_mode: Literal["none", "local"] = "none"
    include_trailer: bool = False


class SummarizerCropConfig(BaseModel):
    """海报智能裁剪配置。"""
    ratio: float = 1.5
    engine: str | None = None
    standard_fanza_crop: bool = True


class SummarizerCoverConfig(BaseModel):
    """海报封面相关配置。"""
    basename_pattern: str = "poster"
    add_label: bool = True
    use_javdb_cover: Literal["fallback", "never"] = "fallback"
    crop: SummarizerCropConfig = Field(default_factory=SummarizerCropConfig)


class SummarizerFanartConfig(BaseModel):
    """背景图相关配置。"""
    basename_pattern: str = "fanart"


def parse_duration_seconds(val: float | int | str) -> float:
    """解析时间间隔（支持整型、浮点型、缩写如 '1.5s' 或 ISO 8601 格式如 'PT1.5S'）。"""
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        s = val.strip()
        m = re.match(r"^(?:PT|P|T)?\s*([\d.]+)\s*S?$", s, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                return 1.5
        try:
            return float(s)
        except ValueError:
            return 1.5
    return 1.5


class SummarizerExtraFanartsConfig(BaseModel):
    """剧照下载与保存配置。"""
    enabled: bool = True
    scrap_interval: float | int | str = 0.5
    timeout: float = 10.0
    max_count: int = 0
    uniform_sampling: bool = True

    @property
    def scrap_interval_seconds(self) -> float:
        """获取浮点秒数的下载请求间隔。"""
        return parse_duration_seconds(self.scrap_interval)


class SummarizerActressAvatarConfig(BaseModel):
    """女优头像下载与保存配置。"""
    enabled: bool = False
    scrap_interval: float | int | str = 0.5
    timeout: float = 10.0

    @property
    def scrap_interval_seconds(self) -> float:
        """获取浮点秒数的下载请求间隔。"""
        return parse_duration_seconds(self.scrap_interval)


class SummarizerSubtitleConfig(BaseModel):
    """字幕文件归档整理配置。"""
    enabled: bool = True
    auto_c_suffix: bool = False
    filename_extensions: list[str] = Field(
        default_factory=lambda: [".srt", ".vtt", ".ass", ".ssa", ".sbv", ".idx", ".sub"]
    )


class SummarizerConfig(BaseModel):
    """汇总与归档整理综合配置。"""
    move_files: bool = True
    path: SummarizerPathConfig = Field(default_factory=SummarizerPathConfig)
    title: SummarizerTitleConfig = Field(default_factory=SummarizerTitleConfig)
    default: SummarizerDefaultConfig = Field(default_factory=SummarizerDefaultConfig)
    nfo: SummarizerNfoConfig = Field(default_factory=SummarizerNfoConfig)
    censor_options_representation: list[str] = Field(
        default_factory=lambda: ["无码", "有码", "打码情况未知"]
    )
    cover: SummarizerCoverConfig = Field(default_factory=SummarizerCoverConfig)
    fanart: SummarizerFanartConfig = Field(default_factory=SummarizerFanartConfig)
    extra_fanarts: SummarizerExtraFanartsConfig = Field(default_factory=SummarizerExtraFanartsConfig)
    actress_avatar: SummarizerActressAvatarConfig = Field(default_factory=SummarizerActressAvatarConfig)
    subtitle: SummarizerSubtitleConfig = Field(default_factory=SummarizerSubtitleConfig)


class NetworkConfig(BaseModel):
    """网络请求与超时重试配置。"""
    retry: int = 3
    timeout: float = 10.0


class CrawlerConfig(BaseModel):
    """爬虫调度与友好抓取延时配置。"""
    sleep_after_scraping: float = 2.0
    sleep_jitter: float = 2.0
    tab_bridge_hosts: list[str] = Field(default_factory=lambda: ["airav.io"])
    # 大批量抓取请求冷却防风控保护 (Burst Protection)
    burst_protection_enabled: bool = True
    burst_limit: int = 10
    burst_jitter: int = 2
    burst_cooldown: float = 60.0
    burst_cooldown_jitter: float = 10.0


class ServerConfig(BaseModel):
    """服务网络与安全鉴权配置。"""
    host: str = "127.0.0.1"
    port: int = 8765
    token: str = ""


def get_expected_token() -> str:
    """获取当前生效的安全访问令牌。若设置了非空 JAVSP_TOKEN 环境变量则优先采用，否则统一从 config.yml 读取。"""
    import os
    env_token = os.environ.get("JAVSP_TOKEN", "").strip()
    if env_token:
        return env_token
    config = get_config()
    return (config.server.token or "").strip()


def is_running_in_docker() -> bool:
    """检测当前后端进程是否运行于 Docker 容器环境中。"""
    import os
    if os.environ.get("JAVSP_IN_DOCKER") in ("1", "true", "True"):
        return True
    if os.path.exists("/.dockerenv"):
        return True
    try:
        if os.path.exists("/proc/1/cgroup"):
            with open("/proc/1/cgroup", "rt", encoding="utf-8") as f:
                content = f.read()
                if "docker" in content or "containerd" in content:
                    return True
    except Exception:
        pass
    return False


class TranslateFieldConfig(BaseModel):
    """待翻译字段开关配置。"""
    title: bool = True
    plot: bool = True


class TranslatorConfig(BaseModel):
    """翻译配置模型（SSOT）。"""
    target_lang: str = "zh-CN"
    engine: dict[str, Any] | str | None = None
    fields: TranslateFieldConfig = Field(default_factory=TranslateFieldConfig)


class AppConfig(BaseModel):
    """全局应用配置根模型。"""
    scanner: ScannerConfig = Field(default_factory=ScannerConfig)
    network: NetworkConfig = Field(default_factory=NetworkConfig)
    crawler: CrawlerConfig = Field(default_factory=CrawlerConfig)
    crawlers: list[str] = Field(default_factory=lambda: ["javbus", "javdb"])
    summarizer: SummarizerConfig = Field(default_factory=SummarizerConfig)
    translator: TranslatorConfig = Field(default_factory=TranslatorConfig)
    server: ServerConfig = Field(default_factory=ServerConfig)



def deep_merge(base: dict[str, Any], update: dict[str, Any]) -> dict[str, Any]:
    """递归合并两个字典，update 覆盖 base 中的相同键；若 base 存在新增键则保留默认值。"""
    result = base.copy()
    for key, value in update.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


_global_config: AppConfig | None = None


def find_default_config_path() -> Path:
    """寻找基准配置模板 config.default.yml 的真实路径。"""
    current_dir = Path(__file__).resolve().parent
    candidates = [
        current_dir.parent / "config.default.yml",
        current_dir.parent.parent / "backend" / "config.default.yml",
        Path.cwd() / "config.default.yml",
        Path.cwd() / "backend" / "config.default.yml",
    ]
    for c in candidates:
        if c.is_file():
            return c
    return current_dir.parent / "config.default.yml"


def write_api_token_file(token: str, target_dir: Path) -> Path | None:
    """在配置目录下生成或更新醒目的 API_TOKEN.txt 说明文件。"""
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        token_file = target_dir / "API_TOKEN.txt"
        content = (
            "======================================================================\n"
            "🔑 JavSP 安全访问令牌 (API Token)\n"
            "======================================================================\n"
            f"当前访问令牌：{token}\n\n"
            "使用说明：\n"
            "1. 请将上方 Token 复制并填入 Chrome 浏览器扩展设置面板中的安全访问令牌输入框。\n"
            "2. 此文件由系统为您自动生成并守护，防止未授权访问。\n"
            "3. 若需修改为您熟悉的密码，可直接编辑同一目录下的 config.yml (server.token 字段)，\n"
            "   或者在 Chrome 扩展的设置面板中在线修改保存，系统将自动同步此文件。\n"
            "======================================================================\n"
        )
        token_file.write_text(content, encoding="utf-8")
        return token_file
    except Exception:
        return None


def find_config_path() -> Path:
    """寻找用户配置文件 config.yml 的真实路径。优先匹配容器挂载目录与环境变量。"""
    import os
    # 1. 显式环境变量指定
    env_file = os.environ.get("JAVSP_CONFIG_FILE", "").strip()
    if env_file:
        return Path(env_file)

    env_dir = os.environ.get("JAVSP_CONFIG_DIR", "").strip()
    if env_dir:
        return Path(env_dir) / "config.yml"

    # 2. 优先检查 Docker 标准挂载目录 /app/config
    docker_config = Path("/app/config/config.yml")
    if docker_config.is_file():
        return docker_config

    # 3. 常规候选路径
    current_dir = Path(__file__).resolve().parent
    candidates = [
        Path.cwd() / "config" / "config.yml",
        current_dir.parent / "config" / "config.yml",
        current_dir.parent / "config.yml",
        current_dir.parent.parent / "backend" / "config.yml",
        Path.cwd() / "config.yml",
        Path.cwd() / "backend" / "config.yml",
    ]
    for c in candidates:
        if c.is_file():
            return c

    # 4. 都不存在时，若处于 Docker 环境或 /app/config 目录存在，目标指向 /app/config/config.yml
    if Path("/app/config").is_dir() or is_running_in_docker():
        return docker_config

    return current_dir.parent / "config.yml"


def init_user_config_if_missing(
    target_path: Path | None = None,
    default_path: Path | None = None,
) -> Path:
    """若用户配置文件尚不存在，且基准模板存在，则从模板复制初始化一份，并在必要时生成初始 Token。"""
    import shutil
    import secrets

    target = target_path or find_config_path()
    default = default_path or find_default_config_path()
    is_newly_created = False

    if not target.is_file() and default.is_file():
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(default, target)
            is_newly_created = True
        except Exception:
            pass

    # 若新创建了配置文件且运行在 Docker 环境下：
    if is_newly_created and is_running_in_docker() and target.is_file():
        try:
            with open(target, "r", encoding="utf-8") as f:
                loaded = yaml.safe_load(f) or {}

            server_node = loaded.get("server") or {}
            current_token = str(server_node.get("token") or "").strip()
            # 若 server.token 为空，自动生成一个强随机 Token 并落盘
            if not current_token:
                auto_token = f"javsp_{secrets.token_hex(6)}"
                server_node["token"] = auto_token
                loaded["server"] = server_node
                with open(target, "w", encoding="utf-8") as f:
                    yaml.dump(loaded, f, allow_unicode=True, sort_keys=False, default_flow_style=False)
                # 同级生成 API_TOKEN.txt
                write_api_token_file(auto_token, target.parent)
        except Exception:
            pass

    return target


def load_config(
    config_path: Path | str | None = None,
    default_config_path: Path | str | None = None,
) -> AppConfig:
    """从 YAML 文件读取配置，执行三级合并 (默认模板 + 用户配置) 并生成 AppConfig 单例。"""
    global _global_config

    path = Path(config_path) if config_path else find_config_path()
    def_path = Path(default_config_path) if default_config_path else find_default_config_path()

    # 若未指定特定路径且本地用户配置文件不存在，自动从默认模板初始化一份
    if config_path is None and not path.is_file() and def_path.is_file():
        init_user_config_if_missing(path, def_path)

    # 1. 读取默认模板基准数据
    base_data: dict[str, Any] = {}
    if def_path.is_file():
        try:
            with open(def_path, "r", encoding="utf-8") as f:
                loaded = yaml.safe_load(f)
                if isinstance(loaded, dict):
                    base_data = loaded
        except Exception:
            base_data = {}

    # 2. 读取用户自定义配置数据
    user_data: dict[str, Any] = {}
    if path.is_file():
        try:
            with open(path, "r", encoding="utf-8") as f:
                loaded = yaml.safe_load(f)
                if isinstance(loaded, dict):
                    user_data = loaded
        except Exception:
            user_data = {}

    # 3. 递归深度合并：以 base_data 补齐缺省项，以 user_data 覆盖个性化配置
    merged_data = deep_merge(base_data, user_data) if (base_data or user_data) else {}

    if merged_data:
        _global_config = AppConfig.model_validate(merged_data)
    else:
        _global_config = AppConfig()

    return _global_config


def get_config() -> AppConfig:
    """获取当前生效的 AppConfig 实例。"""
    global _global_config
    if _global_config is None:
        return load_config()
    return _global_config


def get_default_config(default_config_path: Path | str | None = None) -> AppConfig:
    """获取系统默认预设配置对象（优先从 config.default.yml 读取完整预设）。"""
    def_path = Path(default_config_path) if default_config_path else find_default_config_path()
    if def_path.is_file():
        try:
            with open(def_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            if isinstance(data, dict):
                return AppConfig.model_validate(data)
        except Exception:
            pass
    return AppConfig()


def get_raw_config_text(config_path: Path | str | None = None) -> str:
    """读取配置的原始纯文本内容（供设置界面查看编辑）。优先返回本地 config.yml，缺失时回退到模板内容。"""
    path = Path(config_path) if config_path else find_config_path()
    if path.is_file():
        return path.read_text(encoding="utf-8")

    def_path = find_default_config_path()
    if def_path.is_file():
        return def_path.read_text(encoding="utf-8")

    return yaml.dump(
        AppConfig().model_dump(),
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )


def save_config(
    new_config: AppConfig | dict[str, Any],
    config_path: Path | str | None = None,
) -> AppConfig:
    """将配置对象持久化写入用户 YAML 文件，并热更新内存单例。"""
    global _global_config
    if isinstance(new_config, dict):
        validated_config = AppConfig.model_validate(new_config)
    else:
        validated_config = new_config

    path = Path(config_path) if config_path else find_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    data = validated_config.model_dump()
    yaml_text = yaml.dump(
        data,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )

    path.write_text(yaml_text, encoding="utf-8")
    _global_config = validated_config

    token_val = (validated_config.server.token or "").strip()
    if token_val and (is_running_in_docker() or (path.parent / "API_TOKEN.txt").is_file()):
        write_api_token_file(token_val, path.parent)

    return _global_config


def save_raw_config_text(
    yaml_text: str,
    config_path: Path | str | None = None,
) -> AppConfig:
    """校验原始 YAML 文本语法并验证字段，成功后写入用户 YAML 磁盘并热更新单例。"""
    global _global_config
    try:
        parsed_data = yaml.safe_load(yaml_text)
    except yaml.YAMLError as exc:
        raise ValueError(f"YAML 语法格式错误: {exc}") from exc

    if not isinstance(parsed_data, dict):
        raise ValueError("YAML 根节点必须为对象映射结构 (dict)")

    # 结合默认配置进行合并校验
    def_path = find_default_config_path()
    base_data: dict[str, Any] = {}
    if def_path.is_file():
        try:
            with open(def_path, "r", encoding="utf-8") as f:
                base_data = yaml.safe_load(f) or {}
        except Exception:
            base_data = {}

    merged_data = deep_merge(base_data, parsed_data) if base_data else parsed_data
    validated_config = AppConfig.model_validate(merged_data)

    path = Path(config_path) if config_path else find_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml_text, encoding="utf-8")

    _global_config = validated_config

    token_val = (validated_config.server.token or "").strip()
    if token_val and (is_running_in_docker() or (path.parent / "API_TOKEN.txt").is_file()):
        write_api_token_file(token_val, path.parent)

    return _global_config



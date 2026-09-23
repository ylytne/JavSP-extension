"""JavSP Backend 命令行管理工具 (CLI)。

方便 Docker 用户通过 `docker exec <容器名> python -m app.cli <命令>` 快捷管理配置与安全令牌。
"""

from __future__ import annotations

import argparse
import secrets
import sys
from pathlib import Path

from app import __version__
from app.config import (
    find_config_path,
    load_config,
    save_config,
    write_api_token_file,
    get_expected_token,
)


def handle_token(args: argparse.Namespace) -> int:
    """处理 token 子命令。"""
    config_path = find_config_path()
    cfg = load_config(config_path)

    if args.action == "get" or not args.action:
        current_token = (cfg.server.token or "").strip()
        if current_token:
            print(f"当前生效的安全令牌 (API Token): {current_token}")
        else:
            print("当前未配置 API Token (服务处于免鉴权运行模式)")
        print(f"配置文件路径: {config_path}")
        return 0

    elif args.action == "set":
        new_token = (args.value or "").strip()
        if not new_token:
            print("错误: 新 Token 不能为空。若需禁用鉴权请使用: python -m app.cli token clear", file=sys.stderr)
            return 1
        cfg.server.token = new_token
        save_config(cfg, config_path=config_path)
        write_api_token_file(new_token, config_path.parent)
        print(f"✅ API Token 已成功更新为: {new_token}")
        print(f"已同步更新至: {config_path} 及同级 API_TOKEN.txt")
        return 0

    elif args.action == "generate":
        new_token = f"javsp_{secrets.token_hex(6)}"
        cfg.server.token = new_token
        save_config(cfg, config_path=config_path)
        write_api_token_file(new_token, config_path.parent)
        print(f"✅ 已为您生成全新的随机 API Token: {new_token}")
        print(f"已同步写入: {config_path} 及同级 API_TOKEN.txt")
        return 0

    elif args.action == "clear":
        cfg.server.token = ""
        save_config(cfg, config_path=config_path)
        token_txt = config_path.parent / "API_TOKEN.txt"
        if token_txt.is_file():
            try:
                token_txt.unlink()
            except Exception:
                pass
        print("⚠️  已清除 API Token，服务已切换为无鉴权模式。")
        return 0

    else:
        print(f"未知的 token 子命令: {args.action}", file=sys.stderr)
        return 1


def handle_info(args: argparse.Namespace) -> int:
    """打印系统与配置路径信息。"""
    config_path = find_config_path()
    cfg = load_config(config_path)
    token = get_expected_token()

    print("==================================================")
    print(f"JavSP Backend 版本: {__version__}")
    print(f"当前配置文件路径: {config_path}")
    print(f"API Token 状态: {'已配置 (' + (token[:3] + '***' if len(token) > 3 else '***') + ')' if token else '未配置 (公开)'}")
    print(f"默认爬虫列表: {', '.join(cfg.crawlers)}")
    print("==================================================")
    return 0


def main() -> int:
    """CLI 入口点。"""
    parser = argparse.ArgumentParser(
        prog="python -m app.cli",
        description="JavSP Backend 命令行管理工具",
    )
    subparsers = parser.add_subparsers(dest="command")

    # token 命令
    token_parser = subparsers.add_parser("token", help="查看或修改安全访问令牌 (API Token)")
    token_parser.add_argument(
        "action",
        nargs="?",
        default="get",
        choices=["get", "set", "generate", "clear"],
        help="操作类型: get (查看当前, 默认), set (设置新密码), generate (随机生成), clear (清除密码)",
    )
    token_parser.add_argument("value", nargs="?", default="", help="当 action 为 set 时指定的新密码")

    # info 命令
    subparsers.add_parser("info", help="查看当前系统与配置文件状态")

    args = parser.parse_args()

    if args.command == "token":
        return handle_token(args)
    elif args.command == "info":
        return handle_info(args)
    else:
        # 默认无参数时打印 token
        args.action = "get"
        return handle_token(args)


if __name__ == "__main__":
    sys.exit(main())

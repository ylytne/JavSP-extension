"""API 安全鉴权依赖与验证逻辑。"""

from __future__ import annotations

import hmac
from fastapi import HTTPException, Header, Query, Request, status
from app.config import get_expected_token


def verify_api_token(
    request: Request,
    authorization: str | None = Header(default=None),
    x_api_token: str | None = Header(default=None),
    token: str | None = Query(default=None),
) -> None:
    """验证客户端请求中的 API Token。

    支持通过以下三种途径之一提供 Token:
    1. Authorization: Bearer <token>
    2. X-API-Token: <token>
    3. Query 参数: ?token=<token> (适用于 <img> 等媒体资源请求)

    如果服务端未配置 token（留空），则允许无鉴权访问。
    如果服务端配置了 token，未提供或提供错误的 token 将抛出 HTTP 401 Unauthorized。
    """
    expected = get_expected_token()
    if not expected:
        # 服务端未配置 token，开放访问
        return

    provided: str | None = None
    if authorization:
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            provided = parts[1]
        elif len(parts) == 1:
            provided = parts[0]
    elif x_api_token:
        provided = x_api_token.strip()
    elif token:
        provided = token.strip()

    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: API Token 缺失或无效",
            headers={"WWW-Authenticate": "Bearer"},
        )

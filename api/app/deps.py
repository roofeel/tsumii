from __future__ import annotations

import re

from fastapi import Header, HTTPException

_USER = re.compile(r"^[A-Za-z0-9_.@-]{1,64}$")


def current_user_id(x_user_id: str | None = Header(default=None)) -> str:
    """MVP：从 X-User-Id 头读取用户（默认 demo）。

    上线前替换为真实认证（例如校验 JWT / Session 后取用户 id），其余代码无需改动。
    """
    uid = x_user_id or "demo"
    if not _USER.match(uid):
        raise HTTPException(400, "invalid X-User-Id")
    return uid

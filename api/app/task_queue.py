"""任务队列：QUEUE_MODE=inline 时在请求内同步执行；rq 时投递到 Redis，由 worker 执行。"""
from __future__ import annotations

from typing import Callable

from .config import get_settings


def enqueue(func: Callable[..., None], *args) -> None:
    s = get_settings()
    if s.queue_mode == "rq":
        from redis import Redis
        from rq import Queue

        Queue(s.queue_name, connection=Redis.from_url(s.redis_url)).enqueue(func, *args, job_timeout=300)
    else:
        func(*args)

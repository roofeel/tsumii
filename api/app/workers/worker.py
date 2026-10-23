"""RQ worker 入口：python -m app.workers.worker"""
from __future__ import annotations

import logging

from redis import Redis
from rq import Queue, Worker

from ..config import get_settings


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    s = get_settings()
    conn = Redis.from_url(s.redis_url)
    Worker([Queue(s.queue_name, connection=conn)], connection=conn).work(with_scheduler=False)


if __name__ == "__main__":
    main()

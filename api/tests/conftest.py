import os
import tempfile

# 必须在导入 app 之前设置：内存数据库、同步队列、临时存储
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("QUEUE_MODE", "inline")
os.environ.setdefault("STORAGE_BACKEND", "local")
os.environ.setdefault("LOCAL_STORAGE_DIR", tempfile.mkdtemp(prefix="tsumii-test-"))
os.environ.setdefault("AUTO_CREATE_TABLES", "true")

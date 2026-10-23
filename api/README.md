# Tsumii API（FastAPI）

PRD 第五、六章的后端实现：三个引擎、结构化图纸存储、异步任务、对象存储和导出。MVP 不接入价格与库存数据。

## 本地运行

```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env                 # 默认：SQLite + 同步任务 + 本地文件存储，无需其他服务
uvicorn app.main:app --reload        # http://localhost:8000/docs
pytest                               # 引擎、导出与 API 测试
```

PDF 中的中文需要一个可嵌入的 TrueType CJK 字体。Docker 镜像已安装 `fonts-wqy-zenhei`；本地开发请安装该字体，或用 `PDF_FONT_PATH` 指定字体文件。

完整环境（PostgreSQL + Redis 队列 + MinIO）请在仓库根目录运行 `docker compose up --build`。

## 结构

```
app/
  engines/           与框架无关的纯逻辑，可单独测试
    color.py         sRGB → CIELAB，向量化 CIEDE2000
    catalog.py       色卡、最近色（批量）、替代色、校验
    pattern.py       图纸编辑、孤立像素、对称、小区域合并、结构验证
    convert.py       Engine B：预处理（旋转/裁剪/亮度对比度/背景移除/主体居中）→ 采样 → ΔE2000 匹配 → 颜色数约束 → 优化
    motifs.py        AI 方案 → 方格图纸（与前端算法逐格一致，有测试对照）
    materials.py     Engine C：用量 / 损耗 / 采购 / 包装、配件
    ai/              Engine A：AIProvider 协议、MockProvider、需求解析、局部修改
  exports/           CSV、XLSX（带公式）、PNG、SVG、PDF 制作图纸
  api/               路由：catalog、ai、tasks、images、projects、shopping-lists
  models.py          SQLAlchemy 模型（Project、DesignIdea、DesignVariant、Pattern、PatternVersion、ShoppingList、GenerationTask、Asset、BeadCatalog）
  services.py        业务逻辑
  workers/           RQ 后台任务（方案生成、图片转换）
  storage.py         本地 / S3 兼容存储
  cli.py             导入已核实色卡
alembic/             数据库迁移
```

## 主要接口（前缀 `/api/v1`，完整文档见 `/docs`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/catalog` | 当前色卡与是否已核实 |
| POST | `/ai/parse` | 自然语言 → 结构化需求 |
| POST | `/ai/ideas` | 生成 4～8 个方案（异步任务） |
| POST | `/ai/ideas/{id}/refine` | 二次设计，生成新的版本 |
| GET | `/tasks/{id}` | 查询任务状态与结果 |
| POST | `/images` | 上传图片（按实际内容校验格式和大小） |
| POST | `/images/{id}/convert` | 图片转图纸（异步，可同时创建项目） |
| POST | `/projects`、`/projects/from-idea` | 创建项目 |
| PUT | `/projects/{id}/pattern` | 保存图纸（`baseRevision` 乐观并发，冲突返回 409） |
| POST | `/projects/{id}/pattern/local-edit` | AI 局部修改 |
| GET/POST | `/projects/{id}/versions`、`…/restore` | 版本历史 |
| GET | `/projects/{id}/materials` | 由当前图纸实时计算材料和配件 |
| PATCH | `/projects/{id}/shopping-list` | 损耗比例，已购 / 缺货 / 已确认标记 |
| POST | `/shopping-lists/merge` | 合并多个项目的采购需求 |
| GET | `/projects/{id}/export/{png,svg,pdf,csv,xlsx,json}` | 导出 |

**用户身份**：MVP 通过 `X-User-Id` 请求头区分用户，所有项目、方案、任务和文件都按用户隔离。上线前请把 `app/deps.py` 中的 `current_user_id` 替换为真实认证。

**任务队列**：`QUEUE_MODE=inline` 时任务在请求内完成，返回的任务已经带有结果；`QUEUE_MODE=rq` 时任务投递到 Redis，由 `python -m app.workers.worker` 执行，客户端轮询 `/tasks/{id}` 获取结果。

**AI Provider**：`AI_PROVIDER=mock`（默认）按规则生成，不需要密钥；`AI_PROVIDER=bedrock` 通过 Amazon Bedrock Converse API（boto3 `bedrock-runtime`）调用 Claude Haiku 5.5（`BEDROCK_MODEL_ID`，默认 `global.anthropic.claude-haiku-5-5`），接入方式与 ai-referrer 相同。`APP_ENV=production` 时使用 AWS 默认凭证链；其他环境优先使用 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`，未设置时同样回退到默认凭证链（`~/.aws`、SSO、IAM 角色）。区域取 `AWS_REGION`。模型只负责名称、描述、标签、主题图案和配色，配色限定在当前色卡内；用量估算和可行性判断仍由确定性代码完成。

**色卡**：内置示例色卡（`SAMPLE-xx`，未核实）。上线前运行 `python -m app.cli import-catalog delica-11-0.csv` 导入已核实的官方数据，并设置 `CATALOG_SOURCE=db`。

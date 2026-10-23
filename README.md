# Tsumii つみー · 串米

**Tiny Beads. Endless Possibilities.** 一颗一颗，把灵感串成作品。

AI 串珠设计与 DIY 创作平台（MVP）。

```
web/   Next.js 14 + TypeScript + Tailwind + Zustand      → web/README.md
api/   FastAPI + SQLAlchemy + PostgreSQL + Redis(RQ) + S3 → api/README.md
docker-compose.yml   一键启动全部服务
```

## 启动

**全部服务**：`docker compose up --build`

- Web：http://localhost:3000
- API 文档：http://localhost:8000/docs

**只跑前端**：`cd web && npm install && npm run dev`。不设置 `BACKEND_URL` 时，前端使用内置的模拟 AI，项目数据保存在浏览器本地。

**只跑后端**：`cd api && pip install -r requirements-dev.txt && uvicorn app.main:app --reload`。默认使用 SQLite，任务同步执行，文件存在本地，不需要其他服务。

## Coolify 部署

web、api、worker、PostgreSQL 和 Redis 作为一个 Docker Compose 应用部署，配置在 [docker-compose.coolify.yml](docker-compose.coolify.yml)。

1. 在 Coolify 中从此仓库创建应用，Build Pack 选择 `Docker Compose`，Base Directory 为 `/`，Docker Compose Location 填写 `/docker-compose.coolify.yml`。
2. 在 web 服务上绑定域名（或使用 Coolify 自动分配的域名），端口为 `3000`。api 和 worker 不对外暴露，web 通过内网 `http://api:8000` 访问 api。
3. PostgreSQL 的用户名和密码由 Coolify 自动生成（`SERVICE_USER_POSTGRES` / `SERVICE_PASSWORD_POSTGRES`），无需手动填写。
4. api 每次启动先执行 `alembic upgrade head`；worker 在 api 健康检查通过后才启动。
5. 上传的图片默认存在 api 与 worker 共用的 `storage` 卷；改用 S3 时设置 `STORAGE_BACKEND=s3` 和 `S3_*` 变量。

AI 使用 Amazon Bedrock 上的 Claude Haiku 5.5（`AI_PROVIDER=bedrock`），接入方式与 ai-referrer 相同：通过 `bedrock-runtime` 的 Converse API 调用 global 推理配置文件，凭证走 AWS 默认凭证链（环境变量、IAM 角色等）。需要在 Coolify 中设置：

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...          # 服务器绑定了 IAM 角色时可不填
AWS_SECRET_ACCESS_KEY=...
# 可选
AWS_SESSION_TOKEN=             # 临时凭证（ASIA 开头）时必填
BEDROCK_MODEL_ID=global.anthropic.claude-haiku-5-5
CATALOG_SOURCE=sample          # 导入已核实色卡后改为 db
```

对应的 IAM 身份需要 `bedrock:InvokeModel` 权限，并在 Bedrock 控制台开通 Claude Haiku 5.5 的模型访问。调用失败时，worker 日志中 `bedrock request failed` 一行包含 AWS 返回的错误码和原因。不想调用模型时可设置 `AI_PROVIDER=mock`。

**邀请码**：AI 方案生成与二次设计需要邀请码。在 Coolify 中设置 `INVITE_CODES`（逗号分隔，可配置多个），用户第一次使用 AI 功能时会弹窗输入，验证通过后保存在浏览器中；每次调用 AI 时 web 服务端都会再次校验。删除某个邀请码后，使用它的用户下次调用会重新弹窗。**`INVITE_CODES` 留空时不做限制，生产环境务必设置。** 首页「热门串珠模板」是预制图纸，不调用 AI，不需要邀请码。

## 当前状态

- 前后端的引擎算法一致：ΔE2000、材料公式和 motif 栅格化都有共用的测试数据对照。
- 前端已接入后端的 AI 方案生成和二次设计（设置 `BACKEND_URL` 后生效）。项目、图纸和采购状态目前仍存在浏览器本地；`web/src/lib/api/client.ts` 已覆盖全部后端接口，下一步是把 store 切换为调用这些接口。
- MVP 不接入价格和库存数据。
- 内置色卡为示例数据（`SAMPLE-xx`，未核实），上线前需导入已核实的 MIYUKI 色卡。

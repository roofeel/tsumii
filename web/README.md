# Tsumii つみー · 串米

**Tiny Beads. Endless Possibilities.** 一颗一颗，把灵感串成作品。

AI 串珠设计与 DIY 创作平台：Web 端 MVP。技术栈为 Next.js 14（App Router）、TypeScript、Tailwind CSS 和 Zustand。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 引擎单元测试（vitest）
npm run typecheck
npm run build
```

需要 Node.js 18.17 及以上。首次打开会自动生成 4 个示例项目，数据保存在浏览器 localStorage 中。

## 功能（对应 PRD Phase 1）

| 页面 | 路径 | 内容 |
| --- | --- | --- |
| 首页 | `/` | 上传图片 / AI 设计两个入口、我的项目、东京主题系列、AI 灵感、模板、已导出图纸 |
| AI 创意生成 | `/create` | 自然语言解析 → 4～8 个方案 → 选择 → AI 二次设计（带版本历史）→ 转换为图纸 |
| 图片转串珠 | `/upload` | 旋转、裁剪缩放、亮度对比度、背景移除、主体提取居中；5 种转换模式；列/行、最大颜色数、孤立像素、对称、小区域优化 |
| 编辑工作台 | `/editor/[id]` | 三栏布局；画笔、橡皮、吸管、填充、区域；撤销/重做（Ctrl+Z）；四种视图；颜色高亮；按行查看步骤；AI 局部修改；版本保存/恢复；实时材料统计；PNG / JSON 导出 |
| 材料清单 | `/shopping/[id]` | 用量、损耗、采购量、包装；已购/缺货标记；缺货时按 ΔE 推荐替代色号；配件（不确定项需确认）；合并多个项目；CSV（Excel 可直接打开） |
| 制作图纸 | `/print/[id]` | A4 打印 / 另存为 PDF：效果图、尺寸、网格图与坐标、色号图例、材料、配件、逐行步骤 |

## 架构

```
src/
  app/                  页面与 API 路由（/api/ideas、/api/refine）
  components/           Header、BeadCanvas（Canvas 编辑器）、PatternThumb、NecklacePreview …
  store/                Zustand 全局状态（persist → localStorage）
  lib/
    types.ts            数据模型（PRD 第七章）
    color/              sRGB → CIELAB、CIEDE2000
    catalog/            MIYUKI 色卡、最近色、替代色、校验
    pattern/            Engine B：图纸操作、图片转换、主题栅格化
    materials/          Engine C：材料与配件计算
    ai/                 Engine A：AIProvider 接口 + MockProvider、提示词解析、局部修改
    export/  render.ts  CSV / JSON / PNG 导出，Canvas 绘制
scripts/import-catalog.ts  导入已核实色卡
```

**AI Provider**：业务代码只依赖 `AIProvider` 接口（`src/lib/ai/index.ts`）。默认的 `MockProvider` 按规则确定性地生成方案，不需要密钥。接入图像生成模型时，新增一个 Provider 实现，再用 `AI_PROVIDER` 环境变量切换即可。如果返回结果带 `previewImage`，效果图会直接显示生成的图片。

**材料计算**：MVP 不接入价格和库存数据。

```
Required = 图纸中该色号的珠子数
Reserve  = ceil(Required × 损耗比例)      # 默认 10%，界面可调
Purchase = Required + Reserve
Packages = ceil(Purchase / 单包颗数)      # 按克销售时：克数 × 可信颗数/克
```

缺少可信的包装参数时，系统显示「需确认」，不做猜测。

## ⚠️ 色卡数据

PRD 要求不得虚构 MIYUKI 官方色号。仓库内置的 `sample-delica-11-0.json` 只是开发用示例：编号为 `SAMPLE-xx`，`verified=false`，不对应任何官方色号，所以界面和导出的图纸都会标注「示例色卡 · 未核实」。

上线前需要：

1. 准备来自官方色卡或授权商家的 CSV，列格式见 `scripts/import-catalog.ts`。
2. 运行 `npx tsx scripts/import-catalog.ts your.csv`。
3. 在 `src/lib/catalog/index.ts` 中改为导入 `delica-11-0.json`。

## 当前限制 / 下一步

- 只支持 Delica 11/0 与平面方格排列。Peyote、Brick、Loom 等编织结构属于 Phase 2，届时扩展 `LayoutType`，并为每种工艺补充排列与验证。
- AI 方案中含立体结构的部分会标为「需人工确认」，转换时只保留平面部分。
- 数据目前存在浏览器本地。接入 FastAPI + PostgreSQL 时沿用 `src/lib/types.ts` 中的数据模型即可。
- PDF 通过浏览器打印生成；Excel 导出为 UTF-8 CSV。

## 连接后端

在 `.env.local` 中设置 `BACKEND_URL=http://localhost:8000` 后，AI 方案生成和二次设计会转发到 FastAPI 后端，结果存入数据库，后端说明见 `../api/README.md`。`src/lib/api/client.ts` 是覆盖全部后端接口的类型化客户端。

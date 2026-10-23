"""制作图纸 PDF（A4）

内容：作品效果图（图纸缩略）、名称与主题、成品尺寸、珠子类型、完整网格图与行列坐标、
色号图例、每种颜色数量、材料与配件清单、制作步骤与注意事项、逐行步骤。
无法自动验证的结构在首页醒目提示需人工确认。
"""
from __future__ import annotations

import io
import logging
import os
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..engines.catalog import Catalog
from ..engines.materials import calculate_materials, estimate_accessories
from ..engines.pattern import product_size_cm, row_runs, validate_pattern
from .common import DIFFICULTY_ZH, ITEM_ZH, STATUS_ZH, SheetSource, legend_order
from .image import pattern_png

log = logging.getLogger(__name__)

# 中文/日文字体：必须是 TrueType 轮廓并嵌入 PDF，保证任何阅读器都能显示。
# Docker 镜像安装 fonts-wqy-zenhei；也可用 PDF_FONT_PATH 指定其他 TrueType CJK 字体。
FONT_CANDIDATES = [
    os.environ.get("PDF_FONT_PATH", ""),
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
]


def _register_cjk_font() -> str:
    for path in FONT_CANDIDATES:
        if path and os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("TsumiiCJK", path, subfontIndex=0))
                return "TsumiiCJK"
            except Exception as e:  # noqa: BLE001
                log.warning("无法加载字体 %s：%s", path, e)
    log.warning("未找到可嵌入的 CJK 字体，回退到未嵌入的 STSong-Light（部分阅读器无法显示中文）")
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    return "STSong-Light"


CJK = _register_cjk_font()
INK = colors.HexColor("#222222")
MUTED = colors.HexColor("#6B6862")
LINE = colors.HexColor("#ECEAE6")
WARN_BG = colors.HexColor("#FBEBD5")
WARN_FG = colors.HexColor("#7A4A0E")

S = {
    "eyebrow": ParagraphStyle("eyebrow", fontName=CJK, fontSize=8, textColor=MUTED, leading=11),
    "title": ParagraphStyle("title", fontName=CJK, fontSize=20, leading=26, textColor=INK),
    "body": ParagraphStyle("body", fontName=CJK, fontSize=9.5, leading=14, textColor=INK),
    "small": ParagraphStyle("small", fontName=CJK, fontSize=8, leading=11, textColor=MUTED),
    "h2": ParagraphStyle("h2", fontName=CJK, fontSize=12, leading=16, spaceBefore=10, spaceAfter=6, textColor=INK),
    "warn": ParagraphStyle("warn", fontName=CJK, fontSize=8.5, leading=12, textColor=WARN_FG),
}


def _table(data, widths, header=True, align_right_from: int | None = None):
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("FONT", (0, 0), (-1, -1), CJK, 8.5),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style += [("LINEBELOW", (0, 0), (-1, 0), 0.8, INK), ("TEXTCOLOR", (0, 0), (-1, 0), MUTED)]
    if align_right_from is not None:
        style.append(("ALIGN", (align_right_from, 0), (-1, -1), "RIGHT"))
    t.setStyle(TableStyle(style))
    return t


def pattern_pdf(src: SheetSource, catalog: Catalog) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=14 * mm, title=f"{src.name} 制作图纸", author="Tsumii")
    avail_w = A4[0] - 28 * mm
    summary = calculate_materials(src.cells, catalog, src.wastage_rate)
    accessories = estimate_accessories(src.item_type, src.width, src.height, 42 if src.item_type == "necklace" else None)
    errors = validate_pattern(src.cells, src.width, src.height, catalog)
    order = legend_order(src.cells, catalog)
    code_index = {cid: i + 1 for i, cid in enumerate(order)}
    w_cm, h_cm = product_size_cm(src.width, src.height)
    lines_by_id = {l.color_id: l for l in summary.lines}

    story: list = [
        Paragraph("MIYUKI BEAD PATTERN · 制作图纸 · Tsumii つみー · 串米", S["eyebrow"]),
        Paragraph(src.name, S["title"]),
    ]
    if src.description:
        story.append(Paragraph(src.description, S["body"]))
    story.append(Spacer(1, 6))

    warnings = []
    if not catalog.verified:
        warnings.append("本图纸使用示例色卡，色号未经核实，不能直接用于采购。")
    if errors:
        warnings.append("图纸验证未通过：" + "；".join(errors))
    if src.feasibility_note:
        warnings.append(src.feasibility_note + "。立体结构未包含在本图纸中，需人工确认。")
    if warnings:
        box = Table([[Paragraph("<br/>".join(warnings), S["warn"])]], colWidths=[avail_w])
        box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), WARN_BG), ("BOX", (0, 0), (-1, -1), 0.4, WARN_FG)]))
        story += [box, Spacer(1, 8)]

    # 概要：缩略图 + 信息
    thumb_png = pattern_png(src.cells, src.width, src.height, catalog)
    thumb = Image(io.BytesIO(thumb_png))
    scale = min(70 * mm / thumb.imageWidth, 90 * mm / thumb.imageHeight)
    thumb.drawWidth, thumb.drawHeight = thumb.imageWidth * scale, thumb.imageHeight * scale
    info = [
        ["作品类型", ITEM_ZH.get(src.item_type, src.item_type)],
        ["主题", " · ".join(src.style_tags) or "—"],
        ["珠子类型", "MIYUKI Delica 11/0"],
        ["排列方式", "平面方格（Square stitch / Loom）"],
        ["图纸尺寸", f"{src.width} 列 × {src.height} 行"],
        ["成品尺寸", f"约 {w_cm} × {h_cm} cm（不含配件）"],
        ["珠子总数", f"{summary.total_beads} 颗 · {summary.color_count} 色"],
        ["难度", DIFFICULTY_ZH.get(src.difficulty or "", "—")],
        ["图纸版本", f"v{src.version} · {date.today().isoformat()}"],
    ]
    info_t = _table(info, [22 * mm, avail_w - 80 * mm - 22 * mm], header=False)
    overview = Table([[thumb, info_t]], colWidths=[80 * mm, avail_w - 80 * mm])
    overview.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story += [overview]

    # 色号图例与材料
    legend: list[list] = [["编号", "色块", "色号", "颜色名称", "使用", "建议备量", "采购", "包装"]]
    for cid in order:
        l = lines_by_id[cid]
        legend.append([str(code_index[cid]), "", l.code, f"{l.name_zh} {l.name}", l.required, f"+{l.reserve}", l.purchase_needed, l.packages if l.packages is not None else "需确认"])
    lt = _table(legend, [12 * mm, 12 * mm, 26 * mm, avail_w - 116 * mm, 16 * mm, 18 * mm, 16 * mm, 16 * mm], align_right_from=4)
    lt.setStyle(TableStyle([("BACKGROUND", (1, i + 1), (1, i + 1), colors.HexColor(lines_by_id[cid].hex)) for i, cid in enumerate(order)]))
    story += [Paragraph("色号图例与材料清单", S["h2"]), lt]

    acc = [["配件", "数量", "说明", "状态"]] + [[a.name, a.quantity, Paragraph(a.reason, S["small"]), STATUS_ZH[a.status]] for a in accessories]
    story += [KeepTogether([Paragraph("配件", S["h2"]), _table(acc, [34 * mm, 24 * mm, avail_w - 78 * mm, 20 * mm])])]

    # 网格图（新页）
    grid_png = pattern_png(src.cells, src.width, src.height, catalog, code_index)
    grid = Image(io.BytesIO(grid_png))
    max_h = A4[1] - 28 * mm - 24 * mm
    scale = min(avail_w / grid.imageWidth, max_h / grid.imageHeight)
    grid.drawWidth, grid.drawHeight = grid.imageWidth * scale, grid.imageHeight * scale
    story += [PageBreak(), Paragraph("串珠网格图 · 行列坐标（格内数字为图例编号）", S["h2"]), grid]

    # 制作步骤
    steps = [
        "按图例准备各色珠子，建议使用分格盒并标注编号。",
        "剪取串珠线，穿入 #12 串珠针，尾端预留约 15 cm。",
        "从第 1 行开始，按下表从左到右串入珠子；每行完成后以方格平织（square stitch）与上一行连接。",
        "每完成 5 行对照网格图检查一次，发现错误及时拆改。",
        "全部完成后将线头回穿 2–3 行并打结，涂少量胶水固定。",
        "按配件清单安装扣件与连接环；标注「需确认」的结构请先确认再安装。",
    ]
    story += [PageBreak(), Paragraph("制作步骤与注意事项", S["h2"])]
    story += [Paragraph(f"{i + 1}. {s}", S["body"]) for i, s in enumerate(steps)]
    rows = [["行", "从左到右（编号 × 颗数）"]] + [
        [str(r + 1), Paragraph("  ".join(f"{code_index[c]}×{n}" for c, n in row_runs(src.cells, src.width, r)), S["body"])] for r in range(src.height)
    ]
    story += [Spacer(1, 6), _table(rows, [14 * mm, avail_w - 14 * mm])]

    def footer(canvas, _doc):
        canvas.saveState()
        canvas.setFont(CJK, 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(14 * mm, 8 * mm, f"Tsumii — Tiny Beads. Endless Possibilities. · {src.name} · v{src.version}")
        canvas.drawRightString(A4[0] - 14 * mm, 8 * mm, f"{canvas.getPageNumber()}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()

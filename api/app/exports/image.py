"""图纸 PNG / SVG 导出（含行列坐标与可选色号编号）"""
from __future__ import annotations

import io
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFont

from ..engines.catalog import Catalog
from ..engines.color import hex_to_rgb, is_light

CELL, GAP, MARGIN = 24, 2, 34


def _font(size: int):
    try:
        return ImageFont.truetype("DejaVuSansMono.ttf", size)
    except OSError:
        return ImageFont.load_default()


def pattern_png(cells: list[str], width: int, height: int, catalog: Catalog, code_index: dict[str, int] | None = None) -> bytes:
    step = CELL + GAP
    img = Image.new("RGB", (MARGIN + width * step + 16, MARGIN + height * step + 16), (250, 249, 246))
    d = ImageDraw.Draw(img)
    small, num = _font(10), _font(12)
    for x in range(width):
        d.text((MARGIN + x * step + CELL / 2, 14), str(x + 1), fill=(107, 104, 98), font=small, anchor="mm")
    for y in range(height):
        d.text((MARGIN - 6, MARGIN + y * step + CELL / 2), str(y + 1), fill=(107, 104, 98), font=small, anchor="rm")
    for i, cid in enumerate(cells):
        x, y = i % width, i // width
        px, py = MARGIN + x * step, MARGIN + y * step
        hx = catalog.get(cid).hex
        d.rounded_rectangle((px, py, px + CELL, py + CELL), radius=6, fill=hex_to_rgb(hx), outline=tuple(int(v * 0.85) for v in hex_to_rgb(hx)))
        if code_index:
            d.text((px + CELL / 2, py + CELL / 2), str(code_index[cid]), fill=(34, 34, 34) if is_light(hx) else (255, 255, 255), font=num, anchor="mm")
        else:
            r = CELL * 0.14
            hole = tuple(int(v * 0.62) for v in hex_to_rgb(hx))
            d.ellipse((px + CELL / 2 - r, py + CELL / 2 - r, px + CELL / 2 + r, py + CELL / 2 + r), fill=hole)
    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()


def pattern_svg(cells: list[str], width: int, height: int, catalog: Catalog, code_index: dict[str, int] | None = None) -> str:
    step = CELL + GAP
    W, H = MARGIN + width * step + 16, MARGIN + height * step + 16
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="monospace">',
        f'<rect width="{W}" height="{H}" fill="#FAF9F6"/>',
    ]
    for x in range(width):
        parts.append(f'<text x="{MARGIN + x * step + CELL / 2}" y="18" font-size="10" text-anchor="middle" fill="#6B6862">{x + 1}</text>')
    for y in range(height):
        parts.append(f'<text x="{MARGIN - 6}" y="{MARGIN + y * step + CELL / 2 + 3}" font-size="10" text-anchor="end" fill="#6B6862">{y + 1}</text>')
    for i, cid in enumerate(cells):
        x, y = i % width, i // width
        c = catalog.get(cid)
        px, py = MARGIN + x * step, MARGIN + y * step
        parts.append(f'<rect x="{px}" y="{py}" width="{CELL}" height="{CELL}" rx="6" fill="{c.hex}"><title>{escape(c.code)}</title></rect>')
        if code_index:
            fg = "#222222" if is_light(c.hex) else "#FFFFFF"
            parts.append(f'<text x="{px + CELL / 2}" y="{py + CELL / 2 + 4}" font-size="11" text-anchor="middle" fill="{fg}">{code_index[cid]}</text>')
    parts.append("</svg>")
    return "".join(parts)

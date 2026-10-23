"""Engine B：图片 → 结构化方格图纸

Image Normalization → Structure Extraction → Grid Layout → Color Quantization
→ MIYUKI Palette Matching（CIELAB / ΔE2000）→ Pattern Optimization → Pattern Validation
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Literal

import numpy as np
from PIL import Image, ImageEnhance, ImageOps
from skimage.measure import label

from .catalog import DELICA_11_0_SIZE_MM, Catalog
from .color import hex_to_lab, rgb_to_lab_array
from .pattern import merge_rare_colors, mirror_horizontal, remove_isolated

ConversionMode = Literal["faithful", "pixel", "cartoon", "outline", "low-color"]
MAX_SIDE = 480


@dataclass
class PrepOptions:
    rotate: int = 0  # 0/90/180/270
    zoom: float = 1.0  # 中心裁剪倍数 1–3
    square_crop: bool = False
    brightness: int = 0  # -50..50
    contrast: int = 0  # -50..80
    remove_background: bool = False
    auto_center: bool = False


@dataclass
class ConvertOptions:
    cols: int = 28
    rows: int | None = None  # None = 按原图比例与 Delica 珠子宽高比计算
    max_colors: int = 6
    mode: ConversionMode = "pixel"
    remove_isolated: bool = True
    symmetry: bool = False
    small_area_merge: bool = True
    background_id: str | None = None
    prep: PrepOptions = field(default_factory=PrepOptions)


def preprocess(img: Image.Image, p: PrepOptions) -> Image.Image:
    """返回 RGBA 图片（背景移除后透明区域 alpha=0）"""
    img = ImageOps.exif_transpose(img).convert("RGBA")
    if p.rotate % 360:
        img = img.rotate(-p.rotate, expand=True)
    w, h = img.size
    cw, ch = w / max(1.0, p.zoom), h / max(1.0, p.zoom)
    if p.square_crop:
        cw = ch = min(cw, ch)
    left, top = (w - cw) / 2, (h - ch) / 2
    img = img.crop((round(left), round(top), round(left + cw), round(top + ch)))
    img.thumbnail((MAX_SIDE, MAX_SIDE))

    rgb, alpha = img.convert("RGB"), img.getchannel("A")
    if p.brightness:
        rgb = ImageEnhance.Brightness(rgb).enhance(1 + p.brightness / 100)
    if p.contrast:
        rgb = ImageEnhance.Contrast(rgb).enhance((p.contrast + 100) / 100)
    arr = np.dstack([np.asarray(rgb), np.asarray(alpha)]).copy()

    if p.remove_background:
        # 与四边平均色接近、且与边缘连通的区域视为背景
        border = np.concatenate([arr[0, :, :3], arr[-1, :, :3], arr[:, 0, :3], arr[:, -1, :3]]).astype(float)
        bg = border.mean(axis=0)
        near = ((arr[..., :3].astype(float) - bg) ** 2).sum(axis=-1) < 48**2
        labels = np.asarray(label(near, connectivity=1))
        edge_labels = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
        arr[np.isin(labels, list(edge_labels)), 3] = 0

    if p.auto_center:
        ys, xs = np.nonzero(arr[..., 3] > 128)
        if len(xs):
            x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
            side = int(max(x1 - x0, y1 - y0) * 1.12) + 1
            canvas = np.zeros((side, side, 4), dtype=np.uint8)
            sub = arr[y0 : y1 + 1, x0 : x1 + 1]
            oy, ox = (side - sub.shape[0]) // 2, (side - sub.shape[1]) // 2
            canvas[oy : oy + sub.shape[0], ox : ox + sub.shape[1]] = sub
            arr = canvas
    return Image.fromarray(arr, "RGBA")


def auto_rows(img_w: int, img_h: int, cols: int) -> int:
    bw, bh = DELICA_11_0_SIZE_MM
    return max(4, min(120, round(cols * (img_h / img_w) * (bw / bh))))


def sample_grid(arr: np.ndarray, cols: int, rows: int) -> tuple[np.ndarray, np.ndarray]:
    """区域平均采样。返回 (rgb (rows*cols,3), opaque mask (rows*cols,))"""
    h, w = arr.shape[:2]
    rgb = np.zeros((rows * cols, 3))
    opaque = np.zeros(rows * cols, dtype=bool)
    for gy in range(rows):
        y0 = gy * h // rows
        y1 = max(y0 + 1, (gy + 1) * h // rows)
        for gx in range(cols):
            x0 = gx * w // cols
            x1 = max(x0 + 1, (gx + 1) * w // cols)
            block = arr[y0:y1, x0:x1].reshape(-1, 4)
            vis = block[block[:, 3] >= 128]
            i = gy * cols + gx
            if len(vis) and len(vis) >= len(block) - len(vis):
                rgb[i] = vis[:, :3].mean(axis=0)
                opaque[i] = True
    return rgb, opaque


def limit_colors(cells: list[str], max_colors: int, catalog: Catalog) -> list[str]:
    """把用色限制在 max_colors 以内：反复将用量最少的颜色并入 ΔE 最近的保留色"""
    cur = list(cells)
    while True:
        counts = Counter(cur)
        if len(counts) <= max(1, max_colors):
            return cur
        ordered = sorted(counts.items(), key=lambda kv: (kv[1], kv[0]))
        victim = ordered[0][0]
        target = min((c for c, _ in ordered[1:]), key=lambda c: catalog.distance(victim, c))
        cur = [target if c == victim else c for c in cur]


def convert_array(arr: np.ndarray, opts: ConvertOptions, catalog: Catalog) -> tuple[list[str], int, int]:
    """arr: (H, W, 4) uint8 RGBA → (cells, cols, rows)"""
    cols = max(4, min(120, opts.cols))
    rows = opts.rows or auto_rows(arr.shape[1], arr.shape[0], cols)
    bg = opts.background_id or catalog.nearest(hex_to_lab("#FFFFFF")).id

    rgb, opaque = sample_grid(arr, cols, rows)
    if opts.mode == "cartoon":
        step = 255 / 4
        rgb = np.round(rgb / step) * step
    ids = catalog.nearest_ids(rgb_to_lab_array(rgb)) if opaque.any() else []
    cells = [ids[i] if opaque[i] else bg for i in range(rows * cols)] if ids else [bg] * (rows * cols)

    max_colors = min(opts.max_colors, 4) if opts.mode == "low-color" else opts.max_colors
    cells = limit_colors(cells, max_colors, catalog)

    if opts.mode == "outline":
        used = set(cells)
        darkest = min(used, key=lambda c: catalog.get(c).lab.L)
        L = np.array([catalog.get(c).lab.L for c in cells]).reshape(rows, cols)
        right = np.zeros_like(L)
        down = np.zeros_like(L)
        right[:, :-1] = np.abs(L[:, :-1] - L[:, 1:])
        down[:-1, :] = np.abs(L[:-1, :] - L[1:, :])
        edge = (np.maximum(right, down) > 18) & (L < 92)
        cells = [darkest if e else c for c, e in zip(cells, edge.ravel())]

    if opts.remove_isolated or opts.mode == "pixel":
        cells = remove_isolated(cells, cols, rows)
    if opts.small_area_merge:
        cells = merge_rare_colors(cells, max(2, round(cols * rows * 0.004)), catalog)
    if opts.symmetry:
        cells = mirror_horizontal(cells, cols, rows)
    return cells, cols, rows


def convert_image(img: Image.Image, opts: ConvertOptions, catalog: Catalog) -> tuple[list[str], int, int]:
    prepared = preprocess(img, opts.prep)
    return convert_array(np.asarray(prepared), opts, catalog)

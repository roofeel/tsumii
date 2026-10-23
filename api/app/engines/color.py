"""色彩工具：sRGB ↔ CIELAB（D65）与 CIEDE2000 色差。

标量版本用于单个颜色；向量化版本（numpy）用于图片转换时的批量匹配。
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Lab:
    L: float
    a: float
    b: float


_HEX = re.compile(r"^[0-9a-fA-F]{6}$")


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if not _HEX.match(h):
        raise ValueError(f"Invalid hex color: {hex_color}")
    n = int(h, 16)
    return (n >> 16) & 255, (n >> 8) & 255, n & 255


def rgb_to_hex(rgb: tuple[float, float, float]) -> str:
    return "#" + "".join(f"{max(0, min(255, round(v))):02X}" for v in rgb)


def rgb_to_lab_array(rgb: np.ndarray) -> np.ndarray:
    """rgb: (..., 3) 0–255 → lab: (..., 3)"""
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ]
    )
    xyz = lin @ m.T
    xyz = xyz / np.array([0.95047, 1.0, 1.08883])
    eps = 216 / 24389
    kappa = 24389 / 27
    f = np.where(xyz > eps, np.cbrt(xyz), (kappa * xyz + 16) / 116)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], axis=-1)


def rgb_to_lab(rgb: tuple[float, float, float]) -> Lab:
    L, a, b = rgb_to_lab_array(np.array(rgb, dtype=np.float64)).tolist()
    return Lab(L, a, b)


def hex_to_lab(hex_color: str) -> Lab:
    return rgb_to_lab(hex_to_rgb(hex_color))


def delta_e2000_array(lab1: np.ndarray, lab2: np.ndarray) -> np.ndarray:
    """向量化 CIEDE2000（Sharma 2005）。lab1、lab2 形状可广播，最后一维为 3。"""
    lab1 = np.asarray(lab1, dtype=np.float64)
    lab2 = np.asarray(lab2, dtype=np.float64)
    L1, a1, b1 = lab1[..., 0], lab1[..., 1], lab1[..., 2]
    L2, a2, b2 = lab2[..., 0], lab2[..., 1], lab2[..., 2]

    C1 = np.hypot(a1, b1)
    C2 = np.hypot(a2, b2)
    Cbar7 = ((C1 + C2) / 2) ** 7
    G = 0.5 * (1 - np.sqrt(Cbar7 / (Cbar7 + 25.0**7)))
    a1p = (1 + G) * a1
    a2p = (1 + G) * a2
    C1p = np.hypot(a1p, b1)
    C2p = np.hypot(a2p, b2)
    h1p = np.where((a1p == 0) & (b1 == 0), 0.0, np.degrees(np.arctan2(b1, a1p)) % 360)
    h2p = np.where((a2p == 0) & (b2 == 0), 0.0, np.degrees(np.arctan2(b2, a2p)) % 360)

    dLp = L2 - L1
    dCp = C2p - C1p
    zero = (C1p * C2p) == 0
    dhp = h2p - h1p
    dhp = np.where(dhp > 180, dhp - 360, dhp)
    dhp = np.where(dhp < -180, dhp + 360, dhp)
    dhp = np.where(zero, 0.0, dhp)
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dhp / 2))

    Lbarp = (L1 + L2) / 2
    Cbarp = (C1p + C2p) / 2
    hsum = h1p + h2p
    hbarp = np.where(
        zero,
        hsum,
        np.where(np.abs(h1p - h2p) <= 180, hsum / 2, np.where(hsum < 360, (hsum + 360) / 2, (hsum - 360) / 2)),
    )
    T = (
        1
        - 0.17 * np.cos(np.radians(hbarp - 30))
        + 0.24 * np.cos(np.radians(2 * hbarp))
        + 0.32 * np.cos(np.radians(3 * hbarp + 6))
        - 0.20 * np.cos(np.radians(4 * hbarp - 63))
    )
    dTheta = 30 * np.exp(-(((hbarp - 275) / 25) ** 2))
    Cbarp7 = Cbarp**7
    Rc = 2 * np.sqrt(Cbarp7 / (Cbarp7 + 25.0**7))
    Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / np.sqrt(20 + (Lbarp - 50) ** 2)
    Sc = 1 + 0.045 * Cbarp
    Sh = 1 + 0.015 * Cbarp * T
    Rt = -np.sin(np.radians(2 * dTheta)) * Rc
    return np.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))


def delta_e2000(c1: Lab, c2: Lab) -> float:
    return float(delta_e2000_array(np.array([c1.L, c1.a, c1.b]), np.array([c2.L, c2.a, c2.b])))


def is_light(hex_color: str) -> bool:
    return hex_to_lab(hex_color).L > 62


__all__ = [
    "Lab",
    "hex_to_rgb",
    "rgb_to_hex",
    "rgb_to_lab",
    "rgb_to_lab_array",
    "hex_to_lab",
    "delta_e2000",
    "delta_e2000_array",
    "is_light",
]

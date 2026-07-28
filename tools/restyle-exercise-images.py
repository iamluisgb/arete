#!/usr/bin/env python3
"""
Reestiliza las ilustraciones de RepDB a la paleta de Areté.

Hace dos cosas, ambas permitidas por el término 4 de la licencia de RepDB
("Images may be resized, cropped, or recolored for in-app use"):

  1. Recorta el fondo plano y lo deja transparente, para que la ilustración
     se apoye sobre --surface en claro y en oscuro sin ficha de color.
  2. Rota SOLO el rango azul/cian hacia el terracota de Areté. La piel, el pelo
     y el metal del material quedan intactos porque se filtran por tono y
     saturación, no por posición.

Deliberadamente NO usa modelos generativos: el término 5 de la licencia prohíbe
image-to-image, style transfer y fine-tuning sobre estas imágenes. Esto es una
transformación de color determinista, reproducible y auditable.

Uso:  python3 tools/restyle-exercise-images.py ORIGEN DESTINO
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Paleta de Areté (style.css)
ACCENT_HUE = 8.0 / 360.0      # --accent #d4372c
BG_TOLERANCE = 26             # distancia RGB para considerar "fondo"
BLUE_LO, BLUE_HI = 0.42, 0.75  # rango de tono a rotar (~150°-270°)
MIN_SAT = 0.18                # por debajo es gris: material, no ropa


def rgb_to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    idx = nz & (mx == r)
    h[idx] = ((g - b)[idx] / d[idx]) % 6
    idx = nz & (mx == g)
    h[idx] = (b - r)[idx] / d[idx] + 2
    idx = nz & (mx == b)
    h[idx] = (r - g)[idx] / d[idx] + 4
    h = (h / 6.0) % 1.0
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6).astype(int)
    f = h * 6 - i
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    i = i % 6
    out = np.zeros(h.shape + (3,), dtype=float)
    for n, (rr, gg, bb) in enumerate([(v, t, p), (q, v, p), (p, v, t),
                                      (p, q, v), (t, p, v), (v, p, q)]):
        m = i == n
        out[m] = np.stack([rr, gg, bb], -1)[m]
    return out


def restyle(src: Path, dst: Path):
    im = Image.open(src).convert("RGB")
    a = np.asarray(im).astype(float) / 255.0

    # ── 1. fondo → transparente ──────────────────────────────────────────
    # el color de fondo es el de la esquina: plano y mayoritario
    bg = a[2, 2].copy()
    dist = np.linalg.norm((a - bg) * 255, axis=-1)
    # alfa suave en el borde para no dejar dientes de sierra
    alpha = np.clip((dist - BG_TOLERANCE) / BG_TOLERANCE, 0, 1)

    # ── 2. azules → terracota ────────────────────────────────────────────
    h, s, v = rgb_to_hsv(a)
    is_blue = (h >= BLUE_LO) & (h <= BLUE_HI) & (s >= MIN_SAT)
    # se conserva el contraste interno del rango: el cian claro sigue siendo
    # el tono claro y el marino sigue siendo el oscuro, solo que en cálido
    span = (h - BLUE_LO) / (BLUE_HI - BLUE_LO)          # 0..1 dentro del azul
    new_h = (ACCENT_HUE + (span - 0.5) * 0.055) % 1.0    # abanico estrecho
    h = np.where(is_blue, new_h, h)
    s = np.where(is_blue, np.clip(s * 0.92, 0, 1), s)    # baja un punto el chillido

    # el material (barra, disco, pesa) es gris FRÍO y canta junto a un neutro
    # cálido como --surface2; se le da el mismo sesgo templado sin colorearlo
    is_cool_gray = (h >= BLUE_LO) & (h <= BLUE_HI) & (s < MIN_SAT) & (s > 0.02)
    h = np.where(is_cool_gray, 0.06, h)
    s = np.where(is_cool_gray, s * 0.55, s)

    rgb = hsv_to_rgb(h, s, v)
    out = np.dstack([(rgb * 255).astype(np.uint8),
                     (alpha * 255).astype(np.uint8)])
    dst.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out, "RGBA").save(dst, "WEBP", quality=88, method=6)
    return dst.stat().st_size


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src_dir, dst_dir = Path(sys.argv[1]), Path(sys.argv[2])
    files = sorted(src_dir.glob("*.webp"))
    if not files:
        sys.exit(f"sin .webp en {src_dir}")
    total = 0
    for f in files:
        n = restyle(f, dst_dir / f.name)
        total += n
        print(f"  {f.name:46} {n/1024:5.1f} KB")
    print(f"\n{len(files)} imágenes · {total/1024:.0f} KB")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Genera js/exercise-media.js y copia las imágenes a assets/exercises/.

Lee .eval/match.json y .eval/repdb-arete-full/ (los produce build-exercise-catalog.py)
y deja en el repo solo lo que se va a servir: un mapa alias → fotogramas y los WebP
ya reestilizados.

Los movimientos de confianza "ninguno" se omiten a propósito: sin match fiable no se
dibuja nada.

Uso:  python3 tools/gen-exercise-media.py [--incluir-base]
"""
import json
import shutil
import sys
from pathlib import Path

MATCH = Path(".eval/match.json")
SRC = Path(".eval/repdb-arete-full")
DEST = Path("assets/exercises")
OUT = Path("js/exercise-media.js")

# 'base' = la familia, no la variante exacta. Se incluye por defecto; con
# --sin-base se deja fuera para ser más conservador.
NIVELES = {"exacto", "alto", "medio", "base"}


def main():
    if "--sin-base" in sys.argv:
        NIVELES.discard("base")

    match = json.loads(MATCH.read_text())
    DEST.mkdir(parents=True, exist_ok=True)

    entradas, usados = [], set()
    for o in match:
        # los fotogramas ya reestilizados que dejó el constructor del catálogo
        frames = o.get("_frames")
        if not frames:
            continue
        # una secuencia reconstruida vale aunque no haya candidato directo
        if o["confianza"] not in NIVELES and not o.get("_compuesto"):
            continue
        rel = []
        for f in frames:
            name = Path(f).name
            src = SRC / name
            if not src.exists():
                continue
            dst = DEST / name
            if not dst.exists():
                shutil.copy2(src, dst)
            usados.add(name)
            rel.append(f"assets/exercises/{name}")
        if not rel:
            continue
        alias = sorted({v for v in o["variantes"]})
        entradas.append((o["clave"], alias, rel, o.get("tips_es") or []))

    # limpiar assets que ya no usa nadie
    for p in DEST.glob("*.webp"):
        if p.name not in usados:
            p.unlink()

    lines = [
        "// Generado por tools/gen-exercise-media.py — no editar a mano.",
        "//",
        "// Ilustraciones: Exercise data by RepDB (repdb.co), usadas en app con",
        "// atribución según su licencia de tier gratuito. Recoloreadas y recortadas",
        "// con tools/restyle-exercise-images.py (sin modelos generativos).",
        "",
        "export const EXERCISE_MEDIA = {",
    ]
    for clave, alias, frames, tips in sorted(entradas):
        js_alias = ", ".join(json.dumps(a, ensure_ascii=False) for a in alias)
        js_frames = ", ".join(json.dumps(f) for f in frames)
        lines.append(f"  {json.dumps(clave, ensure_ascii=False)}: {{")
        lines.append(f"    alias: [{js_alias}],")
        lines.append(f"    frames: [{js_frames}],")
        if tips:
            lines.append(f"    tip: {json.dumps(tips[0], ensure_ascii=False)},")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    OUT.write_text("\n".join(lines))

    peso = sum(p.stat().st_size for p in DEST.glob("*.webp"))
    print(f"{len(entradas)} movimientos con imagen")
    print(f"{len(usados)} ficheros · {peso/1024/1024:.2f} MB en {DEST}")
    print(f"→ {OUT}")


if __name__ == "__main__":
    main()

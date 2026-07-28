#!/usr/bin/env python3
"""
Descarga, reestiliza y monta la página de revisión del catálogo de ejercicios.

Lee .eval/match.json (lo produce match-exercises.py), baja las imágenes de RepDB
de cada movimiento emparejado, las pasa por el reestilizado de Areté y escribe
catalogo-ejercicios.html para revisar movimiento a movimiento antes de incorporar.

Uso:  python3 tools/build-exercise-catalog.py
"""
import html
import importlib.util
import json
import urllib.request
from pathlib import Path

# el reestilizador vive en un fichero con guiones, así que se carga a mano
_spec = importlib.util.spec_from_file_location(
    "restyle", Path(__file__).with_name("restyle-exercise-images.py"))
rs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rs)

BASE = "https://raw.githubusercontent.com/sergei-argutin/exercise-dataset/main/"
SRC = Path(".eval/repdb-full")
OUT = Path(".eval/repdb-arete-full")

ORDEN = ["exacto", "alto", "medio", "base", "ninguno"]

# RepDB clasifica el burpee como 'cardio' y le da una sola pose, igual que a la
# comba o las cuerdas de batalla. Para un movimiento de varias fases eso es un
# error de su catálogo: una foto fija no enseña nada. Se reconstruye la
# secuencia con imágenes suyas de las fases que sí tienen dos poses.
# Sigue siendo uso en app de material licenciado, no un dataset derivado.
CUCLILLAS = "images/flat/bodyweight-squat-peak.webp"
PLANCHA = "images/flat/high-plank-main.webp"
FLEXION = "images/flat/push-up-peak.webp"
SALTO = "images/flat/jump-squat-peak.webp"

# En orden cronológico del movimiento. Se evalúa de arriba abajo y gana la
# primera regla que encaje, así que las variantes van antes que el genérico.
KB_SENTADILLA = "images/flat/one-arm-kettlebell-front-squat-peak.webp"
KB_RACK = "images/flat/one-arm-kettlebell-front-squat-start.webp"
KB_ARRIBA = "images/flat/one-arm-kettlebell-push-press-peak.webp"

COMPUESTOS = [
    # sin salto: la fase final es ponerse de pie, no saltar
    (("sin salto",), [CUCLILLAS, PLANCHA, FLEXION]),
    (("burpee",), [CUCLILLAS, PLANCHA, FLEXION, SALTO]),
    # RepDB no tiene thruster de kettlebell, pero sí sus dos mitades: un
    # thruster es sentadilla frontal + push press. Mejor esto que la versión
    # con barra, que es otro material, o que dejarlo vacío.
    (("thruster",), [KB_SENTADILLA, KB_RACK, KB_ARRIBA]),
]


def secuencia(o):
    """Devuelve la secuencia reconstruida del movimiento, o None."""
    texto = " ".join(o["variantes"]).lower() + " " + o["clave"]
    import unicodedata as _u
    texto = "".join(c for c in _u.normalize("NFD", texto)
                    if _u.category(c) != "Mn")
    for claves, frames in COMPUESTOS:
        if any(k in texto for k in claves):
            return frames
    return None
ETIQUETA = {
    "exacto":  ("Exacto", "El nombre coincide letra a letra. Se puede incorporar sin mirar."),
    "alto":    ("Alta", "Todas las palabras de Areté aparecen en el nombre de RepDB."),
    "medio":   ("Media", "Coincidencia parcial. Conviene mirar la imagen antes de aceptar."),
    "base":    ("Movimiento base", "No es la variante exacta, sino la familia. Decide tú si vale."),
    "ninguno": ("Sin imagen", "Ningún candidato aceptable. Se queda sin ilustración."),
}


def fetch(rel: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 800:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(BASE + rel, timeout=30) as r:
            data = r.read()
        if len(data) < 800:
            return False
        dest.write_bytes(data)
        return True
    except Exception:
        return False


def card(o, restyled):
    conf = o["confianza"]
    variantes = " · ".join(html.escape(v) for v in o["variantes"])
    poses = restyled.get(o["clave"], [])
    compuesto = secuencia(o) is not None
    if poses:
        # se publica junto a la app: las rutas van a assets/, no a .eval/,
        # que está gitignorada y no existiría en el servidor
        imgs = "".join(
            f'<img src="assets/exercises/{Path(p).name}" alt="" loading="lazy">'
            for p in poses)
        media = f'<div class="pict f{len(poses)}">{imgs}</div>'
    else:
        media = '<div class="pict empty"><span>sin imagen</span></div>'
    origen = (f'<div class="src">RepDB: <b>{html.escape(o["repdb_es"])}</b>'
              f'<span class="en">{html.escape(o["repdb_en"] or "")}</span></div>'
              if o["repdb_es"] else '<div class="src none">sin candidato</div>')
    if compuesto:
        origen += ('<div class="badge">secuencia reconstruida</div>')
    tip = ""
    if o.get("tips_es"):
        tip = f'<div class="tip">{html.escape(o["tips_es"][0])}</div>'
    return (f'<article class="card {conf}">{media}'
            f'<div class="body"><h3>{variantes}</h3>{origen}{tip}</div></article>')


def main():
    match = json.loads(Path(".eval/match.json").read_text())

    # 1. descargar + reestilizar
    restyled, fallos = {}, []
    # también entran los que no tienen candidato pero sí secuencia reconstruida:
    # el thruster de kettlebell no existe en RepDB, se arma con sus dos mitades
    con_img = [o for o in match if o.get("imagenes") or secuencia(o)]
    print(f"descargando y reestilizando {len(con_img)} movimientos…")
    for o in con_img:
        poses = []
        # secuencia reconstruida si la hay; si no, las poses que traiga RepDB
        # (los isométricos y los estiramientos vienen con una sola, 'main')
        comp = secuencia(o)
        rels = comp or [o["imagenes"][k] for k in ("start", "peak", "main")
                        if o["imagenes"].get(k)]
        for rel in rels:
            name = Path(rel).name
            raw = SRC / name
            if not fetch(rel, raw):
                continue
            dst = OUT / name
            if not dst.exists():
                try:
                    rs.restyle(raw, dst)
                except Exception:
                    continue
            poses.append(str(dst))
        if poses:
            restyled[o["clave"]] = poses
            o["_frames"] = poses      # lo consume gen-exercise-media.py
            if comp:
                o["_compuesto"] = True
        else:
            fallos.append(o["repdb_es"])

    # los fotogramas resueltos se devuelven a match.json para el generador
    Path(".eval/match.json").write_text(
        json.dumps(match, ensure_ascii=False, indent=1))

    # 2. página
    grupos = {k: [o for o in match if o["confianza"] == k] for k in ORDEN}
    tot = len(match)
    ok = sum(1 for o in match if restyled.get(o["clave"]))
    secciones = []
    for k in ORDEN:
        g = grupos[k]
        if not g:
            continue
        titulo, sub = ETIQUETA[k]
        cards = "".join(card(o, restyled) for o in g)
        secciones.append(
            f'<section id="{k}"><header class="sh {k}"><h2>{titulo} '
            f'<span class="n">{len(g)}</span></h2><p>{sub}</p></header>'
            f'<div class="grid">{cards}</div></section>')

    chips = "".join(
        f'<a href="#{k}" class="chip {k}">{ETIQUETA[k][0]} <b>{len(grupos[k])}</b></a>'
        for k in ORDEN if grupos[k])

    tpl = Path("tools/catalog-template.html").read_text()
    Path("catalogo-ejercicios.html").write_text(
        tpl.replace("{{TOTAL}}", str(tot))
           .replace("{{CONIMG}}", str(ok))
           .replace("{{PCT}}", str(100 * ok // tot))
           .replace("{{CHIPS}}", chips)
           .replace("{{SECCIONES}}", "".join(secciones)))

    print(f"\n{ok}/{tot} movimientos con imagen ({100*ok//tot}%)")
    if fallos:
        print(f"descargas fallidas: {len(fallos)} → {fallos[:5]}")
    peso = sum(p.stat().st_size for p in OUT.glob('*.webp'))
    print(f"{len(list(OUT.glob('*.webp')))} imágenes reestilizadas · {peso/1024/1024:.1f} MB")
    print("→ catalogo-ejercicios.html")


if __name__ == "__main__":
    main()

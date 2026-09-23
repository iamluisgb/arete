#!/usr/bin/env python3
"""
Genera js/exercise-ontology.js (plan F0+F2, docs/PLAN-ONTOLOGIA.md).

Fuente de datos: free-exercise-db (https://github.com/yuhonas/free-exercise-db),
876 ejercicios, licencia Unlicense (dominio público). El JSON crudo se cachea en
tools/cache/free-exercise-db.json: la única conexión de red es de build, nunca de
runtime — la app consulta el módulo generado, offline.

El mapeo NO se calcula aquí: lo propone un LLM (nombre + alias + tip de Areté vs
los 873→876 candidatos) y lo confirma una persona. Esa tabla vive en
docs/ontologia-propuestas.json y este script solo aplica las filas CONFIRMADAS —
las dudosas quedan en la tabla para revisión, nunca entran al catálogo (medición
del plan: el matching difuso produce pares equivocados con alta confianza; no se
escribe un matcher por similitud de cadenas).

Contrato de subsumción (F3, mergeado): el módulo generado debe resolver EXACTAMENTE
las mismas claves que la semilla hand-authored, y los campos `lift`/`variantOf` de
los nodos de la semilla se emiten sin cambios. Los nodos nuevos no introducen
`lift` ni `variantOf`: eso movería la derivación de dominios (delta de evals) y es
una decisión que le toca a la revisión humana, no al build.

Uso:
  python3 tools/build-exercise-ontology.py                # genera el módulo
  python3 tools/build-exercise-ontology.py --refresh      # re-baja fedb
  python3 tools/build-exercise-ontology.py --tabla        # regenera el .md de revisión
"""
import json
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

FEDB_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
CACHE = Path("tools/cache/free-exercise-db.json")
PROPOSALS = Path("docs/ontologia-propuestas.json")
OUT = Path("js/exercise-ontology.js")
TABLE_MD = Path("docs/ontologia-propuestas.md")

# ── Vocabularios controlados (cerrados: nada fuera de ellos es válido) ──

# Patrón de movimiento. El plan F0 lo fija: 10 valores.
PATTERN = {
    "hinge",    # bisagra de cadera: peso muerto, swing, RDL
    "squat",    # flexión de rodilla bilateral: sentadilla, squat
    "lunge",    # zancada / unilateral de pierna completa: búlgara, escalera
    "push_h",   # empuje horizontal: banca, flexiones, remo... no: remo es pull
    "push_v",   # empuje vertical: militar, press de hombro
    "pull_h",   # tracción horizontal: remo
    "pull_v",   # tracción vertical: dominada, jalón
    "carry",    # carga: farmer walk, suitcase carry
    "core",     # anti-movimiento y flexión de tronco: plancha, abdominal
    "loco",     # locomoción y total-body cíclico: burpee, comba, escalador
}

# fedb `equipment` (13 valores, contando el nulo) → material de Areté.
# 'other' y los nulos se resuelven a mano en la tabla cuando importa; el mapa
# da el valor por defecto honesto.
EQUIPMENT = {
    "barbell": ["barra"],
    "dumbbell": ["mancuerna"],
    "kettlebells": ["kettlebell"],
    "body only": ["ninguno"],
    "cable": ["cable"],
    "machine": ["maquina"],
    "bands": ["goma"],
    "medicine ball": ["balon"],
    "exercise ball": ["fitball"],
    "e-z curl bar": ["barra"],
    "foam roll": ["ninguno"],
    "other": None,   # se resuelve a mano en la tabla
    None: None,      # 77 entradas sin equipment: se resuelve a mano en la tabla
}

# fedb `primaryMuscles`/`secondaryMuscles` (17) → español de entrenador.
MUSCLE = {
    "abdominals": "abdominales",
    "abductors": "abductores",
    "adductors": "aductores",
    "biceps": "bíceps",
    "calves": "gemelos",
    "chest": "pectoral",
    "forearms": "antebrazo",
    "glutes": "glúteo",
    "hamstrings": "isquios",
    "lats": "dorsal",
    "lower back": "lumbar",
    "middle back": "espalda media",
    "neck": "cuello",
    "quadriceps": "cuádriceps",
    "shoulders": "hombro",
    "traps": "trapecio",
    "triceps": "tríceps",
}

# ── mediaKey en Python: espejo exacto de la firma canónica del módulo JS ──
# Si estas copias divergen, la validación miente. El test de la semilla en
# tests/exercise-ontology.test.js es la red: cualquier desvío salta ahí.

STOP = {"con", "de", "del", "la", "el", "los", "las", "en", "a", "y", "o",
        "para", "sobre", "kb", "the", "with", "and", "dos", "una", "un"}

_STEMS = [("ones", "on"), ("ores", "or"), ("ales", "al"), ("iles", "il")]


def _stem(w):
    for plural, singular in _STEMS:
        if len(w) > len(plural) and w.endswith(plural):
            return w[: -len(plural)] + singular
    if len(w) > 4 and w.endswith("es") and w[-4:-2] in ("ch", "sh", "ss", "zz"):
        return w[:-2]
    if len(w) > 3 and w.endswith("s"):
        return w[:-1]
    return w


def media_key(name):
    plain = (name or "").lower()
    plain = unicodedata.normalize("NFD", plain)
    plain = "".join(c for c in plain if not unicodedata.combining(c))
    plain = re.sub(r"\(.*?\)", " ", plain)  # el JS elimina el paréntesis entero
    out = []
    for ch in plain:
        out.append(ch if (ch.isascii() and ch.isalnum()) or ch == " " else " ")
    words = "".join(out).split()
    return " ".join(sorted(_stem(w) for w in words if w and w not in STOP))


def ensure_fedb(refresh=False):
    if CACHE.exists() and not refresh:
        return json.loads(CACHE.read_text())
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    print(f"bajando free-exercise-db → {CACHE}")
    with urllib.request.urlopen(FEDB_URL, timeout=60) as r:
        CACHE.write_bytes(r.read())
    return json.loads(CACHE.read_text())


def load_proposals():
    if not PROPOSALS.exists():
        sys.exit(f"falta {PROPOSALS}: la tabla de propuestas es la entrada del build")
    return json.loads(PROPOSALS.read_text())


FEDB_PENDING = []  # alias de fedb a añadir si no colisionan (se resuelve al final)


def fedb_pending(name):
    FEDB_PENDING.append(name)
    return name


def dedupe_fedb_aliases(nodes):
    """Quita los alias de fedb cuya firma ya esté reservada por otro nodo."""
    for node in nodes:
        kept = []
        for alias in node["aliases"]:
            if alias in FEDB_PENDING:
                FEDB_PENDING.remove(alias)
            key = media_key(alias)
            clash = seen_key_of(nodes, node, key)
            if clash:
                print(f"aviso: alias '{alias}' de {node['id']} choca con {clash['id']}: no se añade")
                continue
            kept.append(alias)
        node["aliases"] = kept


def seen_key_of(nodes, node, key):
    for other in nodes:
        aliases = [other["name"], *other.get("aliases", [])]
        if other is not node and any(media_key(a) == key for a in aliases):
            return other
    return None


def validate_node(node, fedb_by_id):
    """Un nodo solo sale si todos sus campos respetan los vocabularios."""
    where = f"[{node['id']}]"
    if node["pattern"] not in PATTERN:
        sys.exit(f"{where} pattern '{node['pattern']}' fuera del vocabulario")
    for eq in node["equipment"]:
        if eq not in ("barra", "mancuerna", "kettlebell", "dominadas", "ninguno",
                      "banco", "cable", "maquina", "goma", "balon", "fitball"):
            sys.exit(f"{where} equipment '{eq}' fuera del vocabulario de Areté")
    for m in node.get("primary", []) + node.get("secondary", []):
        if m not in MUSCLE.values():
            sys.exit(f"{where} músculo '{m}' fuera del vocabulario")
    src = node.get("source")
    if src == "fedb":
        ref = fedb_by_id.get(node.get("fedb"))
        if ref is None:
            sys.exit(f"{where} fedb id '{node.get('fedb')}' no existe en el dataset")


def build_node(row, fedb_by_id):
    """Una fila confirmada → nodo del esquema F0 (más lift/variantOf de F3).
    Las filas source 'alias' no producen nodo: su clave ya resuelve por otro."""
    if row["source"] == "alias":
        return None
    base = {
        "id": row["id"],
        "name": row["arete"],
        "aliases": list(row.get("aliases", [])),
        "pattern": row["pattern"],
        "equipment": list(row["equipment"]),
        "primary": list(row.get("primary", [])),
        "secondary": list(row.get("secondary", [])),
        "domains": list(row["domains"]),
        "unilateral": bool(row.get("unilateral", False)),
        "mechanic": row.get("mechanic", ""),
        "contraindications": list(row.get("contraindications", [])),
        "regression": row.get("regression", ""),
        "progression": row.get("progression", ""),
        "substitutes": list(row.get("substitutes", [])),
        "source": row["source"],
    }
    if row["source"] == "fedb":
        ref = fedb_by_id[row["fedb"]]
        base["fedb"] = row["fedb"]
        # el nombre inglés del dataset entra como alias: quien registre en
        # inglés (o importe de otro sitio) resuelve igual. Si su firma colisiona
        # con otra ya reservada (p. ej. dos claves Areté contra el mismo fedb),
        # se descarta el alias con aviso, no el nodo.
        if ref["name"] not in base["aliases"] and ref["name"] != base["name"]:
            base["aliases"].append(fedb_pending(ref["name"]))
        if not base["mechanic"]:
            base["mechanic"] = ref.get("mechanic") or ""
        if not base["primary"]:
            base["primary"] = [MUSCLE[m] for m in ref.get("primaryMuscles", [])
                               if m in MUSCLE]
        if not base["secondary"]:
            base["secondary"] = [MUSCLE[m] for m in ref.get("secondaryMuscles", [])
                                 if m in MUSCLE]
    if row.get("lift"):
        base["lift"] = row["lift"]
    if row.get("variantOf"):
        base["variantOf"] = row["variantOf"]
    return base


def js_str(s):
    return json.dumps(s, ensure_ascii=False)


def emit_module(nodes):
    lines = []
    lines.append("// Ontología de ejercicios de Areté — GENERADO, no editar a mano.")
    lines.append("//")
    lines.append("// Regenerar:  python3 tools/build-exercise-ontology.py")
    lines.append("//")
    lines.append("// Datos: free-exercise-db (github.com/yuhonas/free-exercise-db), Unlicense")
    lines.append("// (dominio público), cruzado con el catálogo de Areté (js/exercise-media.js).")
    lines.append("// Solo entran los 89 con ilustración y tip propios; el resto del dataset queda")
    lines.append("// como cantera en tools/cache/. El mapeo lo propone un LLM y lo confirma una")
    lines.append("// persona: docs/ontologia-propuestas.json es la fuente de verdad de las filas.")
    lines.append("//")
    lines.append("// Contrato F3 (PLAN-ONTOLOGIA.md): `lift` marca los cinco nodos canónicos que")
    lines.append("// alimentan la derivación de dominios; `variantOf` declara variantes que NO")
    lines.append("// cuentan; lo que no resuelve no cuenta — matching exacto sobre mediaKey, sin")
    lines.append("// substring ni fallback de regex.")
    lines.append("")
    lines.append("export const EXERCISE_ONTOLOGY = [")
    for node in nodes:
        lines.append("  {")
        lines.append(f"    id: {js_str(node['id'])}, name: {js_str(node['name'])},")
        lines.append(f"    pattern: {js_str(node['pattern'])},")
        lines.append(f"    equipment: {json.dumps(node['equipment'], ensure_ascii=False)},")
        if node["primary"]:
            lines.append(f"    primary: {json.dumps(node['primary'], ensure_ascii=False)},")
        if node["secondary"]:
            lines.append(f"    secondary: {json.dumps(node['secondary'], ensure_ascii=False)},")
        lines.append(f"    domains: {json.dumps(node['domains'], ensure_ascii=False)},")
        if node["unilateral"]:
            lines.append("    unilateral: true,")
        if node["mechanic"]:
            lines.append(f"    mechanic: {js_str(node['mechanic'])},")
        if node["contraindications"]:
            lines.append(f"    contraindications: {json.dumps(node['contraindications'], ensure_ascii=False)},")
        if node["regression"]:
            lines.append(f"    regression: {js_str(node['regression'])},")
        if node["progression"]:
            lines.append(f"    progression: {js_str(node['progression'])},")
        if node["substitutes"]:
            lines.append(f"    substitutes: {json.dumps(node['substitutes'], ensure_ascii=False)},")
        lines.append(f"    source: {js_str(node['source'])},")
        if node.get("fedb"):
            lines.append(f"    fedb: {js_str(node['fedb'])},")
        # siempre presente: el módulo itera entry.aliases al indexar
        lines.append(f"    aliases: {json.dumps(node['aliases'], ensure_ascii=False)},")
        if node.get("lift"):
            lines.append(f"    lift: {js_str(node['lift'])},")
        if node.get("variantOf"):
            lines.append(f"    variantOf: {js_str(node['variantOf'])},")
        lines.append("  },")
    lines.append("];")
    lines.append("")
    lines.append("// ── Normalización e índice ───────────────────────────────")
    lines.append("// (idéntico a la semilla F3: una sola firma canónica para todo el producto)")
    lines.append("")
    lines.append("const STOP = new Set(['con', 'de', 'del', 'la', 'el', 'los', 'las', 'en', 'a',")
    lines.append("  'y', 'o', 'para', 'sobre', 'kb', 'the', 'with', 'and', 'dos', 'una', 'un']);")
    lines.append("")
    lines.append("/** Singulariza: plural español (-s tras vocal, -es tras consonante) e inglés. */")
    lines.append("function stem(w) {")
    lines.append("  for (const [plural, singular] of [['ones', 'on'], ['ores', 'or'],")
    lines.append("    ['ales', 'al'], ['iles', 'il']]) {")
    lines.append("    if (w.length > plural.length && w.endsWith(plural)) {")
    lines.append("      return w.slice(0, -plural.length) + singular;")
    lines.append("    }")
    lines.append("  }")
    lines.append("  if (w.length > 4 && w.endsWith('es') && ['ch', 'sh', 'ss', 'zz'].includes(w.slice(-4, -2))) {")
    lines.append("    return w.slice(0, -2);")
    lines.append("  }")
    lines.append("  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);")
    lines.append("  return w;")
    lines.append("}")
    lines.append("")
    lines.append("/** Firma canónica de un nombre: sin tildes, sin paréntesis, en singular. */")
    lines.append("export function mediaKey(name) {")
    lines.append("  const plain = (name || '')")
    lines.append("    .toLowerCase()")
    lines.append("    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')")
    lines.append("    .replace(/\\(.*?\\)/g, ' ')")
    lines.append("    .replace(/[^a-z0-9 ]/g, ' ')")
    lines.append("    .trim();")
    lines.append("  return plain.split(/\\s+/)")
    lines.append("    .filter(w => w && !STOP.has(w))")
    lines.append("    .map(stem)")
    lines.append("    .sort()")
    lines.append("    .join(' ');")
    lines.append("}")
    lines.append("")
    lines.append("// índice firma → nodo, construido una vez")
    lines.append("const INDEX = new Map();")
    lines.append("for (const entry of EXERCISE_ONTOLOGY) {")
    lines.append("  for (const alias of [entry.name, ...entry.aliases]) {")
    lines.append("    const key = mediaKey(alias);")
    lines.append("    if (INDEX.has(key) && INDEX.get(key) !== entry) {")
    lines.append("      throw new Error(`ontología: firma duplicada \"${key}\" (${INDEX.get(key).id} vs ${entry.id})`);")
    lines.append("    }")
    lines.append("    INDEX.set(key, entry);")
    lines.append("  }")
    lines.append("}")
    lines.append("")
    lines.append("/**")
    lines.append(" * De texto libre a nodo de la ontología, o null si no resuelve.")
    lines.append(" * Matching exacto sobre la firma normalizada: sin substring, sin difuso.")
    lines.append(" * Lo que no está en la ontología no cuenta — decidido, no ortográfico.")
    lines.append(" */")
    lines.append("export function resolveExercise(name) {")
    lines.append("  return INDEX.get(mediaKey(name)) || null;")
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


SEED_ALIASES = {
    # contrato de subsumción: alias semilla → lift/variantOf que DEBEN resolver
    "Sentadilla": ("squat", None), "Sentadilla trasera": ("squat", None),
    "Back Squat": ("squat", None), "Squat": ("squat", None),
    "Peso Muerto": ("deadlift", None), "Deadlift": ("deadlift", None),
    "Press de Banca": ("bench", None), "Press Banca": ("bench", None),
    "Bench Press": ("bench", None), "Bench": ("bench", None),
    "Press Militar": ("ohp", None), "Press de Hombro": ("ohp", None),
    "Overhead Press": ("ohp", None), "OHP": ("ohp", None),
    "Dominada": ("pullups", None), "Dominadas": ("pullups", None),
    "Dominada Prono": ("pullups", None), "Dominada Supino": ("pullups", None),
    "Dominada Supina": ("pullups", None), "Pull-up": ("pullups", None),
    "Pull-ups": ("pullups", None), "Chin-up": ("pullups", None), "Chin-ups": ("pullups", None),
    "Sentadilla Frontal": (None, "squat"), "Front Squat": (None, "squat"),
    "Sentadilla Búlgara": (None, "squat"), "Bulgarian Split Squat": (None, "squat"),
    "Pistol Squat": (None, "squat"), "Sentadilla Pistol": (None, "squat"),
    "Sentadilla 1 Pierna": (None, "squat"), "1 Pierna Sentadilla": (None, "squat"),
    "Sentadilla con Salto": (None, "squat"), "Sentadillas con Salto": (None, "squat"),
    "Squat con Salto": (None, "squat"), "Jump Squat": (None, "squat"),
    "Squat en Rack": (None, "squat"), "Sentadilla en Rack": (None, "squat"),
    "Peso Muerto Rumano": (None, "deadlift"), "PM Rumano": (None, "deadlift"),
    "Romanian Deadlift": (None, "deadlift"), "RDL": (None, "deadlift"),
    "Deadlift High Pull": (None, "deadlift"), "High Pull": (None, "deadlift"),
    "Push Press": (None, "ohp"),
    "Press en el Suelo": (None, "bench"), "Floor Press": (None, "bench"),
}


def check_media_coverage(rows):
    """Las 89 claves de js/exercise-media.js deben aparecer una vez exacta."""
    import re as _re
    src = Path("js/exercise-media.js").read_text()
    names = _re.findall(r'"((?:[^"\\]|\\.)+)":\s*\{',
                        src[src.index("export const EXERCISE_MEDIA = {"):])
    counts = {}
    for row in rows:
        counts[row["arete"]] = counts.get(row["arete"], 0) + 1
    missing = [n for n in names if n not in counts]
    dupes = [n for n, c in counts.items() if c > 1]
    extra = [n for n in counts if n not in set(names)]
    if missing or dupes or extra:
        sys.exit("cobertura de las 89 rota:\n"
                 f"  faltan: {missing}\n  duplicadas: {dupes}\n  sobran: {extra}")


def check_seed_contract(nodes):
    """El generado debe resolver la semilla con los mismos lift/variantOf."""
    by_key = {}
    for node in nodes:
        for alias in [node["name"], *node.get("aliases", [])]:
            by_key[media_key(alias)] = node
    failures = []
    for alias, (lift, variant_of) in SEED_ALIASES.items():
        node = by_key.get(media_key(alias))
        if node is None:
            failures.append(f"'{alias}' ya no resuelve")
            continue
        if node.get("lift") != lift or node.get("variantOf") != variant_of:
            failures.append(f"'{alias}' ahora resuelve a {node['id']} con "
                            f"lift={node.get('lift')} variantOf={node.get('variantOf')}")
    if failures:
        sys.exit("contrato de subsumción F3 roto:\n  " + "\n  ".join(failures))


def write_table_md(rows, nodes_applied):
    """La tabla de revisión en markdown: el artefacto que luis lee."""
    applied = {n["id"] for n in nodes_applied}
    order = {"confirmada": 0, "propia": 1, "alta": 2, "media": 3, "baja": 4, "descartado": 5}
    lines = [
        "# Propuestas de mapeo — los 89 de Areté contra free-exercise-db",
        "",
        "> Generado por `tools/build-exercise-ontology.py --tabla` a partir de",
        "> `docs/ontologia-propuestas.json` (la fuente de verdad). No editar aquí.",
        ">",
        "> Estado: **aplicada** = ya está en `js/exercise-ontology.js`; **propuesta** =",
        "> espera confirmación humana. Las confianza `alta/media/baja` son del LLM que",
        "> propuso; ninguna se aplica sin revisión (medición del plan: el difuso miente).",
        "",
        "| # | Areté | Alias | fedb | Confianza | Aplicada | pattern | domains | Nota |",
        "|---|-------|-------|------|-----------|----------|---------|---------|------|",
    ]
    for i, row in enumerate(rows, 1):
        fedb = row.get("fedb") or "—"
        if row["source"] == "propia":
            fedb = "propia"
        ok = "✅ sí" if row["id"] in applied else "—"
        alias = ", ".join(row.get("aliases", [])) or "—"
        nota = (row.get("nota") or "").replace("|", "\\|")
        lines.append(
            f"| {i} | {row['arete']} | {alias} | {fedb} | {row['confianza']} | {ok} "
            f"| {row['pattern']} | {', '.join(row['domains']) or '—'} | {nota} |")
    TABLE_MD.write_text("\n".join(lines) + "\n")


def main():
    refresh = "--refresh" in sys.argv
    fedb = ensure_fedb(refresh)
    fedb_by_id = {e["id"]: e for e in fedb}
    rows = load_proposals()
    check_media_coverage(rows)

    nodes = []
    for row in rows:
        if row["confianza"] != "confirmada" and row["source"] != "propia":
            continue  # dudosa: solo vive en la tabla, nunca en el catálogo
        node = build_node(row, fedb_by_id)
        if node is None:  # source 'alias': la clave ya resuelve por otro nodo
            continue
        validate_node(node, fedb_by_id)
        nodes.append(node)

    dedupe_fedb_aliases(nodes)

    # firma duplicada: el módulo JS también lo defiende, pero se falla aquí antes
    seen = {}
    for node in nodes:
        for alias in [node["name"], *node["aliases"]]:
            key = media_key(alias)
            if key in seen and seen[key] != node["id"]:
                sys.exit(f"firma duplicada '{key}': {seen[key]} vs {node['id']}")
            seen[key] = node["id"]

    check_seed_contract(nodes)

    OUT.write_text(emit_module(nodes))
    print(f"{OUT}: {len(nodes)} nodos ({sum(1 for n in nodes if n['source'] == 'fedb')} de fedb, "
          f"{sum(1 for n in nodes if n['source'] == 'propia')} propios de Areté)")

    if "--tabla" in sys.argv:
        write_table_md(rows, nodes)
        print(f"{TABLE_MD}: tabla de revisión regenerada")


if __name__ == "__main__":
    main()

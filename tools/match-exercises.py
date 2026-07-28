#!/usr/bin/env python3
"""
Empareja los ejercicios reales de los programas de Areté con el catálogo de RepDB.

Salida: .eval/match.json con un registro por movimiento y su nivel de confianza,
para revisar a mano lo dudoso antes de incorporar nada.

  exacto   — el nombre normalizado coincide letra a letra
  alto     — todas las palabras del nombre de Areté están en el de RepDB
  medio    — coincidencia parcial fuerte; hay que mirarlo
  ninguno  — sin candidato aceptable: se queda sin imagen

Uso:  python3 tools/match-exercises.py
"""
import json
import re
import unicodedata
import urllib.request
from pathlib import Path

REPDB = "https://raw.githubusercontent.com/sergei-argutin/exercise-dataset/main/exercises.json"

# entradas de los planes que no son ejercicios sino cabeceras de bloque
NOISE = [r"^(COM|GUERR|HIIT)-?\d", r"^HIIT ", r"^Bloque \d", r"^Min \d",
         r"^Retraso Zona", r"^Hang hold$"]

# palabras que no aportan al emparejamiento
# "kb" NO entra aquí: es la marca de kettlebell, no ruido. Descartarla hacía que
# "Snatch (KB)" cayera en "Arrancada" —el snatch con barra— porque norm() borra
# los paréntesis y la pista se perdía.
STOP = {"con", "de", "del", "la", "el", "los", "las", "en", "a", "y", "o",
        "para", "sobre", "the", "with", "and", "una", "un"}

# variantes y abreviaturas de los planes → forma canónica.
# Incluye el puente inglés↔español: el programa de kettlebell nombra en inglés
# y RepDB indexa en ambos, así que se unifican aquí en un solo vocabulario.
CANON = {
    "kb": "kettlebell", "pesa": "kettlebell",
    "pm": "peso muerto", "elev": "elevacion", "sent": "sentadilla",
    "levantamiento turco": "turco", "turkish get up": "turco",
    "molino de viento": "molino", "windmill": "molino",
    "pesa rusa": "kettlebell", "pesas rusas": "kettlebell",
    "desplante": "zancada", "lunge": "zancada",
    "deadlift": "peso muerto", "squat": "sentadilla",
    "push up": "flexion", "pushup": "flexion", "push ups": "flexion",
    "pull up": "dominada", "pullup": "dominada", "chin up": "dominada",
    "dip": "fondo", "dips": "fondo", "row": "remo",
    "bench press": "press banca", "overhead press": "press militar",
    "military press": "press militar", "shoulder press": "press militar",
    "calf raise": "elevacion talones", "shrug": "encogimiento",
    "leg raise": "elevacion piernas", "crunch": "encogimiento abdominal",
    "plank": "plancha", "mountain climber": "escalador",
    "get up": "turco", "sit up": "abdominal", "situp": "abdominal",
}

VOCALES = "aeiou"

# Coste de que RepDB añada una palabra que Areté no pide. Cambiar el material o
# asistir el movimiento lo convierte en OTRO ejercicio, así que se castiga duro;
# un descriptor de postura apenas cuenta. El resto vale 0.05 por defecto.
SOBRANTE = {
    "banda": .40, "goma": .40, "maquina": .40, "smith": .40, "polea": .40,
    "cable": .40, "asistida": .40, "asistido": .40, "pared": .35,
    "fitball": .35, "estabilidad": .35, "anilla": .35, "trx": .35,
    "dos": .18, "double": .18,
    "isometrico": .30, "isometrica": .30, "negativa": .30, "colgado": .25,
}

# Calificativos que NUNCA deben servir de movimiento base. Solo se excluyen en
# esa última pasada: "Deadlift High Pull" caía en "Plancha Alta" porque el token
# "high" casaba con "High Plank". Como tokens normales sí cuentan.
MODIFICADORES = {
    "high", "low", "alto", "bajo", "front", "back", "side", "lateral",
    "frontal", "trasero", "trasera", "invertido", "invertida", "negativa",
    "asistida", "asistido", "completo", "completa", "basica", "basico",
    "estandar", "tecnica", "salto", "palmada", "mano", "pierna", "rodilla",
    "inclinada", "inclinado", "prono", "prona", "supino", "supina",
    "unilateral", "sumo", "maleta", "ocho", "power", "dead", "split",
    # genéricos y material: "peso" suelto casaba con "Peso Corporal"
    "peso", "corporal", "barra", "mancuerna", "kettlebell", "banda",
    "banco", "cable", "maquina", "polea", "pesa",
}


# Los levantamientos que definen el programa se fijan a mano. Un nombre desnudo
# ("Sentadilla") empata con TODAS sus variantes, porque el nombre inglés tiene
# menos palabras y la puntuación no las distingue: ganaba la primera del
# recorrido, que resultó ser "Sentadilla con Banda". Aquí no se adivina.
OVERRIDES = {
    "sentadilla": "Barbell Back Squat",
    "press banca": "Barbell Bench Press",
    "peso muerto": "Barbell Deadlift",
    "press militar": "Barbell Overhead Press",
    "remo": "Bent-Over Barbell Row",
    "dominada": "Pull-Up",
    "flexion": "Push-Up",
    "fondo": "Chest Dips",
    "zancada": "Barbell Lunge",
    "swing": "Kettlebell Swing",
    "turco": "Kettlebell Turkish Get Ups",
    # Kettlebell: RepDB no tiene thruster ni snatch a una mano ni squat en rack.
    # Se fija lo que sí existe y de verdad corresponde al movimiento.
    "kettlebell rack sentadilla": "One Arm Kettlebell Front Squat",
    "clean kettlebell": "Kettlebell Swing Clean",
    "kettlebell snatch": "Double Kettlebell Swing Snatch",
    "kettlebell remo": "One Arm Kettlebell Row",
    "kettlebell press": "One Arm Kettlebell Floor Press",
}


# Movimientos donde el único candidato usa OTRO material. RepDB no tiene
# thruster de kettlebell, así que lo mejor que encuentra es el de barra: enseñar
# una barra donde hay una pesa rusa confunde más que no enseñar nada.
BLOQUEADOS = {"kettlebell thruster"}


def stem(w: str) -> str:
    """Singulariza. Solo quita marca de plural, nunca de género.

    Dos trampas ya pisadas:
    - Recortar "as"/"os" convertía "sentadillas" en "sentadill" mientras
      "sentadilla" quedaba intacta, y entonces jamás casaban.
    - Recortar "es" a ciegas convertía "burpees" en "burpe" frente a "burpee".
      En español el plural "-es" solo se añade tras consonante, así que se
      exige eso: "flexiones"→"flexion" sí, "burpees"→"burpee" por la vía del
      simple "-s".
    """
    for plural, singular in (("ones", "on"), ("ores", "or"),
                             ("ales", "al"), ("iles", "il")):
        if len(w) > len(plural) and w.endswith(plural):
            return w[: -len(plural)] + singular
    # plural inglés tras sibilante: snatches→snatch, crunches→crunch
    if len(w) > 4 and w[-2:] == "es" and w[-4:-2] in ("ch", "sh", "ss", "zz", "x"):
        return w[:-2]
    if len(w) > 3 and w.endswith("s"):
        return w[:-1]
    return w


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace("(", " ").replace(")", " ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def canon(s: str) -> str:
    """Normaliza → singulariza → aplica el vocabulario común ES/EN.

    El orden importa: las claves de CANON están en singular, así que hay que
    stemmizar antes o "Desplantes" nunca encontraría la regla de "desplante".
    """
    s = " ".join(stem(w) for w in norm(s).split())
    for a, b in CANON.items():
        # la clave también se stemmiza: si no, la regla "desplante"→"zancada"
        # no alcanza a "desplantes", que ya viene recortado a "desplant"
        a_stem = " ".join(stem(w) for w in a.split())
        s = re.sub(rf"\b{re.escape(a_stem)}\b", b, s)
    return re.sub(r"\s+", " ", s).strip()


def tokens(s: str) -> set:
    return {stem(t) for t in canon(s).split() if t not in STOP}


def load_plan_exercises():
    """Nombres de ejercicio de los programas, deduplicados por forma canónica."""
    names = set()

    def walk(o):
        if isinstance(o, dict):
            if "name" in o and ("sets" in o or "reps" in o):
                names.add(o["name"])
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    de_kettlebell = set()
    for f in sorted(Path("programs").glob("*.json")):
        antes = set(names)
        walk(json.loads(f.read_text()))
        if "kettlebell" in f.name:
            de_kettlebell |= (names - antes)

    real = [n for n in names if not any(re.search(p, n) for p in NOISE)]
    # se agrupa por firma de tokens ya stemmizados, no por la cadena canónica:
    # así "Sentadilla"/"Sentadillas" y "Deadlift"/"Peso Muerto" caen en el mismo
    # movimiento en vez de contarse dos veces
    grouped = {}
    for n in real:
        t = tokens(n)
        if n in de_kettlebell:
            t = t | {"kettlebell"}
        grouped.setdefault(" ".join(sorted(t)), []).append(n)
    return grouped


def score(a_tokens, b_tokens):
    """Cobertura del nombre de Areté, con castigo suave por ruido de RepDB.

    Asimétrico a propósito: que RepDB añada calificativos ("con Barra") no
    invalida el match, pero que le falten palabras de Areté sí lo debilita.
    """
    if not a_tokens or not b_tokens:
        return 0.0
    inter = a_tokens & b_tokens
    cobertura = len(inter) / len(a_tokens)
    # El castigo NO es uniforme. Con peso plano, "Sentadilla" casaba con
    # "Sentadilla con Banda" (1 palabra sobrante) antes que con "Sentadilla
    # Trasera con Barra" (2), y acababa enseñando una sentadilla con goma.
    # Cambiar el material es un ejercicio distinto; un descriptor no.
    ruido = sum(SOBRANTE.get(t, 0.05) for t in (b_tokens - a_tokens))
    return cobertura - ruido


def _registro(key, variants, conf, best):
    return {
        "clave": key,
        "variantes": sorted(variants),
        "confianza": conf,
        "repdb_es": best["name_es"] if best else None,
        "repdb_en": best["name_en"] if best else None,
        "imagenes": best["images"].get("flat") if best else None,
        "tips_es": (best.get("tips_es") or [])[:2] if best else [],
        "equipo": best.get("equipment") if best else None,
    }


def main():
    print("bajando catálogo RepDB…")
    repdb = json.loads(urllib.request.urlopen(REPDB).read())
    repdb = repdb if isinstance(repdb, list) else repdb["exercises"]
    # se indexa por los DOS idiomas: los planes de kettlebell nombran en inglés
    cat = [(x, tokens(x["name_es"]), tokens(x["name_en"])) for x in repdb]

    plan = load_plan_exercises()
    out = []
    por_en = {x["name_en"]: x for x in repdb}
    for key, variants in sorted(plan.items()):
        kt = tokens(key)

        # los básicos se fijan a mano; el resto se puntúa
        firma = " ".join(sorted(tokens(key)))
        if firma in BLOQUEADOS:
            out.append(_registro(key, variants, "ninguno", None))
            continue

        fijo = OVERRIDES.get(firma)
        if fijo and fijo in por_en:
            x = por_en[fijo]
            out.append(_registro(key, variants, "exacto", x))
            continue

        best, best_s = None, -9
        for x, es_t, en_t in cat:
            s = max(score(kt, es_t), score(kt, en_t))
            if s > best_s:
                best, best_s = x, s

        if best and (canon(best["name_es"]) == key or canon(best["name_en"]) == key):
            conf = "exacto"
        elif best_s >= 0.95:
            conf = "alto"
        elif best_s >= 0.55:
            conf = "medio"
        else:
            # último recurso: buscar solo el movimiento base ("dominada" para
            # "Dominada Prono"). No es el ejercicio exacto pero sí la misma
            # familia; se marca aparte para que se revise a mano.
            #
            # Se prueban TODOS los tokens y gana el que mejor puntúe: la clave
            # va ordenada alfabéticamente, así que coger el primero elegía
            # "mano" en "Swing 1 Mano" y "estandar" en "Flexiones estándar".
            # se recorren en el orden del nombre original, no del conjunto:
            # el sustantivo principal va primero ("Burpee con flexión" es un
            # burpee, no una flexión), así que se le da ventaja por posición
            ordenados = [t for t in canon(variants[0]).split()
                         if t in kt and len(t) > 3 and t not in MODIFICADORES]
            b2, b2_s = None, -9
            for pos, base in enumerate(ordenados):
                ventaja = 0.12 if pos == 0 else 0.0
                for x, es_t, en_t in cat:
                    s = max(score({base}, es_t), score({base}, en_t)) + ventaja
                    if s > b2_s:
                        b2, b2_s = x, s
            if b2 and b2_s >= 0.55:
                best, conf = b2, "base"
            else:
                best, conf = None, "ninguno"

        out.append(_registro(key, variants, conf, best))

    Path(".eval").mkdir(exist_ok=True)
    Path(".eval/match.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1))

    from collections import Counter
    c = Counter(o["confianza"] for o in out)
    print(f"\n{len(out)} movimientos de Areté")
    for k in ("exacto", "alto", "medio", "base", "ninguno"):
        print(f"  {k:8} {c[k]:3}")
    cubierto = len(out) - c["ninguno"]
    print(f"\ncon imagen: {cubierto}/{len(out)}  ({100*cubierto//len(out)}%)")
    print("→ .eval/match.json")


if __name__ == "__main__":
    main()

"""
Lo que en el chat se le prometió al cliente además de 1 kit normal (collar
extra, regalo, mazo u oráculo, 2 kits…). El que empaca solo se guía del PDF:
si una promesa no llega a `empaque`, no se manda y el cliente se siente
engañado.

Lo usan preparar.py (encabezado "📦 PROMETIDO" en cada chat, para que la
Routine no lo pase por alto) y enviar.py (red de seguridad: si un pedido
tiene una promesa en el chat que no está en su `empaque`, la agrega con ⚠️).

Lee TODOS los mensajes, también los automáticos (toque del día 7, seguimiento
programado, envío masivo): el collar de regalo del día 7 sale como plantilla
automática y antes se descartaba. Solo se salta la bienvenida, cuyo "collar
amuleto de regalo" es el que ya trae todo kit.
"""
import datetime as dt, json, os, re, sys, urllib.error, urllib.request

API_CHATS = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/chats"

# La bienvenida describe el kit normal (ya trae collar de regalo): no es promesa.
RE_BIENVENIDA = re.compile(r"bienvenida", re.I)

# Frases de "algo más que 1 kit normal". Ojo: "trae tapete y collar amuleto de
# regalo" (el kit normal) y "envío gratis" no cuentan.
RE_PROMESA = re.compile(
    r"collar\w*\s+(amuleto\s+)?(extra|adicional|m[aá]s|de\s+yapa)"
    r"|\b(otro|un\s+segundo|segundo|dos|2|3|tres)\s+collar"
    r"|\b(le|les|te|se\s+lo|se\s+la|se\s+los)\s+(regal|obsequi|agreg|inclu|sum|mand|envi|pon|guard)\w*\s+(un|una|el|la|su|sus|los|las)?\s*"
    r"(collar|mazo|or[aá]culo|carta|regalo|amuleto|pulsera|bolsita|cristal|piedra|vela|incienso|sahumerio)"
    r"|\bregalo\s+(extra|adicional)|\bde\s+yapa\b|\byapit"
    r"|\bmazo\s+(extra|adicional|de\s+regalo)|\bor[aá]culo\b"
    r"|\b(dos|2|tres|3)\s+kits?\b"
    r"|\bgratis\b",
    re.I,
)
RE_ENVIO_GRATIS = re.compile(r"env[ií]os?\s+(es\s+)?gratis|gratis\s+a\s+todo", re.I)

# Para saber si el `empaque` ya cubre la promesa.
COSAS = ["collar", "mazo", "oráculo", "oraculo", "carta", "pulsera", "bolsita", "tapete", "cristal",
         "piedra", "vela", "incienso", "sahumerio", "amuleto"]
RE_VARIOS_KITS = re.compile(r"\b(dos|2|tres|3)\s+kits?\b", re.I)


def nueve(wa):
    """Los 9 dígitos del celular (sin 51), para cruzar pedidos y chats."""
    d = re.sub(r"\D", "", str(wa or ""))
    return d[-9:]


def es_promesa(texto):
    t = re.sub(r"\s+", " ", str(texto or ""))
    if not RE_PROMESA.search(t):
        return False
    # Solo "gratis" por el envío gratis no es promesa de producto.
    sin_envio = RE_ENVIO_GRATIS.sub("", t)
    return bool(RE_PROMESA.search(sin_envio))


def de_filas(filas):
    """{9 dígitos: ["MM-DD HH:MM V(quién)/C: texto", …]} con todo lo que suena a promesa."""
    out = {}
    for f in filas:
        if f.get("quien") != "Cliente" and RE_BIENVENIDA.search(f.get("vend") or ""):
            continue
        msg = re.sub(r"\s+", " ", str(f.get("msg") or "")).strip()
        if not es_promesa(msg):
            continue
        quien = "C" if f.get("quien") == "Cliente" else f"V({f.get('vend') or '?'})"
        linea = f"{str(f.get('t', ''))[5:16]} {quien}: {msg[:400]}"
        lista = out.setdefault(nueve(f.get("wa")), [])
        if linea not in lista:
            lista.append(linea)
    return out


def _get(url, clave):
    req = urllib.request.Request(url, headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def traer(clave, dias=21, activos_horas=0):
    """Promesas de los últimos `dias` días (no solo la ventana que se lee): el
    collar del día 7 o el del referido pudo prometerse hace semanas."""
    if not clave:
        return {}
    extra = f"&activos_horas={activos_horas}" if activos_horas else ""
    try:
        r = _get(f"{API_CHATS}?dias=1&promesas_dias={dias}&solo_promesas=1{extra}", clave)
        if "promesas" in r:
            return de_filas(r["promesas"])
        # Worker sin desplegar todavía: se leen 14 días completos (su tope).
        return de_filas(_get(f"{API_CHATS}?dias=14{extra}", clave)["filas"])
    except (urllib.error.URLError, KeyError, ValueError) as err:
        print(f"⚠️ No se pudieron leer las promesas de los chats: {err}", file=sys.stderr, flush=True)
        return {}


def falta_en_empaque(promesas, empaque):
    """Las promesas cuyo objeto (collar, mazo, kit…) no aparece en `empaque`."""
    emp = str(empaque or "").lower()
    faltan = []
    for p in promesas:
        texto = p.split(": ", 1)[-1].lower()
        cosas = [c for c in COSAS if c in texto]
        if RE_VARIOS_KITS.search(texto):
            cosas.append("kits")
        cosas = cosas or ["regalo"]
        if not any(c in emp or (c == "kits" and re.search(r"\b([2-9]|dos|tres)\s*kits\b", emp)) for c in cosas):
            faltan.append(p)
    return faltan

"""
Prepara la lectura nocturna del asesor (Routine de Claude Code).

Toma el .xlsx de la hoja de chats (TAROT CHATS - VENTAS CRM), se queda con las
pestañas diarias de los últimos --dias días y escribe transcripciones cortas
por cliente, en archivos de ~60 000 caracteres para leerlos de a uno:

    python3 scripts/asesor/preparar.py chats.xlsx --dias 3 --salida /tmp/asesor
    ASESOR_CLAVE=... python3 scripts/asesor/preparar.py api --dias 3 --salida /tmp/asesor

Con "api" en lugar del .xlsx lee directo de la base del CRM (sin la hoja ni
Drive, y sin los 10 minutos de retraso del export). --activos-horas N deja
solo los chats que tuvieron algún mensaje en las últimas N horas.

Todo lo que se puede decidir sin leer (qué chats tienen algo, quién escribió
último, si ya salió un recordatorio automático) se decide aquí, para que Claude
gaste su lectura solo en lo que importa.

Se lee TODO: los mensajes automáticos (toque del día 7, seguimiento
programado, envío masivo, pedido web) salen como V(auto: …), porque ahí van
promesas como el collar extra; solo la bienvenida se resume en una línea.
Ningún mensaje del equipo se corta. Cada chat abre con "📦 PROMETIDO" si en
los últimos 21 días se le prometió algo más que 1 kit normal (promesas.py),
aunque haya sido antes de la ventana que se lee.
"""
import argparse, datetime as dt, json, os, re, sys, urllib.error, urllib.request
from collections import OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import promesas as prom

API_CHATS = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/chats"

RE_PESTANA = re.compile(r"^(\d{2})-(\d{2})-(\d{4})$")
RE_AUTO = re.compile(r"autom[aá]tic|masivo|carrito|prueba de bienvenida", re.I)
# El anuncio viejo decía "Hola! Me gustaría…" y el nuevo "¡Hola! Me gustaría…".
RE_SALUDO = re.compile(r"^¡?hola!? me gustar[ií]a m[aá]s informaci[oó]n\.?$", re.I)
# Recordatorios que ya le escribieron al cliente (la bienvenida automática NO cuenta).
RE_RECORDATORIO = re.compile(r"seguimiento autom|toque autom|carrito|masivo", re.I)
RE_BIENVENIDA = re.compile(r"bienvenida", re.I)
# Nada del equipo se corta: una promesa al final de un mensaje largo es la que
# más se pierde. (El Worker ya corta a 2000.)
MAX_CLIENTE, MAX_EQUIPO, MAX_ARCHIVO = 2000, 2000, 60000


def texto_fecha(v):
    return v.strftime("%Y-%m-%d %H:%M:%S") if isinstance(v, dt.datetime) else str(v or "")


def leer_api(desde, hoy, activos_horas=0):
    """Las mismas filas, directo de D1 por el Worker."""
    clave = os.environ.get("ASESOR_CLAVE", "")
    if not clave:
        sys.exit("Falta ASESOR_CLAVE en el entorno.")
    hoy_lima = (dt.datetime.utcnow() - dt.timedelta(hours=5)).date()
    dias = (hoy_lima - desde).days + 1  # el Worker cuenta los días hacia atrás desde hoy (Lima)
    url = f"{API_CHATS}?dias={max(dias, 1)}" + (f"&activos_horas={activos_horas}" if activos_horas else "")
    # Cloudflare corta (error 1010) el User-Agent por defecto de Python.
    req = urllib.request.Request(url, headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            filas = json.load(r)["filas"]
    except urllib.error.HTTPError as err:
        sys.exit(f"El Worker rechazó la consulta ({err.code}): {err.read().decode()[:300]}")
    return [f for f in filas if desde <= dt.date.fromisoformat(f["t"][:10]) <= hoy]


def leer_filas(xlsx, desde, hoy, activos_horas=0):
    """Filas de las pestañas diarias entre desde y hoy (inclusive), ordenadas por fecha."""
    if xlsx == "api":
        return leer_api(desde, hoy, activos_horas)
    try:
        import openpyxl
    except ImportError:
        sys.exit("Falta openpyxl: pip install openpyxl")
    wb = openpyxl.load_workbook(xlsx, read_only=True)
    filas = []
    for ws in wb.worksheets:
        m = RE_PESTANA.match(ws.title)
        if not m or not (desde <= dt.date(int(m[3]), int(m[2]), int(m[1])) <= hoy):
            continue
        for r in ws.iter_rows(values_only=True):
            r = list(r or []) + [None] * 14
            if r[0] in (None, "Fecha (Lima)"):
                continue
            filas.append({
                "t": texto_fecha(r[0]), "wa": re.sub(r"\D", "", str(r[1]).replace(".0", "")),
                "nombre": str(r[2] or ""), "quien": str(r[3] or ""), "vend": str(r[4] or ""),
                "tipo": str(r[5] or "text"), "msg": "" if r[6] is None else str(r[6]),
                "anuncio": str(r[8] or ""), "asesora": str(r[11] or ""), "embudo": str(r[13] or ""),
            })
    filas.sort(key=lambda f: f["t"])
    return filas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx", help='el .xlsx de la hoja de chats, o "api" para leer directo de la base')
    ap.add_argument("--dias", type=int, default=3)
    ap.add_argument("--hoy", default=(dt.datetime.utcnow() - dt.timedelta(hours=5)).strftime("%Y-%m-%d"))
    ap.add_argument("--salida", default="/tmp/asesor")
    ap.add_argument("--activos-horas", type=int, default=0)
    a = ap.parse_args()

    hoy = dt.date.fromisoformat(a.hoy)
    desde = hoy - dt.timedelta(days=a.dias - 1)
    filas = leer_filas(a.xlsx, desde, hoy, a.activos_horas)
    # Promesas de 21 días (el collar del día 7 suele estar fuera de la ventana).
    promesas = prom.de_filas(filas)
    if a.xlsx == "api":
        for k, v in prom.traer(os.environ.get("ASESOR_CLAVE", ""), 21, a.activos_horas).items():
            promesas[k] = v + [x for x in promesas.get(k, []) if x not in v]

    chats = OrderedDict()
    for f in filas:
        chats.setdefault(f["wa"], []).append(f)

    elegidos, meta = [], {}
    for wa, ms in chats.items():
        cli = [m for m in ms if m["quien"] == "Cliente"]
        humano = any(m["quien"] != "Cliente" and not RE_AUTO.search(m["vend"]) for m in ms)
        if not cli or (all(RE_SALUDO.match(m["msg"].strip()) for m in cli) and not humano):
            continue
        ult_cli = max(i for i, m in enumerate(ms) if m["quien"] == "Cliente")
        despues = ms[ult_cli + 1:]
        nombre = next((m["nombre"] for m in reversed(ms) if m["nombre"] not in ("", ".")), "")
        meta[wa] = {
            "nombre": nombre,
            "ultimo": "cliente" if ms[-1]["quien"] == "Cliente" else "equipo",
            "ultimo_cliente": ms[ult_cli]["t"],
            "recordatorio_auto_despues": any(RE_RECORDATORIO.search(m["vend"]) for m in despues),
            "asesora": next((m["asesora"] for m in reversed(ms) if m["asesora"]), ""),
            "embudo": next((m["embudo"] for m in reversed(ms) if m["embudo"]), ""),
            "promesas": promesas.get(prom.nueve(wa), []),
        }
        lineas, anterior, bienvenida = [], "", False
        for m in ms:
            es_cli = m["quien"] == "Cliente"
            auto = not es_cli and RE_AUTO.search(m["vend"])
            if auto and RE_BIENVENIDA.search(m["vend"]):
                if not bienvenida:
                    lineas.append(f"{m['t'][5:16]} V(auto: {m['vend']}): [bienvenida automática: kit normal, ya trae collar]")
                bienvenida = True
                continue
            cuerpo = re.sub(r"\s+", " ", m["msg"]).strip() or f"[{m['tipo']}]"
            if es_cli and m["tipo"] == "image" and m["msg"]:
                cuerpo = "[imagen] " + cuerpo
            cuerpo = cuerpo[: MAX_CLIENTE if es_cli else MAX_EQUIPO]
            quien = "C" if es_cli else f"V(auto: {m['vend']})" if auto else f"V({m['vend'] or '?'})"
            linea = f"{m['t'][5:16]} {quien}: {cuerpo}"
            if linea != anterior:
                lineas.append(linea)
            anterior = linea
        extra = " | ya salió recordatorio automático" if meta[wa]["recordatorio_auto_despues"] else ""
        aviso = ""
        if meta[wa]["promesas"]:
            aviso = ("📦 PROMETIDO (va en `empaque` si compra o ya compró; el que empaca no lo ve si no):\n"
                     + "\n".join(f"   📦 {p}" for p in meta[wa]["promesas"]) + "\n")
        elegidos.append(f"=== {wa} | {nombre or 'sin nombre'} | último: {meta[wa]['ultimo']}{extra}\n{aviso}" + "\n".join(lineas))

    os.makedirs(a.salida, exist_ok=True)
    for f in os.listdir(a.salida):
        if f.startswith("chats_"):
            os.remove(os.path.join(a.salida, f))
    partes, actual = [], ""
    for t in elegidos:
        if actual and len(actual) + len(t) > MAX_ARCHIVO:
            partes.append(actual)
            actual = ""
        actual += t + "\n\n"
    if actual:
        partes.append(actual)
    for i, p in enumerate(partes, 1):
        with open(os.path.join(a.salida, f"chats_{i:02d}.txt"), "w") as fh:
            fh.write(p)
    with open(os.path.join(a.salida, "meta.json"), "w") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=1)

    print(json.dumps({
        "desde": desde.isoformat(), "hasta": hoy.isoformat(), "mensajes": len(filas),
        "numeros": len(chats), "chats_a_leer": len(elegidos),
        "archivos": [f"chats_{i:02d}.txt" for i in range(1, len(partes) + 1)],
        "sin_respuesta": sum(1 for v in meta.values() if v["ultimo"] == "cliente"),
        "con_promesas": [wa for wa, v in meta.items() if v["promesas"]],
    }, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

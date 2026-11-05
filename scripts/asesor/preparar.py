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

Posibles ventas (dueño, 2026-11-04): con "api", los chats que el reporte «Pedidos
y ventas» dejó en POR VERIFICAR o INTENCIÓN (fechas de despacho de ayer, hoy y
mañana) y que no quedaron confirmados se leen SIEMPRE, aunque no tengan
movimiento en las últimas --activos-horas, van primero y abren con
"⭐ POSIBLE VENTA": el asesor les propone su seguimiento en ✨ Sugerencias.
"""
import argparse, datetime as dt, json, os, re, sys, urllib.error, urllib.parse, urllib.request
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


POSIBLES = ("POR_CONFIRMAR", "INTENCION")


def posibles_ventas(hoy):
    """{9 dígitos: "ESTADO · nota"} de lo que el reporte dejó como posible venta y nadie confirmó todavía."""
    clave = os.environ.get("ASESOR_CLAVE", "")
    try:
        import pedidos_estado as pe
    except Exception as err:
        print(f"Posibles ventas: no se pudo cargar pedidos_estado ({err})", file=sys.stderr)
        return {}
    posibles, confirmados = {}, set()
    for d in (hoy - dt.timedelta(days=1), hoy, hoy + dt.timedelta(days=1)):
        try:
            estado = pe.traer(clave, d.isoformat()) or {}
        except Exception as err:
            print(f"Posibles ventas {d}: {err}", file=sys.stderr)
            continue
        for ped in estado.get("pedidos", []):
            n = prom.nueve(ped.get("whatsapp") or "")
            if not n:
                continue
            est = str(ped.get("estado") or "").upper()
            if est in POSIBLES:
                posibles[n] = f"{'POR VERIFICAR' if est == 'POR_CONFIRMAR' else 'INTENCIÓN'} · {str(ped.get('nota') or '').strip()}".strip(" ·")
            elif est in ("CONFIRMADO", "OTRO_DIA"):
                confirmados.add(n)
    return {n: v for n, v in posibles.items() if n not in confirmados}


# Señales de venta en la ventana leída: con --completo, a estos chats se les trae el historial anterior entero (el precio
# acordado hace una semana, el collar prometido en otro día, el pedido de catálogo de antes) para que el reporte no se
# quede con la foto de dos días (dueño, 2026-11-05: Miller a S/69 y collares extra que el reporte no vio).
RE_SENAL_VENTA = re.compile(
    r"\b(yape|yapeo|yapeé|yape[eé]|plin|adelanto|captura|pag[oóu]|abon|dep[oó]sit|direcci[oó]n|distrito|referencia|agencia|shalom|olva|dni|pin\b|ubicaci[oó]n"
    r"|separ|agend|confirm|collar|dije|mazo|or[aá]culo|2 kits|dos kits|regal|descuento|oferta|s/\s*\d|\d{2,3}\s*soles|pedido|catálogo|catalogo)",
    re.I,
)
RE_COMPRA_CRM = re.compile(r"\bpurchase\b|cobro_3x|bot_boleta", re.I)


def historial_completo(wa, n, desde):
    """Los mensajes del chat ANTERIORES a `desde` (hasta n en total), en el mismo formato de línea que la ventana leída."""
    clave = os.environ.get("ASESOR_CLAVE", "")
    url = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/chat?" + urllib.parse.urlencode({"wa_id": wa, "mensajes": n, "largo": 1})
    req = urllib.request.Request(url, headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            chat = json.load(r)
    except Exception:  # noqa: BLE001
        return []
    lineas = []
    for m in chat.get("mensajes") or []:
        t = str(m.get("created_at") or "")
        try:
            fecha_lima = dt.datetime.fromisoformat(t.replace(" ", "T")) - dt.timedelta(hours=5)
        except ValueError:
            continue
        if fecha_lima.date() >= desde:
            continue  # ya está en la ventana leída
        es_cli = m.get("direction") == "in"
        cuerpo = re.sub(r"\s+", " ", str(m.get("body") or "")).strip() or f"[{m.get('type') or 'mensaje'}]"
        if es_cli and m.get("type") == "image":
            cuerpo = f"[imagen#{m.get('id')}] " + (cuerpo if m.get("body") else "")
        quien = "C" if es_cli else (f"V(auto: {m.get('sent_by')})" if RE_AUTO.search(m.get("sent_by") or "") else f"V({m.get('sent_by') or '?'})")
        if not es_cli and RE_BIENVENIDA.search(m.get("sent_by") or ""):
            continue
        lineas.append(f"{fecha_lima.strftime('%m-%d %H:%M')} {quien}: {cuerpo[:1200]}")
    return lineas


def texto_fecha(v):
    return v.strftime("%Y-%m-%d %H:%M:%S") if isinstance(v, dt.datetime) else str(v or "")


def leer_api(desde, hoy, activos_horas=0, linea=0):
    """Las mismas filas, directo de D1 por el Worker."""
    clave = os.environ.get("ASESOR_CLAVE", "")
    if not clave:
        sys.exit("Falta ASESOR_CLAVE en el entorno.")
    hoy_lima = (dt.datetime.utcnow() - dt.timedelta(hours=5)).date()
    dias = (hoy_lima - desde).days + 1  # el Worker cuenta los días hacia atrás desde hoy (Lima)
    url = f"{API_CHATS}?dias={max(dias, 1)}" + (f"&activos_horas={activos_horas}" if activos_horas else "") + (f"&linea={linea}" if linea else "")
    # Cloudflare corta (error 1010) el User-Agent por defecto de Python.
    req = urllib.request.Request(url, headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            filas = json.load(r)["filas"]
    except urllib.error.HTTPError as err:
        sys.exit(f"El Worker rechazó la consulta ({err.code}): {err.read().decode()[:300]}")
    return [f for f in filas if desde <= dt.date.fromisoformat(f["t"][:10]) <= hoy]


def leer_filas(xlsx, desde, hoy, activos_horas=0, linea=0):
    """Filas de las pestañas diarias entre desde y hoy (inclusive), ordenadas por fecha."""
    if xlsx == "api":
        return leer_api(desde, hoy, activos_horas, linea)
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
    ap.add_argument("--linea", type=int, default=0, help="otro número de WhatsApp (id de la línea); por defecto Tarot Store")
    ap.add_argument("--con-reporte", action="store_true", help="compatibilidad: con «api» las posibles ventas del reporte se leen siempre (desde el 2026-11-04)")
    ap.add_argument("--completo", type=int, default=0, help="N > 0: a los chats con señal de venta (pago, dirección, agencia, DNI, collar, imagen del cliente, compra en el CRM) se les suma el historial anterior completo, hasta N mensajes (reporte de pedidos, dueño 2026-11-05)")
    a = ap.parse_args()

    hoy = dt.date.fromisoformat(a.hoy)
    desde = hoy - dt.timedelta(days=a.dias - 1)
    filas = leer_filas(a.xlsx, desde, hoy, a.activos_horas, a.linea)
    posibles = posibles_ventas(hoy) if a.xlsx == "api" else {}
    if posibles and a.activos_horas:
        # Las posibles ventas se leen aunque no hayan tenido movimiento en las últimas N horas.
        ya = {f["wa"] for f in filas}
        filas += [f for f in leer_api(desde, hoy, 0, a.linea) if f["wa"] not in ya and prom.nueve(f["wa"]) in posibles]
        filas.sort(key=lambda f: f["t"])
    # Promesas de 21 días (el collar del día 7 suele estar fuera de la ventana).
    promesas = prom.de_filas(filas)
    if a.xlsx == "api":
        for k, v in prom.traer(os.environ.get("ASESOR_CLAVE", ""), 21, a.activos_horas).items():
            promesas[k] = v + [x for x in promesas.get(k, []) if x not in v]

    chats = OrderedDict()
    for f in filas:
        chats.setdefault(f["wa"], []).append(f)

    elegidos, primeros, meta = [], [], {}
    for wa, ms in chats.items():
        cli = [m for m in ms if m["quien"] == "Cliente"]
        humano = any(m["quien"] != "Cliente" and not RE_AUTO.search(m["vend"]) for m in ms)
        posible = posibles.get(prom.nueve(wa))
        if not cli or (all(RE_SALUDO.match(m["msg"].strip()) for m in cli) and not humano and not posible):
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
            "posible_venta": posible or "",
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
            if es_cli and m["tipo"] == "image":
                # [imagen#id]: imagenes.py la baja para mirarla (capturas de pago, DNI, ubicación).
                cuerpo = (f"[imagen#{m['id']}] " if m.get("id") else "[imagen] ") + (cuerpo if m["msg"] else "").strip()
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
        if posible:
            aviso = (f"⭐ POSIBLE VENTA en el reporte de ventas ({posible}): proponle su seguimiento en `mensajes` "
                     "(qué lo frena en `objecion`; plantilla si su ventana de 24 h ya cerró)\n") + aviso
        # --completo: historial anterior entero para los chats con señal de venta (o ya marcados como compra en el CRM).
        if a.completo and a.xlsx == "api" and (any(RE_SENAL_VENTA.search(m["msg"]) or (m["quien"] == "Cliente" and m["tipo"] == "image") for m in ms)
                                               or RE_COMPRA_CRM.search(meta[wa]["embudo"] or "") or posible):
            previas = historial_completo(wa, a.completo, desde)
            if previas:
                lineas = ([f"📜 HISTORIAL ANTERIOR ({len(previas)} mensajes de antes del {desde.isoformat()}; léelo entero: el precio acordado, "
                           "el producto elegido, el collar o regalo prometido y los pedidos de catálogo de otros días cuentan igual)"]
                          + previas + ["— desde aquí, la ventana de estos días —"] + lineas)
                meta[wa]["historial_previo"] = len(previas)
        (primeros if posible else elegidos).append(f"=== {wa} | {nombre or 'sin nombre'} | último: {meta[wa]['ultimo']}{extra}\n{aviso}" + "\n".join(lineas))
    elegidos = primeros + elegidos

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
        "posibles_ventas": [wa for wa, v in meta.items() if v["posible_venta"]],
    }, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

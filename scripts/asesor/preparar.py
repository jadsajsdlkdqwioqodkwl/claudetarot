"""
Prepara la lectura nocturna del asesor (Routine de Claude Code).

Toma el .xlsx de la hoja de chats (TAROT CHATS - VENTAS CRM), se queda con las
pestañas diarias de los últimos --dias días y escribe transcripciones cortas
por cliente, en archivos de ~60 000 caracteres para leerlos de a uno:

    python3 scripts/asesor/preparar.py chats.xlsx --dias 3 --salida /tmp/asesor

Todo lo que se puede decidir sin leer (qué chats tienen algo, quién escribió
último, si ya salió un recordatorio automático) se decide aquí, para que Claude
gaste su lectura solo en lo que importa.
"""
import argparse, datetime as dt, json, os, re, sys
from collections import OrderedDict

try:
    import openpyxl
except ImportError:
    sys.exit("Falta openpyxl: pip install openpyxl")

RE_PESTANA = re.compile(r"^(\d{2})-(\d{2})-(\d{4})$")
RE_AUTO = re.compile(r"autom[aá]tic|masivo|carrito|prueba de bienvenida", re.I)
RE_SALUDO = re.compile(r"^hola! me gustar[ií]a m[aá]s informaci[oó]n\.?$", re.I)
MAX_CLIENTE, MAX_EQUIPO, MAX_ARCHIVO = 400, 160, 60000


def texto_fecha(v):
    return v.strftime("%Y-%m-%d %H:%M:%S") if isinstance(v, dt.datetime) else str(v or "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("--dias", type=int, default=3)
    ap.add_argument("--hoy", default=(dt.datetime.utcnow() - dt.timedelta(hours=5)).strftime("%Y-%m-%d"))
    ap.add_argument("--salida", default="/tmp/asesor")
    a = ap.parse_args()

    hoy = dt.date.fromisoformat(a.hoy)
    desde = hoy - dt.timedelta(days=a.dias - 1)
    wb = openpyxl.load_workbook(a.xlsx, read_only=True)
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
                "asesora": str(r[11] or ""), "embudo": str(r[13] or ""),
            })
    filas.sort(key=lambda f: f["t"])

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
            "recordatorio_auto_despues": any(RE_AUTO.search(m["vend"]) for m in despues),
            "asesora": next((m["asesora"] for m in reversed(ms) if m["asesora"]), ""),
            "embudo": next((m["embudo"] for m in reversed(ms) if m["embudo"]), ""),
        }
        lineas, anterior = [], ""
        for m in ms:
            es_cli = m["quien"] == "Cliente"
            if not es_cli and RE_AUTO.search(m["vend"]):
                continue
            cuerpo = re.sub(r"\s+", " ", m["msg"]).strip() or f"[{m['tipo']}]"
            if es_cli and m["tipo"] == "image" and m["msg"]:
                cuerpo = "[imagen] " + cuerpo
            cuerpo = cuerpo[: MAX_CLIENTE if es_cli else MAX_EQUIPO]
            linea = f"{m['t'][5:16]} {'C' if es_cli else 'V(' + (m['vend'] or '?') + ')'}: {cuerpo}"
            if linea != anterior:
                lineas.append(linea)
            anterior = linea
        extra = " | ya salió recordatorio automático" if meta[wa]["recordatorio_auto_despues"] else ""
        elegidos.append(f"=== {wa} | {nombre or 'sin nombre'} | último: {meta[wa]['ultimo']}{extra}\n" + "\n".join(lineas))

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
    }, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

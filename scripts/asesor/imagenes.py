"""
Baja las imágenes que mandó el cliente (capturas de Yape/Plin, DNI, ubicación…) para MIRARLAS con Read.
preparar.py marca cada una en los chats como `[imagen#<id>]`.

    ASESOR_CLAVE=... python3 scripts/asesor/imagenes.py /tmp/ventas --max 20
        -> /tmp/ventas/img/<whatsapp>_<id>.<ext> e /tmp/ventas/imagenes.md (cuál es de quién, a qué hora y qué
           le había pedido el equipo justo antes). Prioriza las que siguen a un pedido de captura/pago.
"""
import glob, json, os, re, sys, urllib.error, urllib.request

API = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/imagen"
RE_PEDIDO = re.compile(r"captura|yape|plin|adelanto|comprobante|voucher|dep[oó]sito|datos para el env", re.I)
RE_LINEA = re.compile(r"^(\d\d-\d\d \d\d:\d\d) (C|V\([^)]*\)): (.*)$")
RE_IMG = re.compile(r"\[imagen#(\d+)\]")
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def candidatas(carpeta):
    """[(prioridad, wa, id, hora, lo_ultimo_que_dijo_el_equipo)] de todos los chats_*.txt."""
    out = []
    for f in sorted(glob.glob(os.path.join(carpeta, "chats_*.txt"))):
        wa, previo, previo_pedido = None, "", False
        for linea in open(f, encoding="utf-8"):
            linea = linea.rstrip("\n")
            if linea.startswith("=== "):
                wa, previo, previo_pedido = linea[4:].split(" | ")[0].strip(), "", False
                continue
            m = RE_LINEA.match(linea)
            if not m or not wa:
                continue
            hora, quien, cuerpo = m.groups()
            if quien.startswith("V(") and not quien.startswith("V(auto"):
                previo, previo_pedido = cuerpo[:140], bool(RE_PEDIDO.search(cuerpo))
            for i in RE_IMG.findall(cuerpo) if quien == "C" else []:
                out.append((0 if previo_pedido else 1, wa, int(i), hora, previo))
    return sorted(out, key=lambda x: (x[0], x[3]))


def bajar(clave, id_):
    req = urllib.request.Request(f"{API}?id={id_}", headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read(), r.headers.get("Content-Type", "image/jpeg").split(";")[0]


def main():
    a = sys.argv[1:]
    carpeta = a[0] if a else "/tmp/ventas"
    tope = int(a[a.index("--max") + 1]) if "--max" in a else 20
    clave = os.environ.get("ASESOR_CLAVE") or sys.exit("Falta ASESOR_CLAVE en el entorno.")
    cands = candidatas(carpeta)
    os.makedirs(os.path.join(carpeta, "img"), exist_ok=True)
    lineas, ok, fallo = [], 0, 0
    for prio, wa, id_, hora, previo in cands[:tope]:
        try:
            datos, mime = bajar(clave, id_)
        except (urllib.error.URLError, OSError) as err:
            fallo += 1
            lineas.append(f"- {wa} {hora} imagen#{id_}: NO SE PUDO BAJAR ({err})")
            continue
        ruta = os.path.join(carpeta, "img", f"{wa}_{id_}.{EXT.get(mime, 'jpg')}")
        open(ruta, "wb").write(datos)
        ok += 1
        lineas.append(f"- {ruta} · {hora} · " + ("SIGUE A UN PEDIDO DE CAPTURA/PAGO" if prio == 0 else "imagen suelta") + f" · el equipo había dicho: «{previo}»")
    resto = len(cands) - min(len(cands), tope)
    open(os.path.join(carpeta, "imagenes.md"), "w", encoding="utf-8").write(
        "# Imágenes del cliente para mirar con Read (monto, fecha y nombre de las capturas; DNI y ubicación)\n\n" + "\n".join(lineas)
        + (f"\n\n(+{resto} imágenes más sin bajar: sube --max si hace falta)" if resto else "") + "\n")
    print(json.dumps({"bajadas": ok, "fallidas": fallo, "sin_bajar": resto, "indice": os.path.join(carpeta, "imagenes.md")}, ensure_ascii=False))


if __name__ == "__main__":
    main()

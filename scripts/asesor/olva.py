"""
Agencias de Olva Courier (dueño, 2026-11-10): la «Olva de destino» de la etiqueta tiene que ser una de las que salen en
https://www.olvacourier.com/ubicanos/ y calzar con lo que escribió el cliente.

    python3 scripts/asesor/olva.py buscar "Jr. Amazonas 730, Puerto Maldonado"   -> candidatas con puntaje
    python3 scripts/asesor/olva.py actualizar                                    -> baja la lista de la web a data/olva-agencias.json

Datos: data/olva-agencias.json (432 tiendas y agentes; la web los carga de admin-ajax.php?action=get_olva_stores).
Mismo criterio que shalom.buscar: cada palabra del cliente puntúa UNA vez por el nivel más profundo que calza (distrito 5 >
provincia 3 > departamento 2), una palabra propia del nombre de la agencia suma 6 y de su dirección 2; si el cliente nombró un
lugar conocido, las agencias de otro lugar pierden 8 por lugar. «Segura» = puntúa algo propio y saca 3 al siguiente, o es la única
agencia del distrito nombrado. Sin API de Claude; sin inventar agencias.
"""
import datetime as dt, json, os, re, sys, unicodedata, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
DATOS = os.path.join(AQUI, "..", "..", "data", "olva-agencias.json")
URL = "https://www.olvacourier.com/wp-admin/admin-ajax.php?action=get_olva_stores"
GENERICO = {"de", "del", "la", "el", "los", "las", "y", "en", "a", "al", "por", "con", "olva", "agencia", "oficina", "tienda", "agente", "courier",
            "nro", "n", "jr", "av", "avenida", "calle", "jiron", "mz", "lt", "urb", "sn", "s", "pj", "psje", "pasaje", "int", "cdra", "cuadra", "peru"}


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]+", " ", s)


def palabras(s):
    return [w for w in norm(s).split() if w and w not in GENERICO and not w.isdigit()]


_cache = None


def cargar():
    global _cache
    if _cache is None:
        _cache = json.load(open(DATOS, encoding="utf-8"))
    return _cache


def actualizar():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (tarot-asesor etiquetas)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        src = json.load(r)
    data = (src.get("data") or {}).get("data") or []
    out = [{"id": x.get("office_id"), "nombre": re.sub(r"\s+", " ", str(x.get("nombres") or "")).strip(), "tipo": x.get("tipo"), "office_type": x.get("office_type"),
            "departamento": x.get("department"), "provincia": x.get("province"), "distrito": x.get("district"), "ubigeo": x.get("ubigeo"),
            "direccion": re.sub(r"\s+", " ", str(x.get("direccion") or "")).strip(), "lat": x.get("lat"), "lng": x.get("lng"), "sede": x.get("headquarter_code")}
           for x in data if x.get("nombres")]
    json.dump({"fuente": "https://www.olvacourier.com/ubicanos/ (admin-ajax.php?action=get_olva_stores)", "bajado": dt.date.today().isoformat(), "agencias": out},
              open(DATOS, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    _cache = None
    return len(out)


def buscar(texto, n=5):
    """Candidatas [{puntos, seguro, ...agencia}] para lo que escribió el cliente («Olva Jr. Amazonas 730, Puerto Maldonado»)."""
    q = palabras(texto)
    if not q:
        return []
    agencias = cargar()["agencias"]
    geo_conocidas = {c for a in agencias for seg in (a.get("departamento"), a.get("provincia"), a.get("distrito")) for c in palabras(seg)}
    lugares = [w for w in q if len(w) > 3 and w in geo_conocidas]
    res = []
    vistas = set()  # Olva repite la misma tienda con dos nombres («PUERTO MALDONADO» y «TIENDA PUERTO MALDONADO», misma dirección)
    for a in agencias:
        llave = (norm(a.get("distrito")), " ".join(norm(a.get("direccion")).split()[:5]))
        if llave in vistas:
            continue
        vistas.add(llave)
        niveles = [palabras(a.get("departamento")), palabras(a.get("provincia")), palabras(a.get("distrito"))]
        geo = {c for seg in niveles for c in seg}
        nom = [w for w in palabras(a.get("nombre")) if w not in geo]
        dire = palabras(a.get("direccion"))
        p = 0; especifico = False
        for w in q:
            parecido = lambda c: w == c or (len(w) > 4 and (c.startswith(w) or w.startswith(c)))
            pesos = (2, 3, 5)
            ok = [pesos[i] for i, seg in enumerate(niveles) if any(parecido(c) for c in seg)]
            p += max(ok) if ok else 0
            propia = not any(parecido(c) for c in geo)
            if propia and any(parecido(c) for c in nom): p += 6; especifico = True
            if propia and w in dire: p += 2; especifico = True
            elif propia and any(len(w) > 4 and d.startswith(w) for d in dire): p += 1; especifico = True
        # El distrito completo nombrado por el cliente («Puerto Maldonado») manda sobre una palabra suelta en otra agencia («Galerías El Puerto»).
        if niveles[2] and all(any(w == c or (len(w) > 4 and (c.startswith(w) or w.startswith(c))) for w in q) for c in niveles[2]):
            p += 4; especifico = True
        if lugares and not any(any(w == c or (len(w) > 4 and (c.startswith(w) or w.startswith(c))) for c in geo) for w in lugares):
            p -= 8 * len(lugares)
        if p > 0:
            res.append((p, especifico, a))
    res.sort(key=lambda x: (-x[0], x[2]["nombre"]))
    if not res:
        return []
    tope, esp, top = res[0]
    segundo = res[1][0] if len(res) > 1 else 0
    unica = sum(1 for a in agencias if (a.get("departamento"), a.get("provincia"), a.get("distrito")) == (top.get("departamento"), top.get("provincia"), top.get("distrito"))) == 1
    return [{"puntos": p, "seguro": p == tope and ((e and tope - segundo >= 3) or (unica and tope >= 5)), **a} for p, e, a in res[:n]]


def destino_de(a):
    """Texto de la etiqueta «Olva de destino»: nombre de la tienda/agente como sale en Ubícanos + distrito/provincia/departamento."""
    if not a:
        return ""
    return f"{a.get('nombre')} ({a.get('distrito')}, {a.get('provincia')}, {a.get('departamento')})"


def main():
    args = sys.argv[1:]
    if args[:1] == ["actualizar"]:
        print(f"{actualizar()} agencias de Olva guardadas en {os.path.relpath(DATOS)}")
    elif args[:1] == ["buscar"] and len(args) > 1:
        for c in buscar(" ".join(args[1:])):
            print(f"{c['puntos']:>3} {'SEGURA' if c['seguro'] else '      '} {c['nombre']} · {c.get('distrito')} / {c.get('provincia')} / {c.get('departamento')} · {c.get('direccion')}")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()

"""
Shalom (provincia): agencias y Excel de envío masivo (dueño, 2026-11-08). Primer paso para registrar los envíos de provincia sin
pegar nada a mano; el registro directo en Shalom Pro queda para después (su panel bloquea a los robots y hace falta un navegador).

    python3 scripts/asesor/shalom.py agencias [--actualizar]
        -> las 566 agencias de Shalom con el código que acepta Shalom Pro («LIMA / LIMA / CHORRILLOS / CHORRILLOS CO»), desde la API
           pública de shalom.com.pe/agencias (data/shalom-agencias.json). --actualizar las vuelve a bajar (si la versión cambió).
    python3 scripts/asesor/shalom.py buscar "<lo que escribió el cliente>"
        -> las agencias que mejor calzan (ciudad, distrito, avenida, nombre), con su código, dirección y horario. Si calzan varias,
           hay que preguntarle al cliente (el reporte lo marca «CONFIRMAR AGENCIA»).
    ASESOR_CLAVE=... python3 scripts/asesor/shalom.py masivo [AAAA-MM-DD] [--salida /tmp/shalom/masivo.xlsx]
        -> el Excel del «Formato Pro Masivo» de Shalom con los pedidos de PROVINCIA confirmados del registro del reporte de esa fecha de
           despacho (DNI, teléfono, agencia de destino, PAQUETE XXS, 1 unidad, origen CHORRILLOS CO). Lo que no calza con una agencia
           sale listado para corregirlo antes de subirlo.
"""
import datetime as dt, json, os, re, shutil, sys, unicodedata, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
DATOS = os.path.join(RAIZ, "data", "shalom-agencias.json")
PLANTILLA = os.path.join(RAIZ, "data", "shalom-masivo-plantilla.xlsx")
API = "https://newwebservices.shalomcontrol.com/api/v1/web/agencias"
ORIGEN = "CHORRILLOS CO"  # de donde salen los envíos (dueño): LIMA / LIMA / CHORRILLOS / CHORRILLOS CO
LIMA = dt.timezone(dt.timedelta(hours=-5))
ABREV = {"av": "avenida", "jr": "jiron", "ca": "calle", "psje": "pasaje", "urb": "urbanizacion", "mz": "manzana", "lt": "lote"}
RUIDO = {"shalom", "agencia", "agencias", "de", "la", "el", "los", "las", "en", "del", "a", "y", "con", "por", "para", "sede", "oficina", "local", "nro", "n", "numero",
         "referencia", "ref", "cerca", "frente", "costado", "al", "lado", "esquina", "cuadra", "altura", "envio", "enviar", "provincia", "por favor", "cdra", "pedido", "mi", "me"}


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def palabras(s):
    out = []
    for w in norm(s).split():
        w = ABREV.get(w, w)
        if len(w) >= 2 and w not in RUIDO:
            out.append(w)
    return out


def cargar():
    return json.load(open(DATOS, encoding="utf-8"))


def _post(ruta, cuerpo=None):
    req = urllib.request.Request(f"{API}/{ruta}", data=json.dumps(cuerpo or {}).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def actualizar():
    version = _post("version").get("data")
    lista = _post("listar").get("data") or []
    agencias = [{"id": a["ter_id"], "codigo": a["nombre"], "departamento": a.get("departamento"), "provincia": a.get("provincia"), "distrito": a.get("zona"),
                 "agencia": a.get("lugar_over") or str(a.get("nombre") or "").split(" / ")[-1], "direccion": a.get("direccion") or "", "horario": a.get("hora_atencion") or "",
                 "lat": a.get("latitud"), "lng": a.get("longitud"), "origen": a.get("origen"), "destino": a.get("destino"), "principal": a.get("ter_principal"), "categoria": a.get("ter_categoria")}
                for a in lista if a.get("nombre")]
    json.dump({"fuente": f"{API}/listar (API pública de shalom.com.pe/agencias)", "version": version, "bajado": dt.datetime.now(LIMA).date().isoformat(), "agencias": agencias},
              open(DATOS, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    return version, len(agencias)


def buscar(texto, n=5):
    """Puntúa cada agencia por palabras del texto del cliente que aparecen en su código (dep/prov/dist/agencia) y su dirección."""
    q = palabras(texto)
    if not q:
        return []
    res = []
    for a in cargar()["agencias"]:
        segmentos = [palabras(x) for x in str(a["codigo"]).split(" / ")]  # departamento, provincia, distrito, agencia
        dire = palabras(a["direccion"]); nom = segmentos[-1] if segmentos else []
        p = 0
        for w in q:
            parecido = lambda c: w == c or (len(w) > 4 and (c.startswith(w) or w.startswith(c)))
            if any(parecido(c) for c in nom): p += 6                                    # el nombre de la agencia pesa más
            p += 3 * sum(1 for seg in segmentos[:-1] if any(parecido(c) for c in seg))  # cada nivel (dep/prov/dist) que calza
            if w in dire: p += 2
            elif any(len(w) > 4 and d.startswith(w) for d in dire): p += 1
        if p:
            res.append((p, a))
    res.sort(key=lambda x: (-x[0], x[1]["codigo"]))
    if not res:
        return []
    tope = res[0][0]
    return [{"puntos": p, "seguro": p == tope and (len(res) == 1 or res[1][0] < tope * 0.7), **a} for p, a in res[:n]]


def cmd_buscar(texto):
    r = buscar(texto)
    if not r:
        print("Ninguna agencia calza con ese texto."); return
    for a in r:
        print(f"{'★' if a['seguro'] else ' '} {a['puntos']:>2} · {a['codigo']} · {a['direccion']} · {a['horario']}")


def pedir_worker(ruta):
    clave = os.environ.get("ASESOR_CLAVE") or sys.exit("Falta ASESOR_CLAVE en el entorno.")
    base = os.environ.get("ASESOR_API_BASE") or "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor"
    req = urllib.request.Request(f"{base}{ruta}", headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def cmd_masivo(args):
    import openpyxl
    fecha = next((a for a in args if len(a) == 10 and a[4] == "-"), None)
    if not fecha:
        t = dt.datetime.now(LIMA); fecha = (t.date() if t.hour < 3 else t.date() + dt.timedelta(days=1)).isoformat()
    salida = args[args.index("--salida") + 1] if "--salida" in args else f"/tmp/shalom/masivo-{fecha}.xlsx"
    estado = pedir_worker(f"/ventas-estado?fecha={fecha}&tipo=pedidos")
    pedidos = [p for p in (estado.get("estado") or {}).get("pedidos", []) if str(p.get("destino", "")).upper() == "PROVINCIA" and str(p.get("estado", "")).upper() == "CONFIRMADO"]
    if not pedidos:
        sys.exit(f"No hay pedidos de provincia confirmados registrados para el despacho del {fecha}.")
    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    shutil.copy(PLANTILLA, salida)
    wb = openpyxl.load_workbook(salida); ws = wb.worksheets[0]
    for r in range(2, ws.max_row + 1):  # limpia el ejemplo de la plantilla (deja las fórmulas de medidas)
        for c in ("A", "B", "C", "D", "E", "F", "G", "H", "M", "N"):
            ws[f"{c}{r}"].value = None
    fila = 2; revisar = []
    for p in pedidos:
        texto = f"{p.get('direccion_o_agencia') or ''} {p.get('courier') or ''}"
        if re.search(r"\bolva\b", norm(texto)):
            revisar.append(f"{p.get('nombre')}: va por OLVA, no entra al masivo de Shalom"); continue
        cand = buscar(texto, 3)
        destino = cand[0]["agencia"] if cand and cand[0]["seguro"] else ""
        if not destino:
            revisar.append(f"{p.get('nombre')} ({p.get('whatsapp')}): agencia dudosa para «{texto.strip()}» → " + (" | ".join(c["codigo"] for c in cand) if cand else "sin candidatas"))
        tel = re.sub(r"\D", "", str(p.get("telefono") or p.get("whatsapp") or ""))[-9:]
        ws[f"A{fila}"] = re.sub(r"\D", "", str(p.get("dni") or "")) or None
        ws[f"B{fila}"] = int(tel) if tel else None
        ws[f"F{fila}"] = ORIGEN
        ws[f"G{fila}"] = destino or None
        ws[f"H{fila}"] = "PAQUETE XXS"
        ws[f"M{fila}"] = 1
        if not p.get("dni"):
            revisar.append(f"{p.get('nombre')}: sin DNI en el registro")
        fila += 1
    wb.save(salida)
    print(f"{salida} · {fila - 2} fila(s) de provincia para el {fecha} (origen {ORIGEN}, PAQUETE XXS)")
    for r in revisar:
        print(f"⚠️ {r}")


def main():
    a = sys.argv[1:]
    cmd, resto = (a[0], a[1:]) if a else ("", [])
    if cmd == "agencias":
        if "--actualizar" in resto:
            v, n = actualizar(); print(f"Agencias actualizadas: {n} (versión {v})")
        d = cargar(); print(f"{len(d['agencias'])} agencias · versión {d.get('version')} · bajado {d.get('bajado')}")
        for ag in d["agencias"][:int(resto[0]) if resto and resto[0].isdigit() else 15]:
            print(f"  {ag['codigo']} · {ag['direccion']}")
    elif cmd == "buscar" and resto:
        cmd_buscar(" ".join(resto))
    elif cmd == "masivo":
        cmd_masivo(resto)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()

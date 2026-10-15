"""
Estado del reporte de ventas del día: cada corrida de la noche (22:00 · 23:00 · 00:00) lee SOLO lo que
pasó después de la anterior y suma a lo ya reportado, en vez de releer el día entero.

    ASESOR_CLAVE=... python3 scripts/asesor/ventas_estado.py traer AAAA-MM-DD --salida /tmp/ventas
        -> /tmp/ventas/previo.json (lo reportado hasta el corte) y /tmp/ventas/ctx.json (corte nuevo = ahora).
           Imprime `horas`: con cuántas horas hacia atrás correr `preparar.py --activos-horas` (cubre desde el
           corte anterior más 1 h de solapamiento). Sin estado previo, `horas` = 0: se lee el día completo.
    python3 scripts/asesor/ventas_estado.py novedad AAAA-MM-DD --salida /tmp/ventas --chats N
        -> SIN_NOVEDAD si nadie escribió desde el corte Y el control del sistema ya está explicado en el estado.

enviar.py hace el resto: fusiona el salida.json (solo lo nuevo o cambiado) con el estado, cuadra con el CRM,
manda el PDF y, solo si salió bien, guarda el estado nuevo con el corte de ctx.json.
"""
import datetime as dt, json, math, os, sys, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import control_ventas as cv

API = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/ventas-estado"
CLAVES_LISTA = ("incidencias", "no_cuentan", "sin_marcar_compra", "lineas_revisadas")


def _pedir(clave, fecha, cuerpo=None):
    req = urllib.request.Request(f"{API}?fecha={fecha}", headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0",
                                 "Content-Type": "application/json"}, data=cuerpo, method="PUT" if cuerpo is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as err:
        raise RuntimeError(f"El Worker rechazó el estado de ventas ({err.code}): {err.read().decode()[:200]}")
    except Exception as err:
        raise RuntimeError(f"No se pudo consultar el estado de ventas: {err}")


def traer(clave, fecha):
    r = _pedir(clave, fecha)
    est = r.get("estado") if r.get("existe") else None
    return est if est and est.get("corte") else None  # sin corte no se puede leer solo lo nuevo


def guardar(clave, fecha, estado):
    _pedir(clave, fecha, json.dumps(estado, ensure_ascii=False).encode())


def n9(wa):
    return cv.n9(wa)


def fusionar(previo, nuevo):
    """Lo ya reportado + lo nuevo o cambiado de esta corrida (por WhatsApp; lo nuevo manda). Nunca borra una venta."""
    if not previo:
        return dict(nuevo)
    out = dict(previo)
    for k, v in nuevo.items():
        if k not in ("pedidos", *CLAVES_LISTA):
            out[k] = v
    por_wa = {}
    orden = []
    for p in previo.get("pedidos", []) + nuevo.get("pedidos", []):
        k = n9(p.get("whatsapp")) or f"s/n-{len(orden)}"
        if k not in por_wa:
            orden.append(k)
        viejo = por_wa.get(k, {})
        por_wa[k] = {**viejo, **p, **({'whatsapp': viejo['whatsapp']} if viejo.get('whatsapp') else {})}
    out["pedidos"] = [por_wa[k] for k in orden]
    for c in CLAVES_LISTA:
        vistos, lista = set(), []
        for x in (previo.get(c) or []) + (nuevo.get(c) or []):
            clave = json.dumps(x, sort_keys=True, ensure_ascii=False)
            if clave not in vistos:
                vistos.add(clave)
                lista.append(x)
        if lista:
            out[c] = lista
    return out


def _ahora_utc():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def cmd_traer(fecha, carpeta):
    clave = os.environ.get("ASESOR_CLAVE") or sys.exit("Falta ASESOR_CLAVE en el entorno.")
    estado = traer(clave, fecha)
    os.makedirs(carpeta, exist_ok=True)
    ahora = _ahora_utc()
    horas = 0
    if estado and estado.get("corte"):
        corte = dt.datetime.fromisoformat(estado["corte"])
        horas = max(2, math.ceil((ahora - corte).total_seconds() / 3600) + 1)
    json.dump(estado or {}, open(os.path.join(carpeta, "previo.json"), "w"), ensure_ascii=False, indent=1)
    json.dump({"fecha": fecha, "corte_nuevo": ahora.isoformat()}, open(os.path.join(carpeta, "ctx.json"), "w"))
    print(json.dumps({"hay_estado": bool(estado), "pedidos_previos": len((estado or {}).get("pedidos", [])), "horas": horas,
                      "corte_anterior": (estado or {}).get("corte"), "corte_nuevo": ahora.isoformat()}, ensure_ascii=False, indent=1))


def cmd_novedad(fecha, carpeta, chats):
    clave = os.environ.get("ASESOR_CLAVE") or sys.exit("Falta ASESOR_CLAVE en el entorno.")
    previo = json.load(open(os.path.join(carpeta, "previo.json")))
    if not previo:
        print("HAY_NOVEDAD (sin estado previo: es la primera corrida del día)")
        return
    problemas = cv.cuadrar(cv.traer(clave, fecha), previo)
    if chats == 0 and not problemas:
        print("SIN_NOVEDAD")
    else:
        print(f"HAY_NOVEDAD (chats con movimiento: {chats}; ventas del sistema sin explicar en el estado: {len(problemas)})")


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 2 or a[0] not in ("traer", "novedad"):
        sys.exit(__doc__)
    carpeta = a[a.index("--salida") + 1] if "--salida" in a else "/tmp/ventas"
    if a[0] == "traer":
        cmd_traer(a[1], carpeta)
    else:
        cmd_novedad(a[1], carpeta, int(a[a.index("--chats") + 1]) if "--chats" in a else 1)

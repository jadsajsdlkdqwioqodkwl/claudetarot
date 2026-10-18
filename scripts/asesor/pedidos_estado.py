"""
Registro del reporte de PEDIDOS (10:30 · 11:30 · 16:30 · 22:30 y "a pedido") por fecha de despacho.

Antes cada corrida armaba su PDF desde cero con lo que alcanzaba a leer (la de 11:30 solo ve los chats
activos de las últimas 6 h): una corrida podía reportar menos o más pedidos que la anterior sin que nadie
supiera por qué, y los pedidos separados para otro día (p. ej. el domingo) no quedaban escritos en ningún
lado. Ahora `enviar.py`:

  1. Trae lo ya reportado para esa fecha (`pedidos-estado/FECHA.json` en el Worker) y le suma lo de esta
     corrida (por WhatsApp; lo nuevo manda). Una corrida NUNCA borra un pedido: para quitarlo hay que
     ponerlo en `quitar` [{whatsapp, motivo}] de salida.json y el motivo queda en el historial.
  2. Imprime y guarda la diferencia contra la corrida anterior (nuevos, cambiados, quitados) en `corridas`.
  3. Cada pedido OTRO_DIA con fecha de entrega (ISO AAAA-MM-DD, o D/M) se anota también en el estado de ESA
     fecha como AGENDADO, para que el reporte de ese día lo traiga aunque ninguna corrida lo recuerde.

    ASESOR_CLAVE=... python3 scripts/asesor/pedidos_estado.py ver AAAA-MM-DD
        -> lo reportado, el historial de corridas y los agendados de esa fecha.
"""
import datetime as dt, json, os, re, sys, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ventas_estado as ve

n9 = ve.n9
CAMPOS_CAMBIO = ("estado", "destino", "kits", "empaque", "direccion_o_agencia", "fecha_entrega", "nota", "tipo", "pago")


def _pedir(clave, fecha, cuerpo=None):
    req = urllib.request.Request(f"{ve.API}?fecha={fecha}&tipo=pedidos",
                                 headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0", "Content-Type": "application/json"},
                                 data=cuerpo, method="PUT" if cuerpo is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            res = json.load(r)
        if res.get("tipo") != "pedidos":  # Worker sin desplegar: ignoraría ?tipo= y pisaría el estado de VENTAS de esa fecha
            raise RuntimeError("el Worker aún no tiene el registro de pedidos (falta desplegar src/api/asesor-datos.js)")
        return res
    except urllib.error.HTTPError as err:
        raise RuntimeError(f"El Worker rechazó el registro de pedidos ({err.code}): {err.read().decode()[:200]}")
    except Exception as err:
        raise RuntimeError(f"No se pudo consultar el registro de pedidos: {err}")


def traer(clave, fecha):
    r = _pedir(clave, fecha)
    return r.get("estado") if r.get("existe") else None


def guardar(clave, fecha, estado):
    _pedir(clave, fecha)  # comprueba que el Worker entiende ?tipo=pedidos ANTES de escribir
    _pedir(clave, fecha, json.dumps(estado, ensure_ascii=False).encode())


def fecha_iso(texto, referencia):
    """AAAA-MM-DD o D/M(/AAAA) -> ISO; None si no se entiende. Sin año: el próximo D/M desde `referencia`."""
    t = str(texto or "")
    m = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", t)
    try:
        if m:
            return dt.date(int(m[1]), int(m[2]), int(m[3])).isoformat()
        m = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", t)
        if m:
            ref = dt.date.fromisoformat(referencia)
            anio = int(m[3]) + (2000 if m[3] and int(m[3]) < 100 else 0) if m[3] else ref.year
            d = dt.date(anio, int(m[2]), int(m[1]))
            if not m[3] and d < ref - dt.timedelta(days=30):
                d = dt.date(anio + 1, int(m[2]), int(m[1]))
            return d.isoformat()
    except ValueError:
        pass
    return None


def _resumen(p):
    return f"{p.get('nombre') or p.get('whatsapp')} ({p.get('estado')}{'/' + p['tipo'] if p.get('tipo') else ''}, {p.get('destino') or '?'})"


def combinar(previo, datos):
    """Fusiona lo reportado antes con esta corrida. Devuelve (datos_completos, diferencia).
    Los pedidos de `quitar` salen (con motivo); ninguno más desaparece."""
    quitar = {n9(q.get("whatsapp")): q.get("motivo") or "" for q in datos.get("quitar") or [] if n9(q.get("whatsapp"))}
    nuevo = dict(datos, pedidos=[p for p in datos.get("pedidos", [])])
    completo = ve.fusionar(previo, nuevo) if previo else dict(nuevo)
    vistos, sin_wa = set(), []  # filas sin WhatsApp (INCIDENCIA…): las repetidas de corridas anteriores no se acumulan
    for p in completo["pedidos"]:
        k = None if n9(p.get("whatsapp")) else json.dumps([p.get("nombre"), p.get("nota")], ensure_ascii=False)
        if k is None or k not in vistos:
            vistos.add(k)
            sin_wa.append(p)
    completo["pedidos"] = sin_wa
    antes = {n9(p.get("whatsapp")): p for p in (previo or {}).get("pedidos", []) if n9(p.get("whatsapp"))}
    quitados = []
    if quitar:
        for p in list(completo["pedidos"]):
            if n9(p.get("whatsapp")) in quitar:
                completo["pedidos"].remove(p)
                quitados.append({"pedido": _resumen(p), "motivo": quitar[n9(p.get("whatsapp"))]})
    ahora = {n9(p.get("whatsapp")): p for p in completo["pedidos"] if n9(p.get("whatsapp"))}
    mencionados = {n9(p.get("whatsapp")) for p in datos.get("pedidos", [])}
    dif = {
        "nuevos": [_resumen(p) for k, p in ahora.items() if k not in antes],
        "cambiados": [f"{_resumen(p)}: " + ", ".join(f"{c} {antes[k].get(c)!r} -> {p.get(c)!r}" for c in CAMPOS_CAMBIO
                                                     if antes[k].get(c) != p.get(c) and c in p)
                      for k, p in ahora.items() if k in antes and k in mencionados
                      and any(antes[k].get(c) != p.get(c) for c in CAMPOS_CAMBIO if c in p)],
        "no_mencionados": [_resumen(p) for k, p in antes.items() if k not in mencionados and k not in quitar],
        "quitados": quitados,
    }
    return completo, dif


def agenda(datos):
    """{fecha_iso: [pedido AGENDADO]} de los OTRO_DIA con fecha de entrega distinta a la de este reporte."""
    ref = datos.get("fecha_objetivo", "")
    out, sin_fecha = {}, []
    for p in datos.get("pedidos", []):
        if p.get("estado") != "OTRO_DIA" or (p.get("nombre") or "").upper() == "INCIDENCIA":
            continue
        f = fecha_iso(p.get("fecha_entrega"), ref)
        if not f:
            sin_fecha.append(_resumen(p))
        elif f != ref:
            out.setdefault(f, []).append(dict(p, estado="CONFIRMADO", tipo="AGENDADO", fecha_entrega=f,
                                              nota=(str(p.get("nota") or "") + f" · agendado desde el reporte del {ref}").strip(" ·")))
    return out, sin_fecha


def revisar_fechas(datos):
    """Un pedido de Lima CONFIRMADO cuya entrega NO es la del reporte no puede salir como confirmado (17/10: «Ma» pidió
    entrega el lunes 19 y el reporte de ventas la contó como Lima confirmada, el de pedidos como Otros días: 3 vs 2).
    Pedidos: la entrega debe ser la fecha_objetivo. Ventas: fecha_objetivo (día de la venta) o el día siguiente."""
    ref = datos.get("fecha_objetivo", "")
    try:
        limite = dt.date.fromisoformat(ref) + dt.timedelta(days=1 if datos.get("tipo_reporte") == "ventas" else 0)
    except ValueError:
        return []
    malos = []
    for p in datos.get("pedidos", []):
        if p.get("estado") != "CONFIRMADO" or p.get("destino") != "LIMA" or p.get("tipo"):
            continue
        f = fecha_iso(p.get("fecha_entrega"), ref)
        if f and dt.date.fromisoformat(f) > limite:
            malos.append(f"- {p.get('nombre') or p.get('whatsapp')}: entrega {f}, pero el reporte es del {ref}; "
                         "pásalo a estado OTRO_DIA (con su fecha_entrega) y no lo cuentes como confirmado de hoy.")
    return malos


def registrar(clave, completo, dif, origen):
    """Guarda el estado de la fecha (con una línea nueva en `corridas`) y anota los agendados en sus fechas."""
    ref = completo.get("fecha_objetivo", "")
    ahora = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    ped = [p for p in completo.get("pedidos", []) if (p.get("nombre") or "").upper() != "INCIDENCIA"]
    cuenta = lambda f: sum(1 for p in ped if f(p))
    corrida = {"cuando": ahora, "origen": origen, "total": len(ped),
               "lima_confirmados": cuenta(lambda p: p.get("estado") == "CONFIRMADO" and p.get("destino") == "LIMA" and not p.get("tipo")),
               "provincia_confirmados": cuenta(lambda p: p.get("estado") == "CONFIRMADO" and p.get("destino") == "PROVINCIA" and not p.get("tipo")),
               "otro_dia": cuenta(lambda p: p.get("estado") == "OTRO_DIA"), "dif": dif}
    completo = dict(completo, corridas=(completo.get("corridas") or []) + [corrida])
    guardar(clave, ref, completo)
    futuros, sin_fecha = agenda(completo)
    for f, lista in futuros.items():
        est = traer(clave, f) or {"fecha_objetivo": f, "pedidos": [], "corridas": []}
        por = {n9(p.get("whatsapp")): p for p in est["pedidos"] if n9(p.get("whatsapp"))}
        for p in lista:
            k = n9(p.get("whatsapp"))
            por[k] = {**por.get(k, {}), **p} if k in por else p
        sin_k = [p for p in est["pedidos"] if not n9(p.get("whatsapp"))]
        est["pedidos"] = list(por.values()) + sin_k
        est["corridas"] = (est.get("corridas") or []) + [{"cuando": ahora, "origen": f"agendado desde {ref} ({origen})",
                                                           "total": len(est["pedidos"]), "dif": {"nuevos": [_resumen(p) for p in lista]}}]
        guardar(clave, f, est)
    return futuros, sin_fecha


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] != "ver":
        sys.exit(__doc__)
    est = traer(os.environ.get("ASESOR_CLAVE", ""), sys.argv[2])
    if not est:
        sys.exit(f"Nada registrado para {sys.argv[2]}.")
    print(f"Pedidos registrados para {sys.argv[2]}: {len(est.get('pedidos', []))}")
    for p in est.get("pedidos", []):
        print(f"  - {_resumen(p)} {p.get('whatsapp') or ''} {p.get('fecha_entrega') or ''}")
    for c in est.get("corridas", []):
        print(f"corrida {c['cuando']} · {c['origen']}: total {c['total']}, Lima {c.get('lima_confirmados', '-')}, "
              f"provincia {c.get('provincia_confirmados', '-')}, otro día {c.get('otro_dia', '-')}")
        for k, v in (c.get("dif") or {}).items():
            for x in v:
                print(f"      {k}: {x}")

"""
Pedidos de Lima → Dinsides Courier (dueño, 2026-11-08). Lo corre la Routine «Dinsides — registro de pedidos de Lima» (manual,
«Run now», y la corrida de la noche después del reporte); también sirve a mano. Todo pasa por el Worker (`/api/asesor/dinsides`):
el script no arma curl ni toca Dinsides directo. Memoria: R2 `dinsides/FECHA.json`, columna «Dinsides» de la hoja «Pedidos auto»
y etiqueta `dinsides_registrado` en el chat; nunca se registra dos veces el mismo WhatsApp.

    ASESOR_CLAVE=... python3 scripts/asesor/dinsides.py preparar [AAAA-MM-DD] [--dir /tmp/dinsides]
        -> Fichas de los pedidos de LIMA para esa fecha de ENTREGA (por defecto mañana: lo de esta noche sale mañana aunque sea
           la 1 a. m.), armadas con lo que ya sabe el sistema (reporte de la noche, hoja «Pedidos auto», pin y dirección del chat):
           LISTOS (se registran solos), CON BLOQUEOS (dirección / distrito dudosos, zona roja, estado sin confirmar: los mira una
           persona o la Routine lee el chat y los corrige), YA REGISTRADOS y CANDIDATOS DEL CRM (chats con pin, dirección o compra
           marcada que el reporte no trae: la «cuarta corrida» para que nadie se quede fuera). Deja --dir/fichas.json.
    python3 scripts/asesor/dinsides.py presentar [AAAA-MM-DD]       -> TODO lo que el dueño mira antes del OK, en su formato (fichas +
                                                                        historial del chat + estado en Dinsides y en la hoja + CRM + pendientes con mensaje nuevo).
    python3 scripts/asesor/dinsides.py notas <id|link de la página de revisión> -> lo que la persona marcó (OK / corrección / no va / ya se envió).
    python3 scripts/asesor/dinsides.py chat <whatsapp|conversation_id> [N]   -> los últimos N mensajes de un chat (para resolver una duda).
    python3 scripts/asesor/dinsides.py zona <lat,lng | link de Maps>         -> en qué zona del mapa de cobertura de Dinsides cae.
    python3 scripts/asesor/dinsides.py registrar [/tmp/dinsides/salida.json] [--simular] [--forzar]
        -> Manda al Worker lo que decidiste: {"fecha": "AAAA-MM-DD", "pedidos": [{"whatsapp": "51…", "distrito": "Comas",
           "direccion": "…", "coordenadas": "-12.1,-77.0", "nombre": "…", "telefono": "9…", "cobrar": 89, "tipo_pago": "YAPE",
           "nota": "…", "fecha_entrega": "AAAA-MM-DD", "kits": 1, "empaque": "…", "estado": "CONFIRMADO"}], "marcar": [...]}.
           Solo pone lo que corriges; lo demás lo completa el Worker. Sin "pedidos" registra todos los listos de la fecha.
           El Worker registra en Dinsides los que quedan sin bloqueos (un solo listado), guarda la memoria y marca la hoja.
           --traslado 1|2|3: cómo llegan los paquetes a Dinsides (1 recojo en mi domicilio, por defecto; 2 lo llevo a la tienda
           Cercado, Av Arica 1702; 3 tienda Gamarra). --simular: hace todo menos el POST final a Dinsides (pedido de prueba sin crear nada). --forzar: registra aunque haya
           bloqueos de dirección/distrito (nunca con teléfono inválido o provincia); úsalo solo si una persona lo pidió.
           Si el Worker no tiene credenciales de Dinsides, deja el script de consola en --dir/consola.js para pegarlo a mano.
    python3 scripts/asesor/dinsides.py probar                                -> entra a Dinsides y lee el formulario real, sin registrar.
    python3 scripts/asesor/dinsides.py script [/tmp/dinsides/salida.json]    -> solo el script de consola (F12) de los listos.
    python3 scripts/asesor/dinsides.py marcar <whatsapp> [nro] [motivo…]      -> alguien lo registró a mano: queda en la memoria.
    python3 scripts/asesor/dinsides.py quitar <whatsapp> [AAAA-MM-DD] [motivo…] -> saca un WhatsApp de la memoria de esa fecha (si el panel dice otra cosa).
    python3 scripts/asesor/dinsides.py telegram "texto"                       -> resumen al dueño (sale por el Worker).
    python3 scripts/asesor/dinsides.py estados [desde AAAA-MM-DD] [hasta AAAA-MM-DD] [--solo-ver]
        -> Los ojos del reporte: lee el historial de Dinsides (ENTREGADO, ANULADO, RECHAZADO, REGISTRADO), lo cruza con la hoja
           «Pedidos auto» y marca «entregado #id» / «anulado…» en la columna Dinsides (y «Enviado» si estaba vacío) y la etiqueta
           del chat. --solo-ver no marca nada.
    python3 scripts/asesor/dinsides.py listado [desde] [hasta]                 -> el historial de Dinsides tal cual (id, nombre, tel, estado).
    python3 scripts/asesor/dinsides.py anular <id_pedido…> [--motivo "…"]      -> anula pedidos propios que aún no están EN RUTA («Anular pedido» del detalle).
    python3 scripts/asesor/dinsides.py editar <id_pedido> campo=valor [campo=valor…]
        -> edita un pedido antes de la ruta. Campos: fecha_entrega=AAAA-MM-DD, direccion=…, distrito=Nombre, nombre=…, telefono=9…,
           cobrar=89, tipo_pago=YAPE, obs=…, producto=… (ej.: editar 2940714 fecha_entrega=2026-11-12 "obs=llamar antes").
"""
import datetime as dt, json, os, re, sys, urllib.error, urllib.parse, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
API_BASE = os.environ.get("ASESOR_API_BASE") or "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor"
LIMA = dt.timezone(dt.timedelta(hours=-5))


def clave():
    return os.environ.get("ASESOR_CLAVE") or sys.exit("Falta ASESOR_CLAVE en el entorno.")


def pedir(ruta, method="GET", body=None, timeout=120):
    datos = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = urllib.request.Request(f"{API_BASE}{ruta}", data=datos, method=method,
                                 headers={"x-asesor-clave": clave(), "User-Agent": "tarot-asesor/1.0", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        cuerpo = e.read()
        try:
            return e.code, json.loads(cuerpo)
        except ValueError:
            return e.code, {"error": cuerpo.decode(errors="replace")[:300]}


def salir_si_error(st, r):
    if st == 401:
        sys.exit("La ASESOR_CLAVE del entorno no es la correcta (401).")
    if st >= 400 and r.get("error") not in ("sin_credenciales", "credenciales", "dinsides_rechazo"):
        sys.exit(f"El Worker respondió {st}: {r.get('error')} {r.get('detalle') or ''}".strip())


def fecha_arg(args):
    return next((a for a in args if len(a) == 10 and a[4] == "-" and a[7] == "-"), None)


def carpeta_arg(args, defecto="/tmp/dinsides"):
    return args[args.index("--dir") + 1] if "--dir" in args else defecto


def linea_ficha(f):
    c = f["campos"]
    return (f"{c.get('nombre')} · {f.get('whatsapp')} · tel {c.get('telefono') or '?'} · {c.get('distrito') or 'SIN DISTRITO'} · entrega {c.get('fecha_entrega')}\n"
            f"    {c.get('direccion') or '(sin dirección)'}{' · ' + c['coordenadas'] if c.get('coordenadas') else ''}\n"
            f"    {c.get('producto')} · S/{c.get('cobrar')} {c.get('tipo_pago')}{' · ' + c['obs'][:140] if c.get('obs') else ''}")


def cmd_preparar(args):
    carpeta = carpeta_arg(args)
    os.makedirs(carpeta, exist_ok=True)
    fecha = fecha_arg(args)
    st, r = pedir(f"/dinsides?fecha={fecha}" if fecha else "/dinsides")
    salir_si_error(st, r)
    json.dump(r, open(os.path.join(carpeta, "fichas.json"), "w"), ensure_ascii=False, indent=1)
    json.dump({"fecha": r.get("fecha")}, open(os.path.join(carpeta, "ctx.json"), "w"))  # registrar usa esta fecha si salida.json no trae una
    pedidos = r.get("pedidos", [])
    listos = [f for f in pedidos if f.get("listo")]
    ya = [f for f in pedidos if f.get("ya_registrado")]
    bloqueados = [f for f in pedidos if f.get("bloqueos") and not f.get("ya_registrado")]
    print(f"Entrega {r['fecha']} (noche del {r['fecha_venta']}) · Worker con credenciales de Dinsides: {'sí' if r.get('credenciales') else 'NO (solo script de consola)'}")
    print(f"Listos: {len(listos)} · Con bloqueos: {len(bloqueados)} · Ya registrados: {len(ya)} · Candidatos del CRM fuera del reporte: {len(r.get('candidatos_crm', []))}")
    if listos:
        print("\nLISTOS (se registran solos con `registrar`):")
        for f in listos:
            print("  " + linea_ficha(f))
            for a in f.get("alertas", []):
                print(f"    · {a}")
    if bloqueados:
        print("\nCON BLOQUEOS (lee el chat con `chat`, decide y corrige en salida.json; si no se resuelve, se avisa al dueño):")
        for f in bloqueados:
            print("  " + linea_ficha(f))
            for b in f.get("bloqueos", []):
                print(f"    ⛔ {b}")
            for a in f.get("alertas", []):
                print(f"    · {a}")
            if f.get("direcciones_chat"):
                print("    Direcciones que escribió el cliente: " + " | ".join(f["direcciones_chat"]))
            if f.get("hoja", {}) and f["hoja"].get("dinsides"):
                print(f"    Hoja «Pedidos auto» fila {f['hoja']['fila']}, columna Dinsides: {f['hoja']['dinsides']}")
    if ya:
        print("\nYA REGISTRADOS (no se repiten):")
        for f in ya:
            print(f"  {f['campos'].get('nombre')} · {f.get('whatsapp')} · {json.dumps(f['ya_registrado'], ensure_ascii=False)}")
    if r.get("candidatos_crm"):
        print("\nCANDIDATOS DEL CRM que el reporte NO trae (léelos con `chat`; si es un pedido de Lima confirmado, agrégalo a `pedidos` de salida.json con whatsapp, nombre, direccion, distrito, estado CONFIRMADO):")
        for c in r["candidatos_crm"]:
            print(f"  {c.get('nombre') or '(sin nombre)'} · {c.get('whatsapp')} · {c.get('asesora') or 'sin asesora'}{' · COMPRA MARCADA' if c.get('compra_marcada') else ''}"
                  f"{' · parece PROVINCIA (agencia/ciudad en el chat): no va por Dinsides' if c.get('parece_provincia') else ''}")
            for s in c.get("senales", []):
                print(f"    - {s}")
    print(f"\nFichas completas en {carpeta}/fichas.json. Siguiente: escribe {carpeta}/salida.json y corre `python3 scripts/asesor/dinsides.py registrar {carpeta}/salida.json`.")


def cmd_chat(ref, n="40"):
    ref = str(ref)
    q = f"conversation_id={ref}" if ref.isdigit() and len(ref) < 9 else f"telefono={''.join(ch for ch in ref if ch.isdigit())[-9:]}"
    st, r = pedir(f"/chat?{q}&mensajes={n}&largo=1")
    salir_si_error(st, r)
    if not r.get("encontrado"):
        sys.exit("No encontré ese chat.")
    print(f"{r.get('nombre')} · {r.get('wa_id')} · chat {r.get('conversation_id')} · ventana {r.get('ventana')} · etiquetas: {r.get('etiquetas') or '-'}")
    for m in r.get("mensajes", []):
        quien = "C" if m.get("direction") == "in" else "V"
        cuerpo = m.get("body") or f"[{m.get('type')}]"
        if m.get("type") == "location":
            partes = str(m.get("body") or "").split("|")
            cuerpo = f"[UBICACIÓN] {partes[0]},{partes[1] if len(partes) > 1 else ''} {' '.join(partes[2:]).strip()}"
        print(f"{m.get('created_at', '')[5:16]} {quien}: {cuerpo}")


def cmd_zona(texto):
    st, r = pedir(f"/dinsides?zona={urllib.request.quote(texto)}")
    salir_si_error(st, r)
    print(json.dumps(r, ensure_ascii=False, indent=1))


def _cargar_salida(args, defecto="/tmp/dinsides/salida.json"):
    ruta = next((a for a in args if a.endswith(".json")), defecto)
    if not os.path.exists(ruta):
        # Sin archivo NO se registra nada (2026-11-08: un archivo mal escrito hizo que se registraran TODOS los listos de mañana).
        # Para registrar todos los listos a propósito, escribe un salida.json con {"pedidos": []}.
        sys.exit(f"No existe {ruta}. Escribe el salida.json (con {{\"pedidos\": []}} si quieres registrar todos los listos) y vuelve a correr.")
    try:
        return json.load(open(ruta)), ruta
    except ValueError as err:
        sys.exit(f"No se pudo leer {ruta}: {err}")


def _imprimir_resultado(r, carpeta):
    for x in r.get("registrados", []):
        print(f"✅ Registrado en Dinsides #{x.get('nro') or '?'}: {x.get('nombre')} · {x.get('whatsapp')} · {x.get('distrito')} · entrega {x.get('fecha_entrega')} · S/{x.get('cobrar')} {x.get('tipo_pago')}")
    for x in r.get("no_confirmados", []):
        print(f"❓ NO CONFIRMADO: {x.get('nombre')} · tel {x.get('telefono')} · {x.get('motivo')}")
        for a in x.get("alertas", []):
            print(f"    · {a}")
    if r.get("simulado"):
        print(f"🧪 SIMULACIÓN: no se registró nada. Listado armado para {len(r.get('listos', []))} pedido(s); negocio {r.get('formulario', {}).get('negocio')}, "
              f"traslado {json.dumps(r.get('formulario', {}).get('recojo', {}), ensure_ascii=False)[:200]}")
        print("FICHAS COMPLETAS (exactamente lo que se mandaría a Dinsides; preséntalas tal cual antes de registrar):")
        for x in r.get("listos", []):
            c = x.get("campos") or {}
            print(f"   ▶ {c.get('nombre')} · {x.get('whatsapp')}")
            for k, et in (("tipo_pedido", "Tipo de pedido"), ("nombre", "Nombre"), ("telefono", "Teléfono"), ("fecha_entrega", "Fecha de entrega"),
                          ("distrito", "Distrito"), ("direccion", "Dirección"), ("coordenadas", "Coordenadas"), ("producto", "Producto"),
                          ("cobrar", "Cobrar S/"), ("tipo_pago", "Tipo de pago"), ("obs", "Observación")):
                print(f"       {et}: {c.get(k) if c.get(k) not in (None, '') else '—'}")
            for a in x.get("alertas", []):
                print(f"       · {a}")
    for x in r.get("no_van", []):
        if x.get("ya_registrado"):
            print(f"↩️ Ya estaba registrado: {x.get('nombre')} · {x.get('whatsapp')} · {json.dumps(x['ya_registrado'], ensure_ascii=False)}")
        else:
            print(f"⛔ NO registrado: {x.get('nombre')} · {x.get('whatsapp')}")
            for b in x.get("bloqueos", []):
                print(f"    - {b}")
    for a in r.get("avisos", []):
        print(f"⚠️ {a}")
    if r.get("sin_pedido_en_el_sistema"):
        print(f"⚠️ Sin pedido en el sistema para: {', '.join(r['sin_pedido_en_el_sistema'])} (si es un pedido nuevo, manda nombre, direccion y distrito en salida.json)")
    if r.get("script"):
        os.makedirs(carpeta, exist_ok=True)
        ruta = os.path.join(carpeta, "consola.js")
        open(ruta, "w").write(r["script"] + "\n")
        print(f"📋 Script de consola para {len(r.get('listos', []))} pedido(s) en {ruta}: abrir https://dinsidescourier.com/pedido/nuevo, F12 → Consola, pegar, revisar el listado, elegir el traslado, aceptar los términos y Guardar.")
    for k in ("hoja", "etiquetas"):
        if r.get(k):
            print(f"{k}: {json.dumps(r[k], ensure_ascii=False)[:300]}")


def cmd_registrar(args, accion="registrar"):
    datos, ruta = _cargar_salida(args)
    carpeta = os.path.dirname(os.path.abspath(ruta))
    body = {"accion": accion, "origen": f"dinsides.py {dt.datetime.now(LIMA).strftime('%H:%M')}"}
    ctx = os.path.join(carpeta, "ctx.json")
    fecha_ctx = json.load(open(ctx)).get("fecha") if os.path.exists(ctx) else None
    if datos.get("fecha") or fecha_arg(args) or fecha_ctx:
        body["fecha"] = datos.get("fecha") or fecha_arg(args) or fecha_ctx
    if datos.get("pedidos"):
        body["pedidos"] = datos["pedidos"]
    if "--simular" in args:
        body["simular"] = True
    if "--forzar" in args:
        body["forzar"] = True
    if "--traslado" in args:  # 1 recojo en domicilio (defecto) · 2 lo llevo a tienda Cercado (Av Arica 1702) · 3 tienda Gamarra
        body["traslado"] = args[args.index("--traslado") + 1]
    for m in datos.get("marcar", []) if accion == "registrar" else []:
        st, r = pedir("/dinsides", "POST", {"accion": "marcar", "fecha": body.get("fecha"), **m})
        print(f"marcar {m.get('whatsapp')}: {json.dumps(r, ensure_ascii=False)[:200]}")
    st, r = pedir("/dinsides", "POST", body, timeout=180)
    salir_si_error(st, r)
    if r.get("error"):
        print(f"❌ {r.get('error')}: {r.get('detalle') or ''}")
    _imprimir_resultado(r, carpeta)
    if r.get("error") == "dinsides_rechazo":
        sys.exit(2)
    if r.get("error") in ("sin_credenciales", "credenciales"):
        sys.exit(3)


def cmd_probar():
    st, r = pedir("/dinsides", "POST", {"accion": "probar"}, timeout=180)
    salir_si_error(st, r)
    if r.get("error"):
        sys.exit(f"❌ {r.get('error')}: {r.get('detalle') or ''}")
    f = r.get("formulario", {})
    print(f"Sesión OK (perfil {r.get('perfil')}). Negocio: {f.get('negocio')} · distritos en el desplegable: {f.get('distritos')}")
    print(f"Traslado elegido: id_recojo={f.get('recojo', {}).get('id_recojo')} recojo={f.get('recojo', {}).get('recojo')} · opciones: {json.dumps(f.get('recojo', {}).get('opciones'), ensure_ascii=False)}")
    print(f"Turnos: {json.dumps(f.get('turnos'), ensure_ascii=False)} · tipos de pedido: {[o['valor'] for o in f.get('tipos_pedido', [])]} · tipos de pago: {[o['valor'] for o in f.get('tipos_pago', [])]}")
    if f.get("diferencias"):
        print("Diferencias de la tabla de distritos del repo frente a Dinsides (actualizar DISTRITOS en src/lib/dinsides.js):")
        for d in f["diferencias"]:
            print(f"  - {d}")
    else:
        print("La tabla de distritos del repo coincide con el formulario.")


def cmd_marcar(args):
    wa = "".join(c for c in str(args[0]) if c.isdigit())
    nro = args[1] if len(args) > 1 and not args[1].startswith("-") else ""
    motivo = " ".join(args[2:]) if len(args) > 2 else ""
    body = {"accion": "marcar", "whatsapp": wa, "nro": nro, "motivo": motivo, "origen": "dinsides.py marcar"}
    if fecha_arg(args):
        body["fecha"] = fecha_arg(args)
    st, r = pedir("/dinsides", "POST", body)
    salir_si_error(st, r)
    print(json.dumps(r, ensure_ascii=False))


def cmd_quitar(args):
    """quitar <whatsapp> [AAAA-MM-DD] [motivo…]: saca un WhatsApp de la memoria de registros de esa fecha (no toca Dinsides)."""
    wa = "".join(c for c in str(args[0]) if c.isdigit())
    fecha = fecha_arg(args)
    motivo = " ".join(a for a in args[1:] if a != fecha)
    body = {"accion": "quitar", "whatsapp": wa, "motivo": motivo}
    if fecha:
        body["fecha"] = fecha
    st, r = pedir("/dinsides", "POST", body)
    salir_si_error(st, r)
    print(json.dumps(r, ensure_ascii=False))


def cmd_telegram(texto):
    st, r = pedir("/avisos", "POST", {"informe": f"Dinsides — registro de pedidos de Lima\n\n{texto}", "origen": "dinsides (aviso)"})
    salir_si_error(st, r)
    print(json.dumps(r, ensure_ascii=False))


def cmd_estados(args):
    fechas = [a for a in args if len(a) == 10 and a[4] == "-"]
    body = {"accion": "estados", "marcar": "--solo-ver" not in args}
    if fechas:
        body["desde"] = fechas[0]
        body["hasta"] = fechas[1] if len(fechas) > 1 else fechas[0]
    st, r = pedir("/dinsides", "POST", body, timeout=240)
    salir_si_error(st, r)
    if r.get("error"):
        sys.exit(f"❌ {r.get('error')}: {r.get('detalle') or ''}")
    print(f"Pedidos en Dinsides: {r.get('total')} · entregados {len(r.get('entregados', []))} · pendientes {len(r.get('pendientes', []))} · "
          f"anulados {len(r.get('anulados', []))} · rechazados {len(r.get('rechazados', []))} · marcados en la hoja: {r.get('marcados')} · chats etiquetados: {r.get('etiquetados')}")
    for k, titulo in (("pendientes", "PENDIENTES en Dinsides"), ("rechazados", "RECHAZADOS"), ("sin_fila_en_hoja", "EN DINSIDES PERO SIN FILA EN «Pedidos auto»")):
        if r.get(k):
            print(f"\n{titulo}:")
            for x in r[k][:60]:
                print(f"  #{x['id_pedido']} · {x['nombre']} · {x['telefono']} · {x['distrito']} · entrega {x['fecha_entrega']} · {x['seguimiento']} · S/{x['monto']}")


def cmd_listado(args):
    fechas = [a for a in args if len(a) == 10 and a[4] == "-"]
    q = "&".join(f"{k}={v}" for k, v in zip(("desde", "hasta"), fechas))
    st, r = pedir(f"/dinsides?listado=1&{q}", timeout=240)
    salir_si_error(st, r)
    for x in r.get("pedidos", []):
        print(f"#{x['id_pedido']} · {x['fecha_pedido'][:16]} · entrega {x['fecha_entrega']} · {x['nombre']} · {x['telefono']} · {x['distrito']} · {x['seguimiento']} · S/{x['monto_cobrar']} · {x['detalle'][:40]}")
    print(f"total {r.get('total')}")


def cmd_anular(args):
    ids = [a for a in args if a.isdigit()]
    motivo = args[args.index("--motivo") + 1] if "--motivo" in args else ""
    if not ids:
        sys.exit("Falta el id del pedido (número) a anular.")
    st, r = pedir("/dinsides", "POST", {"accion": "anular", "ids": ids, "motivo": motivo}, timeout=180)
    salir_si_error(st, r)
    print(json.dumps(r, ensure_ascii=False, indent=1))


def cmd_editar(args):
    idp = args[0]
    cambios = {}
    for a in args[1:]:
        if "=" in a:
            k, v = a.split("=", 1)
            cambios[k.strip()] = v.strip()
    if not idp.isdigit() or not cambios:
        sys.exit("Uso: editar <id_pedido> campo=valor …")
    st, r = pedir("/dinsides", "POST", {"accion": "editar", "id": idp, "cambios": cambios}, timeout=180)
    salir_si_error(st, r)
    print(json.dumps(r, ensure_ascii=False, indent=1))


# ---------- presentar: lo que el dueño quiere ver antes de dar el OK (2026-11-09) ----------
RE_RELEVANTE = re.compile(r"direcci|calle|\bav\b|\bjr\b|\bmz\b|\blt\b|dpto|depa|piso|referenc|frente|esquina|portero|timbre|hora|\bpm\b|\bam\b|mañana|tarde|noche|"
                          r"lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|reprogram|cancel|anul|yape|plin|pag[oóa]|adelanto|efectivo|tarjeta|"
                          r"separ|pedido|kit|mazo|collar|descuento|dni|agencia|shalom|olva|oficina|sede|jir[oó]n|urb|lote|ciudad|provincia|lleg|recib|entreg|\d{3,}", re.I)
RE_VENDEDORA_UTIL = re.compile(r"agendad|queda|mañana|lunes|martes|mi[eé]rcoles|jueves|viernes|horario|cobr|pag[oó] completo|sin cobrar|comprobante|boleta|entregad", re.I)
NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]
NEGOCIO = "Tarot Store Peru"


def normalizar_py(t):
    import unicodedata
    return "".join(ch for ch in unicodedata.normalize("NFD", str(t or "").lower()) if unicodedata.category(ch) != "Mn")


def _num(i):
    return NUM[i - 1] if i <= len(NUM) else f"{i}."


def _fecha_pe(iso):
    iso = str(iso or "")[:10]
    return f"{iso[8:10]}/{iso[5:7]}/{iso[0:4]}" if len(iso) == 10 else iso


def _historial(wa, n=60, desde=""):
    """Lo que escribió EL CLIENTE (con fecha y hora) que sirve para decidir, y las líneas de la vendedora que fijan algo."""
    st, r = pedir(f"/chat?telefono={wa[-9:]}&mensajes={n}&largo=1")
    if st != 200 or not r.get("encontrado"):
        return "chat no encontrado", [], ""
    cab = f"etiquetas: {r.get('etiquetas') or '-'} · ventana {r.get('ventana')}"
    lineas, ultimo_cliente = [], ""
    for m in r.get("mensajes", []):
        quien = "C" if m.get("direction") == "in" else "V"
        t = m.get("type")
        cuerpo = m.get("body") or ""
        if t == "location":
            partes = str(cuerpo).split("|"); cuerpo = f"[UBICACIÓN] {partes[0]},{partes[1] if len(partes) > 1 else ''}"
        elif t == "image":
            cuerpo = "[imagen: captura/foto]"
        elif t not in ("text", None):
            continue
        cuerpo = re.sub(r"\s+", " ", str(cuerpo)).strip()
        cuando = m.get("created_at", "")[5:16]
        if quien == "C":
            ultimo_cliente = cuando
        if desde and cuando[:5] < desde:
            continue
        if quien == "C" and (t in ("location", "image") or RE_RELEVANTE.search(cuerpo)):
            lineas.append(f"{cuando} C: {cuerpo[:170]}")
        elif quien == "V" and RE_VENDEDORA_UTIL.search(cuerpo) and not re.search(r"\[image\]|Hola bell|está en \*S/|Claro bell|incluye el mazo|motorizado se estará", cuerpo):
            lineas.append(f"{cuando} V: {cuerpo[:140]}")
    return cab, lineas[-12:], ultimo_cliente


def _telefonos_en(texto):
    return [re.sub(r"\D", "", m)[-9:] for m in re.findall(r"(?:\+?51\s?)?(9\d{2}[\s.-]?\d{3}[\s.-]?\d{3})\b", str(texto or ""))]


def _estado_dinsides(lista, *tels):
    tels = {str(t or "")[-9:] for t in tels if t}
    xs = [x for x in lista if x.get("telefono") in tels]
    if not xs:
        return "sin pedido en Dinsides (ni abierto ni anulado)"
    xs.sort(key=lambda x: x.get("fecha_pedido", ""), reverse=True)
    return "; ".join(f"#{x['id_pedido']} {x['seguimiento']} (registrado {x['fecha_pedido'][:10]}, entrega {x['fecha_entrega']})" for x in xs[:3])


def _boleta(boletas, wa):
    b = boletas.get(str(wa or "")[-9:])
    return f"BOLETA EMITIDA {b['fecha'][:10]} {b['courier']} {b['nro']} (ya se le envió)" if b else "sin boleta"


def _pregunta(f):
    """La pregunta corta que hay que hacer antes del OK (hora específica, cambio de fecha, nota para la asesora)."""
    for a in f.get("alertas", []):
        if a.startswith("HORA ESPECÍFICA"):
            m = re.search(r"«(.+?)»", a); return f"pide hora «{m.group(1) if m else '…'}»: ¿Dinsides (12–5 pm) o motorizado de confianza?"
        if a.startswith("YA AGENDADO"):
            return "ya está agendado en Dinsides para otra fecha: ¿editar la fecha o dejarlo?"
    for a in f.get("alertas", []):
        if a.startswith("NOTA PARA LA ASESORA") and not re.search(r"usar este|se usa|ya resuelto", a, re.I):  # lo ya resuelto no es pregunta
            return a.split(":", 1)[1].strip()[:140]
    return ""


def _tarjeta_dinsides(c):
    """La etiqueta de Dinsides tal cual: lo que va al formulario (y lo que se imprime para la caja)."""
    det = f"{c.get('direccion') or ''}. {c.get('obs') or ''}".strip(". ").replace("..", ".")
    out = ["🏷️ ETIQUETA DINSIDES (lo que va al formulario):",
           f"   Negocio: {NEGOCIO}",
           f"   ENTREGAR A: {(c.get('nombre') or '').upper()}",
           f"   Teléfono: {c.get('telefono') or ''}",
           f"   Producto: {c.get('producto') or ''}",
           f"   Cobrar: S/. {float(c.get('cobrar') or 0):.2f}" + (f" · {c.get('tipo_pago')}" if c.get("tipo_pago") not in (None, "", "YAPE") else "") + f" · {c.get('tipo_pedido') or ''}",
           f"   Distrito: {(c.get('distrito') or '').title()}",
           f"   Fecha Entrega: {_fecha_pe(c.get('fecha_entrega'))}",
           f"   Detalle: {det}"]
    if c.get("coordenadas"):
        out.append(f"   Coordenadas: {c.get('coordenadas')}")
    return out


def _bloque(i, f, lista, boletas, corto=False):
    c = f.get("campos") or {}
    # Sin dirección y sin confirmación (intención, preguntó precio…) no es un pedido: una sola línea con lo que falta, para no llenar la
    # pantalla de etiquetas vacías (dueño 2026-11-09). Solo lleva etiqueta completa lo que tiene datos de pedido.
    if not f.get("listo") and not f.get("ya_registrado") and not c.get("direccion") and not c.get("coordenadas"):
        motivo = str(f.get("estado_reporte") or "").upper() or "sin datos"
        return (f"{_num(i)} {(c.get('nombre') or '').upper()} · WhatsApp {f.get('whatsapp')} · asesora {f.get('asesora') or '-'} · ❓ {motivo}: sin dirección ni pin"
                f" · nota: {str(c.get('obs') or '')[:110]}\n   → acción para la asesora: pedirle ubicación o dirección y teléfono de quien recibe (no se registra hasta tenerlo)")
    tel = c.get("telefono") or f.get("whatsapp", "")[-9:]
    pregunta = _pregunta(f) if f.get("listo") else ""
    if f.get("ya_registrado"):
        estado = "↩️ YA REGISTRADO (no se toca)"
    elif f.get("listo") and pregunta:
        estado = f"✅❓ LISTO, pero confirmar antes del OK: {pregunta}"
    elif f.get("listo"):
        estado = "✅ LISTO (se registra con tu OK)"
    else:
        estado = "❓ PENDIENTE: " + "; ".join(b.split(":")[0] for b in f.get("bloqueos", [])[:2])
    fuentes = f.get("distrito_fuentes") or {}
    fuente = "pin del cliente" if fuentes.get("pin") else "mapa (dirección ubicada)" if fuentes.get("geocodificado") else "texto del cliente" if fuentes.get("texto") else "—"
    primer = (c.get("nombre") or "X").split()[0]
    out = [f"{_num(i)} {(c.get('nombre') or '').upper()} – {(c.get('distrito') or 'SIN DISTRITO').title()} · {estado}",
           f"👤 WhatsApp {f.get('whatsapp')} · asesora {f.get('asesora') or '-'} · distrito por {fuente}"]
    out += _tarjeta_dinsides(c)
    for a in f.get("alertas", []):
        if a.startswith("NOTA PARA LA ASESORA"):
            out.append(f"📣 {a}")
    if c.get("coordenadas"):
        out.append(f"🔎 VERIFICAR (asesora o dueño, antes del OK): el cliente mandó este pin → https://maps.google.com/?q={c.get('coordenadas')} · ¿la dirección de la etiqueta coincide? Si no: «{primer}: dirección …»")
    elif c.get("direccion"):
        dist = (c.get("distrito") or "").title()
        q = c.get("direccion") if normalizar_py(dist) in normalizar_py(c.get("direccion")) else f"{c.get('direccion')}, {dist}"
        out.append(f"🔎 VERIFICAR (asesora o dueño, antes del OK): busca en Google Maps «{q}» · ¿existe y cae en {dist}? Si no: «{primer}: dirección …» o «{primer}: distrito …»")
    if not corto:
        cab, hist, _ = _historial(f.get("whatsapp", ""))
        out.append(f"🗨️ Lo que escribió el cliente ({cab}):")
        out += [f"    {h}" for h in hist] or ["    (nada relevante en los últimos 60 mensajes)"]
        out.append(f"🏷️ Dinsides: {_estado_dinsides(lista, tel, f.get('whatsapp', ''), *_telefonos_en(c.get('obs')), *_telefonos_en(c.get('direccion')))}")
        out.append(f"🧾 Boleta: {_boleta(boletas, f.get('whatsapp', ''))}")
        if f.get("hoja"):
            out.append(f"📄 Hoja «Pedidos auto»: fila {f['hoja'].get('fila')} · Dinsides: {f['hoja'].get('dinsides') or '—'} · Enviado: {f['hoja'].get('enviado') or '—'}")
        for a in f.get("alertas", []):
            if not a.startswith("NOTA PARA LA ASESORA"):
                out.append(f"⚠️ {a}")
        if f.get("ya_registrado"):
            out.append(f"↩️ {json.dumps(f['ya_registrado'], ensure_ascii=False)[:160]}")
    for b_ in f.get("bloqueos", []):
        out.append(f"⛔ {b_}")
    return "\n".join(out)


def _provincia_pedidos(fecha, ag, cands, boletas=None, lista=None):
    """Pedidos de provincia a presentar: estado del reporte + hoja (atrasados / correcciones) + candidatos del CRM que parecen provincia."""
    st, est = pedir(f"/ventas-estado?fecha={fecha}&tipo=pedidos")
    pedidos, vistos = [], set()
    for p in ((est.get("estado") or {}).get("pedidos", []) if st == 200 else []):
        k = str(p.get("whatsapp") or "")[-9:]
        if str(p.get("destino", "")).upper() == "PROVINCIA" and str(p.get("estado", "")).upper() == "CONFIRMADO" and k not in vistos:
            vistos.add(k); pedidos.append({**p, "_origen": f"reporte {fecha}"})
    # Provincia confirmado que sigue en la hoja sin «Enviado» va al Shalom de HOY aunque su fecha prevista sea otra (atrasado o
    # «mañana»): Shalom despacha lo que haya listo. Caso Abel (2026-11-09): `shalom.py agregar` lo puso con entrega del día 10 y la
    # sección Shalom del 09 no lo mostraba.
    for grupo in ("atrasados", "hoy", "futuros", "sin_fecha"):
        for r in ag.get(grupo) or []:
            k = str(r.get("whatsapp") or "")[-9:]; estd = str(r.get("estado") or "").upper()
            if str(r.get("destino", "")).upper() != "PROVINCIA" or k in vistos or not (estd.startswith("CONFIRMADO") or "CORRECCION" in estd):
                continue
            prev = str(r.get("fecha_entrega") or "")
            etiq = " · CORRECCIÓN" if "CORRECCION" in estd else " · ATRASADO" if prev and prev < fecha else " · agregado hoy, sale en este despacho" if prev > fecha else ""
            vistos.add(k); pedidos.append({**r, "_origen": f"hoja (previsto {prev or 'sin fecha'}){etiq}"})
    boletas = boletas or {}; lista = lista or []
    # Lo que ya tiene boleta (Shalom/Olva), ya está entregado, o el equipo ya cerró en la hoja («sí … Shalom NNN (registrado a mano)»,
    # «Motorizado externo …») no es un pedido por despachar (casos Paola / Luzgardo y los 7 de Shalom del 09-11).
    cerrados = {str(x.get("whatsapp") or "")[-9:]: x for x in (ag.get("enviados_recientes") or [])}
    pedidos = [p for p in pedidos if str(p.get("whatsapp") or "")[-9:] not in boletas and str(p.get("whatsapp") or "")[-9:] not in cerrados]
    for c_ in cands:
        k = str(c_.get("whatsapp") or "")[-9:]
        senales = " ".join(str(x) for x in (c_.get("senales") or []))
        if k in vistos or c_.get("atendido") or k in boletas or "ENTREGADO" in _estado_dinsides(lista, k) or not (c_.get("parece_provincia") or re.search(r"shalom|olva|agencia", senales, re.I)):
            continue
        vistos.add(k)
        pedidos.append({"nombre": c_.get("nombre"), "whatsapp": c_.get("whatsapp"), "vendedora": c_.get("asesora"), "direccion_o_agencia": senales[:160], "dni": "",
                        "kits": 1, "pago": "", "nota": "NO está en el reporte ni en la hoja: viene del CRM (compra marcada o agencia en el chat). Confirmar nombre, DNI y adelanto en el chat y agregarlo con shalom.py agregar.",
                        "_origen": "CRM (fuera del reporte)", "_crm": True})
    return pedidos


def _bloque_shalom(i, p, lista, boletas, corto=False):
    import shalom as sh
    wa = str(p.get("whatsapp") or "")
    dni = sh.dni_de(p)
    texto = str(p.get("direccion_o_agencia") or "")
    primer = str(p.get("nombre") or "X").split()[0]
    if "olva" in f"{texto} {p.get('nota') or ''}".lower():
        return f"{_num(i)} {str(p.get('nombre') or '').upper()} · WhatsApp {wa} · 🟠 OLVA (no entra al Excel de Shalom; se manda aparte) · {p.get('_origen')}"
    cand = sh.buscar(texto) if texto.strip() else []
    adelanto, saldo, aviso = sh.montos(p)
    pend = []
    if p.get("_crm"): pend.append("no está en el reporte: confirmar nombre, DNI y adelanto")
    if not dni: pend.append("sin DNI")
    elif len(dni) != 8: pend.append(f"DNI de {len(dni)} dígitos")
    if not cand or not cand[0].get("seguro"): pend.append("agencia por confirmar")
    if aviso: pend.append(aviso)
    codigo = cand[0]["codigo"] if cand else ""
    estado = "✅ LISTO para el Excel" if not pend else ("✅❓ LISTO, pero confirmar: " if cand and cand[0].get("seguro") and dni and len(dni) == 8 else "❓ PENDIENTE: ") + "; ".join(pend)
    out = [f"{_num(i)} {str(p.get('nombre') or '').upper()} · {estado} · {p.get('_origen')}",
           f"👤 WhatsApp {wa} · asesora {p.get('vendedora') or '-'}",
           "🏷️ ETIQUETA SHALOM (lo que va al Excel / la boleta):",
           f"   Destinatario: {str(p.get('nombre') or '').upper()}",
           f"   N°DOC: {dni or '— (falta)'}",
           f"   Destino (código Shalom): {codigo or '— (falta)'}" + (f" · {'SEGURA' if cand and cand[0].get('seguro') else 'DUDOSA, candidatas: ' + ' | '.join(c['codigo'] for c in cand[:3])}" if cand else ""),
           f"   Mercadería: PAQUETE XXS · Cantidad: {p.get('kits') or 1}" + (f" · Qué lleva: {p.get('empaque')}" if p.get("empaque") else ""),
           f"   Adelanto: S/{adelanto} · Saldo: S/{saldo} · Clave: la del día (la da el dueño)",
           f"🏢 Lo que escribió el cliente de la agencia: {texto or '—'}",
           f"🔎 VERIFICAR AGENCIA (asesora o dueño, antes del OK): busca «{texto[:60]}» en https://shalom.com.pe/agencias y confirma que es «{codigo.split(' / ')[-1] if codigo else '…'}»; si no: «{primer}: agencia <nombre exacto>». Cambiarla después cuesta tiempo y plata."]
    if p.get("nota"):
        out.append(f"📝 Nota: {p.get('nota')}")
    if not corto:
        cab, hist, _ = _historial(wa, 40)
        out.append(f"🧾 Boleta: {_boleta(boletas, wa)} · Dinsides: {_estado_dinsides(lista, wa)} · pago: {p.get('pago') or '—'}")
        out.append(f"🗨️ Lo que escribió el cliente ({cab}):")
        out += [f"    {h}" for h in hist[-8:]]
    return "\n".join(out)


CSS_PDF = """@page{size:A4;margin:10mm} *{box-sizing:border-box} html,body{max-width:100%;overflow-x:hidden}
body{font-family:'Noto Sans','DejaVu Sans',sans-serif;font-size:12.5px;color:#111;margin:0;padding:0 10px;overflow-wrap:anywhere;word-break:break-word}
a{color:#1d4ed8;overflow-wrap:anywhere}
h1{font-size:20px;margin:6px 0 2px;color:#075E54} .sub{color:#666;margin:0 0 8px;font-size:11px}
h2{font-size:15px;border-bottom:2px solid #075E54;color:#075E54;margin:14px 0 6px;page-break-after:avoid}
h2.rojo{color:#b91c1c;border-color:#dc2626} h2.amb{color:#854d0e;border-color:#ca8a04} h2.gris{color:#555;border-color:#999;font-size:13px}
.cajas{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px} .cajas div{flex:1 1 30%;min-width:95px;border:1px solid #ddd;border-radius:6px;padding:5px 7px} .cajas b{display:block;font-size:20px;color:#075E54} .cajas span{color:#555;font-size:11px}
.ped{border:1px solid #bbb;border-radius:8px;padding:9px 10px;margin:8px 0;page-break-inside:avoid;max-width:100%}
.pagina .ped{page-break-before:always;page-break-inside:auto} .pagina .ped:first-of-type{page-break-before:auto} .notas,.ver,.porque,table.et,.chat{page-break-inside:avoid}
.ped.listo{border-left:8px solid #075E54} .ped.conf{border-left:8px solid #ca8a04;background:#fffbeb} .ped.pend{border-left:8px solid #dc2626;background:#fff5f5} .ped.ya{border-left:8px solid #999;color:#444}
.ped h3{margin:0 0 4px;font-size:16px;line-height:1.25} .ped .meta{color:#555;font-size:11px;margin-bottom:6px}
table.et{border-collapse:collapse;width:100%;margin:4px 0 8px;table-layout:fixed} table.et th{background:#075E54;color:#fff;text-align:left;padding:4px 7px;width:34%;font-weight:600;font-size:12px} table.et td{border:1px solid #bbb;padding:4px 7px;font-size:12.5px}
.ped.pend table.et th,.ped.conf table.et th{background:#444}
.porque{background:#fde68a;border:2px solid #ca8a04;border-radius:6px;padding:7px 9px;margin:8px 0;font-size:14px;font-weight:700;color:#78350f}
.ver{background:#dbeafe;border:2px solid #2563eb;border-radius:6px;padding:7px 9px;margin:8px 0;font-size:13px} .ver b{display:block;font-size:14px;color:#1e3a8a;margin-bottom:3px} .ver ol{margin:2px 0 0 18px;padding:0} .ver li{margin:3px 0}
.lin{margin:4px 0;font-size:12px} .lin.ases{background:#fef9c3;padding:4px 8px;border-radius:4px;font-weight:600} .lin.blq{color:#b91c1c;font-weight:700} .lin.al{color:#7c2d12}
.chat{font-family:'DejaVu Sans Mono',monospace;font-size:10px;color:#333;background:#f6f6f6;padding:6px 8px;border-radius:4px;margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere} .chat b{color:#075E54} .chat .tit{color:#666;font-family:sans-serif;letter-spacing:.3px}
.notas{margin-top:10px;border:2px dashed #888;border-radius:6px;padding:8px 10px} .notas b{display:block;margin-bottom:4px;color:#333;font-size:12px} .notas .opc{margin:4px 0 8px} .notas .opc span{display:inline-block;border:1.5px solid #555;border-radius:4px;padding:2px 10px;margin:0 8px 4px 0}
.notas .lineas{border-bottom:1px solid #bbb;height:7mm} .ctl{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 4px} .ctl label{border:1.5px solid #555;border-radius:6px;padding:5px 9px;cursor:pointer;font-size:13px} .ctl input[type=radio]{margin-right:4px}
textarea.nota{width:100%;max-width:100%;min-height:60px;font:inherit;font-size:13px;padding:6px;border:1px solid #888;border-radius:6px;display:block} .guardado{color:#075E54;font-weight:600;font-size:12px}
.sticky{position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:2px solid #075E54;z-index:2;font-size:13px}
pre{white-space:pre-wrap;font-family:inherit;margin:0;font-size:12px;overflow-wrap:anywhere}
@media print{body{padding:0} .sticky{position:static} textarea,.ctl{display:none}}"""

RE_ETIQ = re.compile(r"^(Negocio|ENTREGAR A|Teléfono|Producto|Cobrar|Distrito|Fecha Entrega|Detalle|Coordenadas|Destinatario|N°DOC|Destino|Mercadería|Adelanto):")


def _tarjeta_html(cab, cuerpo, E, interactivo=False, pdf_pagina=False):
    """Una tarjeta (pedido) a HTML: etiqueta en tabla, «por qué confirmar» en ámbar, VERIFICAR como llamada a la acción, chat, notas."""
    tipo = "ya" if "↩️" in cab else "pend" if ("❓" in cab and "✅" not in cab) else "conf" if "✅❓" in cab else "listo"
    wa = (re.search(r"WhatsApp (51\d{9})", "\n".join(cuerpo)) or re.search(r"(51\d{9})", cab) or [None, ""])[1]
    filas, otros, chat, meta = [], [], [], ""
    for x in cuerpo:
        xs = x.strip()
        if not xs or xs.startswith("🏷️ ETIQUETA") or xs.startswith("🗨️"):
            continue
        if RE_ETIQ.match(xs):
            k, v = xs.split(":", 1); filas.append((k, v.strip()))
        elif re.match(r"^\d\d-\d\d \d\d:\d\d [CV]:", xs):
            chat.append(xs)
        elif xs.startswith("👤"):
            meta = xs
        else:
            otros.append(xs)
    h = [f"<div class='ped {tipo}' data-wa='{E(wa)}'><h3>{E(cab)}</h3>"]
    if meta: h.append(f"<div class=meta>{E(meta)}</div>")
    m = re.search(r"✅❓ LISTO, pero confirmar(?: antes del OK)?: (.+)$", cab)
    if m: h.append(f"<div class=porque>⚠️ POR QUÉ HAY QUE CONFIRMAR: {E(m.group(1))}</div>")
    if filas: h.append("<table class=et>" + "".join(f"<tr><th>{E(k)}</th><td>{E(v)}</td></tr>" for k, v in filas) + "</table>")
    for o in otros:
        if o.startswith("🔎"):
            txt = o.replace("🔎 VERIFICAR (asesora o dueño, antes del OK): ", "").replace("🔎 VERIFICAR AGENCIA (asesora o dueño, antes del OK): ", "")
            link = re.search(r"https?://\S+", txt)
            paso2 = "¿Va por Dinsides (12–5 pm) o por el motorizado de confianza?" if tipo == "conf" and "hora" in cab.lower() else "Si algo no cuadra, escríbelo abajo (dirección, distrito, agencia, monto)."
            h.append("<div class=ver><b>🔎 VERIFICAR ANTES DEL OK (asesora o dueño)</b><ol>"
                     + f"<li>{E(txt.split(' · ¿')[0].split(' y confirma')[0])}" + (f" → <a href='{E(link.group(0))}'>abrir</a>" if link else "") + "</li>"
                     + f"<li>{E(paso2)}</li></ol></div>")
        else:
            cl = "ases" if o.startswith("📣") else "blq" if o.startswith("⛔") else "al" if o.startswith(("⚠️", "📝", "🏢", "🧾", "🏷️", "📄")) else ""
            h.append(f"<div class='lin {cl}'>{E(o)}</div>")
    # Orden del dueño (2026-11-09): etiqueta → verificar → botones y notas → al final el log del chat (momentos clave).
    if interactivo and wa:
        h.append("<div class=ctl>"
                 + "".join(f"<label><input type=radio name='d-{E(wa)}' value='{v}'>{t}</label>" for v, t in (("ok", "✅ OK, va así"), ("correccion", "✏️ Corrección"), ("no_va", "❌ No va"), ("ya_enviado", "📦 Ya se envió")))
                 + f"</div><textarea class=nota placeholder='Nota: dirección correcta, agencia, monto, motorizado, otra fecha…'></textarea><div class=guardado></div>")
    elif pdf_pagina:
        h.append("<div class=notas><b>Notas de revisión (marca y escribe; Claude las lee cuando le escribas en la sesión):</b>"
                 "<div class=opc><span>☐ OK, va así</span><span>☐ Corrección</span><span>☐ No va</span><span>☐ Ya se envió</span></div>"
                 "<div class=lineas></div><div class=lineas></div></div>")
    if chat:
        vis = chat if interactivo else chat[-14:]
        h.append("<div class=chat><b class=tit>Momentos clave del chat</b><br>" + "".join(("<b>" + E(c) + "</b><br>") if " C: " in c else (E(c) + "<br>") for c in vis) + "</div>")
    h.append("</div>")
    return "".join(h)


def _html(titulo, secciones, resumen=None, interactivo=False, revision=None):
    """PDF (una tarjeta por página) o página de revisión interactiva (misma tarjeta + OK / corrección / no va + nota)."""
    import html as _h
    E = _h.escape
    partes = [f"<h1>{E(titulo)}</h1><p class=sub>Tarot Store Perú · generado por dinsides.py presentar</p>"]
    if interactivo:
        partes.append("<div class=sticky>Marca en cada pedido <b>OK</b>, <b>Corrección</b> (y escribe qué), <b>No va</b> o <b>Ya se envió</b>. Se guarda solo. "
                      "Cuando termines, escribe lo que sea en la sesión (p. ej. «listo»): Claude lee estas notas antes de responder. <span id=total class=guardado></span></div>")
    if resumen:
        partes.append("<div class=cajas>" + "".join(f"<div><b>{E(str(v))}</b><span>{E(k)}</span></div>" for k, v in resumen) + "</div>")
    for t, lineas in secciones:
        lineas = [l for x in lineas for l in str(x).split("\n")]
        clase = "rojo" if ("PENDIENTE" in t or "CORRECCIONES" in t or "❌" in t) else "amb" if ("confirmar" in t.lower() or "NO CERRADAS" in t) else "gris" if ("CHATS DE HOY" in t or "YA REGISTRADOS" in t) else ""
        pagina = "pagina" if re.search(r"PARA REGISTRAR|SHALOM", t) else ""
        partes.append(f"<div class='{pagina}'><h2 class='{clase}'>{E(t)}</h2>")
        bloques, actual = [], []
        for ln in lineas:
            if re.match(r"^(\d+\.|[0-9]\ufe0f?\u20e3|\U0001F51F|1\ufe0f\u20e3[0-9]|🚨 |· )", ln) and actual:
                bloques.append(actual); actual = [ln]
            else:
                actual.append(ln)
        if actual:
            bloques.append(actual)
        for b_ in bloques:
            if not any(x.strip() for x in b_):
                continue
            cab = b_[0]
            if re.match(r"^(\d+\.|[0-9]\ufe0f?\u20e3|\U0001F51F)", cab) and len(b_) > 1:
                compacto = not any(RE_ETIQ.match(x.strip()) for x in b_[1:])  # pendiente sin datos de pedido: una línea + acción
                partes.append(_tarjeta_html(cab, b_[1:], E, interactivo and not compacto, pdf_pagina=bool(pagina) and not interactivo and not compacto))
            elif (cab.startswith("🚨 ") or cab.startswith("· ")) and "OTROS DÍAS" in t:
                wa = (re.search(r"(51\d{9})", cab) or [None, ""])[1]
                partes.append(f"<div class='ped {'conf' if cab.startswith('🚨') else 'ya'}' data-wa='{E(wa)}'><h3>{E(cab)}</h3>" + "".join(f"<div class=lin>{E(x)}</div>" for x in b_[1:] if x.strip())
                              + ("<div class=ctl>" + "".join(f"<label><input type=radio name='d-{E(wa)}' value='{v}'>{tt}</label>" for v, tt in (("ya_enviado", "📦 Ya se envió"), ("pendiente", "⏳ Sigue pendiente"), ("no_va", "❌ No va / falsa alarma")))
                                 + "</div><textarea class=nota placeholder='Nota…'></textarea><div class=guardado></div>" if interactivo and wa else "") + "</div>")
            else:
                partes.append("<pre>" + E("\n".join(x for x in b_ if x.strip())) + "</pre>")
        if "PENDIENTES, falta" in t and not interactivo:
            partes.append("<div class=notas><b>Notas sobre los pendientes (quién sí es venta, a quién pedirle el dato):</b><div class=lineas></div><div class=lineas></div><div class=lineas></div></div>")
        partes.append("</div>")
    js = ""
    if interactivo and revision:
        js = ("<script>const REV=" + json.dumps({"token": revision["token"], "api": revision["api"]}) + ";REV.id=location.pathname.split('/').pop().replace('.html','');"
              "const prev=" + json.dumps(revision.get("notas") or {}) + ";"
              "function guardar(p){const wa=p.dataset.wa;const r=p.querySelector('input[type=radio]:checked');const t=p.querySelector('textarea.nota');"
              "const g=p.querySelector('.guardado');g.textContent='guardando…';"
              "fetch(REV.api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:REV.id,token:REV.token,whatsapp:wa,decision:r?r.value:'',texto:t?t.value:''})})"
              ".then(x=>x.json()).then(x=>{g.textContent=x.ok?('guardado ✓ ('+x.guardadas+' notas)'):('error: '+(x.error||''));document.getElementById('total').textContent=x.ok?('Notas guardadas: '+x.guardadas):'';}).catch(()=>{g.textContent='sin conexión, reintenta';});}"
              "document.querySelectorAll('.ped[data-wa]').forEach(p=>{const wa=p.dataset.wa;if(prev[wa]){const r=p.querySelector(`input[value='${prev[wa].decision}']`);if(r)r.checked=true;const t=p.querySelector('textarea.nota');if(t)t.value=prev[wa].texto||'';}"
              "p.querySelectorAll('input[type=radio]').forEach(i=>i.addEventListener('change',()=>guardar(p)));const t=p.querySelector('textarea.nota');if(t){let h;t.addEventListener('input',()=>{clearTimeout(h);h=setTimeout(()=>guardar(p),900);});}});</script>")
    return "<!doctype html><html lang=es><head><meta charset='utf-8'><meta name=viewport content='width=device-width,initial-scale=1'><title>" + E(titulo) + "</title><style>" + CSS_PDF + "</style></head><body>" + "".join(partes) + js + "</body></html>"


def _pdf_y_subir(titulo, secciones, nombre, resumen=None):
    import base64, glob, shutil, subprocess, tempfile
    carpeta = tempfile.mkdtemp()
    ruta_html, ruta_pdf = os.path.join(carpeta, "p.html"), os.path.join(carpeta, nombre)
    open(ruta_html, "w", encoding="utf-8").write(_html(titulo, secciones, resumen))
    chrome = next((c for c in glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome") + ["/opt/pw-browsers/chromium"] if os.path.exists(c)), None) \
        or shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome") or "chromium"
    subprocess.run([chrome, "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={ruta_pdf}", ruta_html], check=True, capture_output=True)
    st, r = pedir("/reporte", "POST", {"pdf_base64": base64.b64encode(open(ruta_pdf, "rb").read()).decode(), "nombre": nombre, "titulo": titulo}, timeout=180)
    return ruta_pdf, (r.get("url") if st == 200 else f"(no se pudo subir: {st})")


def _pagina_revision(titulo, secciones, resumen, fecha, pedidos_rev):
    """Sube la página interactiva a CRM → Reportes y registra la revisión (id + token) en el Worker. Devuelve (url, id)."""
    import base64, secrets
    token = secrets.token_urlsafe(18)
    api = (os.environ.get("ASESOR_API_BASE") or "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor").replace("/api/asesor", "/api/revision/nota")
    nombre = f"revision-envios-{fecha}-{dt.datetime.now(LIMA).strftime('%H%M')}.html"
    html = _html(titulo, secciones, resumen, interactivo=True, revision={"token": token, "api": api})
    st, r = pedir("/reporte", "POST", {"archivo_base64": base64.b64encode(html.encode("utf-8")).decode(), "nombre": nombre, "titulo": titulo}, timeout=180)
    if st != 200:
        return f"(no se pudo subir la página: {st} {str(r)[:80]})", ""
    rid = str(r.get("id") or "").replace(".html", "")
    st2, r2 = pedir("/revision", "POST", {"id": rid, "token": token, "fecha": fecha, "pedidos": pedidos_rev})
    if st2 != 200:
        return f"{r.get('url')} (la revisión no se pudo registrar: {st2} {str(r2)[:80]})", rid
    return r.get("url"), rid


def cmd_notas(args):
    """dinsides.py notas <id|url de la página de revisión>: lo que la persona marcó en la página (OK / corrección / no va / ya se envió),
    agrupado para actuar: los OK van a salida.json (registrar), los «no va» a `marcar`, los «ya se envió» a `reporte.py enviado`, y
    las correcciones se leen y se aplican (dirección, distrito, agencia, monto, fecha, motorizado)."""
    rid = re.sub(r"^.*/r/", "", args[0]).replace(".html", "") if args else ""
    if not rid and os.path.exists("/tmp/dinsides/revision.json"):
        ult = json.load(open("/tmp/dinsides/revision.json"))
        rid = ult.get("id") or ""
        print(f"(última página de revisión: {ult.get('url')} · despacho {ult.get('fecha')} · creada {ult.get('creada')})")
    if not rid:
        sys.exit("Falta el id (o el link) de la página de revisión y no hay ninguna guardada en /tmp/dinsides/revision.json (corre antes `presentar --pagina`).")
    st, r = pedir(f"/revision?id={rid}")
    salir_si_error(st, r)
    if r.get("error"):
        sys.exit(f"❌ {r['error']}")
    nombres = {str(p.get("whatsapp") or "")[-9:]: p for p in r.get("pedidos", [])}
    notas = r.get("notas") or {}
    grupos = {"ok": [], "correccion": [], "no_va": [], "ya_enviado": [], "pendiente": [], "": []}
    for wa, n in notas.items():
        p = nombres.get(wa[-9:], {})
        grupos.setdefault(n.get("decision", ""), []).append((wa, p.get("nombre") or "?", p.get("tipo") or "", n.get("texto") or "", n.get("cuando")))
    print(f"📝 Revisión {rid} · despacho {r.get('fecha')} · {len(notas)} nota(s) de {len(nombres)} pedidos presentados")
    for k, titulo in (("ok", "✅ OK (se registran / entran al Excel tal cual)"), ("correccion", "✏️ CORRECCIONES (aplicar lo que dice y volver a presentar solo estos)"),
                      ("no_va", "❌ NO VA (marcar «no va» en la hoja; no se registra)"), ("ya_enviado", "📦 YA SE ENVIÓ (cerrar la fila con reporte.py enviado)"), ("pendiente", "⏳ SIGUE PENDIENTE"), ("", "(sin decisión, solo nota)")):
        if grupos.get(k):
            print(f"\n{titulo}:")
            for wa, nom, tipo, texto, cuando in grupos[k]:
                print(f"- {nom} · {wa} · {tipo}{' · «' + texto + '»' if texto else ''} · {cuando}")
    sin = [p for k9, p in nombres.items() if k9 not in {w[-9:] for w in notas}]
    if sin:
        print(f"\nSin nota todavía ({len(sin)}): " + ", ".join(f"{p.get('nombre')} {p.get('whatsapp')}" for p in sin[:30]))
    os.makedirs("/tmp/dinsides", exist_ok=True)
    json.dump({"id": rid, "fecha": r.get("fecha"), "notas": notas, "pedidos": r.get("pedidos")}, open("/tmp/dinsides/notas.json", "w"), ensure_ascii=False, indent=1)
    print("\nGuardado en /tmp/dinsides/notas.json. Lima: los OK + correcciones aplicadas → salida.json → `registrar`; Shalom: «OK» → `shalom.py masivo --subir` (con --agencias si corrigieron agencias).")


def cmd_presentar(args):
    """TODO lo que hay que mirar antes del OK, en el formato del dueño. Con --pagina (o --pdf, que es lo mismo): el detalle completo
    va a la PÁGINA DE REVISIÓN en CRM → Reportes (marcar OK / corrección / no va por pedido) y en pantalla sale la versión corta.
    El PDF para imprimir solo sale con --imprimir (dueño 2026-11-09: «si ya vas a mandar página, ya no mandas el PDF»)."""
    con_pdf = "--pdf" in args or "--pagina" in args
    con_impreso = "--imprimir" in args
    fecha = fecha_arg(args)
    st, r = pedir(f"/dinsides?fecha={fecha}" if fecha else "/dinsides")
    salir_si_error(st, r)
    fecha = r.get("fecha") or fecha
    fichas = r.get("pedidos", [])
    st2, l = pedir(f"/dinsides?listado=1&desde={(dt.date.fromisoformat(fecha) - dt.timedelta(days=12)).isoformat()}&hasta={(dt.date.fromisoformat(fecha) + dt.timedelta(days=30)).isoformat()}", timeout=240)
    lista = l.get("pedidos", []) if st2 == 200 else []
    st3, ag = pedir(f"/pedidos-sheet?hoy={fecha}&boletas=1")
    ag = ag if st3 == 200 else {}
    boletas = {str(b.get("whatsapp"))[-9:]: b for b in (ag.get("boletas") or [])}
    cands = r.get("candidatos_crm") or []
    listos = [f for f in fichas if f.get("listo")]
    pend = [f for f in fichas if not f.get("listo") and not f.get("ya_registrado")]
    ya = [f for f in fichas if f.get("ya_registrado")]
    ahora = dt.datetime.now(LIMA).strftime("%Y-%m-%d %H:%M")
    S, C = [], []  # secciones completas (PDF / pantalla larga) y cortas (pantalla con --pdf)

    def sec(titulo, lineas_largas, lineas_cortas=None):
        S.append((titulo, lineas_largas)); C.append((titulo, lineas_largas if lineas_cortas is None else lineas_cortas))

    cab = [f"📦 Entrega {fecha} · Lima: {len(listos)} para registrar · {len(pend)} pendientes · {len(ya)} ya registrados · generado {ahora} (Lima)"]
    if r.get("fecha_motivo"):
        cab.append(f"📆 Fecha {fecha} porque {r['fecha_motivo']}.")
    sec("RESUMEN", cab)
    i = 0
    if listos:
        L, Cc = [], []
        for f in listos:
            i += 1; L += [_bloque(i, f, lista, boletas), ""]; Cc += [_bloque(i, f, lista, boletas, corto=True), ""]
        sec(f"✅ LIMA — PARA REGISTRAR EN DINSIDES con tu OK ({len(listos)})", L, Cc)
    # Shalom va ANTES de los pendientes de Lima (dueño 2026-11-09: «los limas pendientes, en rojo, deben ir debajo de Shalom»)
    prov = _provincia_pedidos(fecha, ag, cands, boletas, lista)
    L, Cc = [], []
    for j, p in enumerate(prov, 1):
        L += [_bloque_shalom(j, p, lista, boletas), ""]; Cc += [_bloque_shalom(j, p, lista, boletas, corto=True), ""]
    ayer = (dt.date.fromisoformat(fecha) - dt.timedelta(days=1)).isoformat()
    ya_desp = [x for x in (ag.get("enviados_recientes") or []) if any(k in str(x.get("enviado") or "") for k in ("Shalom", "Olva", "boleta")) and (fecha in str(x.get("enviado") or "") or ayer in str(x.get("enviado") or ""))]
    pie_sh = [f"· Ya despachados o registrados a mano por el equipo el {ayer} o el {fecha} (no van al Excel): " + "; ".join(f"{x.get('nombre')} ({str(x.get('enviado'))[:40]})" for x in ya_desp)] if ya_desp else []
    sec(f"🚚 SHALOM (provincia) · despacho {fecha} · {len(prov)} pedido(s) por despachar (reporte + hoja + CRM) · el Excel se arma con «OK Shalom»", (L or ["Sin pedidos de provincia por despachar."]) + pie_sh, (Cc or ["Sin pedidos de provincia por despachar."]) + pie_sh)
    if pend:
        L, Cc, solo_info = [], [], 0
        for f in pend:
            i += 1; L += [_bloque(i, f, lista, boletas), ""]
            c = f.get("campos") or {}
            con_senal = bool(c.get("direccion") or c.get("coordenadas")) or bool(re.search(r"lima|provincia|separ|s[ií],? quiero|direcci|distrito|agencia", str(c.get("obs") or ""), re.I))
            if con_senal:
                Cc += [_bloque(i, f, lista, boletas, corto=True), ""]
            else:
                solo_info += 1
        if solo_info:
            Cc.append(f"… y {solo_info} chat(s) que solo pidieron precio o información, sin destino ni dirección (lista completa en la página). Son para seguimiento de ventas, no pedidos.")
        sec(f"❓ LIMA — PENDIENTES, falta un dato ({len(pend)}; no se registran)", L, Cc)
    if ya:
        sec("↩️ LIMA — YA REGISTRADOS (no se tocan)", ["; ".join(f"{(x.get('campos') or {}).get('nombre')} ({x['ya_registrado'].get('modo')} #{x['ya_registrado'].get('nro') or '-'})" for x in ya)])
    # Correcciones (datos que llegaron)
    corr = [x for x in (ag.get("hoy") or []) if "CORRECCION" in str(x.get("estado") or "").upper() or str(x.get("nota") or "").startswith("🚨 CORRECCIÓN")]
    if corr:
        sec(f"✏️ CORRECCIONES / DATOS QUE LLEGARON ({len(corr)}) — pedidos que no salieron en su día y ya tienen el dato",
            [f"🚨 {x.get('nombre')} · {x.get('whatsapp')} · {x.get('destino')} · venta {x.get('fecha_venta')} · fila {x.get('fila')} · {str(x.get('nota') or '')[:150]}\n    Dinsides: {_estado_dinsides(lista, x.get('whatsapp'))} · Boleta: {_boleta(boletas, x.get('whatsapp'))} · va en: {'Shalom de hoy' if x.get('destino') == 'PROVINCIA' else 'Dinsides de hoy'}" for x in corr])
    # Candidatos del CRM
    L = []
    en_shalom = {str(p_.get("whatsapp") or "")[-9:] for p_ in prov}
    for c_ in cands:
        wa = str(c_.get("whatsapp") or "")
        din = _estado_dinsides(lista, wa); bol = _boleta(boletas, wa); at = c_.get("atendido") or {}
        if wa[-9:] in en_shalom: ver = "🚚 PROVINCIA → ya está numerado en la sección SHALOM"
        elif at: ver = f"✔️ YA ATENDIDO ({at.get('modo')} {at.get('fecha')}{' #' + str(at.get('nro')) if at.get('nro') and at.get('nro') != 'MOTORIZADO' else ''})"
        elif "ENTREGADO" in din or "BOLETA EMITIDA" in bol: ver = "✔️ YA ATENDIDO (no es pedido nuevo)"
        elif "REGISTRADO" in din or "RUTA" in din: ver = "↩️ YA EN DINSIDES"
        elif c_.get("parece_provincia") or re.search(r"shalom|olva|agencia", " ".join(str(x) for x in (c_.get("senales") or [])), re.I): ver = "🚚 PROVINCIA → está numerado en la sección SHALOM"
        else: ver = "👀 REVISAR: señal de compra sin pedido en el reporte, Dinsides, boletas ni memoria → leer el chat: Lima con dirección → salida.json; provincia → shalom.py agregar; no compró → decirlo"
        senales_txt = "".join("\n    chat: " + re.sub(r"\s+", " ", str(x))[:120] for x in (c_.get("senales") or [])[:2])
        L.append(f"- {c_.get('nombre')} · {wa} · {c_.get('asesora') or '-'}{' · COMPRA MARCADA' if c_.get('compra_marcada') else ''} · {ver}\n    Dinsides: {din} · Boleta: {bol}" + senales_txt)
    crm_largo, crm_corto = (L or ["ninguno"]), ([x.split("\n")[0] for x in L if "👀 REVISAR" in x] or [f"{len(cands)} candidato(s) cruzados; ninguno nuevo por leer (detalle en la página)."])
    # Otros días sin despachar
    en_fichas = {f.get("whatsapp", "")[-9:] for f in fichas}
    abiertos = [x for k in ("atrasados", "futuros") for x in (ag.get(k) or []) if str(x.get("whatsapp") or "")[-9:] not in en_fichas]
    conf, noconf = [], []
    for x in abiertos[:60]:
        wa = str(x.get("whatsapp") or ""); fv = str(x.get("fecha_venta") or "")[5:10]
        cab_, hist, ultimo = _historial(wa, 30, desde=fv)
        nuevos = [h for h in hist if " C: " in h and (not fv or h[:5] > fv)]
        linea = (f"{'🚨' if nuevos else '·'} {x.get('nombre')} · {wa} · {x.get('destino')} · {x.get('estado')} · venta {x.get('fecha_venta')} · previsto {x.get('fecha_entrega')} · fila {x.get('fila')}"
                 f"\n    Dinsides: {_estado_dinsides(lista, wa, *_telefonos_en(x.get('nota')), *_telefonos_en(x.get('direccion_o_agencia')))} · Boleta: {_boleta(boletas, wa)} · nota: {str(x.get('nota') or '')[:90]}"
                 + "".join(f"\n    {h}" for h in nuevos[-4:]))
        (conf if str(x.get("estado") or "").upper().startswith("CONFIRMADO") else noconf).append((linea, bool(nuevos)))
    sec(f"📅 PEDIDOS CONFIRMADOS DE OTROS DÍAS AÚN SIN DESPACHAR ({len(conf)}) — 🚨 = el cliente escribió después de la venta",
        [l for l, _ in conf] or ["ninguno"], [l.split("\n")[0] for l, n in conf if n] or ["ninguno con mensaje nuevo"])
    sec(f"🟡 VENTAS NO CERRADAS DE OTROS DÍAS ({len(noconf)}) — solo dieron agencia o intención, sin pago (menos peso; se mira si escriben)",
        [l for l, _ in noconf] or ["ninguna"], [l.split("\n")[0] for l, n in noconf if n] or ["ninguna con mensaje nuevo"])
    # Chats de hoy
    chats_hoy = r.get("chats_hoy")
    cubiertos = en_fichas | {str(c_.get("whatsapp") or "")[-9:] for c_ in cands}
    if chats_hoy is None:
        sec("❌ CHATS DE HOY: el Worker NO pudo leerlos", ["revisar"])
    else:
        otros = [x for x in chats_hoy if str(x.get("whatsapp") or "")[-9:] not in cubiertos]
        L = [f"- {x.get('nombre') or '(sin nombre)'} · {x.get('whatsapp')} · {x.get('asesora') or '-'} · {x.get('mensajes_hoy')} msj · último {str(x.get('ultimo') or '')[5:16]}: {x.get('texto') or ''}{' · COMPRA MARCADA' if x.get('compra_marcada') else ''}" for x in otros[:80]]
        if len(otros) > 80: L.append(f"… y {len(otros) - 80} más")
        L.append("→ Si alguno habla de dirección, pago, agencia o fecha, léelo con `chat <whatsapp> 40` y decide.")
        sec(f"💬 CHATS DE HOY: {len(chats_hoy)} con mensaje del cliente · {len(chats_hoy) - len(otros)} ya están arriba · {len(otros)} restantes con su último mensaje", L,
            [f"{len(chats_hoy)} chats con mensaje hoy; {len(otros)} no son pedido ni candidato (lista completa en la página)."])
    sec(f"🔎 CRM REVISADO: {len(cands)} chat(s) con señal de compra que el reporte NO trae (cruzados con Dinsides, boletas y memoria)", crm_largo, crm_corto)
    # Lista de verificación
    est_ok, n_rep, ult = False, 0, "—"
    try:
        st_e, est_ = pedir(f"/ventas-estado?fecha={fecha}&tipo=pedidos"); est_ok = st_e == 200
        n_rep = len(((est_.get("estado") or {}).get("pedidos") or [])) if est_ok else 0
        corridas = ((est_.get("estado") or {}).get("corridas") or []) if est_ok else []
        ult = corridas[-1].get("cuando", "")[:16] if corridas else "—"
    except Exception:  # noqa: BLE001
        pass
    abiertas = sum(len(ag.get(k) or []) for k in ("atrasados", "hoy", "futuros", "sin_fecha"))
    V = [f"{'✅' if est_ok else '❌'} Reporte de ventas (estado del despacho {fecha}): {n_rep} pedidos · última corrida {ult}",
         f"{'✅' if st3 == 200 else '❌'} Hoja «Pedidos auto»: {abiertas} filas sin «Enviado» · {len(boletas)} boletas emitidas en «Boletas auto»",
         f"{'✅' if st2 == 200 else '❌'} Dinsides: {len(lista)} pedidos leídos · abiertos {sum(1 for x in lista if re.search('REGISTRADO|RUTA', str(x.get('seguimiento','')).upper()))} · anulados {sum(1 for x in lista if 'ANULADO' in str(x.get('seguimiento','')).upper())} · entregados {sum(1 for x in lista if 'ENTREGADO' in str(x.get('seguimiento','')).upper())}",
         f"{'✅' if chats_hoy is not None else '❌'} Chats de hoy: {len(chats_hoy) if chats_hoy is not None else '?'} · candidatos del CRM: {len(cands)} · chats de las fichas leídos: {len(fichas)}",
         "✅ Cruces: memoria del sistema (3 días) · Dinsides por teléfono, nombre y teléfonos alternos de la nota · boletas · hoja",
         "Responde: «OK» (registra los LISTOS de Lima) · «OK Shalom» o «OK Shalom clave NNNN» (arma y sube el Excel) · correcciones: «Nombre: dirección …», «Nombre: distrito …», «Nombre: agencia …», «Nombre: cobrar 69», «Nombre: miércoles», «Nombre: motorizado», «Nombre no va»"]
    sec("✅ LISTA DE VERIFICACIÓN (fuentes leídas en esta corrida)", V)
    if con_pdf:
        resumen = [("Lima para registrar", len(listos)), ("Lima pendientes", len(pend)), ("Ya registrados", len(ya)), ("Provincia (Shalom)", len(prov)), ("Correcciones", len(corr)), ("Chats de hoy", len(chats_hoy) if chats_hoy is not None else "?")]
        pedidos_rev = [{"whatsapp": f.get("whatsapp"), "nombre": (f.get("campos") or {}).get("nombre"), "tipo": "lima"} for f in listos + pend] \
            + [{"whatsapp": p_.get("whatsapp"), "nombre": p_.get("nombre"), "tipo": "shalom"} for p_ in prov] \
            + [{"whatsapp": x.get("whatsapp"), "nombre": x.get("nombre"), "tipo": "otro_dia"} for x in abiertos[:60]]
        url_rev, rid = _pagina_revision(f"Revisión de envíos {fecha}", S, resumen, fecha, pedidos_rev)
        links = [f"Revisar y marcar: {url_rev}", "Marca OK / corrección / no va en cada pedido; se guarda solo. Cuando termines, escribe cualquier cosa en la sesión: Claude lee las notas antes de responder."]
        if con_impreso:
            ruta, url = _pdf_y_subir(f"Envíos {fecha} — presentación completa", S, f"envios-{fecha}-{dt.datetime.now(LIMA).strftime('%H%M')}.pdf", resumen)
            links.insert(1, f"PDF para imprimir (una hoja por pedido, con casilla de notas): {url}")
        if rid:
            os.makedirs("/tmp/dinsides", exist_ok=True)
            json.dump({"id": rid, "url": url_rev, "fecha": fecha, "creada": ahora}, open("/tmp/dinsides/revision.json", "w"), ensure_ascii=False, indent=1)
        C.insert(1, ("📝 PÁGINA DE REVISIÓN", links))
        for t, lineas in C:
            print(f"══════ {t} ══════"); print("\n".join(lineas)); print()
    else:
        for t, lineas in S:
            print(f"══════ {t} ══════"); print("\n".join(lineas)); print()


def main():
    a = sys.argv[1:]
    cmd, resto = (a[0], a[1:]) if a else ("", [])
    if cmd == "preparar":
        cmd_preparar(resto)
    elif cmd == "presentar":
        cmd_presentar(resto)
    elif cmd == "notas" and resto:
        cmd_notas(resto)
    elif cmd == "chat" and resto:
        cmd_chat(*resto[:2])
    elif cmd == "zona" and resto:
        cmd_zona(" ".join(resto))
    elif cmd == "registrar":
        cmd_registrar(resto)
    elif cmd == "script":
        cmd_registrar(resto, accion="script")
    elif cmd == "probar":
        cmd_probar()
    elif cmd == "marcar" and resto:
        cmd_marcar(resto)
    elif cmd == "quitar" and resto:
        cmd_quitar(resto)
    elif cmd == "telegram" and resto:
        cmd_telegram(" ".join(resto))
    elif cmd == "estados":
        cmd_estados(resto)
    elif cmd == "listado":
        cmd_listado(resto)
    elif cmd == "anular" and resto:
        cmd_anular(resto)
    elif cmd == "editar" and len(resto) >= 2:
        cmd_editar(resto)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()

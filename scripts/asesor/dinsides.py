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
import datetime as dt, json, os, re, sys, urllib.error, urllib.request

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
                          r"separ|pedido|kit|mazo|collar|descuento|dni|agencia|\d{3,}", re.I)
RE_VENDEDORA_UTIL = re.compile(r"agendad|queda|mañana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|horario|cobr|pag[oó] completo|sin cobrar", re.I)


def _historial(wa, n=60):
    """Lo que escribió EL CLIENTE (con fecha y hora) que sirve para decidir: dirección, hora, fecha, pago, cambios; y las líneas de la
    vendedora que fijan algo (agendado, horario, cobro). Devuelve (encabezado, líneas)."""
    st, r = pedir(f"/chat?telefono={wa[-9:]}&mensajes={n}&largo=1")
    if st != 200 or not r.get("encontrado"):
        return "chat no encontrado", []
    cab = f"etiquetas: {r.get('etiquetas') or '-'} · ventana {r.get('ventana')}"
    lineas = []
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
        if quien == "C" and (t in ("location", "image") or RE_RELEVANTE.search(cuerpo)):
            lineas.append(f"{m.get('created_at', '')[5:16]} C: {cuerpo[:170]}")
        elif quien == "V" and RE_VENDEDORA_UTIL.search(cuerpo) and not re.search(r"\[image\]|Hola bell|está en \*S/|Claro bell|incluye el mazo|motorizado se estará", cuerpo):
            lineas.append(f"{m.get('created_at', '')[5:16]} V: {cuerpo[:140]}")
    return cab, lineas[-12:]


def _estado_dinsides(lista, tel, wa):
    xs = [x for x in lista if x.get("telefono") in (tel, wa[-9:])]
    if not xs:
        return "sin pedido en Dinsides (ni abierto ni anulado)"
    xs.sort(key=lambda x: x.get("fecha_pedido", ""), reverse=True)
    return "; ".join(f"#{x['id_pedido']} {x['seguimiento']} (registrado {x['fecha_pedido'][:10]}, entrega {x['fecha_entrega']})" for x in xs[:3])


def _bloque(i, f, lista):
    c = f.get("campos") or {}
    tel = c.get("telefono") or f.get("whatsapp", "")[-9:]
    estado = "LISTO" if f.get("listo") else ("YA REGISTRADO" if f.get("ya_registrado") else "PENDIENTE")
    fuentes = f.get("distrito_fuentes") or {}
    fuente = "pin" if fuentes.get("pin") else "mapa (dirección ubicada)" if fuentes.get("geocodificado") else "texto" if fuentes.get("texto") else "—"
    out = [f"{i}) {(c.get('nombre') or '').upper()} – {(c.get('distrito') or 'SIN DISTRITO').title()} · {estado}",
           f"Cliente: {c.get('nombre')} · {tel} · WhatsApp {f.get('whatsapp')} · asesora {f.get('asesora') or '-'}",
           f"Dirección: {c.get('direccion') or '— (sin dirección en texto)'}" + (f" · pin {c.get('coordenadas')}" if c.get("coordenadas") else ""),
           f"Distrito Dinsides: {c.get('distrito') or '—'} (por {fuente})",
           f"Producto: {c.get('producto')} | Cobrar: S/{c.get('cobrar')} {c.get('tipo_pago')} | Entrega: {c.get('fecha_entrega')} | Tipo: {c.get('tipo_pedido')}",
           f"Nota que verá el motorizado: {c.get('obs') or '—'}"]
    cab, hist = _historial(f.get("whatsapp", ""))
    out.append(f"Lo que escribió el cliente ({cab}):")
    out += [f"   {h}" for h in hist] or ["   (nada relevante en los últimos 60 mensajes)"]
    out.append(f"Dinsides: {_estado_dinsides(lista, tel, f.get('whatsapp', ''))}")
    if f.get("hoja"):
        out.append(f"Hoja «Pedidos auto»: fila {f['hoja'].get('fila')} · Dinsides: {f['hoja'].get('dinsides') or '—'} · Enviado: {f['hoja'].get('enviado') or '—'}")
    for b in f.get("bloqueos", []):
        out.append(f"⛔ {b}")
    for a in f.get("alertas", []):
        out.append(f"· {a}")
    if f.get("ya_registrado"):
        out.append(f"↩️ Ya registrado: {json.dumps(f['ya_registrado'], ensure_ascii=False)[:160]}")
    out.append("Decisión: " + ("se registra con el OK" if f.get("listo") else "no se toca (ya registrado)" if f.get("ya_registrado") else "PENDIENTE: resolver el ⛔ (leer el chat de arriba; si falta el dato, preguntar)"))
    return "\n".join(out)


def cmd_presentar(args):
    """Imprime, en el formato que el dueño pidió, TODO lo que hay que mirar antes del OK: fichas completas con el historial del chat,
    el estado en Dinsides y en la hoja; pendientes; ya registrados en una línea; candidatos del CRM; y los pedidos pendientes de otros
    días cuyo cliente escribió (datos que llegaron). La Routine PEGA esta salida tal cual y solo agrega su lectura."""
    fecha = fecha_arg(args)
    st, r = pedir(f"/dinsides?fecha={fecha}" if fecha else "/dinsides")
    salir_si_error(st, r)
    fecha = r.get("fecha") or fecha
    fichas = r.get("pedidos", [])
    st2, l = pedir(f"/dinsides?listado=1&desde={(dt.date.fromisoformat(fecha) - dt.timedelta(days=12)).isoformat()}&hasta={(dt.date.fromisoformat(fecha) + dt.timedelta(days=30)).isoformat()}", timeout=240)
    lista = l.get("pedidos", []) if st2 == 200 else []
    listos = [f for f in fichas if f.get("listo")]
    pend = [f for f in fichas if not f.get("listo") and not f.get("ya_registrado")]
    ya = [f for f in fichas if f.get("ya_registrado")]
    print(f"DINSIDES · entrega {fecha} · {len(listos)} para registrar · {len(pend)} pendientes · {len(ya)} ya registrados · Dinsides consultado: {'sí' if st2 == 200 else 'NO'} ({len(lista)} pedidos del negocio en el rango)\n")
    i = 0
    if listos:
        print("══ PARA REGISTRAR (con el OK) ══")
        for f in listos:
            i += 1; print(_bloque(i, f, lista)); print()
    if pend:
        print("══ PENDIENTES (falta un dato o confirmación; NO se registran) ══")
        for f in pend:
            i += 1; print(_bloque(i, f, lista)); print()
    if ya:
        print("══ YA REGISTRADOS (no se tocan): " + "; ".join(f"{(x.get('campos') or {}).get('nombre')} ({x['ya_registrado'].get('modo')} #{x['ya_registrado'].get('nro') or '-'})" for x in ya) + "\n")
    cands = r.get("candidatos_crm") or []
    print(f"══ CRM REVISADO: {len(cands)} chat(s) con señal de compra que el reporte NO trae ══")
    for c_ in cands:
        print(f"- {c_.get('nombre')} · {c_.get('whatsapp')} · {c_.get('asesora') or '-'}{' · COMPRA MARCADA' if c_.get('compra_marcada') else ''}{' · parece PROVINCIA' if c_.get('parece_provincia') else ''}: " + " / ".join(str(x)[:90] for x in (c_.get("senales") or [])[:2]))
    # Pedidos pendientes de otros días con mensaje nuevo del cliente (datos que llegaron, reclamos, cambios de fecha).
    st3, ag = pedir(f"/pedidos-sheet?hoy={fecha}")
    if st3 == 200:
        en_fichas = {f.get("whatsapp", "")[-9:] for f in fichas}
        # Solo los de OTROS días (atrasados y futuros): los de la fecha ya están en las fichas o en el Shalom del día.
        abiertos = [x for k in ("atrasados", "futuros") for x in (ag.get(k) or []) if str(x.get("whatsapp") or "")[-9:] not in en_fichas]
        con_msg = []
        desde = (dt.datetime.now(LIMA) - dt.timedelta(hours=36)).strftime("%m-%d %H:%M")
        for x in abiertos[:60]:
            cab, hist = _historial(str(x.get("whatsapp") or ""), 20)
            nuevos = [h for h in hist if h.startswith(" ") is False and h[:11] >= desde and " C: " in h]
            if nuevos:
                con_msg.append((x, nuevos))
        print(f"\n══ PEDIDOS PENDIENTES DE OTROS DÍAS CON MENSAJE NUEVO DEL CLIENTE (últimas 36 h): {len(con_msg)} ══ (revisados {min(len(abiertos), 60)} pendientes de la hoja)")
        for x, nuevos in con_msg:
            print(f"- {x.get('nombre')} · {x.get('whatsapp')} · {x.get('destino')} · {x.get('estado')} · previsto {x.get('fecha_entrega')} · fila {x.get('fila')} · nota: {str(x.get('nota') or '')[:80]}")
            for h in nuevos[-4:]:
                print(f"     {h}")
            print("     → si es el dato que faltaba o un cambio, decirlo al dueño con la decisión (Lima: agregar a salida.json; provincia: va al próximo Shalom)")
    print("\nVerificaciones hechas por el sistema: fichas armadas desde el reporte + hoja + chat; cruce con Dinsides (abiertos y anulados) por teléfono y nombre;"
          " CRM revisado (candidatos); pendientes de la hoja con mensaje nuevo. Lo que falta: leer los ⛔ y decidir.")


def main():
    a = sys.argv[1:]
    cmd, resto = (a[0], a[1:]) if a else ("", [])
    if cmd == "preparar":
        cmd_preparar(resto)
    elif cmd == "presentar":
        cmd_presentar(resto)
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

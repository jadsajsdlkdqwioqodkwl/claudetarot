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
    python3 scripts/asesor/dinsides.py chat <whatsapp|conversation_id> [N]   -> los últimos N mensajes de un chat (para resolver una duda).
    python3 scripts/asesor/dinsides.py zona <lat,lng | link de Maps>         -> en qué zona del mapa de cobertura de Dinsides cae.
    python3 scripts/asesor/dinsides.py registrar [/tmp/dinsides/salida.json] [--simular] [--forzar]
        -> Manda al Worker lo que decidiste: {"fecha": "AAAA-MM-DD", "pedidos": [{"whatsapp": "51…", "distrito": "Comas",
           "direccion": "…", "coordenadas": "-12.1,-77.0", "nombre": "…", "telefono": "9…", "cobrar": 89, "tipo_pago": "YAPE",
           "nota": "…", "fecha_entrega": "AAAA-MM-DD", "kits": 1, "empaque": "…", "estado": "CONFIRMADO"}], "marcar": [...]}.
           Solo pone lo que corriges; lo demás lo completa el Worker. Sin "pedidos" registra todos los listos de la fecha.
           El Worker registra en Dinsides los que quedan sin bloqueos (un solo listado), guarda la memoria y marca la hoja.
           --simular: hace todo menos el POST final a Dinsides (pedido de prueba sin crear nada). --forzar: registra aunque haya
           bloqueos de dirección/distrito (nunca con teléfono inválido o provincia); úsalo solo si una persona lo pidió.
           Si el Worker no tiene credenciales de Dinsides, deja el script de consola en --dir/consola.js para pegarlo a mano.
    python3 scripts/asesor/dinsides.py probar                                -> entra a Dinsides y lee el formulario real, sin registrar.
    python3 scripts/asesor/dinsides.py script [/tmp/dinsides/salida.json]    -> solo el script de consola (F12) de los listos.
    python3 scripts/asesor/dinsides.py marcar <whatsapp> [nro] [motivo…]      -> alguien lo registró a mano: queda en la memoria.
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
import datetime as dt, json, os, sys, urllib.error, urllib.request

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
        return {}, ruta
    try:
        return json.load(open(ruta)), ruta
    except ValueError as err:
        sys.exit(f"No se pudo leer {ruta}: {err}")


def _imprimir_resultado(r, carpeta):
    for x in r.get("registrados", []):
        print(f"✅ Registrado en Dinsides: {x.get('nombre')} · {x.get('whatsapp')} · {x.get('distrito')} · entrega {x.get('fecha_entrega')} · S/{x.get('cobrar')} {x.get('tipo_pago')}")
        for a in x.get("alertas", []):
            print(f"    · {a}")
    if r.get("simulado"):
        print(f"🧪 SIMULACIÓN: no se registró nada. Listado armado para {len(r.get('listos', []))} pedido(s); negocio {r.get('formulario', {}).get('negocio')}, "
              f"traslado {json.dumps(r.get('formulario', {}).get('recojo', {}), ensure_ascii=False)[:200]}")
        for x in r.get("listos", []):
            print(f"   - {json.dumps(x.get('campos'), ensure_ascii=False)}")
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
    if datos.get("fecha") or fecha_arg(args):
        body["fecha"] = datos.get("fecha") or fecha_arg(args)
    if datos.get("pedidos"):
        body["pedidos"] = datos["pedidos"]
    if "--simular" in args:
        body["simular"] = True
    if "--forzar" in args:
        body["forzar"] = True
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


def main():
    a = sys.argv[1:]
    cmd, resto = (a[0], a[1:]) if a else ("", [])
    if cmd == "preparar":
        cmd_preparar(resto)
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

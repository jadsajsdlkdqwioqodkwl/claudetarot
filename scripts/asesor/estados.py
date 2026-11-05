#!/usr/bin/env python3
"""
Estados de envío desde los paneles del courier (dueño, 2026-11-02 / 2026-11-05): lo que el panel de Lima («Incides») y
Shalom Pro dicen de cada pedido (entregado, cancelado, en agencia, devuelto) se copia al sistema sin escribirle al cliente.
Lo corre una Routine MANUAL con Claude Cowork en la computadora del dueño (el navegador con su sesión iniciada): Cowork
lee los paneles, escribe /tmp/estados/leido.json y este script hace el resto. Nunca contraseñas en el repo ni en la nube.

    ASESOR_CLAVE=... python3 scripts/asesor/estados.py pendientes [--dias 21]
        → JSON con lo que el sistema espera que esté en camino: filas de «Pedidos auto» sin «Enviado» (atrasados, hoy,
          futuros) con whatsapp, nombre, destino, fecha. Es la lista que Cowork cruza con los paneles.
    python3 scripts/asesor/estados.py cruzar /tmp/estados/leido.json
        → leido.json = [{"whatsapp": "51…" | "telefono": "9…" | "dni": "…", "nombre": "…", "estado": "entregado|cancelado|en_agencia|devuelto|pagado",
                          "fecha": "AAAA-MM-DD", "courier": "Lima|Shalom|Olva", "nota": "…"}]
          Para cada uno: encuentra el chat (teléfono / DNI), cierra la fila de «Pedidos auto» (columna «Enviado»: «sí FECHA
          COURIER ESTADO»), pone el estado en la pestaña Ventas si hay DNI (ventas.py estado) y etiqueta el chat
          (entregado / cancelado / en_agencia / devuelto) por POST /api/asesor/mandar tipo etiqueta. Idempotente: lo que ya
          está marcado no se vuelve a tocar. Lo que no encuentra queda en `no_encontrados`.
          Deja /tmp/estados/resultado.json y lo imprime.
    python3 scripts/asesor/estados.py resumen [/tmp/estados/resultado.json]
        → aviso corto al dueño por Telegram (reporte.py aviso): entregados, cancelados, en agencia, devueltos, no encontrados.

Entrega de los bonos (clases y libros) a los de Lima ya pagados: este script NO comparte nada en Drive. La carpeta de los
bonos se comparte «con el link» (lector) y el link se manda por el chat con la rápida de entrega de bonos (pendiente de que
el dueño pase el link); `cruzar` deja en `bonos_pendientes` los chats de Lima entregados/pagados que aún no recibieron el
mensaje con el link, para que la Routine lo proponga en ✨ Sugerencias (nunca se manda solo).
"""
import datetime as dt, json, os, re, subprocess, sys, urllib.error, urllib.parse, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
API = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor"
ESTADOS = {"entregado": "Entregado", "cancelado": "Cancelado", "en_agencia": "En destino", "devuelto": "Devuelto", "pagado": "Pagado"}
ETIQUETAS = {"entregado": "entregado", "cancelado": "cancelado", "en_agencia": "en_agencia", "devuelto": "devuelto", "pagado": "entregado"}


def clave():
    c = os.environ.get("ASESOR_CLAVE", "")
    if not c:
        sys.exit("Falta ASESOR_CLAVE en el entorno.")
    return c


def pedir(ruta, method="GET", body=None, timeout=90):
    datos = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + ruta, data=datos, method=method,
                                 headers={"x-asesor-clave": clave(), "User-Agent": "tarot-asesor/1.0", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as err:
        try:
            return err.code, json.loads(err.read().decode())
        except ValueError:
            return err.code, {"error": f"HTTP {err.code}"}


def nueve(x):
    return re.sub(r"\D", "", str(x or ""))[-9:]


def hoy_lima():
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=5)).date().isoformat()


def cmd_pendientes(args):
    st, ag = pedir(f"/pedidos-sheet?hoy={hoy_lima()}")
    if st != 200:
        sys.exit(json.dumps(ag, ensure_ascii=False))
    filas = []
    for k in ("atrasados", "hoy", "futuros", "sin_fecha"):
        for r in ag.get(k) or []:
            filas.append({"grupo": k, "fecha_entrega": r.get("fecha_entrega"), "nombre": r.get("nombre"), "whatsapp": r.get("whatsapp"),
                          "destino": r.get("destino"), "estado": r.get("estado"), "fila": r.get("fila"), "dni": r.get("dni"), "courier": r.get("courier")})
    print(json.dumps({"hoy": hoy_lima(), "pendientes": len(filas), "filas": filas}, ensure_ascii=False, indent=1))


def chat_de(telefono=None, dni=None):
    if dni:
        st, r = pedir(f"/buscar-dni?dni={re.sub(r'[^0-9A-Za-z]', '', dni)}")
        if st == 200 and r.get("encontrado"):
            return r
    tel = nueve(telefono)
    if len(tel) == 9:
        st, r = pedir("/chat?" + urllib.parse.urlencode({"telefono": tel, "mensajes": 1}))
        if st == 200 and r.get("encontrado"):
            return r
    return None


def cmd_cruzar(args):
    ruta = args[0] if args else "/tmp/estados/leido.json"
    leido = json.load(open(ruta, encoding="utf-8"))
    if not isinstance(leido, list):
        sys.exit("leido.json debe ser una lista de pedidos leídos del panel.")
    hoy = hoy_lima()
    res = {"hoy": hoy, "aplicados": [], "ya_estaban": [], "no_encontrados": [], "errores": [], "bonos_pendientes": []}
    for item in leido:
        estado = str(item.get("estado") or "").strip().lower()
        if estado not in ESTADOS:
            res["errores"].append({**item, "motivo": f"estado desconocido: {estado} (usa {', '.join(ESTADOS)})"})
            continue
        chat = chat_de(item.get("whatsapp") or item.get("telefono"), item.get("dni"))
        if not chat:
            res["no_encontrados"].append(item)
            continue
        wa = chat.get("wa_id")
        etiquetas = f" {chat.get('etiquetas') or ''} "
        fecha = item.get("fecha") or hoy
        courier = item.get("courier") or "Lima"
        hecho = {"whatsapp": wa, "nombre": item.get("nombre") or chat.get("nombre"), "estado": estado, "pasos": []}
        # 1. Columna «Enviado» de «Pedidos auto» (solo la fila abierta; si no hay, no pasa nada).
        st, r = pedir("/pedidos-sheet", "POST", {"marcar": [{"whatsapp": wa, "enviado": f"sí {fecha} {courier} {estado}"}]})
        hecho["pasos"].append("pedidos_auto: " + ("cerrada" if st == 200 and not r.get("sin_fila") else "sin fila abierta"))
        # 2. Pestaña Ventas (provincia, por DNI): estado que ve el cliente en su link.
        if item.get("dni"):
            st, r = pedir("/ventas", "POST", {"accion": "estado", "dni": re.sub(r"\D", "", str(item["dni"])), "estado": ESTADOS[estado]})
            hecho["pasos"].append("ventas: " + ("ok" if st == 200 and r.get("ok") else str(r.get("error") or st)))
        # 3. Etiqueta del chat (sin escribirle al cliente). Idempotente.
        etiqueta = ETIQUETAS[estado]
        if f" {etiqueta} " in etiquetas:
            hecho["pasos"].append(f"etiqueta {etiqueta}: ya estaba")
            res["ya_estaban"].append(hecho)
        else:
            st, r = pedir("/mandar", "POST", {"tipo": "etiqueta", "conversation_id": chat.get("conversation_id"), "etiqueta": etiqueta})
            hecho["pasos"].append(f"etiqueta {etiqueta}: " + ("ok" if st == 200 else str(r.get("error") or st)))
            res["aplicados"].append(hecho)
        # 4. Bonos: Lima entregado/pagado sin el mensaje de bonos todavía → lista para proponer el link (no se manda solo).
        if estado in ("entregado", "pagado") and str(courier).lower().startswith("lima") and " bonos_enviados " not in etiquetas:
            res["bonos_pendientes"].append({"whatsapp": wa, "nombre": hecho["nombre"], "conversation_id": chat.get("conversation_id")})
    os.makedirs("/tmp/estados", exist_ok=True)
    json.dump(res, open("/tmp/estados/resultado.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({k: (len(v) if isinstance(v, list) else v) for k, v in res.items()}, ensure_ascii=False))
    if res["no_encontrados"]:
        print("No encontrados:", json.dumps(res["no_encontrados"], ensure_ascii=False))


def cmd_resumen(args):
    ruta = args[0] if args else "/tmp/estados/resultado.json"
    res = json.load(open(ruta, encoding="utf-8"))
    cuenta = {}
    for h in res.get("aplicados", []):
        cuenta[h["estado"]] = cuenta.get(h["estado"], 0) + 1
    partes = [f"{ESTADOS[k]}: {v}" for k, v in cuenta.items()] or ["sin cambios"]
    texto = (f"Estados de envío ({res.get('hoy')}): " + ", ".join(partes)
             + (f"; ya estaban: {len(res.get('ya_estaban', []))}" if res.get("ya_estaban") else "")
             + (f"; NO encontrados en el sistema: {len(res['no_encontrados'])} → " + ", ".join(str(x.get('nombre') or x.get('whatsapp') or x.get('dni')) for x in res["no_encontrados"][:8]) if res.get("no_encontrados") else "")
             + (f"; Lima entregados sin link de bonos: {len(res['bonos_pendientes'])}" if res.get("bonos_pendientes") else ""))
    r = subprocess.run([sys.executable, os.path.join(AQUI, "reporte.py"), "aviso", texto], text=True, capture_output=True)
    print(texto)
    if r.returncode:
        print(r.stderr or r.stdout, file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("pendientes", "cruzar", "resumen"):
        sys.exit(__doc__)
    {"pendientes": cmd_pendientes, "cruzar": cmd_cruzar, "resumen": cmd_resumen}[sys.argv[1]](sys.argv[2:])

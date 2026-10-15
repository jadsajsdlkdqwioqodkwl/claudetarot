"""
Lista de llamadas de URO (Routine cada hora, con el plan de Claude, SIN API de IA).

Paso 0, barato (no toca la hoja): `llamadas.py gate` imprime SIN_NOVEDAD o HAY_MOVIMIENTO N.
Solo si hay movimiento se lee la hoja y se corre `preparar`.

La hoja «URO - Lista de llamadas» (pestañas Llamadas y Estado) es la memoria:
este script decide, sin gastar lectura del modelo, QUÉ chats tienen algo nuevo
desde la última corrida; el modelo solo lee esos, escribe el resumen y el
speech, y los pone en la hoja con el conector de Sheets.

    ASESOR_CLAVE=... python3 scripts/uro/llamadas.py preparar \
        --estado estado.json --filas filas.json --salida /tmp/uro

  estado.json = lo que devuelve get_values de Estado!A2:B (wa, último id leído)
  filas.json  = lo que devuelve get_values de Llamadas!B2:B (teléfonos, fila = lugar + 2)

Escribe /tmp/uro/chats.txt (solo lo nuevo) y /tmp/uro/plan.json. Si no hay nada
nuevo imprime SIN_NOVEDAD y no hay nada que leer ni escribir.
"""
import argparse, datetime as dt, json, os, re, sys, urllib.error, urllib.request

API = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/chats"
LINEA_URO = 1  # conversations.linea_id del número de URO (+51 940 028 332)

# Saludo del anuncio: no cuenta como interés.
RE_SALUDO = re.compile(r"^[¡!\s]*hola[!.,\s]*(quiero|me gustar[ií]a|quisiera|buenas)?.{0,30}(informaci[oó]n( sobre esto)?|hacer mi pedido)[.!\s]*$", re.I)
RE_AUTO = re.compile(r"autom[aá]tic|masivo|carrito|prueba de bienvenida", re.I)
MAX_MSGS_CHAT = 60
# Números que NO son clientes (pruebas del equipo, cuentas internas): nunca van a la lista.
INTERNOS = {
    "51927633099",  # número del Yape del negocio (chat de prueba «uwu»)
    "51930575181",  # «Juan Conde»: prueba de la bienvenida (la vendedora lo saluda como prueba)
    "51935070774",  # cuenta veronika (vendedora de URO)
}


def valores(ruta):
    """Acepta la respuesta cruda de get_values ({"values": [...]}) o la lista sola."""
    try:
        d = json.load(open(ruta))
    except (OSError, ValueError):
        return []
    if isinstance(d, dict):
        d = d.get("values", [])
    return [r for r in d if isinstance(r, list)]


def solo_digitos(x):
    return re.sub(r"\D", "", str(x).replace(".0", ""))


def leer_api(dias):
    clave = os.environ.get("ASESOR_CLAVE", "")
    if not clave:
        sys.exit("Falta ASESOR_CLAVE en el entorno.")
    req = urllib.request.Request(f"{API}?dias={dias}&linea={LINEA_URO}",
                                 headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)["filas"]
    except urllib.error.HTTPError as err:
        sys.exit(f"El Worker rechazó la consulta ({err.code}): {err.read().decode()[:200]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["gate", "preparar"])
    ap.add_argument("--gate-horas", type=int, default=3, help="gate: ventana de movimiento a mirar (solapa corridas caídas)")
    ap.add_argument("--estado", default="")
    ap.add_argument("--filas", default="")
    ap.add_argument("--salida", default="/tmp/uro")
    ap.add_argument("--dias", type=int, default=14, help="el Worker da hasta 14")
    ap.add_argument("--max", type=int, default=20, help="chats por corrida (el resto sale en la siguiente)")
    a = ap.parse_args()

    if a.cmd == "gate":
        # Compuerta barata (sin leer la hoja): ¿algún chat con interés escribió en las últimas N horas?
        corte = (dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) - dt.timedelta(hours=5 + a.gate_horas)).strftime("%Y-%m-%d %H:%M:%S")
        por_chat = {}
        for f in leer_api(a.dias):
            por_chat.setdefault(f["wa"], []).append(f)
        movimiento = 0
        for wa, ms in por_chat.items():
            if wa in INTERNOS:
                continue
            cli = [m for m in ms if m["quien"] == "Cliente"]
            if any(m["tipo"] != "text" or not RE_SALUDO.match(m["msg"].strip()) for m in cli) and any(m["t"] >= corte for m in cli):
                movimiento += 1
        print(f"HAY_MOVIMIENTO {movimiento}" if movimiento else "SIN_NOVEDAD")
        return

    estado = {solo_digitos(r[0]): int(solo_digitos(r[1]) or 0) for r in valores(a.estado) if len(r) >= 2 and r[0] != ""}
    fila_de = {solo_digitos(r[0]): i + 2 for i, r in enumerate(valores(a.filas)) if r and r[0] != ""}

    chats = {}
    for f in leer_api(a.dias):
        chats.setdefault(f["wa"], []).append(f)

    pendientes, compraron, omitidos = [], [], 0
    for wa, ms in chats.items():
        if wa in INTERNOS:
            continue
        cli = [m for m in ms if m["quien"] == "Cliente"]
        # Mínimo de interés: escribió algo más que el saludo del anuncio.
        if not any(m["tipo"] != "text" or not RE_SALUDO.match(m["msg"].strip()) for m in cli):
            omitidos += 1
            continue
        ultimo_id = max(m["id"] for m in ms)
        embudo = next((m["embudo"] for m in reversed(ms) if m["embudo"]), "")
        if wa in estado and estado[wa] >= ultimo_id:
            continue  # nada nuevo
        if "purchase" in embudo.lower():
            if wa in fila_de:
                compraron.append({"wa": wa, "fila": fila_de[wa], "ultimo_id": ultimo_id})
            elif wa not in estado:
                omitidos += 1
            continue
        pendientes.append((max(m["t"] for m in ms), wa, ms, ultimo_id, embudo))

    pendientes.sort(reverse=True)  # primero lo más reciente
    lote, resto = pendientes[:a.max], len(pendientes) - len(pendientes[:a.max])

    # Filas libres: la validación de casillas llega hasta la fila 1000 y append_values caía en la 1001;
    # la Routine escribe con update_values en estas filas exactas.
    plan = {"nuevos": [], "actualizar": [], "ya_compraron": compraron, "quedan_para_la_proxima": resto,
            "siguiente_fila_llamadas": len(valores(a.filas)) + 2,
            "siguiente_fila_estado": len(valores(a.estado)) + 2}
    partes = []
    for t, wa, ms, ultimo_id, embudo in lote:
        nombre = next((m["nombre"] for m in reversed(ms) if m["nombre"] not in ("", ".")), "")
        asesora = next((m["asesora"] for m in reversed(ms) if m["asesora"]), "")
        ult_cli = max(m["t"] for m in ms if m["quien"] == "Cliente")
        item = {"wa": wa, "nombre": nombre, "ultimo_id": ultimo_id, "ultimo_cliente": ult_cli}
        if wa in fila_de:
            item["fila"] = fila_de[wa]
            plan["actualizar"].append(item)
            accion = f"ACTUALIZAR fila {fila_de[wa]}"
        else:
            plan["nuevos"].append(item)
            accion = "NUEVO"
        lineas, bienv = [], False
        for m in ms[-MAX_MSGS_CHAT:]:
            es_cli = m["quien"] == "Cliente"
            auto = (not es_cli) and RE_AUTO.search(m["vend"])
            if auto and "bienvenida" in m["vend"].lower():
                if not bienv:
                    lineas.append(f"{m['t'][5:16]} [bienvenida automática de URO: precio, envío gratis, pago al recibir, pregunta el distrito]")
                bienv = True
                continue
            cuerpo = re.sub(r"\s+", " ", m["msg"]).strip()[:600] or f"[{m['tipo']}]"
            quien = "C" if es_cli else f"V(auto)" if auto else f"V({m['vend'] or '?'})"
            lineas.append(f"{m['t'][5:16]} {quien}: {cuerpo}")
        partes.append(f"=== {wa} | {nombre or 'sin nombre'} | {accion} | asesora del chat: {asesora or '-'} | último msg cliente: {ult_cli}\n" + "\n".join(lineas))

    os.makedirs(a.salida, exist_ok=True)
    with open(os.path.join(a.salida, "chats.txt"), "w") as fh:
        fh.write("\n\n".join(partes) + ("\n" if partes else ""))
    with open(os.path.join(a.salida, "plan.json"), "w") as fh:
        json.dump(plan, fh, ensure_ascii=False, indent=1)

    if not lote and not compraron:
        print("SIN_NOVEDAD")
        return
    print(json.dumps({"nuevos": len(plan["nuevos"]), "actualizar": len(plan["actualizar"]),
                      "ya_compraron": len(compraron), "quedan_para_la_proxima": resto,
                      "sin_interes_aun": omitidos, "chats": os.path.join(a.salida, "chats.txt"),
                      "plan": os.path.join(a.salida, "plan.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()

"""
Lista de llamadas de URO para la asesora comercial (Routine cada hora).

Solo trae los chats del número de URO que tuvieron mensajes en la última hora
(--activos-horas) y deja fuera lo que no vale una llamada: el cliente que solo
mandó el saludo prellenado del anuncio (o nunca respondió), el que pidió que no
lo escriban y el que ya está en la hoja con el mismo último mensaje. Lo que
queda sale en JSON para que la Routine escriba el resumen y el speech; todo lo
que se puede decidir sin leer se decide aquí.

Dos pasos:

    # 1) candidatos (lee el Worker; la hoja trae ya_procesados.json de la base)
    ASESOR_CLAVE=... python3 scripts/asesor/uro_llamadas.py preparar \
        --activos-horas 2 --ya /tmp/asesor/uro_ya.json --salida /tmp/asesor/uro_candidatos.json

    # 2) con los resúmenes y speeches que escribió la Routine (llamadas.json):
    python3 scripts/asesor/uro_llamadas.py armar /tmp/asesor/uro_candidatos.json \
        /tmp/asesor/uro_llamadas.json --ya /tmp/asesor/uro_ya.json --salida /tmp/asesor/uro_lote.json

`armar` no deja pasar un speech con promesas de salud que el producto no puede
hacer (docs/uro/negocio.md) y escribe el lote para ArtifactData: un «set» por
cliente nuevo y un «update» por cliente ya listado que NO toca el check de la
asesora (`llamada`, `llamada_por`, `llamada_fecha`).
"""
import argparse, datetime as dt, json, os, re, sys, urllib.error, urllib.request

API_CHATS = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/chats"
LINEA_URO = 1  # id de la línea URO en `lineas` (ver docs/productos-y-numeros.md)
COLECCION = "llamadas"
MAX_RESPUESTAS = 12
MAX_LINEAS_TRANSCRIPCION = 40

# El saludo que manda el anuncio al tocar el botón de WhatsApp (variantes que se ven en los chats).
RE_SALUDO = re.compile(
    r"^¡?hola!?[ .,]*(quiero|me gustar[ií]a)( conseguir)?( m[aá]s)? informaci[oó]n"
    r"( sobre esto\.?| por favor)?\.?$", re.I)
# Texto del anuncio pegado por el cliente: no es una respuesta.
RE_ANUNCIO = re.compile(r"uro, tu aliada", re.I)
RE_NO_LLAMAR = re.compile(
    r"no (me|nos) (escrib|molest|moles|llam)|no quiero (m[aá]s )?(mensaj|informaci)|dejen de|spam|bloquead|denunci", re.I)
# Señales de interés: preguntan por precio, envío, cómo se compra, cómo se toma.
RE_INTERES = re.compile(
    r"precio|cu[aá]nto|cuesta|costo|env[ií]o|delivery|pedido|pedir|comprar|llega|d[oó]nde|distrito|"
    r"agencia|pago|yape|tarjeta|contra entrega|cu[aá]ndo|tiempo|stock|original|efecto|tom[ao]|c[aá]psula|"
    r"^(lima|provincia)\b", re.I)
RE_AUTO = re.compile(r"autom[aá]tic|masivo|carrito|prueba de bienvenida", re.I)
RE_PEDIDO_EQUIPO = re.compile(r"pedido|adelanto|comprobante|confirm|direcci|yape", re.I)
# Lo que el speech nunca puede decir: suplemento, no medicamento (docs/uro/negocio.md).
RE_PROHIBIDO = re.compile(
    r"\bcur[aoe]|elimina|garantiz|reemplaz|desde la ra[ií]z|antes y despu[eé]s|diagn[oó]st|"
    r"candidiasis|infecci[oó]n|enfermedad|medicina|medicament", re.I)
MAX_SPEECH = 1100
MAX_RESUMEN = 600


def telefono(wa):
    """51987654321 -> +51 987 654 321 (número para marcar)."""
    d = re.sub(r"\D", "", wa)
    if d.startswith("51") and len(d) == 11:
        return f"+51 {d[2:5]} {d[5:8]} {d[8:]}"
    return f"+{d}"


def es_saludo(m):
    return bool(RE_SALUDO.match(m.strip())) or bool(RE_ANUNCIO.search(m))


def respuestas_del_cliente(ms):
    """Lo que el cliente escribió de verdad (no el saludo del anuncio) y los archivos que mandó."""
    out = []
    for m in ms:
        if m["quien"] != "Cliente":
            continue
        if m["tipo"] not in ("", "text", "None") and not m["msg"].strip():
            out.append(f"[mandó un {m['tipo']}]")
        elif m["msg"].strip() and not es_saludo(m["msg"]):
            out.append(m["msg"].strip())
        elif m["tipo"] not in ("", "text", "None"):
            out.append(f"[mandó un {m['tipo']}]")
    return out


def transcripcion(ms):
    lineas = []
    for m in ms[-MAX_LINEAS_TRANSCRIPCION:]:
        if m["quien"] == "Cliente":
            quien = "Cliente"
        elif RE_AUTO.search(m["vend"]):
            quien = "Automático"
        else:
            quien = f"Equipo ({m['vend'] or 'asesora'})"
        texto = m["msg"].strip().replace("\n", " / ")
        if quien == "Automático":
            texto = texto[:120]
        lineas.append(f"{m['t'][5:16]} {quien}: {texto[:400]}")
    return "\n".join(lineas)


def elegible(ms):
    """(clave, respuestas) — clave es None si el chat sirve para llamar."""
    respuestas = respuestas_del_cliente(ms)
    if not respuestas:
        return "sin_respuesta", respuestas
    if any(RE_NO_LLAMAR.search(r) for r in respuestas):
        return "no_llamar", respuestas
    return None, respuestas


def nivel_interes(respuestas):
    """Alta: preguntó algo, dio su zona (Lima o provincia) o escribió dos veces. Un sticker solo es Media."""
    textos = [r for r in respuestas if not r.startswith("[mandó")]
    if len(textos) >= 2 or any(RE_INTERES.search(r) for r in textos):
        return "Alta"
    return "Media"


def leer_chats(clave, dias, activos_horas, linea=LINEA_URO):
    if not clave:
        sys.exit("Falta ASESOR_CLAVE en el entorno.")
    url = f"{API_CHATS}?dias={dias}&linea={linea}" + (f"&activos_horas={activos_horas}" if activos_horas else "")
    req = urllib.request.Request(url, headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)["filas"]
    except urllib.error.HTTPError as err:
        sys.exit(f"El Worker rechazó la consulta ({err.code}): {err.read().decode()[:300]}")


def agrupar(filas):
    chats = {}
    for f in sorted(filas, key=lambda f: f["t"]):
        chats.setdefault(f["wa"], []).append(f)
    return chats


def leer_ya(ruta):
    """Lo que ya está en la hoja: {wa: {version, ultimo_cliente}}.

    Acepta un JSON con la lista de ArtifactData list, o la carpeta que deja
    ArtifactData con out_dir (un archivo por documento: {id, data, version}).
    """
    if not ruta or not os.path.exists(ruta):
        return {}
    if os.path.isdir(ruta):
        obj = []
        for raiz, _, archivos in os.walk(ruta):
            for nombre in archivos:
                if nombre.endswith(".json"):
                    with open(os.path.join(raiz, nombre), encoding="utf-8") as f:
                        obj.append(json.load(f))
    else:
        obj = json.load(open(ruta, encoding="utf-8"))
    if isinstance(obj, dict):
        obj = next((v for v in obj.values() if isinstance(v, list)), [obj] if "data" in obj or "id" in obj else [])
    ya = {}
    for d in obj:
        datos = d.get("data", d)
        wa = d.get("doc_id") or d.get("id") or datos.get("wa")
        if wa:
            ya[str(wa)] = {"version": d.get("version"), "ultimo_cliente": datos.get("ultimo_cliente", "")}
    return ya


def preparar(filas, ya, ahora=None):
    candidatos, omitidos = [], {"sin_respuesta": 0, "no_llamar": 0, "ya_procesados": 0}
    for wa, ms in agrupar(filas).items():
        clave, respuestas = elegible(ms)
        if clave:
            omitidos[clave] += 1
            continue
        if not respuestas:
            omitidos["sin_respuesta"] += 1
            continue
        clientes = [m for m in ms if m["quien"] == "Cliente"]
        ultimo_cliente = clientes[-1]["t"]
        previo = ya.get(wa)
        if previo and previo.get("ultimo_cliente", "") >= ultimo_cliente:
            omitidos["ya_procesados"] += 1
            continue
        candidatos.append({
            "wa": wa,
            "telefono": telefono(wa),
            "nombre": next((m["nombre"] for m in reversed(ms) if m["nombre"] not in ("", ".")), "") or "Sin nombre",
            "interes": nivel_interes(respuestas),
            "primer_contacto": ms[0]["t"],
            "ultimo_cliente": ultimo_cliente,
            "version": previo.get("version") if previo else None,
            "anuncio": next((m["anuncio"] for m in ms if m["anuncio"]), ""),
            "asesora": next((m["asesora"] for m in reversed(ms) if m["asesora"]), ""),
            "pedido_mencionado": any(m["quien"] != "Cliente" and not RE_AUTO.search(m["vend"])
                                     and RE_PEDIDO_EQUIPO.search(m["msg"] or "") for m in ms),
            "respuestas_cliente": respuestas[-MAX_RESPUESTAS:],
            "transcripcion": transcripcion(ms),
        })
    candidatos.sort(key=lambda c: (c["interes"] != "Alta", c["ultimo_cliente"]), reverse=False)
    return {"generado": (ahora or dt.datetime.utcnow() - dt.timedelta(hours=5)).strftime("%Y-%m-%d %H:%M"),
            "candidatos": candidatos, "omitidos": omitidos}


def armar(candidatos, llamadas, ya):
    """Valida los resúmenes y speeches de la Routine y arma el lote para ArtifactData."""
    por_wa = {c["wa"]: c for c in candidatos["candidatos"]}
    problemas, writes = [], []
    ahora = (dt.datetime.utcnow() - dt.timedelta(hours=5)).strftime("%Y-%m-%d %H:%M")
    for ll in llamadas:
        wa = str(ll.get("wa", ""))
        c = por_wa.get(wa)
        if not c:
            problemas.append(f"{wa}: no está en los candidatos")
            continue
        resumen, speech = ll.get("resumen", "").strip(), ll.get("speech", "").strip()
        if not resumen or not speech:
            problemas.append(f"{wa}: falta resumen o speech")
            continue
        antes = len(problemas)
        for nombre, txt, maximo in (("speech", speech, MAX_SPEECH), ("resumen", resumen, MAX_RESUMEN)):
            if len(txt) > maximo:
                problemas.append(f"{wa}: {nombre} de {len(txt)} caracteres (máximo {maximo})")
            prohibido = RE_PROHIBIDO.search(txt)
            if prohibido:
                problemas.append(f"{wa}: {nombre} dice «{prohibido.group(0)}», no se puede decir de URO")
        if len(problemas) > antes:
            continue
        datos = {
            "nombre": c["nombre"], "telefono": c["telefono"], "interes": c["interes"],
            "primer_contacto": c["primer_contacto"], "ultimo_cliente": c["ultimo_cliente"],
            "anuncio": c["anuncio"], "asesora": c["asesora"], "pedido_mencionado": c["pedido_mencionado"],
            "resumen": resumen, "speech": speech, "actualizado": ahora,
        }
        if c["version"] is None and wa not in ya:
            writes.append({"op": "set", "collection": COLECCION, "doc_id": wa,
                           "data": {**datos, "llamada": False, "llamada_por": "", "llamada_fecha": ""}})
        else:
            writes.append({"op": "update", "collection": COLECCION, "doc_id": wa,
                           "if_version": c["version"], "data": datos})
    return problemas, writes


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="orden", required=True)
    p = sub.add_parser("preparar")
    p.add_argument("--activos-horas", type=int, default=2, help="chats con mensajes en las últimas N horas")
    p.add_argument("--dias", type=int, default=7, help="historial que se lee de cada chat")
    p.add_argument("--ya", default="", help="JSON de ArtifactData list con lo que ya está en la hoja")
    p.add_argument("--salida", default="/tmp/asesor/uro_candidatos.json")
    a = sub.add_parser("armar")
    a.add_argument("candidatos")
    a.add_argument("llamadas", help="JSON: lista de {wa, resumen, speech}")
    a.add_argument("--ya", default="")
    a.add_argument("--salida", default="/tmp/asesor/uro_lote.json")
    x = ap.parse_args()

    if x.orden == "preparar":
        filas = leer_chats(os.environ.get("ASESOR_CLAVE", ""), x.dias, x.activos_horas)
        salida = preparar(filas, leer_ya(x.ya))
        os.makedirs(os.path.dirname(x.salida) or ".", exist_ok=True)
        json.dump(salida, open(x.salida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"{len(salida['candidatos'])} para llamar · omitidos {salida['omitidos']} · {x.salida}")
        return

    cand = json.load(open(x.candidatos, encoding="utf-8"))
    llamadas = json.load(open(x.llamadas, encoding="utf-8"))
    problemas, writes = armar(cand, llamadas, leer_ya(x.ya))
    if problemas:
        print("No sale el lote. Corrige y vuelve a correr `armar`:")
        for p_ in problemas:
            print(" -", p_)
        sys.exit(1)
    os.makedirs(os.path.dirname(x.salida) or ".", exist_ok=True)
    json.dump({"writes": writes}, open(x.salida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Lote de {len(writes)} escrituras · {x.salida}")


if __name__ == "__main__":
    main()

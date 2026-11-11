"""
Manda el resultado de la lectura del asesor por el Worker (/api/asesor/avisos),
que tiene el token del bot y reparte:

  1. Al dueño: un PDF con los pedidos de la fecha objetivo y un resumen.
  2. A la vendedora asignada a cada chat (o al dueño si ella no vinculó
     Telegram): "Manda este mensaje" con el texto listo (un toque lo copia) y
     un botón que abre ese chat en el CRM.

    ASESOR_CLAVE=... python3 scripts/asesor/enviar.py /tmp/asesor/salida.json
    ... --solo-mensajes        sin PDF (corridas de 11:30 y 16:00)
    ... --informe informe.txt  informe CRO, solo al dueño
    ... --prueba               no manda nada, imprime lo que mandaría
    ... --solo-pdf             solo arma el PDF (con ASESOR_CLAVE también lo sube a CRM → Reportes)

Cada PDF queda guardado en el servidor: el link sale en el resumen de Telegram
y en el botón Reportes del CRM (solo admin).

salida.json:
{
  "fecha_objetivo": "2026-09-29",
  "pedidos": [{"estado": "CONFIRMADO|POR_CONFIRMAR|OTRO_DIA|INTENCION",
               "destino": "LIMA|PROVINCIA", "nombre": "", "whatsapp": "",
               "telefono": "", "dni": "", "direccion_o_agencia": "",
               "courier": "", "kits": 1, "pago": "", "fecha_entrega": "", "nota": "",
               "tipo": "CAMBIO|REPOSICION|AGENDADO",   # solo si no es venta nueva del día (ver ESPECIALES)
               "empaque": "+ mazo The Classic Tarot · + collar amuleto"}],   # lo que NO es 1 kit normal; vacío si es 1 kit
  "mensajes": [{"whatsapp": "", "nombre": "", "motivo": "", "mensaje": "",
                "objecion": "lo que probablemente lo frena (desconfianza por el adelanto, falta de info…)",
                "idea": {"titulo": "otra opción para la próxima", "mensaje": "texto listo"},   # opcional
                "adjuntar": ["Fotos de envíos de hoy"],   # opcional: recursos del banco (título exacto) o algo a mano; NO va en el mensaje
                "plantilla": "rescate_lead_1",   # opcional: plantilla aprobada si su ventana de 24 h cerró (el mensaje sale cuando conteste)
                "pasos": [{"horas": 5, "mensaje": ""}]}],   # opcional: secuencia si no responde
  "preguntas": [{"pregunta": "¿Puedo ofrecerle a X…?", "motivo": "", "opciones": ["Sí", "No"],
                 "whatsapp": "", "nombre": ""}],   # al dueño; su respuesta queda en la memoria
  "respuestas_rapidas": [{"titulo": "", "texto": "", "motivo": "",
                          "destinatarios": [{"whatsapp": "", "nombre": ""}]}],
  "variantes": [{"ref_tipo": "rapida|bienvenida", "ref_id": 12, "texto": "", "motivo": "hipótesis"}],
  "saldos": [{"whatsapp": "", "nombre": "", "codigo": "TS-…", "monto": 69, "motivo": "mandó captura de Yape 29/09 18:40"}],
  "analisis": [{"whatsapp": "", "intencion": "alta|media|baja|ninguna", "resultado": "ganado|perdido|abierto",
                "motivo": "", "objecion": "", "calidad": 1-5, "agente": "", "upsell": "", "nota": "coaching"}],
  "envios": [{"whatsapp": "", "nombre": "", "link": "https://…/TS-…", "motivo": "", "mensaje": ""}],
  "quitar": [{"whatsapp": "", "motivo": "canceló / se pasó a otro día"}],   # único modo de sacar un pedido ya reportado (ver pedidos_estado.py)
  "rescates": [{"whatsapp": "", "motivo": "por qué tiene posibilidades de comprar"}],   # rescate de lead 1 (plantilla): SALE SOLO, sin aprobación
  "origen": "asesor 16:30"
}

Cada mensaje llega por Telegram a todo el equipo Y queda en ✨ Sugerencias del
CRM, donde una persona lo aprueba (se programa) o lo descarta. Las respuestas
rápidas propuestas solo van a ✨ Sugerencias. Las "variantes" (otra versión de
una respuesta rápida o de un paso de la bienvenida que ya existe, ids en
contexto.py) van a ✨ Sugerencias solo para el admin: aprobarla la mete en la
prueba. El "analisis" de cada chat se guarda para el coaching y el resumen
semanal (no avisa a nadie). Los "envios" (link con la boleta
ya lista) no van a Telegram ni a las vendedoras: solo al admin en ✨ Sugerencias.
"""
import base64, glob, html, json, os, re, subprocess, sys, urllib.error, urllib.request
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import promesas as prom

ORDEN = ["CONFIRMADO", "POR_CONFIRMAR", "OTRO_DIA", "INTENCION"]
TITULOS = {
    ("CONFIRMADO", "LIMA"): "✅ Lima — confirmados", ("CONFIRMADO", "PROVINCIA"): "✅ Provincia — confirmados",
    ("POR_CONFIRMAR", None): "🟡 Por confirmar", ("OTRO_DIA", None): "📅 Otros días", ("INTENCION", None): "🔥 Intención de compra",
}
# Reporte unificado «Pedidos y ventas» (2026-11-02): criterio liberal, lo dudoso sale como POR VERIFICAR y nada se descarta en silencio.
TITULOS_UNIFICADO = {("CONFIRMADO", "LIMA"): "✅ LIMA — por registrar en Dinsides (ya dieron su dirección)", ("CONFIRMADO", "PROVINCIA"): "✅ PROVINCIA — por registrar (ya dieron su adelanto)",
                     ("OTRO_DIA", None): "📅 Otros días — sin destino claro",
                     ("POR_CONFIRMAR", None): "🟡 POR VERIFICAR — huele a venta: confírmalo en el chat antes de empacar", ("INTENCION", None): "🔥 Intención de compra"}
ESTADOS_SINONIMOS = {"POR_VERIFICAR": "POR_CONFIRMAR", "VERIFICAR": "POR_CONFIRMAR", "CONFIRMADA": "CONFIRMADO", "AGENDADO": "OTRO_DIA",
                     "OTRO_DÍA": "OTRO_DIA", "INTENCIÓN": "INTENCION", "DESCARTADO": "DESCARTADO"}
# Lo que sale el día del despacho sin ser venta nueva: cambio, reposición o un
# pedido de un día pasado agendado para esta fecha. Va en su propia sección,
# después de los confirmados y ANTES de los por confirmar, para que no se pierda.
ESPECIALES = {"CAMBIO": "🔁 Cambio", "REPOSICION": "♻️ Reposición", "AGENDADO": "📌 Agendado de otro día",
              # 2026-11-09 (dueño): pedido PENDIENTE de envío al que le llegó el dato que faltaba (DNI, agencia, dirección) o una
              # corrección. Va ARRIBA DEL TODO en rojo; antes quedaba abajo y nadie lo veía (caso Elia Rita, DNI incompleto).
              "CORRECCION": "✏️ Corrección / dato que faltaba"}
# Incidencia que obliga a mandar algo (reposición, cambio, motorizado…): va arriba y marcada.
ENVIO = re.compile(r"reposici|repon[eé]|cambi(o|ar) (de|el|la|por)|motoriz|devoluci|llev[aá](r|rle|rsela)\b"
                   r"|falt\w* (la |el |una |un )?(carta|mazo|collar|manual|tapete|kit)", re.I)
especial = lambda p: str(p.get("tipo") or "").upper().replace("Ó", "O") in ESPECIALES
es_repo = lambda p: str(p.get("tipo") or "").upper().replace("Ó", "O") in ("CAMBIO", "REPOSICION")
e = lambda s: html.escape(str(s if s is not None else ""))
num_kits = lambda p: 1 if p.get("kits") in (None, "") else int(p.get("kits"))


def empaque(p):
    """Lo que el que empaca agrega o quita a "1 kit normal". Él asume que todo
    pedido es 1 kit y solo se guía del PDF: si un extra no sale aquí, no va.
    Toma el campo `empaque`; si no está, la frase de la nota que empieza con 📦."""
    extra = str(p.get("empaque") or "").strip()
    if not extra and "📦" in str(p.get("nota") or ""):
        m = re.search(r"📦\s*(.+?)(?:(?<=\.)\s|$)", str(p["nota"]))
        extra = m.group(1).strip() if m else ""
    partes, k = [], num_kits(p)
    if k == 0 and "no lleva kit" not in extra.lower():
        partes.append("NO lleva kit")
    elif k > 1 and f"{k} kit" not in extra.lower():
        partes.append(f"{k} KITS")
    if extra:
        partes.append(extra)
    return " · ".join(partes)


def revisar_promesas(datos, carpeta, clave):
    """Red de seguridad del empaque: lo prometido en el chat (collar extra del
    toque del día 7, regalo, mazo, 2 kits…) que no está en `empaque` se agrega
    con ⚠️ para que el que empaca lo vea. Lee las promesas de 30 días del
    Worker y, si no hay clave, las del meta.json de preparar.py."""
    pedidos = [p for p in datos.get("pedidos", []) if (p.get("nombre") or "").upper() != "INCIDENCIA"
               and prom.nueve(p.get("whatsapp") or p.get("telefono"))]
    if not pedidos:
        return []
    todas = prom.traer(clave, 30) if clave else {}
    meta = os.path.join(carpeta, "meta.json")
    if os.path.exists(meta):
        for wa, m in json.load(open(meta)).items():
            v = todas.setdefault(prom.nueve(wa), [])
            v += [x for x in m.get("promesas") or [] if x not in v]
    avisos = []
    for p in pedidos:
        lista = todas.get(prom.nueve(p.get("whatsapp"))) or todas.get(prom.nueve(p.get("telefono"))) or []
        faltan = prom.falta_en_empaque(lista, empaque(p))
        if not faltan:
            continue
        frase = " | ".join(f"«{x}»" for x in faltan[-3:])
        p["empaque"] = (str(p.get("empaque") or "").strip() + " · " if str(p.get("empaque") or "").strip() else "") \
            + f"⚠️ VERIFICAR, en el chat se le prometió: {frase}"
        avisos.append(f"- {p.get('nombre') or p.get('whatsapp')} ({p.get('estado')}): {frase}")
    return avisos


def tabla(filas, cols):
    cab = "".join(f"<th>{e(n)}</th>" for n, _ in cols)
    cuerpo = "".join(("<tr class=alerta>" if "🚨" in str(p.get("nota") or "") else "<tr class=extra>" if p.get("_empaque") else "<tr>")
                     + "".join(f"<td>{e(p.get(k, ''))}</td>" for _, k in cols) + "</tr>" for p in filas)
    cuerpo = re.sub(r"<tr( class=\w+)?>", lambda m: m.group(0) + "<td class=n></td>", cuerpo)
    return f"<table><tr><th>#</th>{cab}</tr>" + cuerpo + "</table>"


def validar_ventas(datos):
    """Un reporte de ventas necesita vendedora, destino y estado en cada pedido: si falta, no sale a medias."""
    malos = [f"- {p.get('nombre') or p.get('whatsapp')}: falta " + ", ".join(k for k in ("vendedora", "destino", "estado") if not p.get(k))
             for p in datos.get("pedidos", []) if (p.get("nombre") or "").upper() != "INCIDENCIA"
             and not all(p.get(k) for k in ("vendedora", "destino", "estado"))]
    if malos or not datos.get("fecha_objetivo"):
        sys.exit("Reporte de ventas incompleto (cada pedido lleva vendedora, destino y estado; y fecha_objetivo):\n" + "\n".join(malos))


def promover_provincia(p):
    """Regla del dueño (2026-11-09): en provincia el adelanto ES la venta, haya mandado S/10, S/20 o S/50. Un POR_VERIFICAR de
    provincia cuyo texto muestra el pago visto (monto con operación, captura, «adelantó S/…») pasa a CONFIRMADO con nota «🚨 ATENCIÓN»
    (sale en rojo). Sigue POR VERIFICAR solo si NO hay pago visto o faltan DNI/agencia. Devuelve True si lo cambió."""
    est = ESTADOS_SINONIMOS.get(str(p.get("estado") or "").strip().upper().replace(" ", "_"), str(p.get("estado") or "").strip().upper())
    if est != "POR_CONFIRMAR" or p.get("destino") != "PROVINCIA" or p.get("tipo"):
        return False
    txt = f"{p.get('pago') or ''} {p.get('nota') or ''}"
    vio = re.search(r"adelant[oó]\s*(de\s*)?s/\s*\d|yape[oó]\s*s/\s*\d|mand[oó]\s*s/\s*\d|\bop\.?\s*[0-9A-Z]{4,}|captura (de|del) (pago|yape|plin|adelanto)|(yape|plin)\s*s/\s*\d{2,3}", txt, re.I)
    falta = re.search(r"sin captura|falta[n]? (la |una )?captura|no (hay|mand[oó]|envi[oó]) (la |una )?captura|dijo que (ya )?(yape|pag|deposit)|sin (comprobante|constancia)|falta[n]? (el |la |su )?(dni|agencia|nombre)|sin (dni|agencia|datos)", txt, re.I)
    # «Pedido web sin chat; falta confirmar agencia, DNI y adelanto S/20» NO es un adelanto visto (2026-11-11, caso Jennifer Figuera:
    # salió CONFIRMADO con «adelanto visto (revisar monto)» sin haber pagado nada).
    sin_pago = re.search(r"falta\w*[^.;]{0,80}adelanto|sin (pago|adelanto)|no (ha )?(pag|adelant|yape)|pendiente (de |el )?(pago|adelanto)|a[uú]n no (pag|adelant|yape)", txt, re.I)
    if not vio or falta or sin_pago:
        return False
    p["estado"] = "CONFIRMADO"
    if "🚨" not in str(p.get("nota") or ""):
        p["nota"] = ("🚨 ATENCIÓN: adelanto visto (revisar monto) · " + str(p.get("nota") or "")).strip(" ·")
    return True


def normalizar_unificado(datos):
    """Deja el salida.json del reporte unificado en el formato de siempre: estados sinónimos, DESCARTADO → `descartados`,
    Lima CONFIRMADO con entrega en otro día → OTRO_DIA (se avisa, no se frena). Devuelve los avisos."""
    avisos = []
    import pedidos_estado as _pe
    ref = datos.get("fecha_objetivo", "")
    pedidos, descartados = [], list(datos.get("descartados") or [])
    for p in datos.get("pedidos", []):
        est = ESTADOS_SINONIMOS.get(str(p.get("estado") or "").strip().upper().replace(" ", "_"), str(p.get("estado") or "").strip().upper())
        p = dict(p, estado=est)
        if est == "DESCARTADO":
            descartados.append({"nombre": p.get("nombre"), "whatsapp": p.get("whatsapp"), "motivo": p.get("motivo") or p.get("nota") or "sin motivo"})
            continue
        if re.search(r"ya registrad|no (lo|la) le[ií] en esta corrida|corridas? anterior", str(p.get("nota") or ""), re.I):
            # 2026-11-02: la Routine repitió un pedido ya registrado con una nota de relleno y pisó la nota real. Se ignora:
            # lo registrado se conserva solo (regla 17); para cambiarlo hay que mandar los datos de verdad.
            avisos.append(f"- {p.get('nombre') or p.get('whatsapp')}: nota de relleno («{str(p.get('nota'))[:50]}»); se ignora esta fila y queda lo ya registrado.")
            continue
        if (p.get("nombre") or "").upper() != "INCIDENCIA":
            if not p.get("vendedora"):
                p["vendedora"] = "(sin vendedora)"
            if p.get("destino") not in ("LIMA", "PROVINCIA"):
                # Sin destino no se sabe en qué sección va: sale como POR VERIFICAR, nunca se pierde.
                avisos.append(f"- {p.get('nombre') or p.get('whatsapp')}: destino {p.get('destino')!r} (debe ser LIMA o PROVINCIA) → sale como POR VERIFICAR.")
                p["estado"], p["destino"] = ("POR_CONFIRMAR" if est in ("CONFIRMADO", "POR_CONFIRMAR") else est), p.get("destino") or "?"
                p["nota"] = ("⚠️ sin destino claro · " + str(p.get("nota") or "")).strip(" ·")
        if promover_provincia(p):
            est = "CONFIRMADO"
            avisos.append(f"- {p.get('nombre') or p.get('whatsapp')}: provincia con adelanto visto → CONFIRMADO en rojo (regla del dueño 2026-11-09: el adelanto es la venta, sea S/10, S/20 o S/50).")
        if est == "CONFIRMADO" and p.get("destino") == "LIMA" and not p.get("tipo"):
            f = _pe.fecha_iso(p.get("fecha_entrega"), ref)
            if f and f > ref:
                p["estado"], p["fecha_entrega"] = "OTRO_DIA", f
                avisos.append(f"- {p.get('nombre') or p.get('whatsapp')}: Lima con entrega el {f} (no el {ref}) → pasó a OTRO_DIA y queda agendado.")
        if est == "OTRO_DIA" and not _pe.fecha_iso(p.get("fecha_entrega"), ref):
            avisos.append(f"- {p.get('nombre') or p.get('whatsapp')}: OTRO_DIA sin fecha entendible ({p.get('fecha_entrega')!r}); ponle fecha_entrega AAAA-MM-DD para que quede agendado.")
        pedidos.append(p)
    datos["pedidos"], datos["descartados"] = pedidos, descartados
    return avisos


def armar_pdf(datos, carpeta):
    if datos.get("tipo_reporte") in ("ventas", "unificado"):
        validar_ventas(datos)
    fecha = datos.get("fecha_objetivo", "")
    todos = datos.get("pedidos", [])
    # Las incidencias van en su propia sección, no como filas de pedidos.
    pedidos = [p for p in todos if (p.get("nombre") or "").upper() != "INCIDENCIA"]
    incidencias = datos.get("incidencias") or [p.get("nota", "").lstrip("🚨 ") for p in todos if p not in pedidos]
    pedidos = [dict(p, _empaque=empaque(p)) for p in pedidos]
    cols = [("Cliente", "nombre"), ("WhatsApp", "whatsapp"), ("Teléfono recibe", "telefono"), ("DNI", "dni"),
            ("Dirección / Agencia", "direccion_o_agencia"), ("Courier", "courier"), ("Kits", "kits"),
            ("📦 Empaque (extras)", "_empaque"), ("Pago", "pago"), ("Fecha", "fecha_entrega"), ("Nota", "nota")]
    partes, cola = [], []
    unificado = datos.get("tipo_reporte") == "unificado"
    if unificado:
        # Dueño 2026-11-11: este es un reporte de VENTAS para Jennifer, Dani y Moi. Reposiciones y cambios (los despacha otro
        # equipo), incidencias y saldos van en el reporte «Saldos y reposiciones», solo para el dueño (armar_pdf_dueno). La sección
        # «Para el que empaca» se quitó: el empaque va impreso en cada etiqueta.
        pedidos = [p for p in pedidos if not es_repo(p)]
        envios = datos.get("envios_hechos") or {}
        for p in pedidos:
            hecho = envios.get(prom.nueve(p.get("whatsapp")) or "-")
            p["_envio"] = (hecho if hecho else "por registrar") if p.get("estado") in ("CONFIRMADO", "OTRO_DIA") or especial(p) else ""
        # Dueño 2026-11-11 (2.ª vuelta): «Lima» y «Provincia» no son solo las ventas de hoy: son TODO lo confirmado que tiene que
        # salir en este despacho. Una corrección («aclaró que paga en efectivo») o un agendado de otro día que sale hoy va en su
        # fila de Lima o Provincia, no en una sección aparte (se duplicaba). Lo confirmado para otra fecha va a «Otros días».
        for p in pedidos:
            if str(p.get("tipo") or "").upper().replace("Ó", "O") in ("CORRECCION", "AGENDADO"):
                p["_tipo_orig"], p["tipo"] = p.get("tipo"), ""
            if p.get("estado") == "CONFIRMADO" and str(p.get("fecha_entrega") or "") not in ("", fecha):
                p["estado"] = "OTRO_DIA"
        # 3.ª vuelta del dueño (2026-11-11): el reporte es una «revisión de envíos 2». En Lima va lo que FALTA registrar en Dinsides
        # (dio dirección); en Provincia, quien ya dio su adelanto, tenga o no sus datos. Los de otra fecha también van ahí (ya son
        # clientes), con su fecha. Lo que YA está registrado en el courier no va ahí: baja a una lista al final, con su check.
        for p in pedidos:
            p["_otra_fecha"] = p.get("estado") == "OTRO_DIA"
            if p["_otra_fecha"] and p.get("destino") in ("LIMA", "PROVINCIA"):
                p["estado"] = "CONFIRMADO"
                p["nota"] = (f"📅 ENTREGA EL {p.get('fecha_entrega') or '(sin fecha)'} · " + str(p.get("nota") or "")).strip(" ·")
        es_venta = lambda p: p.get("estado") == "CONFIRMADO" and p.get("destino") in ("LIMA", "PROVINCIA")
        ya_registrados = [p for p in pedidos if es_venta(p) and p.get("_envio") and p["_envio"] != "por registrar"]
        vendidos = list(pedidos)  # para «Ventas por vendedora»: cuenta también lo ya registrado
        pedidos = [p for p in pedidos if p not in ya_registrados]
    # Primero, para el que empaca: todo lo que sale y NO es 1 kit normal.
    salen = [p for p in pedidos if p.get("estado") == "CONFIRMADO" or especial(p)]
    raros = [p for p in salen if p["_empaque"]]
    if not unificado:
        partes.append("<h2 class=emp>📦 PARA EL QUE EMPACA — lo que NO es 1 kit normal "
                      f"({len(raros)} de {len(salen)} pedidos que salen)</h2>"
                      + ("<div class=emp>" + tabla(raros, [("Cliente", "nombre"), ("Destino", "destino"), ("Kits", "kits"),
                                                           ("Qué agregar / quitar", "_empaque")]) + "</div>" if raros else "")
                      + "<p class=emp>Todos los demás pedidos que salen llevan <b>1 kit normal</b>, sin nada extra.</p>")
    # Segundo, las incidencias: en cuadro grande y rojo, no en letra chica al final.
    # Las que piden mandar algo (reposición, cambio, motorizado) van primero.
    inc_filas = [{"texto": str(p.get("nota") or "").lstrip("🚨 ").strip(), "whatsapp": p.get("whatsapp", "")}
                 for p in todos if (p.get("nombre") or "").upper() == "INCIDENCIA" and (p.get("nota") or "").strip()]
    vistos = " ".join(f["texto"].lower() for f in inc_filas)
    inc_filas += [{"texto": str(i).lstrip("🚨 ").strip(), "whatsapp": ""} for i in incidencias
                  if str(i).strip() and (str(i).lstrip("🚨 ").split() or [""])[0].strip(":,").lower() not in vistos]
    for f in inc_filas:
        f["envio"] = "🛵 SÍ — mandar motorizado / agregar al despacho" if ENVIO.search(f["texto"]) else ""
        f["texto"] = "🚨 " + f["texto"]
    inc_filas.sort(key=lambda f: not f["envio"])
    if inc_filas and not unificado:
        partes.append(f"<h2 class=inc>🚨🚨 ATENCIÓN — INCIDENCIAS ({len(inc_filas)})</h2><div class=inc>"
                      + tabla(inc_filas, [("Qué pasa / qué hacer", "texto"), ("¿Requiere envío?", "envio"),
                                          ("WhatsApp", "whatsapp")]) + "</div>")
    esp = [dict(p, tipo=ESPECIALES[str(p.get("tipo")).upper().replace("Ó", "O")]) for p in pedidos if especial(p)]
    # Correcciones y datos que llegaron: lo primero del PDF, en rojo (dueño 2026-11-09: «prefiero una falsa alarma arriba a que quede abajo»).
    correcciones = [p for p in esp if str(p.get("tipo")).startswith("✏️")]
    if correcciones:
        partes.append(f"<h2 class=inc>🚨 PRIMERO: CORRECCIONES Y DATOS QUE LLEGARON — pedidos pendientes que ya se pueden despachar ({len(correcciones)})</h2>"
                      + "<div class=inc>" + tabla(correcciones, [("Destino", "destino"), ("Cliente", "nombre"), ("WhatsApp", "whatsapp"), ("DNI", "dni"),
                                                                    ("Dirección / Agencia", "direccion_o_agencia"), ("Kits", "kits"), ("📦 Qué lleva", "_empaque"),
                                                                    ("Pago", "pago"), ("Qué llegó / qué corregir", "nota")]) + "</div>")
    for (estado, destino), titulo in (TITULOS_UNIFICADO if unificado else TITULOS).items():
        if estado == "POR_CONFIRMAR" and esp:
            partes.append(f"<h2 class=esp>{'📌 TAMBIÉN SALEN EN ESTE DESPACHO: agendados de otros días' if unificado else '🚨 SALEN EN ESTE DESPACHO: cambios, reposiciones y agendados de otros días'} ({len(esp)})</h2>"
                          + "<div class=esp>" + tabla(esp, [("Tipo", "tipo"), ("Destino", "destino"), ("Cliente", "nombre"),
                                                            ("WhatsApp", "whatsapp"), ("Dirección / Agencia", "direccion_o_agencia"),
                                                            *([("Envío", "_envio")] if unificado else []),
                                                            ("Kits", "kits"), ("📦 Qué lleva", "_empaque"), ("Nota", "nota")]) + "</div>")
        filas = [p for p in pedidos if not especial(p) and p.get("estado") == estado and (destino is None or p.get("destino") == destino)]
        if filas:
            partes.append(f"<h2>{titulo} ({len(filas)})</h2>" + tabla(filas, cols))
        if estado == "OTRO_DIA" and unificado:
            # Agenda pendiente: TODO pedido de la pestaña «Pedidos auto» sin marcar «Enviado» (atrasados, futuros y los de
            # fechas pasadas), aunque ninguna corrida de hoy lo haya vuelto a ver. Así un pedido para dentro de un mes no
            # desaparece de los reportes hasta que alguien lo marque como enviado (caso Katia Reyes, 2026-10-30).
            en_reporte = {prom.nueve(p.get("whatsapp")) for p in pedidos if prom.nueve(p.get("whatsapp"))}
            ya_en_courier = {prom.nueve(p.get("whatsapp")) for p in (ya_registrados if unificado else [])}
            ag = datos.get("agenda_pendiente") or {}
            filas_ag, viejos, sin_conf_ag = [], 0, []
            import datetime as _dt2
            try:
                limite = (_dt2.date.fromisoformat(str(datos.get("fecha_venta"))) - _dt2.timedelta(days=3)).isoformat()
            except ValueError:
                limite = ""
            for grupo, etiqueta in (("atrasados", "⚠️ ATRASADO (su fecha ya pasó y nadie lo marcó enviado)"), ("hoy", "HOY"),
                                    ("futuros", "futuro"), ("sin_fecha", "sin fecha")):
                for r in ag.get(grupo) or []:
                    if prom.nueve(r.get("whatsapp")) in en_reporte and grupo != "atrasados":
                        continue
                    # Ya registrado o entregado en el courier: no es un pendiente aunque su fila de la hoja siga abierta.
                    if prom.nueve(r.get("whatsapp")) in ya_en_courier or re.search(r"Dinsides (registrado|ENTREGADO)", (datos.get("envios_hechos") or {}).get(prom.nueve(r.get("whatsapp")) or "-", "")):
                        continue
                    # Atrasados de hace más de 3 días: ya no se listan (el sistema cierra solo los que tienen boleta o estado final
                    # en Dinsides; lo que queda es ruido de la hoja). Se cuentan y se avisa (dueño 2026-11-09).
                    if grupo == "atrasados" and limite and str(r.get("fecha_entrega") or "") < limite:
                        viejos += 1
                        continue
                    fila_ag = dict(r, _cuando=etiqueta, nota=("🚨 " if grupo == "atrasados" else "") + str(r.get("nota") or ""),
                                   _envio=(datos.get("envios_hechos") or {}).get(prom.nueve(r.get("whatsapp")) or "-") or "por registrar")
                    # Lo que ya es venta (confirmado o agendado) es PRIORIDAD: hay que registrarlo o reagendarlo y avisar a Moi (caso
                    # Nohemi: dirección y pin desde el 31/10, viajó, sin registrar). Lo no confirmado va aparte, con menos peso.
                    (filas_ag if str(r.get("estado") or "").upper().startswith(("CONFIRMADO", "OTRO_DIA")) else sin_conf_ag).append(fila_ag)
            if sin_conf_ag:
                cola.append(f"<h2>🗒️ De otros días, sin confirmar ({len(sin_conf_ag)}) — solo si el cliente vuelve a escribir</h2>"
                            + tabla(sin_conf_ag, [("Entrega", "fecha_entrega"), ("Cliente", "nombre"), ("WhatsApp", "whatsapp"), ("Destino", "destino"), ("Nota", "nota"), ("Fila", "fila")]))
            if filas_ag or ag:
                partes.append(f"<h2 class=inc>🚨 REAGENDAR O REGISTRAR — ventas de otros días que todavía no salen ({len(filas_ag)}): avisar a Moi</h2>"
                              + ("<div class=esp>" + tabla(filas_ag, [("Cuándo", "_cuando"), ("Entrega", "fecha_entrega"), ("Cliente", "nombre"),
                                                                       ("WhatsApp", "whatsapp"), ("Destino", "destino"), ("Estado", "estado"), ("Envío", "_envio"),
                                                                       ("Dirección / Agencia", "direccion_o_agencia"), ("Kits", "kits"),
                                                                       ("📦 Empaque", "empaque"), ("Nota", "nota"), ("Fila", "fila")]) + "</div>"
                                 if filas_ag else "<p class=emp>No hay ventas de otros días pendientes de salir.</p>")
                              + "<p class=emp>Cada uno necesita una decisión: registrarlo con su fecha, reagendarlo (si ya está en Dinsides, Moi le escribe a Dinsides) o darlo de baja. "
                                "El sistema cierra solo los que ya tienen boleta (Shalom/Olva) o están registrados o entregados en Dinsides.</p>"
                              + (f"<p class=emp>Además hay {viejos} pedido(s) con fecha de hace más de 3 días sin «Enviado» en la hoja: no se listan aquí; revísalos en la pestaña «Pedidos auto».</p>" if viejos else ""))
    if unificado:
        desc = [d for d in (datos.get("descartados") or []) if isinstance(d, dict)]
        if desc:
            partes.append(f"<h2>🗂️ Descartados con motivo — lo que parecía venta y NO lo es ({len(desc)}; si alguno sí es venta, avísale a Moi)</h2>"
                          + tabla(desc, [("Cliente", "nombre"), ("WhatsApp", "whatsapp"), ("Por qué no cuenta", "motivo")]))
    # Todos los formularios de la página de las últimas 24 h, hayan terminado o no
    # en venta (GET /api/asesor/pedidos-web; main() los trae y los deja en datos).
    if unificado and ya_registrados:
        cola.append(f"<h2>☑️ Ya registrados en el courier ({len(ya_registrados)}) — no hay que hacer nada</h2>"
                    + tabla([dict(p, _envio="✔ " + str(p.get("_envio") or "")) for p in ya_registrados],
                            [("Destino", "destino"), ("Cliente", "nombre"), ("WhatsApp", "whatsapp"), ("Envío", "_envio"), ("Fecha", "fecha_entrega"), ("Kits", "kits")]))
    partes += cola
    # Dueño 2026-11-11: en el unificado no hay sección de pedidos web; el que compró ya está en Lima o Provincia.
    web = [] if unificado else (datos.get("pedidos_web") or [])
    if web:
        compraron = sum(1 for w in web if w.get("resultado") == "COMPRÓ")
        partes.append(f"<h2 class=web>🌐 Pedidos de la web — últimas 24 h ({len(web)}; compraron {compraron})</h2>"
                      + "<div class=web>" + tabla(web, [("Hora", "hora"), ("Cliente", "nombre"), ("WhatsApp", "whatsapp"),
                                                        ("Destino", "destino"), ("Dirección / Agencia", "direccion_o_agencia"),
                                                        ("Producto", "producto"), ("Total S/", "total"),
                                                        ("Resultado", "resultado")]) + "</div>")
    conf = [p for p in pedidos if p.get("estado") == "CONFIRMADO" or especial(p)]
    kits = sum(num_kits(p) for p in conf)  # en el unificado: solo lo que sale en ESTE despacho (lo de otra fecha ya pasó a «Otros días»)
    cuenta = lambda f: sum(1 for p in pedidos if f(p))
    normal = lambda est, des=None: lambda p: not especial(p) and p.get("estado") == est and (des is None or p.get("destino") == des)
    cajas = [("Kits a despachar", kits),
             ("Lima confirmados", cuenta(normal("CONFIRMADO", "LIMA"))),
             ("Provincia confirmados", cuenta(normal("CONFIRMADO", "PROVINCIA"))),
             ("Agendados y correcciones" if unificado else "Cambios / reposiciones / agendados", len(esp)),
             ("Por confirmar", cuenta(normal("POR_CONFIRMAR"))),
             ("Otros días", cuenta(normal("OTRO_DIA"))),
             ("Intención", cuenta(normal("INTENCION"))),
             *([] if unificado else [("Incidencias", len(incidencias))]),
             *([] if unificado else [("Pedidos web (24 h)", len(datos.get("pedidos_web") or []))])]
    if unificado:
        cajas = [("Lima por registrar", cuenta(normal("CONFIRMADO", "LIMA"))), ("Provincia por registrar", cuenta(normal("CONFIRMADO", "PROVINCIA"))),
                 ("Ya registrados en el courier", len(ya_registrados)), ("Kits por registrar", kits),
                 ("Por verificar", cuenta(normal("POR_CONFIRMAR"))), ("Intención", cuenta(normal("INTENCION")))]
    resumen = "<div class=cajas>" + "".join(f"<div><b>{v}</b><span>{e(k)}</span></div>" for k, v in cajas) + "</div>"
    origen = datos.get("origen", "asesor")
    es_ventas = datos.get("tipo_reporte") in ("ventas", "unificado")
    if es_ventas:
        titulo = f"Reporte de ventas · {e(datos.get('hora') or '')} {e(fecha)}".replace("  ", " ")
        if unificado:
            titulo = (f"Pedidos y ventas · {e(datos.get('hora') or '')} · ventas del {e(datos.get('fecha_venta') or fecha)} · "
                      f"despacho del {e(fecha)}").replace("  ", " ")
        # Ventas por vendedora: toda venta (confirmada para el despacho o agendada para otro día).
        por = {}
        for p in (vendidos if unificado else pedidos):
            if p.get("estado") not in ("CONFIRMADO", "OTRO_DIA") or p.get("tipo") in ("CAMBIO", "REPOSICION"):
                continue
            if str(p.get("_tipo_orig") or "").upper() == "AGENDADO":
                continue  # venta de otro día que sale en este despacho: ya se contó el día que se vendió
            nom = p.get("vendedora") or "(sin vendedora)"
            v = por.setdefault(nom, {"Vendedora": nom, "lima": 0, "prov": 0, "otro": 0, "total": 0, "kits": 0})
            v["lima" if p.get("destino") == "LIMA" else "prov"] += 1
            v["otro"] += 1 if p.get("estado") == "OTRO_DIA" or p.get("_otra_fecha") else 0
            v["total"] += 1
            v["kits"] += num_kits(p)
        if por:
            tot = {"Vendedora": "TOTAL", **{k: sum(v[k] for v in por.values()) for k in ("lima", "prov", "otro", "total", "kits")}}
            partes.insert(0, "<h2>👩 Ventas por vendedora</h2>" + tabla(
                sorted(por.values(), key=lambda v: -v["total"]) + [tot],
                [("Vendedora", "Vendedora"), ("Lima", "lima"), ("Provincia", "prov"), ("Agendadas otro día", "otro"),
                 ("Total ventas", "total"), ("Kits", "kits")]))
        # Venta que NO está marcada como compra en el CRM: Meta no se entera. Va arriba, en rojo, con el asesor que olvidó marcarla.
        sin = [x for x in (datos.get("sin_marcar_compra") or []) if isinstance(x, dict)]
        if sin:
            partes.insert(0, f"<h2 class=inc>🚨 META NO SE ENTERÓ — venta sin marcar como COMPRA ({len(sin)})</h2><div class=inc>"
                          + tabla(sin, [("Asesor que debe marcarla", "vendedora"), ("WhatsApp", "whatsapp"), ("Por qué es venta", "motivo")])
                          + "</div>")
            por_asesor = {}
            for x in sin:
                por_asesor[x.get("vendedora") or "(sin vendedora)"] = por_asesor.get(x.get("vendedora") or "(sin vendedora)", 0) + 1
            print("OLVIDARON MARCAR COMPRA (Meta): " + ", ".join(f"{k} ({v})" for k, v in por_asesor.items()))
        sin_exp = datos.get("sin_explicar") or [] if unificado else []
        if sin_exp:
            # Lo que el CRM tiene como venta y el reporte no explica: arriba del todo, en rojo (antes el reporte no salía).
            partes.insert(0, f"<h2 class=inc>🚨 EL CRM TIENE COMO VENTA Y EL REPORTE NO LO EXPLICA ({len(sin_exp)}) — revisar a mano</h2><div class=inc>"
                          + tabla([{"texto": str(x).lstrip("- ")} for x in sin_exp], [("Qué dice el sistema", "texto")]) + "</div>")
    else:
        titulo = f"Reporte de ventas · despacho del {e(fecha)}"
    doc = f"""<!doctype html><meta charset=utf-8><style>
@page{{size:A4 landscape;margin:10mm}} body{{font-family:'Noto Sans','DejaVu Sans',sans-serif;font-size:12.5px;color:#111}}
h1{{font-size:24px;margin:0}} h2{{font-size:17px;border-bottom:2px solid #075E54;color:#075E54;margin:14px 0 4px}}
.sub{{color:#666;margin:2px 0 10px}}
.cajas{{display:flex;gap:8px;margin:8px 0}} .cajas div{{flex:1;border:1px solid #ddd;border-radius:6px;padding:6px 8px}}
.cajas b{{display:block;font-size:24px;color:#075E54}} .cajas span{{color:#555}}
table{{border-collapse:collapse;width:100%;counter-reset:n}} tr{{page-break-inside:avoid}}
th{{background:#075E54;color:#fff;text-align:left;padding:5px 6px}} td{{border:1px solid #bbb;padding:5px 6px;vertical-align:top}}
td.n::before{{counter-increment:n;content:counter(n)}} ol.inc li{{margin:3px 0}}
tr.extra td{{background:#fef9c3;font-weight:600}} h2.emp{{color:#854d0e;border-color:#ca8a04;font-size:19px}}
div.emp th{{background:#ca8a04}} div.emp td{{background:#fef9c3;font-size:15px;font-weight:700}} p.emp{{margin:4px 0 8px;font-size:14px}}
body > table td:last-child, div.esp td:last-child{{width:24%}} body > table td:nth-last-child(4){{width:9%}}
h2.inc{{color:#b91c1c;border-color:#dc2626;font-size:19px}} div.inc th{{background:#dc2626}}
div.inc td{{background:#fee2e2;font-size:15px;font-weight:700}} tr.alerta td{{background:#fee2e2;font-weight:700}}
h2.esp{{color:#9a3412;border-color:#ea580c;font-size:19px}} div.esp th{{background:#ea580c}} div.esp td{{background:#ffedd5;font-size:15px;font-weight:700}}
h2.web{{color:#1d4ed8;border-color:#2563eb}} div.web th{{background:#2563eb}}</style>
<h1>{titulo}</h1>
<p class=sub>Tarot Store Perú · generado por {e(origen)}</p>{resumen}{''.join(partes)}"""
    nombre_pdf = (f"{'pedidos-y-ventas' if unificado else 'ventas'}-{fecha}-{re.sub(r'[^0-9]', '', str(datos.get('hora') or ''))}".rstrip("-")
                  if es_ventas else f"pedidos-{fecha}")
    ruta_html, ruta_pdf = os.path.join(carpeta, "pedidos.html"), os.path.join(carpeta, nombre_pdf + ".pdf")
    with open(ruta_html, "w") as fh:
        fh.write(doc)
    import shutil
    chrome = next((c for c in glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome") + ["/opt/pw-browsers/chromium"]
                   if os.path.exists(c)), None) or shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome") or "chromium"
    subprocess.run([chrome, "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={ruta_pdf}", ruta_html], check=True, capture_output=True)
    return ruta_pdf, kits


def salud_whatsapp(clave, fecha):
    """Entregas y entradas de WhatsApp del día (GET /api/asesor/entrega): cuántos mensajes salieron, cuántos no entregó Meta y por
    qué, cuántos entraron y cuántos no se pudieron procesar. Un fallo no frena el reporte."""
    try:
        req = urllib.request.Request(AVISOS.replace("/avisos", f"/entrega?fecha={fecha}"), headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except Exception as err:  # noqa: BLE001
        return {"error": str(err)}


def armar_pdf_dueno(datos, carpeta):
    """Reporte «Saldos y reposiciones», SOLO para el dueño (2026-11-11), una vez al cierre de la noche: saldos cobrados hoy (por el
    medio que sea: Yape, Plin, depósito BCP, un tercero), reposiciones y cambios (los despacha otro equipo, no Dinsides),
    incidencias, y lo que el sistema resolvió solo (entregados, anulados, rechazados, motorizado externo, boletas). Nada de esto va
    al reporte de ventas del equipo ni a la revisión de envíos de la asesora. Devuelve (ruta_pdf, resumen) o (None, "")."""
    todos = datos.get("pedidos", [])
    saldos = [x for x in (datos.get("saldos") or []) if isinstance(x, dict)]
    repos = [dict(p, _empaque=empaque(p), tipo=ESPECIALES.get(str(p.get("tipo")).upper().replace("Ó", "O"), p.get("tipo"))) for p in todos
             if es_repo(p) and (p.get("nombre") or "").upper() != "INCIDENCIA"]
    inc = [str(p.get("nota") or "").strip() for p in todos if (p.get("nombre") or "").upper() == "INCIDENCIA" and str(p.get("nota") or "").strip()]
    inc += [str(i).strip() for i in (datos.get("incidencias") or []) if str(i).strip() and str(i).strip() not in inc]
    res = datos.get("_resuelto") or {}
    partes = []
    def monto(x):
        try:
            return float(re.sub(r"[^\d.]", "", str(x.get("monto") or "")) or 0)
        except ValueError:
            return 0.0
    total = sum(monto(x) for x in saldos)
    partes.append(f"<h2>💰 Saldos cobrados hoy ({len(saldos)}) · total S/{total:.0f}</h2>"
                  + (tabla(saldos, [("Cliente", "nombre"), ("WhatsApp", "whatsapp"), ("Código", "codigo"), ("Monto S/", "monto"), ("Cómo pagó / qué se vio", "motivo")])
                     if saldos else "<p class=emp>El reporte no vio ningún pago de saldo hoy.</p>"))
    partes.append(f"<h2 class=esp>♻️ Reposiciones y cambios ({len(repos)}) — los despacha el equipo de reposiciones, no Dinsides</h2>"
                  + ("<div class=esp>" + tabla(repos, [("Tipo", "tipo"), ("Destino", "destino"), ("Cliente", "nombre"), ("WhatsApp", "whatsapp"),
                                                       ("Dirección / Agencia", "direccion_o_agencia"), ("📦 Qué llevar", "_empaque"), ("Nota", "nota")]) + "</div>"
                     if repos else "<p class=emp>Ninguna.</p>"))
    if inc:
        partes.append(f"<h2 class=inc>🚨 Incidencias ({len(inc)})</h2><div class=inc>" + tabla([{"texto": t} for t in inc], [("Qué pasa / qué hacer", "texto")]) + "</div>")
    filas, viejos_entregados = [], 0
    import datetime as _dt3
    try:
        corte_entregados = (_dt3.date.fromisoformat(str(datos.get("fecha_venta"))) - _dt3.timedelta(days=1)).isoformat()
    except ValueError:
        corte_entregados = ""
    for k, titulo in (("entregados", "Entregado (Dinsides)"), ("pendientes", "Registrado, por entregar (Dinsides)"), ("anulados", "Anulado (Dinsides)"), ("rechazados", "Rechazado (Dinsides)")):
        for x in res.get(k) or []:
            # De lo entregado solo lo de los últimos 2 días (lo demás es historia y alargaba el PDF a 110 filas).
            if k == "entregados" and str(x.get("fecha_entrega") or "") < corte_entregados:
                viejos_entregados += 1
                continue
            filas.append({"que": titulo, "nombre": x.get("nombre"), "tel": x.get("telefono"), "detalle": f"#{x.get('id_pedido')} · {x.get('distrito') or ''} · entrega {x.get('fecha_entrega')} · {x.get('seguimiento') or ''} · S/{x.get('monto')}"})
    for x in res.get("cerradas_por_nota") or []:
        filas.append({"que": "Motorizado externo", "nombre": x.get("nombre"), "tel": x.get("whatsapp"), "detalle": f"fila {x.get('fila')} cerrada: {x.get('motivo')}"})
    for x in res.get("boletas") or []:
        filas.append({"que": "Boleta emitida (provincia)", "nombre": x.get("nombre"), "tel": x.get("whatsapp"), "detalle": f"{x.get('courier') or ''} {x.get('nro') or ''} · fila {x.get('fila')} cerrada"})
    orden = {"Anulado (Dinsides)": 0, "Rechazado (Dinsides)": 1, "Motorizado externo": 2, "Registrado, por entregar (Dinsides)": 3, "Boleta emitida (provincia)": 4, "Entregado (Dinsides)": 5}
    filas.sort(key=lambda f: orden.get(f["que"], 9))
    partes.append(f"<h2>🧹 Lo que el sistema ya resolvió solo (últimos 14 días en Dinsides; {len(filas)})</h2>"
                  + (tabla(filas, [("Estado", "que"), ("Cliente", "nombre"), ("Teléfono", "tel"), ("Detalle", "detalle")]) if filas else "<p class=emp>Sin datos de Dinsides en esta corrida.</p>")
                  + (f"<p class=emp>Además, {viejos_entregados} entregados de días anteriores (no se listan).</p>" if viejos_entregados else ""))
    # Salud de WhatsApp del día (dueño 2026-11-11): lo que Meta no entregó y lo que no pudo entrar.
    ent = datos.get("_entrega") or {}
    linea_wa = ""
    if ent.get("ok"):
        sa, en = ent.get("salientes") or {}, ent.get("entrantes") or {}
        motivos = [dict(m, _pl=f"{m.get('plantillas', 0)} plantillas") for m in sa.get("por_motivo") or []]
        bloque = (f"<p class=emp>Salieron <b>{sa.get('total', 0)}</b> mensajes ({sa.get('plantillas', 0)} plantillas); Meta NO entregó <b>{sa.get('fallidos', 0)}</b>. "
                  f"Entraron <b>{en.get('mensajes', 0)}</b> mensajes de {en.get('chats', 0)} chats; NO se pudieron procesar <b>{en.get('no_procesados', 0)}</b>"
                  f"{'; archivos de clientes aún sin guardar: ' + str(en.get('archivos_sin_guardar')) if en.get('archivos_sin_guardar') else ''}.</p>")
        if motivos:
            bloque += tabla(motivos, [("Por qué no se entregó", "motivo"), ("Mensajes", "mensajes"), ("De ellos", "_pl")])
        if en.get("errores"):
            bloque += "<div class=inc>" + tabla(en["errores"], [("Mensaje entrante que no se pudo procesar (queda guardado para recuperarlo)", "error"), ("Veces", "n"), ("Personas", "personas")]) + "</div>"
        partes.insert(1, f"<h2{' class=inc' if en.get('no_procesados') else ''}>📶 WhatsApp hoy — entregas y entradas</h2>" + bloque)
        linea_wa = f"\n📶 WhatsApp: {sa.get('fallidos', 0)} de {sa.get('total', 0)} no entregados por Meta · entrantes sin procesar: {en.get('no_procesados', 0)}"
    elif ent.get("error"):
        partes.insert(1, f"<h2>📶 WhatsApp hoy</h2><p class=emp>No se pudo leer la entrega del día: {e(ent['error'])}</p>")
    doc = f"""<!doctype html><meta charset=utf-8><style>
@page{{size:A4 landscape;margin:10mm}} body{{font-family:'Noto Sans','DejaVu Sans',sans-serif;font-size:12.5px;color:#111}}
h1{{font-size:24px;margin:0}} h2{{font-size:17px;border-bottom:2px solid #075E54;color:#075E54;margin:14px 0 4px}} .sub{{color:#666;margin:2px 0 10px}}
table{{border-collapse:collapse;width:100%;counter-reset:n}} tr{{page-break-inside:avoid}}
th{{background:#075E54;color:#fff;text-align:left;padding:5px 6px}} td{{border:1px solid #bbb;padding:5px 6px;vertical-align:top}}
td.n::before{{counter-increment:n;content:counter(n)}} p.emp{{margin:4px 0 8px;font-size:14px}}
h2.inc{{color:#b91c1c;border-color:#dc2626}} div.inc th{{background:#dc2626}} div.inc td{{background:#fee2e2}}
h2.esp{{color:#9a3412;border-color:#ea580c}} div.esp th{{background:#ea580c}} div.esp td{{background:#ffedd5}}</style>
<h1>Saldos y reposiciones · {e(datos.get('fecha_venta') or datos.get('fecha_objetivo') or '')}</h1>
<p class=sub>Tarot Store Perú · solo para Moi · generado por {e(datos.get('origen', 'asesor'))}</p>{''.join(partes)}"""
    nombre = f"saldos-y-reposiciones-{datos.get('fecha_venta') or datos.get('fecha_objetivo') or ''}"
    ruta_html, ruta_pdf = os.path.join(carpeta, "dueno.html"), os.path.join(carpeta, nombre + ".pdf")
    with open(ruta_html, "w") as fh:
        fh.write(doc)
    import shutil
    chrome = next((c for c in glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome") + ["/opt/pw-browsers/chromium"]
                   if os.path.exists(c)), None) or shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome") or "chromium"
    subprocess.run([chrome, "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={ruta_pdf}", ruta_html], check=True, capture_output=True)
    resumen = (f"🔒 Saldos y reposiciones {datos.get('fecha_venta') or ''} (solo Moi)\n💰 Saldos cobrados: {len(saldos)} · S/{total:.0f}\n"
               f"♻️ Reposiciones y cambios: {len(repos)} · 🚨 Incidencias: {len(inc)}\n"
               f"🧹 Dinsides: {len(res.get('entregados') or [])} entregados · {len(res.get('anulados') or [])} anulados · {len(res.get('rechazados') or [])} rechazados · motorizado externo: {len(res.get('cerradas_por_nota') or [])}") + linea_wa
    return ruta_pdf, resumen


def es_cierre(datos, args):
    """El reporte del dueño sale UNA vez por noche, en la última corrida (23:45), o cuando se pide con --dueno."""
    if "--dueno" in args:
        return True
    m = re.search(r"(\d{1,2})[:h](\d{2})", str(datos.get("hora") or ""))
    return bool(m) and (int(m.group(1)), int(m.group(2))) >= (23, 30) or bool(m) and int(m.group(1)) < 3


AVISOS = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/avisos"
SUGERENCIAS = AVISOS.replace("/avisos", "/sugerencias")
PEDIDOS_WEB = AVISOS.replace("/avisos", "/pedidos-web")
ANALISIS = AVISOS.replace("/avisos", "/analisis")
RESCATES = AVISOS.replace("/avisos", "/rescates")


def al_worker(clave, cuerpo, url=None):
    """El Worker tiene el token del bot y sabe qué vendedora atiende cada chat."""
    req = urllib.request.Request(url or AVISOS, data=json.dumps(cuerpo).encode(),
                                 headers={"Content-Type": "application/json", "x-asesor-clave": clave,
                                          # Cloudflare corta (error 1010) el User-Agent por defecto de Python.
                                          "User-Agent": "tarot-asesor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as err:
        sys.exit(f"El Worker rechazó el aviso ({err.code}): {err.read().decode()[:300]}")


def traer_pedidos_web(clave, datos, horas=24):
    """Los formularios de la página (vendieran o no) para la sección 🌐 del PDF.
    Si salida.json ya trae "pedidos_web", se usan esos. Un fallo no frena el reporte."""
    if "pedidos_web" in datos or not clave:
        return
    req = urllib.request.Request(f"{PEDIDOS_WEB}?horas={horas}",
                                 headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            datos["pedidos_web"] = json.load(r).get("pedidos", [])
    except Exception as err:  # noqa: BLE001
        print(f"No se pudieron traer los pedidos de la web: {err}", flush=True)


def subir_reporte(clave, pdf_base64, nombre, titulo):
    """Guarda el PDF en el servidor (CRM → Reportes) y devuelve su link."""
    r = al_worker(clave, {"pdf_base64": pdf_base64, "nombre": nombre, "titulo": titulo}, AVISOS.replace("/avisos", "/reporte"))
    return r["url"]


PEDIDOS_SHEET = AVISOS.replace("/avisos", "/pedidos-sheet")


def _post_asesor(clave, url, cuerpo, timeout=240):
    req = urllib.request.Request(url, data=json.dumps(cuerpo, ensure_ascii=False).encode(),
                                 headers={"Content-Type": "application/json", "x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def conciliar_agenda(clave, hoy):
    """Antes de leer la agenda pendiente, cierra («Enviado») lo que ya consta como salido: filas con boleta emitida en «Boletas
    auto» (Shalom/Olva) y pedidos de Lima con estado final en Dinsides (entregado / anulado / rechazado). Así la agenda solo
    trae lo que de verdad falta despachar (dueño 2026-11-09: traía 100+ pedidos ya entregados). Un fallo no frena el reporte."""
    import datetime as _dt
    resuelto = {"boletas": [], "entregados": [], "anulados": [], "rechazados": [], "cerradas_por_nota": [], "pendientes": []}
    try:
        total = 0
        for _ in range(6):  # el Worker cierra hasta 40 filas por llamada
            r = _post_asesor(clave, PEDIDOS_SHEET, {"conciliar": True})
            total += int(r.get("marcados") or 0)
            resuelto["boletas"] += r.get("filas") or []
            if r.get("error") or not r.get("restantes"):
                break
        print(f"🧹 Agenda: {total} fila(s) cerradas por boleta emitida" + (f" (error: {r['error']})" if r.get("error") else ""), flush=True)
    except Exception as err:  # noqa: BLE001
        print(f"⚠️ No se pudo conciliar la agenda con las boletas: {err}", flush=True)
    try:
        d = _dt.date.fromisoformat(hoy)
        r = _post_asesor(clave, AVISOS.replace("/avisos", "/dinsides"), {"accion": "estados", "desde": (d - _dt.timedelta(days=14)).isoformat(),
                                                                       "hasta": (d + _dt.timedelta(days=1)).isoformat(), "marcar": True})
        if r.get("error"):
            print(f"⚠️ Dinsides estados: {r['error']}", flush=True)
        else:
            for k in ("entregados", "anulados", "rechazados", "cerradas_por_nota", "pendientes"):
                resuelto[k] = r.get(k) or []
            print(f"🧹 Dinsides: {len(r.get('entregados', []))} entregados · {len(r.get('anulados', []))} anulados · {len(r.get('rechazados', []))} rechazados · "
                  f"{r.get('marcados', 0)} fila(s) marcadas en la hoja", flush=True)
    except Exception as err:  # noqa: BLE001
        print(f"⚠️ No se pudo leer el estado de Dinsides: {err}", flush=True)
    return resuelto


def marcar_compras(clave, datos):
    """Venta confirmada (Lima con dirección / provincia con adelanto) que la asesora no marcó como compra en el CRM: la marca el
    sistema (etiqueta purchase + Purchase a Meta), con permiso del dueño (2026-11-09). Solo pedidos CONFIRMADO u OTRO_DIA."""
    sin = [x for x in (datos.get("sin_marcar_compra") or []) if isinstance(x, dict) and x.get("whatsapp")]
    if not sin:
        return
    estado = {prom.nueve(p.get("whatsapp")): p for p in datos.get("pedidos", []) if prom.nueve(p.get("whatsapp"))}
    hechos = []
    for x in sin:
        p = estado.get(prom.nueve(x.get("whatsapp")))
        if not p or p.get("estado") not in ("CONFIRMADO", "OTRO_DIA") or (p.get("nombre") or "").upper() == "INCIDENCIA":
            continue
        valor = {0: 0, 1: 89, 2: 149, 3: 199}.get(num_kits(p), 89 * num_kits(p)) or 89
        try:
            r = _post_asesor(clave, AVISOS.replace("/avisos", "/marcar-compra"), {"whatsapp": x["whatsapp"], "valor": valor, "motivo": x.get("motivo") or "", "product_label": (p.get("_empaque") or "Kit Tarot de aprendizaje")[:120]}, timeout=60)
            hechos.append(f"{p.get('nombre') or x['whatsapp']}: {'ya estaba' if r.get('ya_marcado') else 'marcada'}" + (f" (Meta: {r['meta']['error']})" if r.get("meta", {}).get("error") else ""))
        except Exception as err:  # noqa: BLE001
            hechos.append(f"{p.get('nombre') or x['whatsapp']}: no se pudo ({err})")
    if hechos:
        print("🛍️ Compras marcadas en el CRM (la asesora no las marcó): " + "; ".join(hechos), flush=True)


def agenda_sheet(clave, hoy):
    """Pedidos de la pestaña «Pedidos auto» sin marcar «Enviado» (atrasados, de hoy, futuros, sin fecha). Un fallo no frena el reporte."""
    req = urllib.request.Request(f"{PEDIDOS_SHEET}?hoy={hoy}&enviadas=1", headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except Exception as err:  # noqa: BLE001
        print(f"⚠️ No se pudo leer la agenda de la hoja «Pedidos auto»: {err}", flush=True)
        return {"error": str(err)}


def guardar_en_sheet(clave, datos):
    """Deja en «Pedidos auto» todo pedido que sale o que podría salir (confirmados, por verificar, otros días, cambios,
    reposiciones, agendados). Clave: WhatsApp entre las filas sin «Enviado». La columna «Enviado» la marca una persona."""
    ped = [p for p in datos.get("pedidos", []) if (p.get("nombre") or "").upper() != "INCIDENCIA"
           and (p.get("estado") in ("CONFIRMADO", "POR_CONFIRMAR", "OTRO_DIA") or especial(p))]
    if not ped:
        return {"nuevas": 0, "actualizadas": 0}
    cuerpo = {"fecha_objetivo": datos.get("fecha_objetivo"), "origen": f"{datos.get('origen', 'asesor')} {datos.get('hora') or ''}".strip(),
              "pedidos": [dict(p, fecha_venta=p.get("fecha_venta") or datos.get("fecha_venta") or "") for p in ped]}
    req = urllib.request.Request(PEDIDOS_SHEET, data=json.dumps(cuerpo, ensure_ascii=False).encode(),
                                 headers={"Content-Type": "application/json", "x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except Exception as err:  # noqa: BLE001
        print(f"⚠️ No se pudo escribir en la hoja «Pedidos auto»: {err}", flush=True)
        return {"error": str(err)}


# Lo que delata a un bot (ver .claude/skills/voz-tarot-store). Las vendedoras
# no escriben así; si un texto lo tiene, no se guarda y la Routine lo rehace.
RE_ROBOT = [
    (re.compile(r"—|–"), "usa guion largo (—)"),
    (re.compile(r"\bno dude[sn]? en\b|\bestoy aqu[ií] para\b|\bcon gusto te ayudo\b|\bespero que est[eé]s? bien\b", re.I), "frase de plantilla"),
    (re.compile(r"\bentiendo (tu|su) (preocupaci[oó]n|inquietud)\b|\bcomprendo perfectamente\b", re.I), "frase de manual de ventas"),
    (re.compile(r"\b[A-ZÁÉÍÓÚÑ]{5,}\b"), "palabra en MAYÚSCULAS"),
    (re.compile(r"\b(tú|tu|te|tienes|puedes|quieres)\b", re.I), "tutea (el equipo trata de usted)"),
]


# Dueño, 2026-11-07: «¿le mando fotos?» / «si desea le paso fotos» suena a cumplir, no a vender. Lo que hay que adjuntar
# va en `adjuntar` (nota para la vendedora) y el texto se escribe como si ya los mandara («Le dejo las fotos de…»).
RE_PIDE_PERMISO_ADJUNTO = re.compile(
    r"(\b(le|les)\s+(mando|env[ií]o|paso|comparto)\s+(unas?\s+|las\s+|los\s+|algunas?\s+)?(fotos?|videos?|im[aá]genes|capturas?|pdf)\b"
    r"|\b(desea|quiere|gusta)\s+que\s+le\s+(mande|env[ií]e|pase)\s+(unas?\s+|las\s+|los\s+)?(fotos?|videos?|im[aá]genes)\b)", re.I)


def pide_permiso_adjunto(texto):
    for frase in re.split(r"(?<=[.!?])\s+|\n", texto):
        if RE_PIDE_PERMISO_ADJUNTO.search(frase) and ("?" in frase or re.search(r"\bsi\s+(desea|gusta|quiere|prefiere)\b", frase, re.I)):
            return True
    return False


def problemas_de(texto):
    """Lo que delata a un bot en un texto para clientes (vacío = pasa)."""
    p = [motivo for patron, motivo in RE_ROBOT if patron.search(texto)]
    if pide_permiso_adjunto(texto):
        p.append("pide permiso para mandar fotos/videos: ponlo en `adjuntar` y escribe como si ya los mandaras")
    if len(texto) > 420:
        p.append(f"muy largo ({len(texto)} caracteres; las vendedoras escriben 1–3 líneas)")
    if texto.count("?") > 1:
        p.append("más de una pregunta")
    if sum(1 for c in texto if ord(c) > 0x2600) > 4:
        p.append("demasiados emojis")
    return p


def revisar_estilo(datos):
    """Saca de datos las propuestas que suenan a bot (no se guardan) y devuelve por qué.
    También las que repiten el mismo texto a más de 2 clientes: hay que personalizarlas."""
    repetidos = Counter(m.get("mensaje") for m in datos.get("mensajes", []) if m.get("mensaje"))
    fuera = []

    def pasa(quien, textos):
        malos = [f"{', '.join(problemas_de(x))}: {x[:100]}" for x in textos if x and problemas_de(x)]
        if malos:
            fuera.append(f"- {quien}: " + " | ".join(malos))
        return not malos

    mensajes = []
    for m in datos.get("mensajes", []):
        textos = [m.get("mensaje") or ""] + [p.get("mensaje") or p.get("texto") or "" for p in m.get("pasos") or []] \
            + [(m.get("idea") or {}).get("mensaje") or (m.get("idea") or {}).get("texto") or ""]
        if repetidos[m.get("mensaje")] > 2:
            fuera.append(f"- {m.get('nombre') or m.get('whatsapp')}: el mismo texto para {repetidos[m.get('mensaje')]} clientes; personalízalo con lo que dijo cada uno")
        elif pasa(m.get("nombre") or m.get("whatsapp"), textos):
            mensajes.append(m)
    datos["mensajes"] = mensajes
    datos["respuestas_rapidas"] = [r for r in datos.get("respuestas_rapidas", []) if pasa(r.get("titulo"), [r.get("texto") or ""])]
    datos["variantes"] = [v for v in datos.get("variantes", []) if pasa(f"versión {v.get('ref_tipo')} #{v.get('ref_id')}", [v.get("texto") or ""])]
    return fuera


def main():
    args = sys.argv[1:]
    prueba, solo_mensajes = "--prueba" in args, "--solo-mensajes" in args
    informe = args[args.index("--informe") + 1] if "--informe" in args else None
    clave = os.environ.get("ASESOR_CLAVE", "")
    if not clave and not prueba and "--solo-pdf" not in args:
        sys.exit("Falta ASESOR_CLAVE en el entorno (o usa --prueba).")

    if informe:  # informe: queda en CRM → Reportes; solo los de ventas van también por Telegram
        texto = open(informe).read().strip()
        if prueba:
            print(texto + "\n(prueba, nada se guardó)")
            return
        # Reporte de ventas (título «Ventas …»): además llega por Telegram al dueño.
        origen = "reporte de ventas" if texto.lower().lstrip().startswith("ventas") else "director CRO"
        r = al_worker(clave, {"informe": texto, "origen": origen})
        print(f"Informe guardado: {r.get('link') or 'ok'} · Telegram: {r.get('telegram') or 'no aplica'}")
        return

    ruta = next(a for a in args if not a.startswith("--"))
    datos = json.load(open(ruta))
    fuera = revisar_estilo(datos)
    if fuera:
        print("NO SE GUARDARON (suenan a bot; reescríbelas como las vendedoras, skill voz-tarot-store, "
              "y vuelve a mandarlas en otro salida.json):\n" + "\n".join(fuera), flush=True)
    carpeta = os.path.dirname(os.path.abspath(ruta))
    estado_nuevo = None
    unificado = datos.get("tipo_reporte") == "unificado"
    if unificado:
        # Reporte «Pedidos y ventas» (2026-11-02): ventas de fecha_venta (hoy) + despacho de fecha_objetivo (mañana), una sola
        # memoria (registro por fecha de despacho + hoja «Pedidos auto»), criterio liberal y nada frena el envío: lo que no
        # cuadra sale en el PDF, en rojo, para que una persona lo revise.
        import datetime as _dt
        datos.setdefault("fecha_venta", (_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(hours=5)).date().isoformat())
        datos.setdefault("fecha_objetivo", (_dt.date.fromisoformat(datos["fecha_venta"]) + _dt.timedelta(days=1)).isoformat())
        for a in normalizar_unificado(datos):
            print("ℹ️ " + a.lstrip("- "), flush=True)
        if clave and not solo_mensajes:
            datos["_resuelto"] = conciliar_agenda(clave, datos["fecha_venta"])
            datos["agenda_pendiente"] = agenda_sheet(clave, datos["fecha_venta"])
            # Cómo va el envío de cada venta (dueño 2026-11-11: el reporte debe mirar el courier): lo que Dinsides tiene abierto o
            # entregado y lo que la hoja ya cerró (Shalom con orden, boleta, motorizado). Sale en la columna «Envío».
            hechos = {}
            for x in (datos["agenda_pendiente"].get("enviadas") or []):
                hechos[prom.nueve(x.get("whatsapp")) or "-"] = str(x.get("enviado") or "")[:60]
            for k, txt in (("pendientes", "Dinsides registrado"), ("entregados", "Dinsides ENTREGADO"), ("anulados", "Dinsides ANULADO"), ("rechazados", "Dinsides RECHAZADO")):
                for x in datos["_resuelto"].get(k) or []:
                    for tel in {str(x.get("telefono") or "")[-9:], prom.nueve(x.get("whatsapp_hoja")) or ""} - {""}:
                        hechos[tel] = f"{txt} #{x.get('id_pedido')} (entrega {x.get('fecha_entrega')})"
            datos["envios_hechos"] = hechos

    def cuadre_unificado(d):
        """Cuadre con el CRM DESPUÉS de sumar lo registrado (así lo explicado en corridas anteriores cuenta; 2026-11-02:
        la 2.ª corrida volvía a marcar en rojo lo que la 1.ª ya había puesto en `no_cuentan`)."""
        if not (unificado and clave and not solo_mensajes) or "--sin-control" in args:
            return
        import control_ventas
        try:
            d["sin_explicar"] = control_ventas.cuadrar(control_ventas.traer(clave, d["fecha_venta"]), d)
        except RuntimeError as err:
            d["sin_explicar"] = [f"No se pudo consultar el control de ventas del {d['fecha_venta']}: {err}"]
        if d["sin_explicar"]:
            print("⚠️ EL CRM CONOCE VENTAS QUE EL REPORTE NO EXPLICA (salen en rojo en el PDF; si puedes, corrige salida.json y vuelve a mandar):\n"
                  + "\n".join(d["sin_explicar"]), flush=True)
        else:
            print("Cuadre con el CRM: OK (todo candidato del sistema está explicado en el reporte)", flush=True)
    if datos.get("tipo_reporte") == "ventas" and not prueba and not solo_mensajes:
        import control_ventas, ventas_estado
        try:
            # Cada corrida de la noche manda solo lo nuevo o cambiado; aquí se suma a lo ya reportado del día.
            previo = None if "--sin-estado" in args else ventas_estado.traer(clave, datos.get("fecha_objetivo", ""))
            if previo:
                datos = ventas_estado.fusionar(previo, datos)
                print(f"Estado del día: {len(previo.get('pedidos', []))} pedidos ya reportados + esta corrida = {len(datos['pedidos'])}", flush=True)
            ctx_ruta = os.path.join(carpeta, "ctx.json")
            if os.path.exists(ctx_ruta):
                corte = json.load(open(ctx_ruta)).get("corte_nuevo")
            else:
                import datetime as _dt
                corte = (_dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(minutes=30)).replace(microsecond=0).isoformat()
                print("⚠️ No corriste ventas_estado.py traer: el corte del estado será hace 30 min.", flush=True)
            estado_nuevo = dict(datos, corte=corte)
        except RuntimeError as err:
            sys.exit(f"NO SE ENVIÓ EL REPORTE: {err}. Reintenta; solo si el Worker está caído usa --sin-estado y dilo en el informe.")
        if "--sin-control" not in args:
            # Un reporte de ventas no sale mientras el sistema conozca una venta que el reporte no explica.
            try:
                problemas = control_ventas.cuadrar(control_ventas.traer(clave, datos.get("fecha_objetivo", "")), datos)
            except RuntimeError as err:
                sys.exit(f"NO SE ENVIÓ EL REPORTE: {err}. Reintenta; solo si el Worker está caído usa --sin-control y dilo en el informe.")
            if problemas:
                sys.exit("NO SE ENVIÓ EL REPORTE: no cuadra con el CRM. Revisa cada chat y corrige salida.json:\n" + "\n".join(problemas))
            print("Cuadre con el CRM: OK (todo candidato del sistema está explicado en el reporte)", flush=True)
    import pedidos_estado as _pe
    mal_fecha = _pe.revisar_fechas(datos) if not solo_mensajes else []
    if mal_fecha:
        sys.exit("NO SE ENVIÓ: pedidos de Lima confirmados con entrega en otro día (regla 6 de negocio.md: separa hoy de otros días):\n"
                 + "\n".join(mal_fecha))
    registro = None
    if datos.get("tipo_reporte") != "ventas" and not prueba and not solo_mensajes and "--sin-estado" not in args \
            and clave and datos.get("fecha_objetivo") and datos.get("pedidos") is not None:
        import pedidos_estado
        try:
            # Registro de pedidos por fecha de despacho: esta corrida se SUMA a lo ya reportado y deja su diferencia escrita.
            previo = pedidos_estado.traer(clave, datos["fecha_objetivo"])
            if unificado:
                ctx_ruta = os.path.join(carpeta, "ctx.json")
                datos["corte"] = (json.load(open(ctx_ruta)).get("corte_nuevo") if os.path.exists(ctx_ruta) else None) \
                    or _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat()
            datos, dif = pedidos_estado.combinar(previo, datos)
            registro = dif
            # La regla «provincia con adelanto = venta» también alcanza a lo que corridas anteriores dejaron POR VERIFICAR.
            for _p in datos.get("pedidos", []):
                if promover_provincia(_p):
                    print(f"ℹ️ {_p.get('nombre') or _p.get('whatsapp')}: provincia con adelanto visto (ya registrado) → CONFIRMADO en rojo.", flush=True)
            print(f"Registro de pedidos {datos['fecha_objetivo']}: {len((previo or {}).get('pedidos', []))} ya reportados "
                  f"+ esta corrida = {len(datos['pedidos'])}", flush=True)
            for k, titulo in (("nuevos", "NUEVOS"), ("cambiados", "CAMBIARON"), ("quitados", "QUITADOS (con motivo)"),
                              ("no_mencionados", "ya reportados que esta corrida NO mencionó (se conservan)")):
                if dif[k]:
                    print(f"  {titulo}: " + " | ".join(x if isinstance(x, str) else f"{x['pedido']} — {x['motivo'] or 'sin motivo'}" for x in dif[k]), flush=True)
            _, sin_fecha = pedidos_estado.agenda(datos)
            if sin_fecha:
                print("⚠️ OTRO_DIA sin fecha de entrega entendible (pon `fecha_entrega` como AAAA-MM-DD para que quede agendado): "
                      + " | ".join(sin_fecha), flush=True)
        except RuntimeError as err:
            sys.exit(f"NO SE ENVIÓ EL REPORTE: {err}. Reintenta; solo si el Worker está caído usa --sin-estado y dilo en la respuesta.")
    if unificado:
        cuadre_unificado(datos)
    faltan = revisar_promesas(datos, carpeta, clave)
    if faltan:
        print("📦 PROMESAS DEL CHAT QUE NO ESTABAN EN `empaque` (se agregaron con ⚠️ al PDF; revisa cada chat y "
              "pon el extra en `empaque` del pedido, o vuelve a mandarlo si no aplica):\n" + "\n".join(faltan), flush=True)
    if "--solo-pdf" in args or not solo_mensajes:
        traer_pedidos_web(clave, datos)
    if "--solo-pdf" in args:  # arma el PDF (y con clave lo sube a CRM → Reportes); no avisa a nadie
        pdf = armar_pdf(datos, carpeta)[0]
        print(f"PDF: {pdf}")
        if clave:
            with open(pdf, "rb") as fh:
                link = subir_reporte(clave, base64.b64encode(fh.read()).decode(), os.path.basename(pdf),
                                     f"{'Pedidos y ventas' if unificado else 'Pedidos'} {datos.get('fecha_objetivo', '')} · {datos.get('origen', 'asesor')}")
            print(f"REPORTE PDF: {link}")
            if unificado and "--dueno" in args:  # muestra del reporte del dueño: se sube a CRM → Reportes, no avisa a nadie
                datos["_entrega"] = salud_whatsapp(clave, datos.get("fecha_venta", ""))
                pdf_d, _ = armar_pdf_dueno(datos, carpeta)
                with open(pdf_d, "rb") as fh:
                    print("REPORTE DEL DUEÑO (PDF, sin Telegram): " + subir_reporte(clave, base64.b64encode(fh.read()).decode(), os.path.basename(pdf_d), f"Saldos y reposiciones {datos.get('fecha_venta', '')} (solo Moi)"))
        return
    ped = datos.get("pedidos", [])
    cuenta = lambda est, des=None: sum(1 for p in ped if not especial(p) and p.get("estado") == est and (des is None or p.get("destino") == des))
    cuerpo = {"mensajes": datos.get("mensajes", [])}
    if not solo_mensajes:
        pdf, kits = armar_pdf(datos, carpeta)
        ventas = datos.get("tipo_reporte") == "ventas"
        if ventas:
            cuerpo["solo_dueno"] = True  # el reporte de ventas de la noche es solo para el dueño
        ag = datos.get("agenda_pendiente") or {}
        pendientes_ag = sum(len(ag.get(k) or []) for k in ("atrasados", "hoy", "futuros", "sin_fecha"))
        cuerpo["resumen"] = ((f"🧭 Pedidos y ventas {datos.get('hora') or ''} — ventas del {datos.get('fecha_venta', '')} · despacho del {datos.get('fecha_objetivo', '')}\n"
                              if unificado else f"🧭 Asesor — {'ventas' if ventas else 'pedidos para'} {datos.get('fecha_objetivo', '')}\n")
                             + f"✅ Lima: {cuenta('CONFIRMADO', 'LIMA')} · Provincia: {cuenta('CONFIRMADO', 'PROVINCIA')} · {kits} kits\n"
                             + (f"🔁 Cambios / reposiciones / agendados de otros días: {sum(1 for p in ped if especial(p))}\n" if any(especial(p) for p in ped) and not unificado else "")
                             + f"🟡 Por {'verificar' if unificado else 'confirmar'}: {cuenta('POR_CONFIRMAR')} · 📅 Otros días: {cuenta('OTRO_DIA')}\n"
                             + ((f"📌 Agenda pendiente (hoja «Pedidos auto»): {pendientes_ag}" + (f" · ⚠️ atrasados: {len(ag['atrasados'])}" if ag.get("atrasados") else "") + "\n"
                                 + (f"🗂️ Descartados con motivo: {len(datos.get('descartados') or [])}\n" if datos.get("descartados") else "")
                                 + (f"🚨 El CRM tiene como venta y el reporte no explica: {len(datos['sin_explicar'])}\n" if datos.get("sin_explicar") else ""))
                                if unificado else "")
                             + (f"🌐 Pedidos de la web (24 h): {len(datos['pedidos_web'])} · compraron "
                                f"{sum(1 for w in datos['pedidos_web'] if w.get('resultado') == 'COMPRÓ')}\n" if datos.get("pedidos_web") else "")
                             + f"✍️ Mensajes sugeridos a las vendedoras: {len(cuerpo['mensajes'])}")
        with open(pdf, "rb") as fh:
            cuerpo["pdf_base64"] = base64.b64encode(fh.read()).decode()
        cuerpo["pdf_nombre"] = os.path.basename(pdf)
        print(f"PDF: {pdf}")
        if not prueba:
            link = subir_reporte(clave, cuerpo["pdf_base64"], cuerpo["pdf_nombre"],
                                 f"{'Pedidos y ventas' if unificado else 'Ventas' if ventas else 'Pedidos'} {datos.get('fecha_objetivo', '')} · {datos.get('origen', 'asesor')}")
            cuerpo["resumen"] += f"\n📄 Reporte: {link}"
            print(f"REPORTE PDF: {link}", flush=True)
            if registro is not None:
                import pedidos_estado
                # Lo que no es memoria del día (agenda leída de la hoja, formularios web, cuadre) no se guarda en el registro.
                guardable = {k: v for k, v in datos.items() if k not in ("agenda_pendiente", "pedidos_web", "sin_explicar", "_resuelto", "envios_hechos", "_entrega")}
                origen_reg = str(datos.get("origen", "asesor"))
                if datos.get("hora") and str(datos["hora"]) not in origen_reg:
                    origen_reg += f" {datos['hora']}"
                futuros, _ = pedidos_estado.registrar(clave, guardable, registro, origen_reg)
                print(f"Registro de pedidos guardado ({len(datos['pedidos'])} pedidos)."
                      + "".join(f" Agendados: {len(v)} para {f}." for f, v in futuros.items()), flush=True)
                if unificado:
                    r = guardar_en_sheet(clave, datos)
                    print(f"Hoja «Pedidos auto»: {r.get('nuevas', 0)} filas nuevas, {r.get('actualizadas', 0)} actualizadas"
                          + (f" (error: {r['error']})" if r.get("error") else ""), flush=True)
                    marcar_compras(clave, datos)
            if estado_nuevo:
                import ventas_estado
                ventas_estado.guardar(clave, estado_nuevo.get("fecha_objetivo", ""), estado_nuevo)
                print(f"Estado del día guardado (corte {estado_nuevo['corte']}).", flush=True)
    elif cuerpo["mensajes"]:
        cuerpo["resumen"] = f"🧭 Asesor — {len(cuerpo['mensajes'])} mensajes sugeridos a las vendedoras"

    if prueba:
        print(cuerpo.get("resumen", ""))
        for m in cuerpo["mensajes"]:
            print(f"\n→ {m.get('nombre')} (+{m.get('whatsapp')}) — {m.get('motivo', '')}\n{m.get('mensaje')}")
        print("\n(prueba, nada salió)")
        return
    if datos.get("analisis"):
        for i in range(0, len(datos["analisis"]), 100):
            r = al_worker(clave, {"origen": datos.get("origen", "asesor"), "fecha": datos.get("fecha_analisis"),
                                  "chats": datos["analisis"][i:i + 100]}, ANALISIS)
            print(f"Análisis guardados: {r.get('guardados', 0)} (sin chat: {len(r.get('sin_chat', []))})", flush=True)
    if not cuerpo["mensajes"] and "resumen" not in cuerpo and not any(datos.get(k) for k in ("respuestas_rapidas", "envios", "variantes", "saldos", "preguntas", "rescates")):
        print("Nada que avisar.")
        return
    if datos.get("rescates"):
        # El rescate de lead 1 lo decide el asesor y sale solo (autorizado por el dueño): ver docs/asesor.md.
        for i in range(0, len(datos["rescates"]), 15):
            r = al_worker(clave, {"rescates": datos["rescates"][i:i + 15]}, RESCATES)
            print(f"Rescates de lead 1 programados: {len(r.get('programados', []))}; rechazados: "
                  f"{json.dumps(r.get('rechazados', []), ensure_ascii=False)}", flush=True)
    mensajes = cuerpo.pop("mensajes")
    total = {"enviados": 0, "fallidos": [], "sugerencias": 0}
    # Primero ✨ Sugerencias del CRM (aprobar = programarlo): si Telegram
    # falla después, las propuestas ya quedaron guardadas.
    propuestas = [{"tipo": "seguimiento", "whatsapp": m.get("whatsapp"), "nombre": m.get("nombre"),
                   "motivo": m.get("motivo"), "texto": m.get("mensaje"), "objecion": m.get("objecion"),
                   "idea": m.get("idea") if isinstance(m.get("idea"), dict) else None,
                   "adjuntar": m.get("adjuntar") or [], "plantilla": m.get("plantilla") or None,
                   "pasos": [{"horas": p.get("horas"), "texto": p.get("mensaje") or p.get("texto")}
                             for p in m.get("pasos") or []]} for m in mensajes]
    propuestas += [dict(r, tipo="respuesta_rapida") for r in datos.get("respuestas_rapidas", [])]
    propuestas += [dict(v, tipo="variante") for v in datos.get("variantes", [])]
    # Preguntas al dueño ("¿puedo ofrecer…?"): solo el admin las ve y responde.
    propuestas += [{"tipo": "pregunta", "texto": q.get("pregunta") or q.get("texto"), "motivo": q.get("motivo"),
                    "opciones": q.get("opciones") or [], "whatsapp": q.get("whatsapp"), "nombre": q.get("nombre")}
                   for q in datos.get("preguntas", [])]
    # Capturas del pago del saldo que vio el asesor: las confirma una persona de Shalom con un toque.
    propuestas += [{"tipo": "saldo", "whatsapp": s.get("whatsapp"), "nombre": s.get("nombre"), "codigo": s.get("codigo"),
                    "texto": s.get("texto") or f"Captura de S/{s.get('monto', '')}", "motivo": s.get("motivo")}
                   for s in datos.get("saldos", [])]
    # Links con la boleta lista: solo al admin, en el CRM. No van a Telegram.
    propuestas += [{"tipo": "envio", "whatsapp": e.get("whatsapp"), "nombre": e.get("nombre"), "link": e.get("link"),
                    "motivo": e.get("motivo"), "texto": e.get("mensaje")} for e in datos.get("envios", [])]
    for i in range(0, len(propuestas), 20):
        r = al_worker(clave, {"origen": datos.get("origen", "asesor"), "sugerencias": propuestas[i:i + 20]}, SUGERENCIAS)
        total["sugerencias"] += r.get("creadas", 0) + r.get("actualizadas", 0)
        total.setdefault("sin_chat", []).extend(r.get("sin_chat", []))
    print(f"Sugerencias guardadas en el CRM: {total['sugerencias']}", flush=True)
    # Telegram: el PDF de pedidos al dueño (si hay) y UN solo aviso al equipo
    # "hay recomendaciones nuevas". Los mensajes en sí quedan en ✨ Sugerencias.
    aviso = {"nuevas_recomendaciones": total["sugerencias"]} if total["sugerencias"] else {}
    if "pdf_base64" in cuerpo:
        aviso.update(cuerpo)
    if aviso:
        r = al_worker(clave, aviso)
        total["enviados"] += r.get("enviados", 0)
        total["fallidos"] += r.get("fallidos", [])
    if unificado and not solo_mensajes and es_cierre(datos, args):
        try:
            datos["_entrega"] = salud_whatsapp(clave, datos.get("fecha_venta", ""))
            pdf_d, resumen_d = armar_pdf_dueno(datos, carpeta)
            with open(pdf_d, "rb") as fh:
                b64 = base64.b64encode(fh.read()).decode()
            link_d = subir_reporte(clave, b64, os.path.basename(pdf_d), f"Saldos y reposiciones {datos.get('fecha_venta', '')} (solo Moi)")
            r = al_worker(clave, {"pdf_base64": b64, "pdf_nombre": os.path.basename(pdf_d), "resumen": resumen_d + f"\n📄 {link_d}", "solo_dueno": True})
            print(f"REPORTE DEL DUEÑO (saldos y reposiciones, solo Moi): {link_d} · Telegram: {r.get('a_dueno', 0)}", flush=True)
        except Exception as err:  # noqa: BLE001
            print(f"⚠️ No se pudo armar o mandar el reporte del dueño (saldos y reposiciones): {err}", flush=True)
    print(json.dumps(total, ensure_ascii=False))


if __name__ == "__main__":
    main()

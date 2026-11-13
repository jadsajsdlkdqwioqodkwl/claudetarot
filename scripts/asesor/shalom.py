"""
Shalom (provincia): agencias y Excel de envío masivo (dueño, 2026-11-08). Primer paso para registrar los envíos de provincia sin
pegar nada a mano; el registro directo en Shalom Pro queda para después (su panel bloquea a los robots y hace falta un navegador).

    python3 scripts/asesor/shalom.py agencias [--actualizar]
        -> las 566 agencias de Shalom con el código que acepta Shalom Pro («LIMA / LIMA / CHORRILLOS / CHORRILLOS CO»), desde la API
           pública de shalom.com.pe/agencias (data/shalom-agencias.json). --actualizar las vuelve a bajar (si la versión cambió).
    python3 scripts/asesor/shalom.py buscar "<lo que escribió el cliente>"
        -> las agencias que mejor calzan (ciudad, distrito, avenida, nombre), con su código, dirección y horario. Si calzan varias,
           hay que preguntarle al cliente (el reporte lo marca «CONFIRMAR AGENCIA»).
    ASESOR_CLAVE=... python3 scripts/asesor/shalom.py masivo [AAAA-MM-DD ...] [--solo N] [--agencias ajustes.json] [--clave NNNN] [--sin-ventas] [--subir] [--salida x.xlsx]
        -> el Excel del «Formato Pro Masivo» de Shalom con los pedidos de PROVINCIA confirmados del registro del reporte de esa(s)
           fecha(s) de despacho (DNI, teléfono, agencia de destino, PAQUETE XXS, 1 unidad, origen CHORRILLOS CO). Varias fechas = un
           simulacro con varios días. Junto al Excel sale «…-referencia.xlsx» (NO se sube a Shalom) con, por fila: nombre, WhatsApp, lo
           que escribió el cliente, la agencia elegida y las otras candidatas, para que una persona revise antes de subir. El archivo
           para Shalom es su plantilla oficial byte a byte (solo se escriben las celdas con datos): cualquier otro cambio la rechaza.

           --agencias ajustes.json: {"51987654321": "AV PARRA 379", ...} fija la agencia (nombre del desplegable de Shalom) de un
           WhatsApp cuando el buscador dudó o se equivocó. Las dudas que queden salen listadas.
           Las claves son sagradas (dueño, 2026-11-08): el Worker NUNCA inventa ni asigna una. Solo con --clave NNNN (la clave del día
           que el dueño le dio a la sesión) se crean las ventas de la pestaña Ventas (`POST /api/asesor/ventas crear`) con esa clave,
           que es la que el CRM le mandará al cliente cuando pague el saldo; si una venta ya existía, se le pone esa misma clave. Sin
           --clave no se toca la hoja Ventas y la referencia dice «PENDIENTE». La clave va en el archivo de referencia (nunca en
           Telegram ni al cliente). Deja /tmp/shalom/lote.json con los DNI del lote para `clave`.
    python3 scripts/asesor/shalom.py clave NNNN [lote.json]
        -> pone o corrige la clave de seguridad de TODAS las ventas del último lote (crea la venta si no existe). Es lo que se corre
           cuando el dueño da la clave después del Excel o la corrige.
           --clave NNNN: la clave de seguridad del día que el dueño le dijo a la sesión; se usa para TODAS las ventas del lote (así en
           Shalom Pro basta «CLAVE MASIVA»). Sin --clave no se crea ninguna venta y nadie asigna clave.
           --subir: deja el Excel y la referencia en CRM → Reportes (links) para descargarlos desde cualquier lado.
    python3 scripts/asesor/shalom.py agregar <whatsapp> --nombre "…" --dni 12345678 --agencia "texto del cliente" [--pago …] [--nota …]
                                                 -> provincia que el reporte no trajo: a la hoja como CONFIRMADO (entra al masivo)
    python3 scripts/asesor/shalom.py telegram "texto"   -> aviso al dueño por el Worker (sin claves).

Paso a paso en Shalom Pro (probado el 2026-11-08): Registra → Registro de envíos masivos → «Sube el archivo» (el Excel de `masivo`)
→ Continuar → Shalom muestra «N envíos registrados» y autocompleta el nombre por DNI (puede cambiar el celular por el de su base:
revisar) → «Ingresar clave de seguridad» en cada envío con la clave del archivo de referencia (o «CLAVE MASIVA» si todas son
iguales) → «Registrar envíos» → descargar/imprimir las boletas → foto de boleta + caja al número de la empresa → Routine de boletas.

De dónde sale cada columna del Excel (el masivo NO autocompleta nada por DNI, así que todo tiene que venir del chat):
  DESTINATARIO (DOC) = DNI que el cliente escribió en el chat (el reporte lo guarda en `dni`; sin DNI la fila sale marcada).
  TELF. DESTINATARIO = el WhatsApp del cliente (9 dígitos) salvo que haya dado otro número para recoger.
  ORIGEN = CHORRILLOS CO (de donde salen los paquetes). DESTINO = la agencia de Shalom tal como la llama Shalom Pro (último tramo del
  código «DEP / PROV / DIST / AGENCIA»), elegida con `buscar` a partir de lo que escribió el cliente («Shalom Av. Parra, Arequipa»).
  MERCADERIA = PAQUETE XXS (la medida más barata, S/8; las medidas y el peso los calcula la plantilla), CANTIDAD 1. Con 2 o más kits:
  UN solo PAQUETE XS, cantidad 1 (dueño 2026-11-11), nunca N paquetes XXS.
  CONTACTO, TELF. CONTACTO, NRO GRR y COBRO SEGURO quedan vacíos (sin cobro seguro, regla del dueño).
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
# Palabras que están en casi todos los nombres y direcciones: no identifican una agencia (no suman como «propias»).
GENERICO = {"avenida", "calle", "jiron", "pasaje", "urbanizacion", "urb", "asoc", "asociacion", "aahh", "aa", "hh", "manzana", "lote", "km", "co", "plaza", "mercado", "centro", "principal", "oficina", "sede", "nuevo", "nueva", "san", "santa", "santo", "los", "las", "el", "la", "de", "del"}


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


_AGENCIAS = None


def cargar():
    """Las agencias del día. Las guarda el Worker (las baja de la API pública de Shalom una vez al día: `GET /api/asesor/
    shalom-agencias`), así todo el sistema usa la misma lista sin commits. Si no hay clave, no hay red o el Worker falla, se usa
    el archivo del repo (`data/shalom-agencias.json`). Trae también `confirmadas` (lo que una persona ya confirmó por pedido)."""
    global _AGENCIAS
    if _AGENCIAS is not None:
        return _AGENCIAS
    d = None
    if os.environ.get("ASESOR_CLAVE") and not os.environ.get("SHALOM_SIN_RED"):
        try:
            r = pedir_worker("/shalom-agencias")
            if isinstance(r, dict) and len(r.get("agencias") or []) >= 300:
                d = dict(r, _origen="Worker (copia del día)")
        except Exception as err:  # noqa: BLE001
            print(f"⚠️ No se pudieron leer las agencias del Worker ({err}); uso el archivo del repo.", file=sys.stderr)
    if d is None:
        d = dict(json.load(open(DATOS, encoding="utf-8")), _origen="archivo del repo")
    _AGENCIAS = d
    return d


def recibe(a):
    """¿La agencia RECIBE envíos? (`destino = 1`). De las 566 de la API, 77 no reciben (p. ej. AV. HUAYRUROPATA en Wanchaq)."""
    return str(a.get("destino")) == "1"


_DESTINOS = None


def plantilla_destinos():
    """Los nombres que acepta la columna G (DESTINO) del Excel: la lista `Hoja2!C2:C490` de la plantilla oficial. El Excel
    identifica la agencia SOLO por ese texto exacto."""
    global _DESTINOS
    if _DESTINOS is None:
        import zipfile
        z = zipfile.ZipFile(PLANTILLA)
        sst = [re.sub(r"<[^>]+>", "", x).replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">") for x in re.findall(r"<si>(.*?)</si>", z.read("xl/sharedStrings.xml").decode("utf-8"), re.S)]
        rels = dict(re.findall(r'Id="(rId\d+)"[^>]*?Target="([^"]+)"', z.read("xl/_rels/workbook.xml.rels").decode()) or [(b, a) for a, b in re.findall(r'Target="([^"]+)"[^>]*?Id="(rId\d+)"', z.read("xl/_rels/workbook.xml.rels").decode())])
        rid = re.search(r'<sheet [^>]*name="Hoja2"[^>]*r:id="(rId\d+)"', z.read("xl/workbook.xml").decode()).group(1)
        hoja = z.read("xl/" + rels[rid].lstrip("/")).decode("utf-8")
        out = []
        for m in re.finditer(r'<c r="C(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', hoja, re.S):
            v = re.search(r"<v>(.*?)</v>", m.group(3) or "")
            if int(m.group(1)) >= 2 and v:
                out.append(sst[int(v.group(1))] if 't="s"' in m.group(2) else v.group(1))
        _DESTINOS = out
    return _DESTINOS


def nombre_plantilla(agencia):
    """El texto EXACTO de `Hoja2!C` para una agencia de la API (8 nombres de la API traen espacios de más al final:
    «HUANCARO », «PUNTA HERMOSA »…). None si la plantilla no la tiene."""
    lista = plantilla_destinos()
    crudo = str(agencia or "")
    if crudo in lista:
        return crudo
    por_recorte = {x.strip(): x for x in lista}
    if crudo.strip() in por_recorte:
        return por_recorte[crudo.strip()]
    junto = {re.sub(r"\s+", " ", x).strip(): x for x in lista}
    return junto.get(re.sub(r"\s+", " ", crudo).strip())


def cruce_plantilla(agencias=None):
    """(nuevas, quitadas): agencias que reciben y la plantilla no tiene, y nombres de la plantilla que ya no existen en la API."""
    agencias = agencias if agencias is not None else cargar()["agencias"]
    reciben = [a for a in agencias if recibe(a)]
    nuevas = sorted(a["agencia"].strip() for a in reciben if not nombre_plantilla(a["agencia"]))
    vivos = {re.sub(r"\s+", " ", a["agencia"]).strip() for a in reciben}
    quitadas = sorted(x for x in plantilla_destinos() if re.sub(r"\s+", " ", x).strip() not in vivos)
    return nuevas, quitadas


def agencias_al_dia(avisar=True):
    """Primer paso de todo lo que usa agencias (masivo, revisión, recomendar): carga la copia del día, la cruza con la plantilla y
    avisa UNA vez por Telegram si la plantilla quedó vieja o si la API de Shalom falló. Devuelve la línea de estado."""
    d = cargar()
    nuevas, quitadas = cruce_plantilla(d["agencias"])
    linea = (f"Agencias de Shalom: {len(d['agencias'])} ({sum(1 for a in d['agencias'] if recibe(a))} reciben envíos) · versión {d.get('version')} · "
             f"bajadas {d.get('bajado')} · revisadas {d.get('revisado') or d.get('bajado')} · {d.get('_origen')}")
    con_red = bool(os.environ.get("ASESOR_CLAVE")) and not os.environ.get("SHALOM_SIN_RED") and avisar
    if d.get("error"):
        linea += f"\n⚠️ La API de Shalom falló ({d['error']}): sigo con la copia que hay. Respaldo manual: https://www.shalom.com.pe/agencias (su buscador solo busca por PROVINCIA)."
        hoy = dt.datetime.now(LIMA).date().isoformat()
        if con_red and d.get("aviso_api") != hoy:
            cmd_telegram(f"⚠️ La API de agencias de Shalom no respondió o cambió de forma ({d['error']}). Se sigue con la lista del {d.get('bajado')}. Respaldo manual: https://www.shalom.com.pe/agencias (buscar por provincia).", callar=True)
            pedir_worker("/shalom-agencias", {"accion": "aviso_api", "version": hoy})
    if nuevas or quitadas:
        linea += (f"\n⚠️ LA PLANTILLA DEL EXCEL QUEDÓ VIEJA: {len(nuevas)} agencia(s) nueva(s) que no tiene ({', '.join(nuevas[:8])}) y {len(quitadas)} nombre(s) que Shalom ya no usa "
                  f"({', '.join(quitadas[:8])}). Hay que bajar la plantilla nueva de Shalom Pro; mientras tanto esas agencias no van al Excel.")
        if con_red and str(d.get("aviso_plantilla")) != str(d.get("version")):
            cmd_telegram(f"⚠️ Shalom cambió sus agencias (versión {d.get('version')}) y la plantilla del Excel masivo quedó vieja. Nuevas: {', '.join(nuevas[:10]) or '—'}. Ya no existen: {', '.join(quitadas[:10]) or '—'}. "
                         "Hay que bajar la plantilla nueva de Shalom Pro (Registro de envíos masivos → descargar formato) y pasarla para actualizar el sistema. Mientras tanto esas agencias no entran al Excel.", callar=True)
            pedir_worker("/shalom-agencias", {"accion": "aviso_plantilla", "version": str(d.get("version"))})
    return linea


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
    # Solo agencias que RECIBEN envíos (`destino = 1`): una que no recibe no puede ser el destino (2026-11-13).
    agencias = [a for a in cargar()["agencias"] if recibe(a)]
    # Palabras del cliente que son un LUGAR conocido por Shalom (departamento / provincia / distrito de alguna agencia). Si el cliente
    # nombró un lugar, una agencia de OTRO lugar no puede ganar por el nombre de la calle (2026-11-09: «Av. Mariscal Castilla, Mollendo»
    # ganaba la agencia de Huancayo «AV MARISCAL CASTILLA»; la correcta es MOLLENDO CO).
    geo_conocidas = {c for a in agencias for seg in str(a["codigo"]).split(" / ")[:-1] for c in palabras(seg)} - set(GENERICO)
    lugares = [w for w in q if len(w) >= 3 and w in geo_conocidas]  # también lugares de 3 letras: Ilo, Ica, Ate
    for a in agencias:
        segmentos = [palabras(x) for x in str(a["codigo"]).split(" / ")]  # departamento, provincia, distrito, agencia
        dire = palabras(a["direccion"]); nom = segmentos[-1] if segmentos else []
        geo = {c for seg in segmentos[:-1] for c in seg}
        p = 0; especifico = False
        for w in q:
            parecido = lambda c: w == c or (len(w) > 4 and (c.startswith(w) or w.startswith(c)))
            # Cada nivel que calza suma; el distrito pesa más que la provincia y esta más que el departamento (2026-11-09: «Sachaca»
            # empataba con todas las agencias de Arequipa y ganaba la primera por orden alfabético).
            # Cada palabra cuenta UNA vez, por el nivel más profundo que calza («Arequipa» en dep, prov y distrito vale 5, no 10).
            pesos = (2, 3, 5)
            niveles_ok = [pesos[min(i_, 2)] for i_, seg in enumerate(segmentos[:-1]) if any(parecido(c) for c in seg)]
            p += max(niveles_ok) if niveles_ok else 0
            propia = w not in GENERICO and not any(parecido(c) for c in geo)
            if propia and any(parecido(c) for c in nom): p += 6; especifico = True      # una palabra PROPIA del nombre de la agencia
            if propia and w in dire: p += 2; especifico = True
            elif propia and any(len(w) > 4 and d.startswith(w) for d in dire): p += 1; especifico = True
        if lugares and not any(any(w == c or (len(w) > 4 and (c.startswith(w) or w.startswith(c))) for c in geo) for w in lugares):
            p -= 8 * len(lugares)  # el cliente nombró un lugar y esta agencia no está ahí
        if p > 0:
            res.append((p, especifico, a))
    res.sort(key=lambda x: (-x[0], x[2]["codigo"]))
    if not res:
        return []
    tope, esp = res[0][0], res[0][1]
    segundo = res[1][0] if len(res) > 1 else 0
    top = res[0][2]
    # Única agencia de su distrito y el texto nombró ese distrito: también es segura (p. ej. «Shalom Huarmey»).
    unica = sum(1 for a in agencias if (a["departamento"], a["provincia"], a["distrito"]) == (top["departamento"], top["provincia"], top["distrito"])) == 1
    # Seguro si el texto nombra algo propio de la agencia y saca al menos 3 puntos al siguiente, o si es la única agencia del distrito nombrado.
    return [{"puntos": p, "seguro": p == tope and ((e and tope - segundo >= 3) or (unica and tope >= 6)), **a} for p, e, a in res[:n]]


# ---------- UNA sola función decide la agencia (dueño 2026-11-13) ----------
# La usan el Excel masivo, la página de revisión (dinsides.py presentar), las etiquetas, la referencia y `recomendar`.
RE_SIN_DEFINIR = re.compile(r"sin definir|por definir|no sabe|no conoce|confirmar la (sede|agencia)|agencia (por|a) confirmar|falta (la )?(agencia|direcci)|la m[aá]s cercana|cualquiera", re.I)
RE_REFERENCIA = re.compile(r"(?:frente a(?:l)?|al frente de(?:l)?|al costado de(?:l)?|al lado de(?:l)?|cerca (?:de(?:l)?|a(?:l)?)|detr[aá]s de(?:l)?|a espaldas de(?:l)?|por (?:el|la)|altura de(?:l)?|"
                           r"paradero|mercado|plaza|parque|colegio|hospital|cl[ií]nica|terminal|grifo|[oó]valo|banco|iglesia|universidad|estadio|comisar[ií]a|puente)\s+[^,;.()]{3,60}", re.I)
# Palabras de referencia que están en decenas de direcciones: solas no distinguen una agencia.
COMUN_REF = GENERICO | {"paradero", "mercado", "plaza", "parque", "colegio", "hospital", "clinica", "terminal", "grifo", "ovalo", "banco", "iglesia", "frente", "costado", "cuadras", "cuadra",
                        "cdras", "mtrs", "metros", "espaldas", "altura", "cruce", "entre", "antes", "despues", "nueva", "nuevo", "san", "santa", "peru", "sur", "norte", "este", "oeste"}


# Palabras comunes que SÍ distinguen cuando están en el NOMBRE de la agencia («TALARA BAJA PARQUE 22», «MERCADO MODELO»).
NOMBRE_OK = {"parque", "mercado", "plaza", "terminal", "ovalo", "grifo", "paradero", "colegio", "hospital", "banco", "iglesia", "puente", "estadio"}


def _parecido(w, c):
    return w == c or (len(w) > 4 and len(c) > 4 and (c.startswith(w) or w.startswith(c)))


def metros(lat1, lng1, lat2, lng2):
    """Distancia en metros entre dos puntos (haversine)."""
    import math
    try:
        a1, o1, a2, o2 = (math.radians(float(x)) for x in (lat1, lng1, lat2, lng2))
    except (TypeError, ValueError):
        return None
    h = math.sin((a2 - a1) / 2) ** 2 + math.cos(a1) * math.cos(a2) * math.sin((o2 - o1) / 2) ** 2
    return int(round(2 * 6371000 * math.asin(math.sqrt(h))))


def _ficha(a, dist=None):
    return {"agencia": nombre_plantilla(a["agencia"]) or a["agencia"].strip(), "codigo": a["codigo"], "direccion": re.sub(r"\s+", " ", str(a.get("direccion") or "")).strip(),
            "lat": a.get("lat"), "lng": a.get("lng"), "en_plantilla": bool(nombre_plantilla(a["agencia"])), **({"metros": dist} if dist is not None else {})}


def buscar_osm(consulta, cache=None):
    """Puntos de OpenStreetMap (Nominatim) para una referencia, por el Worker (caché en R2, 1 consulta por segundo). `cache` =
    {consulta en minúsculas: {"hits": [{lat, lng, nombre}]}} para probar sin red."""
    k = re.sub(r"\s+", " ", consulta).strip().lower()
    if cache is not None:
        return (cache.get(k) or {}).get("hits") or []
    if not os.environ.get("ASESOR_CLAVE") or os.environ.get("SHALOM_SIN_RED"):
        return []
    try:
        r = pedir_worker("/shalom-agencias", {"accion": "osm", "consultas": [{"q": consulta}]})
        return ((r.get("resultados") or [{}])[0]).get("hits") or []
    except Exception:  # noqa: BLE001
        return []


def elegir_agencia(pedido, confirmadas=None, osm_cache=None):
    """LA agencia de Shalom de un pedido de provincia. `pedido` = {whatsapp, direccion_o_agencia, courier?, ...} (o un texto).
    Devuelve SIEMPRE lo mismo: {agencia (texto exacto de la plantilla), codigo, direccion, confianza: "confirmada" | "segura" |
    "dudosa", segura (bool: puede ir al Excel), porque, candidatas: [{agencia, codigo, direccion, metros?}], texto, referencia}.
    Solo agencias que reciben envíos (`destino = 1`); la central («… CO») no tiene trato especial. Lo que no se sabe queda dudoso."""
    if isinstance(pedido, str):
        pedido = {"direccion_o_agencia": pedido}
    texto = re.sub(r"\s+", " ", f"{pedido.get('direccion_o_agencia') or ''} {pedido.get('courier') or ''}").strip()
    datos = cargar()
    reciben = [a for a in datos["agencias"] if recibe(a)]
    k9 = re.sub(r"\D", "", str(pedido.get("whatsapp") or ""))[-9:]
    out = {"agencia": "", "codigo": "", "direccion": "", "confianza": "dudosa", "segura": False, "porque": "", "candidatas": [], "texto": texto, "referencia": ""}

    def cerrar(a, confianza, porque, candidatas=(), dist=None):
        f = _ficha(a, dist)
        out.update(agencia=f["agencia"], codigo=f["codigo"], direccion=f["direccion"], confianza=confianza, porque=porque, candidatas=[c for c in candidatas if c["codigo"] != f["codigo"]][:6])
        out["segura"] = confianza in ("segura", "confirmada")
        if not f["en_plantilla"]:
            out["segura"] = False
            out["confianza"] = "dudosa"
            out["porque"] = f"«{f['agencia']}» no está en la lista de destinos de la plantilla del Excel (Hoja2): hay que bajar la plantilla nueva de Shalom Pro. " + porque
        return out

    # 0. Lo que una persona ya confirmó (revisión de envíos o chat) manda, si esa agencia sigue recibiendo.
    conf = (confirmadas if confirmadas is not None else datos.get("confirmadas") or {}).get(k9) if k9 else None
    if conf:
        a = next((x for x in reciben if (nombre_plantilla(x["agencia"]) or x["agencia"].strip()) == str(conf.get("agencia") or "").strip() or x["codigo"] == conf.get("codigo")), None)
        if a:
            return cerrar(a, "confirmada", f"confirmada por {conf.get('quien') or 'una persona'} el {conf.get('cuando') or conf.get('fecha') or '?'}")
        out["porque"] = f"se había confirmado «{conf.get('agencia')}», pero esa agencia ya no recibe envíos o no existe; "
    q = palabras(texto)
    # ¿Nombró un lugar donde Shalom tiene agencias pero NINGUNA recibe envíos? (2026-11-13: Pucallpa, 8 agencias y todas con
    # `destino = 0`; el Excel llevó «CALLERIA AV SAENZ PEÑA» y esa fila no se registró). No se manda a otra ciudad: se avisa.
    por_prov = {}
    for a in datos["agencias"]:
        por_prov.setdefault((a["departamento"], a["provincia"]), []).append(a)
    mejor_prov, mejor_n = None, 0
    for (dep, prov), lista in por_prov.items():
        nombres = {c for a in lista for seg in (prov, a["distrito"]) for c in palabras(seg) if len(c) >= 3 and c not in GENERICO}
        n = sum(1 for w in set(q) if any(_parecido(w, c) for c in nombres))
        if n > mejor_n:
            mejor_prov, mejor_n = (dep, prov), n
    if mejor_prov and not any(recibe(a) for a in por_prov[mejor_prov]):
        out["porque"] += (f"Shalom NO recibe envíos en {mejor_prov[1]} ({mejor_prov[0]}): tiene {len(por_prov[mejor_prov])} agencia(s) ahí y ninguna recibe. "
                          "Hay que ofrecerle al cliente otra agencia de otra ciudad u Olva")
        out["sin_servicio"] = True
        # Cómo llamó el cliente a su ciudad («Pucallpa», no «Coronel Portillo»), para el texto de la asesora.
        nombres_lugar = [c for a in por_prov[mejor_prov] for seg in (a["distrito"], mejor_prov[1]) for c in palabras(seg) if len(c) > 3]
        out["lugar"] = next((w.capitalize() for w in q if w in nombres_lugar), _titulo(mejor_prov[1]))
        return out
    cand = buscar(texto, 8) if q else []
    if not cand:
        out["porque"] += "el texto del cliente no nombra ningún lugar ni agencia que Shalom reconozca"
        return out
    top = cand[0]
    lugar = lambda a: (a["departamento"], a["provincia"], a["distrito"])
    nombra = lambda nombre: any(_parecido(w, c) for w in q for c in palabras(nombre) if len(c) >= 3)
    del_distrito = [a for a in reciben if lugar(a) == lugar(top)]
    de_provincia = [a for a in reciben if lugar(a)[:2] == lugar(top)[:2]]
    # Universo de candidatas: el distrito que nombró; si el «distrito» es en realidad la ciudad (se llama igual que la provincia) o no
    # nombró distrito, todas las de la provincia.
    ciudad = norm(top["distrito"]) == norm(top["provincia"])
    if nombra(top["distrito"]) and not (ciudad and len(de_provincia) > len(del_distrito)):
        universo, ambito = del_distrito, f"el distrito {top['distrito']}"
    elif nombra(top["provincia"]) or nombra(top["distrito"]):
        universo, ambito = de_provincia, f"la provincia {top['provincia']}"
    else:
        # No nombró ni distrito ni provincia (solo una calle o el nombre de la agencia): vale si el buscador no tiene dudas.
        universo, ambito = [c for c in reciben if any(c["codigo"] == x["codigo"] for x in cand[:5])], "las agencias que calzan con el texto"
    fichas = [_ficha(a) for a in universo]
    sin_definir = bool(RE_SIN_DEFINIR.search(texto))
    if len(universo) == 1 and universo[0]["codigo"] == top["codigo"] and ambito.startswith(("el distrito", "la provincia")):
        return cerrar(top, "segura", f"es la única agencia que recibe envíos en {ambito}")
    # Palabras PROPIAS del cliente (ni genéricas ni el nombre del lugar) y en cuántas candidatas aparecen (nombre, dirección o referencia).
    geo = {c for a in universo for seg in (a["departamento"], a["provincia"], a["distrito"]) for c in palabras(seg)}
    propias = [w for w in q if w not in COMUN_REF and w not in geo and (len(w) > 3 or w.isdigit())]
    def aciertos(a):
        donde = palabras(a["agencia"]) + palabras(a["direccion"])
        nombre = [c for c in palabras(a["agencia"]) if c not in geo]
        hits = [w for w in propias if any(_parecido(w, c) or (w.isdigit() and w == c) for c in donde)]
        # Una palabra común («parque», «mercado») cuenta cuando está en el NOMBRE de la agencia: «agencia Parque 22» → TALARA BAJA PARQUE 22.
        hits += [w for w in q if w not in hits and w not in geo and w in NOMBRE_OK and w in nombre]
        return hits
    def en_nombre(a):
        nombre = [c for c in palabras(a["agencia"]) if c not in geo and c not in GENERICO]
        return [w for w in propias if not w.isdigit() and any(_parecido(w, c) for c in nombre)]
    con = sorted(((aciertos(a), a) for a in universo), key=lambda x: -len(x[0]))
    con = [(h, a) for h, a in con if h]
    ref = RE_REFERENCIA.search(re.sub(r"\bshalom\b", " ", texto, flags=re.I))
    out["referencia"] = ref.group(0).strip() if ref else ""
    sin_lugar = ambito.startswith("las agencias")
    por_nombre = [a for a in universo if en_nombre(a)]
    if len(por_nombre) == 1 and not sin_definir and (not sin_lugar or top.get("seguro")):
        return cerrar(por_nombre[0], "segura", f"el cliente nombró «{' '.join(en_nombre(por_nombre[0]))}», que es el nombre de esta agencia y de ninguna otra de {ambito}", fichas)
    if con and not sin_definir and not sin_lugar:
        mejor, a_mejor = con[0]
        segundo = con[1][0] if len(con) > 1 else []
        # Algo propio (calle, número, nombre) que aparece en UNA sola agencia, o claramente más que en la siguiente.
        if (len(con) == 1 or len(mejor) - len(segundo) >= 2 or (any(w.isdigit() and len(w) >= 2 for w in mejor) and not any(w.isdigit() for w in segundo) and len(mejor) > len(segundo))) \
                and any(len(w) > 3 for w in mejor):
            return cerrar(a_mejor, "segura", f"el cliente escribió «{' '.join(mejor)}», que entre las {len(universo)} agencia(s) de {ambito} solo calza con esta", fichas)
    # Triangulación con OpenStreetMap: la referencia del cliente (mercado, plaza, paradero, «frente a…») contra la lat/lng de cada agencia.
    distancias = []
    if out["referencia"] and len(universo) > 1:
        consulta = f"{out['referencia']}, {top['distrito'] if not ciudad else top['provincia']}, {top['provincia']}, Perú"
        hits = buscar_osm(consulta, osm_cache)
        if hits:
            pt = hits[0]
            for a in universo:
                m = metros(pt["lat"], pt["lng"], a.get("lat"), a.get("lng"))
                if m is not None:
                    distancias.append((m, a))
            distancias.sort(key=lambda x: x[0])
            fichas = [_ficha(a, m) for m, a in distancias] + [_ficha(a) for a in universo if not any(a is b for _, b in distancias)]
            if distancias and not sin_definir and distancias[0][0] <= 400 and (len(distancias) == 1 or distancias[1][0] >= 2 * max(distancias[0][0], 150)):
                m, a = distancias[0]
                return cerrar(a, "segura", f"OpenStreetMap ubica «{out['referencia']}» ({pt['nombre'][:70]}) a {m} m de esta agencia; la siguiente queda a "
                              f"{distancias[1][0] if len(distancias) > 1 else '—'} m", fichas, m)
            porque_osm = (f"OpenStreetMap ubica «{out['referencia']}» pero ninguna agencia queda claramente más cerca "
                          f"({'; '.join(f'{_ficha(a)[chr(97) + chr(103) + chr(101) + chr(110) + chr(99) + chr(105) + chr(97)]} a {m} m' for m, a in distancias[:3])})")
        else:
            porque_osm = f"OpenStreetMap no encontró «{out['referencia']}» en {top['provincia']}"
    else:
        porque_osm = "el cliente no dio una referencia (mercado, plaza, avenida, «frente a…»)" if not out["referencia"] else ""
    # Sin universo claro pero el buscador no tiene dudas (nombró algo propio de la agencia y le saca ventaja a las demás).
    mejor_a = distancias[0][1] if distancias else (con[0][1] if con else top)
    motivos = []
    # ¿Lo que escribió calza con una agencia de ese lugar que NO recibe envíos? Se dice, para no mandarlo a ciegas a otra.
    for a in datos["agencias"]:
        if not recibe(a) and (a["departamento"], a["provincia"]) == (top["departamento"], top["provincia"]):
            suyas = [c for c in palabras(a["agencia"]) + palabras(a["direccion"])[:6] if c not in geo and c not in COMUN_REF and len(c) > 4]
            if any(_parecido(w, c) for w in propias for c in suyas):
                motivos.append(f"lo que escribió calza con «{a['agencia'].strip()}» ({a['direccion'][:50]}), que NO recibe envíos")
                break
    if sin_definir:
        motivos.append("el reporte dice que el cliente no definió la agencia")
    if len(universo) > 1:
        motivos.append(f"en {ambito} hay {len(universo)} agencias que reciben envíos")
    if con and len(con) > 1:
        motivos.append("lo que escribió calza con más de una")
    if porque_osm:
        motivos.append(porque_osm)
    return cerrar(mejor_a, "dudosa", "; ".join(motivos) or "no hay un dato que distinga una sola agencia", fichas, distancias[0][0] if distancias else None)


def agencia_de_nota(nota, mostrada=None):
    """La agencia que una persona escribió en la nota de la revisión («agencia Av Parra 379», una dirección o una referencia).
    `mostrada` = {agencia, codigo} que tenía la tarjeta (para acotar a esa provincia). Devuelve (ficha | None, por qué no).
    Si no calza con UNA sola agencia que recibe envíos, no se adivina."""
    texto = re.sub(r"^\s*(la\s+)?agencia\s*(es|:|=)?\s*", "", str(nota or "").strip(), flags=re.I)
    if not texto:
        return None, "la nota está vacía"
    reciben = [a for a in cargar()["agencias"] if recibe(a)]
    plano = lambda t: re.sub(r"\s+", " ", norm(t))
    exactas = [a for a in reciben if plano(a["agencia"]) == plano(texto)]
    prov = None
    if mostrada and mostrada.get("codigo"):
        partes = [x.strip() for x in str(mostrada["codigo"]).split(" / ")]
        prov = tuple(partes[:2]) if len(partes) >= 3 else None
    if len(exactas) > 1 and prov:
        exactas = [a for a in exactas if (a["departamento"], a["provincia"]) == prov] or exactas
    if len(exactas) == 1:
        return _ficha(exactas[0]), ""
    e = elegir_agencia({"direccion_o_agencia": texto}, confirmadas={})
    if not e["segura"] and prov:
        e = elegir_agencia({"direccion_o_agencia": f"{texto}, {prov[1]}"}, confirmadas={})
    if e["segura"]:
        return {"agencia": e["agencia"], "codigo": e["codigo"], "direccion": e["direccion"], "en_plantilla": True}, ""
    return None, e["porque"] + ((" · candidatas: " + " | ".join(f"{c['agencia']} ({c['direccion'][:40]})" for c in e["candidatas"][:4])) if e["candidatas"] else "")


def confirmar(whatsapp, agencia, codigo="", fecha="", quien="", texto=""):
    """Guarda en el Worker la agencia confirmada por una persona para ese pedido (memoria: R2 `shalom/confirmadas.json`).
    El Excel, la revisión y las etiquetas la usan sin volver a buscar."""
    global _AGENCIAS
    r = pedir_worker("/shalom-agencias", {"accion": "confirmar", "whatsapp": whatsapp, "agencia": agencia, "codigo": codigo, "fecha": fecha, "quien": quien, "texto": texto})
    if _AGENCIAS is not None and r.get("ok"):
        _AGENCIAS.setdefault("confirmadas", {})[re.sub(r"\D", "", str(whatsapp))[-9:]] = r.get("confirmada")
    return r


def aplicar_notas(notas, pedidos, fecha="", quien="la asesora (revisión de envíos)"):
    """Las notas de la página de revisión sobre pedidos de Shalom → agencias confirmadas. «OK» confirma la agencia que mostraba la
    tarjeta; una corrección que nombra una agencia (o da una dirección o referencia) se busca con `agencia_de_nota`. Devuelve las
    líneas para mostrar."""
    lineas = []
    por_wa = {re.sub(r"\D", "", str(p.get("whatsapp") or ""))[-9:]: p for p in pedidos or [] if p.get("tipo") == "shalom"}
    for wa, n in (notas or {}).items():
        p = por_wa.get(re.sub(r"\D", "", str(wa))[-9:])
        if not p:
            continue
        nombre = p.get("nombre") or wa
        decision, nota = n.get("decision") or "", str(n.get("texto") or "").strip()
        m = re.search(r"agencia\s*(?:es|:|=)?\s*(.+)", nota, re.I)
        if decision == "ok" and not m:
            if p.get("agencia"):  # «OK» = la agencia que mostraba la tarjeta queda confirmada para ese pedido
                r = confirmar(p["whatsapp"], p["agencia"], p.get("codigo") or "", fecha, quien, p.get("texto") or "")
                lineas.append(f"✅ {nombre} · agencia CONFIRMADA: {p['agencia']} ({p.get('codigo') or ''})" if r.get("ok") else f"❌ {nombre} · no se pudo guardar la confirmación: {r.get('error')}")
            else:
                lineas.append(f"❓ {nombre} · marcó OK pero la tarjeta no tenía agencia: falta un dato")
        elif m or (decision == "correccion" and nota and not re.search(r"dni|documento|cobrar|saldo|kits?|no va", nota, re.I)):
            ficha, porque = agencia_de_nota(m.group(1) if m else nota, p)
            if ficha:
                r = confirmar(p["whatsapp"], ficha["agencia"], ficha["codigo"], fecha, quien, nota)
                lineas.append(f"✅ {nombre} · «{nota[:60]}» → agencia CONFIRMADA: {ficha['agencia']} · {ficha['direccion'][:80]}" if r.get("ok") else f"❌ {nombre} · no se pudo guardar: {r.get('error')}")
            else:
                lineas.append(f"❓ {nombre} · «{nota[:60]}» no calza con UNA sola agencia que reciba envíos: FALTA UN DATO ({porque[:220]})")
    return lineas


def _titulo(t):
    """«CORONEL PORTILLO» → «Coronel Portillo» (el texto para el cliente no lleva palabras en mayúsculas)."""
    return " ".join(w.capitalize() for w in str(t or "").split())


def recomendacion_de(p, e):
    """La recomendación `dato_envio` para la asesora cuando la agencia de un pedido es dudosa: `motivo` (lo lee ella: qué dijo el
    cliente, las candidatas y el paso a paso de la captura de shalom.com.pe/agencias) y `texto` (lo que ELLA le manda al cliente, en
    la voz de las vendedoras: de usted, una sola pregunta). Claude no le escribe al cliente."""
    dijo = re.sub(r"\s+", " ", str(p.get("direccion_o_agencia") or "")).strip() or "(no dijo agencia)"
    codigo = e["codigo"] or (e["candidatas"][0]["codigo"] if e["candidatas"] else "")
    partes = [x.strip() for x in codigo.split(" / ")]
    provincia = partes[1] if len(partes) >= 3 else ""
    if e.get("sin_servicio"):
        lugar = e.get("lugar") or "esa ciudad"
        return {"motivo": f"Shalom no recibe envíos en {lugar}: el cliente dijo «{dijo}» y hoy ninguna agencia de Shalom de ahí recibe paquetes (lo dice la lista oficial de shalom.com.pe/agencias). "
                          "Ofrécele Olva o una agencia de Shalom de otra ciudad que le quede cerca; cuando responda, anota la agencia en el chat.",
                "texto": f"Estimad@ ☺️ le cuento que por ahora Shalom no está recibiendo envíos en {lugar}. Para que su kit le llegue sin problema se lo podemos enviar por Olva 📦 ¿Le parece bien?"}
    cands = ([{"agencia": e["agencia"], "direccion": e["direccion"]}] if e["agencia"] else []) + e["candidatas"]
    lista = "; ".join(f"{c['agencia']} ({c['direccion'][:70]})" for c in cands[:6])
    donde = _titulo(provincia) or "su ciudad"
    return {"motivo": f"Agencia dudosa: el cliente dijo «{dijo}» y {e['porque']}. Candidatas: {lista}. "
                      f"Entra a https://www.shalom.com.pe/agencias, escribe la provincia {provincia or '(la del cliente)'} en el buscador (solo busca por provincia), toma captura de la lista y mándasela al cliente "
                      "para que confirme cuál es. Cuando responda, anota el nombre de la agencia en el chat.",
            "texto": f"Estimad@ ☺️ en {donde} Shalom tiene varias agencias. Le comparto la lista para que me confirme cuál le queda mejor y así le enviamos su kit sin problema 📦 ¿Cuál sería?"}


def pedidos_de_provincia(fechas):
    """Provincia CONFIRMADO por Shalom que todavía no sale: lo del reporte de esas fechas de despacho + lo abierto en «Pedidos auto»."""
    pedidos, vistos = [], set()
    cerrados = set()
    for f in fechas:
        ag = pedir_worker(f"/pedidos-sheet?hoy={f}&boletas=1") or {}
        cerrados |= {re.sub(r"\D", "", str(x.get("whatsapp") or ""))[-9:] for x in (ag.get("enviados_recientes") or [])} | {re.sub(r"\D", "", str(x.get("whatsapp") or ""))[-9:] for x in (ag.get("boletas") or [])}
        estado = pedir_worker(f"/ventas-estado?fecha={f}&tipo=pedidos")
        filas = [dict(p, _fecha=f) for p in (estado.get("estado") or {}).get("pedidos", [])] + [dict(r, _fecha=r.get("fecha_entrega") or f) for g in ("atrasados", "hoy", "futuros", "sin_fecha") for r in (ag.get(g) or [])]
        for p in filas:
            k = re.sub(r"\D", "", str(p.get("whatsapp") or ""))[-9:]
            if not k or k in vistos or str(p.get("destino", "")).upper() != "PROVINCIA" or not str(p.get("estado", "")).upper().startswith("CONFIRMADO"):
                continue
            if "olva" in f"{p.get('direccion_o_agencia')} {p.get('courier')} {p.get('nota')}".lower():
                continue
            vistos.add(k); pedidos.append(p)
    return [p for p in pedidos if re.sub(r"\D", "", str(p.get("whatsapp") or ""))[-9:] not in cerrados]


def cmd_recomendar(args):
    """recomendar [AAAA-MM-DD …] [--ver]: por cada pedido de provincia con agencia DUDOSA (o en una ciudad donde Shalom no recibe)
    deja una recomendación `dato_envio` en el chat del cliente para la asesora (POST /api/asesor/sugerencias). Una por chat (el
    Worker actualiza la pendiente). `--ver` solo lista. Lo corre la Routine del asesor (10:00 · 15:00 · 19:00)."""
    fechas = [a for a in args if len(a) == 10 and a[4] == "-"]
    if not fechas:
        hoy = dt.datetime.now(LIMA).date()
        fechas = [hoy.isoformat(), (hoy + dt.timedelta(days=1)).isoformat()]
    print(agencias_al_dia(), flush=True)
    sugerencias, seguras = [], 0
    for p in pedidos_de_provincia(fechas):
        e = elegir_agencia(p)
        if e["segura"]:
            seguras += 1
            continue
        r = recomendacion_de(p, e)
        sugerencias.append({"tipo": "dato_envio", "whatsapp": str(p.get("whatsapp") or ""), "nombre": p.get("nombre") or "", **r})
        print(f"❓ {p.get('nombre')} · {p.get('whatsapp')} · {'SIN SERVICIO' if e.get('sin_servicio') else 'agencia dudosa'}: {e['porque'][:160]}")
    print(f"Provincia por Shalom sin salir ({', '.join(fechas)}): {seguras} con agencia segura o confirmada · {len(sugerencias)} dudosa(s)")
    if not sugerencias or "--ver" in args:
        return
    r = pedir_worker("/sugerencias", {"origen": "shalom agencias", "sugerencias": sugerencias})
    print(f"Recomendaciones para la asesora: {r.get('creadas', 0)} nuevas, {r.get('actualizadas', 0)} actualizadas" + (f" · sin chat: {r.get('sin_chat')}" if r.get("sin_chat") else "") + (f" · error: {r['error']}" if r.get("error") else ""))


def linea_agencia(e):
    """Una línea para pantalla: agencia, dirección, confianza y porqué."""
    marca = {"confirmada": "✅ CONFIRMADA", "segura": "✅ SEGURA", "dudosa": "❓ DUDOSA"}[e["confianza"]]
    return f"{marca} · {e['agencia'] or '—'} · {e['codigo'] or '—'} · {e['direccion'][:110]} · porque {e['porque']}"


def cmd_triangular(args):
    """triangular "<texto del cliente>" [--provincia X]: prueba `elegir_agencia` con un texto."""
    texto = " ".join(a for a in args if not a.startswith("--") and (args.index(a) == 0 or args[args.index(a) - 1] != "--provincia"))
    if "--provincia" in args:
        texto += ", " + args[args.index("--provincia") + 1]
    e = elegir_agencia({"direccion_o_agencia": texto})
    print(linea_agencia(e))
    if e["referencia"]:
        print(f"   referencia del cliente: «{e['referencia']}»")
    for c in e["candidatas"]:
        print(f"   candidata: {c['agencia']} · {c['codigo']} · {c['direccion'][:100]}" + (f" · a {c['metros']} m de la referencia" if c.get("metros") is not None else ""))


def cmd_buscar(texto):
    r = buscar(texto)
    if not r:
        print("Ninguna agencia calza con ese texto."); return
    for a in r:
        print(f"{'★' if a['seguro'] else ' '} {a['puntos']:>2} · {a['codigo']} · {a['direccion']} · {a['horario']}")


def pedir_worker(ruta, body=None):
    clave = os.environ.get("ASESOR_CLAVE") or sys.exit("Falta ASESOR_CLAVE en el entorno.")
    base = os.environ.get("ASESOR_API_BASE") or "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor"
    datos = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = urllib.request.Request(f"{base}{ruta}", data=datos, method="POST" if datos else "GET",
                                 headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read())
        except ValueError:
            return {"error": f"http {e.code}"}


def dni_de(p):
    """DNI del pedido; si viene de la hoja (sin columna DNI) se saca de la nota («DNI 12345678»)."""
    d = re.sub(r"\D", "", str(p.get("dni") or ""))
    if d:
        return d
    m = re.search(r"DNI\D{0,12}(\d{8})\b", f"{p.get('nota') or ''} {p.get('direccion_o_agencia') or ''}", re.I)
    return m.group(1) if m else ""


def montos(p):
    """Adelanto y saldo de un pedido de provincia según el TEXTO del reporte (`pago`, `nota`, `empaque`): «Adelanto S/20; saldo S/69»,
    «Pagado S/89 (sin saldo)», «Adelanto S/10», «solo mazo S/69». Por defecto adelanto 20 y saldo = precio − adelanto.
    Devuelve (adelanto, saldo, aviso): aviso no vacío cuando el monto hubo que suponerlo (kits 0 sin precio, extra sin monto)."""
    texto = f"{p.get('pago') or ''} {p.get('nota') or ''}"
    empaque = str(p.get("empaque") or "")
    kits = int(p.get("kits")) if str(p.get("kits")).isdigit() else 1   # 0 = no es kit (solo mazo, oráculo…)
    aviso = ""
    precio = {1: 89, 2: 149, 3: 199}.get(kits, 89 * kits) if kits else None
    if kits == 0:  # no es kit (solo mazo, oráculo…): el precio sale del texto o se pregunta
        m0 = re.search(r"s/\s*(\d{2,3})", empaque, re.I) or re.search(r"(?:total|precio|contraentrega|saldo|pag\w+)\D{0,14}(\d{2,3})", texto, re.I)
        precio = int(m0.group(1)) if m0 else 0
        aviso = "" if m0 else "MONTO: no es un kit y el reporte no dice el precio; confirmarlo"
    elif re.search(r"descuento|rebaja|precio especial|promo|negociad", f"{texto} {empaque}", re.I):
        aviso = "MONTO: habla de descuento/precio especial; confirmar el saldo"
    elif re.search(r"\+|extra|cuenco|oráculo|oraculo|collar.*(s/|soles)|otro modelo|gold|rider", empaque, re.I) and re.search(r"s/\s*\d", empaque, re.I):
        aviso = "MONTO: el empaque trae un extra con precio; confirmar el saldo"
    m = re.search(r"adelanto\D{0,14}(\d{2,3})", texto, re.I) or re.search(r"s/\s*(\d{2,3})\s*(?:de\s+)?adelanto", texto, re.I) \
        or re.search(r"(?:yape|plin)\s*s?/?\s*(\d{2,3})", texto, re.I)
    adelanto = int(m.group(1)) if m else 20
    m2 = re.search(r"saldo\D{0,14}(\d{2,3})", texto, re.I)
    if m2:
        saldo = int(m2.group(1))
    elif re.search(r"pag[oó] (todo|completo|el total)|pago completo|\bpagad[oa]\b|sin saldo|s/\s*%s completo" % (precio or 0), texto, re.I) \
            and not re.search(r"adelanto", texto, re.I):
        adelanto, saldo = precio, 0
    else:
        saldo = max(0, (precio or 0) - adelanto)
    return adelanto, saldo, aviso


def _xml_escape(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def llenar_plantilla(filas, salida):
    """
    Copia la plantilla oficial BYTE A BYTE y solo escribe los valores de las filas (A, B, F, G, H, M) dentro de
    xl/worksheets/sheet1.xml, con las cadenas en xl/sharedStrings.xml como las trae Shalom. No se toca nada más: ni docProps
    (título «Excel de Plataformas PRO», autor SHALOM EMPRESARIAL), ni las hojas ocultas «Medidas» y «Hoja2» (tablas de agencias), ni
    estilos ni fórmulas. Reescribir el libro con una librería de Excel cambia esas partes y Shalom Pro responde «El archivo no
    corresponde a la plantilla oficial» (2026-11-08).
    filas = [{"dni": "32992096", "tel": "927055371", "origen": "CHORRILLOS CO", "destino": "GARATEA", "mercaderia": "PAQUETE XXS", "cantidad": 1}]
    """
    import zipfile
    zin = zipfile.ZipFile(PLANTILLA)
    hoja = zin.read("xl/worksheets/sheet1.xml").decode("utf-8")
    sst = zin.read("xl/sharedStrings.xml").decode("utf-8")
    cadenas = re.findall(r"<si>(.*?)</si>", sst, re.S)
    indice = {re.sub(r"<[^>]+>", "", c): i for i, c in enumerate(cadenas)}
    nuevas = []

    def idx(texto):
        texto = str(texto)
        if texto not in indice:
            indice[texto] = len(cadenas) + len(nuevas); nuevas.append(texto)
        return indice[texto]

    def celda(col, r, estilo, valor, tipo):
        if valor in (None, ""):
            return f'<c r="{col}{r}" s="{estilo}"/>'
        if tipo == "n":
            return f'<c r="{col}{r}" s="{estilo}"><v>{valor}</v></c>'
        return f'<c r="{col}{r}" s="{estilo}" t="s"><v>{idx(valor)}</v></c>'

    def poner(hoja, r, col, estilo, valor, tipo):
        patron = re.compile(r'<c r="%s%d"(?:\s[A-Za-z:]+="[^"]*")*\s*(?:/>|>.*?</c>)' % (col, r), re.S)
        nueva = celda(col, r, estilo, valor, tipo)
        if patron.search(hoja):
            return patron.sub(lambda _m: nueva, hoja, count=1)
        raise RuntimeError(f"la plantilla no tiene la celda {col}{r}")

    if len(filas) > 499:
        raise RuntimeError("la plantilla de Shalom tiene 499 filas de datos como máximo")
    for i, f in enumerate(filas):
        r = i + 2
        dni = re.sub(r"\D", "", str(f.get("dni") or ""))
        # Un DNI que empieza en 0 («00485469») va como texto: como número perdería los ceros. Los demás, como número (igual que
        # el ejemplo de la plantilla).
        hoja = poner(hoja, r, "A", 4, dni, "s" if dni.startswith("0") else "n")
        hoja = poner(hoja, r, "B", 4, re.sub(r"\D", "", str(f.get("tel") or "")), "n")
        hoja = poner(hoja, r, "F", 1, f.get("origen") or ORIGEN, "s")
        hoja = poner(hoja, r, "G", 1, f.get("destino") or "", "s")
        hoja = poner(hoja, r, "H", 1, f.get("mercaderia") or "PAQUETE XXS", "s")
        hoja = poner(hoja, r, "M", 1, int(f.get("cantidad") or 1), "n")
    # la fila 2 de ejemplo de la plantilla (ZAMACOLA → JAEN) se limpia si no se usó
    if not filas:
        for col, est in (("A", 4), ("B", 4), ("F", 1), ("G", 1), ("H", 1), ("M", 1)):
            hoja = poner(hoja, 2, col, est, "", "n")
    if nuevas:
        sst = sst.replace("</sst>", "".join(f"<si><t>{_xml_escape(t)}</t></si>" for t in nuevas) + "</sst>")
        sst = re.sub(r'uniqueCount="\d+"', f'uniqueCount="{len(cadenas) + len(nuevas)}"', sst)
        sst = re.sub(r' count="\d+"', f' count="{len(cadenas) + len(nuevas)}"', sst)
    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    with zipfile.ZipFile(salida, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            datos = zin.read(item.filename)
            if item.filename == "xl/worksheets/sheet1.xml":
                datos = hoja.encode("utf-8")
            elif item.filename == "xl/sharedStrings.xml":
                datos = sst.encode("utf-8")
            zout.writestr(item, datos)
    zin.close()


def cmd_masivo(args):
    import openpyxl
    fechas = [a for a in args if len(a) == 10 and a[4] == "-"]
    if not fechas:
        t = dt.datetime.now(LIMA); fechas = [(t.date() if t.hour < 3 else t.date() + dt.timedelta(days=1)).isoformat()]
    fecha = fechas[-1]
    salida = args[args.index("--salida") + 1] if "--salida" in args else f"/tmp/shalom/masivo-{fecha}.xlsx"
    pedidos, vistos = [], set()
    for f in fechas:
        estado = pedir_worker(f"/ventas-estado?fecha={f}&tipo=pedidos")
        for p in (estado.get("estado") or {}).get("pedidos", []):
            k = re.sub(r"\D", "", str(p.get("whatsapp") or ""))[-9:]
            if str(p.get("destino", "")).upper() == "PROVINCIA" and str(p.get("estado", "")).upper() == "CONFIRMADO" and k not in vistos:
                vistos.add(k); pedidos.append({**p, "_fecha": f})
    # Provincia PENDIENTE en la hoja «Pedidos auto» (sin «Enviado», fecha de hoy o pasada, CONFIRMADO o corrección): pedidos que no
    # salieron en su día (DNI incompleto, agencia dudosa…) y que no están en el estado de esta fecha. Entran al masivo marcados como
    # ATRASADO para que no se queden en la hoja para siempre (dueño 2026-11-09, caso Elia Rita).
    ag = pedir_worker(f"/pedidos-sheet?hoy={fecha}&boletas=1") or {}
    # Lo que el equipo ya cerró en la hoja («sí … Shalom NNN (registrado a mano)», boleta emitida) NO entra al Excel aunque el estado
    # del reporte lo siga trayendo como CONFIRMADO (2026-11-09: el masivo del 10 repitió a 5 que ya estaban registrados a mano).
    cerrados = {re.sub(r"\D", "", str(x.get("whatsapp") or ""))[-9:] for x in (ag.get("enviados_recientes") or [])} | {re.sub(r"\D", "", str(x.get("whatsapp") or ""))[-9:] for x in (ag.get("boletas") or [])}
    pedidos = [p for p in pedidos if re.sub(r"\D", "", str(p.get("whatsapp") or ""))[-9:] not in cerrados]
    for grupo in ("atrasados", "hoy", "futuros", "sin_fecha"):
        for r in ag.get(grupo) or []:
            k = re.sub(r"\D", "", str(r.get("whatsapp") or ""))[-9:]
            est = str(r.get("estado") or "").upper()
            if str(r.get("destino", "")).upper() != "PROVINCIA" or k in vistos or not (est.startswith("CONFIRMADO") or "CORRECCION" in est):
                continue
            if "olva" in f"{r.get('direccion_o_agencia')} {r.get('nota')}".lower():
                continue
            vistos.add(k)
            prev = str(r.get("fecha_entrega") or "")
            atras = bool(prev) and prev < fecha
            pedidos.append({**r, "_fecha": prev or fecha, "_atrasado": atras,
                            "nota": (f"ATRASADO (despacho previsto {prev}, sin boleta): " if atras else "") + str(r.get("nota") or "")})
    if not pedidos:
        sys.exit(f"No hay pedidos de provincia confirmados registrados para el despacho de {', '.join(fechas)} ni pendientes en la hoja.")
    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    filas_excel = []
    # La referencia para la persona va en OTRO archivo: Shalom solo debe recibir su plantilla tal cual (sin hojas extra).
    wb_ref = openpyxl.Workbook(); ref = wb_ref.active; ref.title = "Referencia"
    ref.append(["Fila Excel", "Despacho", "Nombre", "WhatsApp", "DNI", "Lo que escribió el cliente", "Agencia elegida (código Shalom Pro)", "Seguro", "Otras candidatas", "Kits", "Nota del reporte", "Revisar", "CLAVE de seguridad (teclear en Shalom Pro)", "Adelanto", "Saldo", "DESTINO en el Excel (columna G, texto exacto)", "Dirección de la agencia", "Por qué esa agencia", "Mercadería", "Celular en el Excel"])
    tope = int(args[args.index("--solo") + 1]) if "--solo" in args else 0  # --solo N: solo las primeras N filas (pruebas)
    ajustes = {}
    if "--agencias" in args:
        ajustes = {re.sub(r"\D", "", k)[-9:]: v for k, v in json.load(open(args[args.index("--agencias") + 1])).items()}
    print(agencias_al_dia(), flush=True)   # primer paso: agencias del día y cruce con la plantilla
    destinos_ok = set(plantilla_destinos())
    clave_dia = args[args.index("--clave") + 1] if "--clave" in args else ""
    if clave_dia and not re.fullmatch(r"\d{4}", clave_dia):
        sys.exit("--clave debe ser de 4 dígitos.")
    con_ventas = bool(clave_dia)  # sin clave del dueño no se toca la hoja Ventas (--sin-ventas queda como sinónimo de no pasar --clave)
    lote = []
    fila = 2; revisar = []; claves = {}
    for p in pedidos:
        if tope and fila - 2 >= tope:
            break
        texto = f"{p.get('direccion_o_agencia') or ''} {p.get('courier') or ''}"
        aviso = []
        if re.search(r"\bolva\b", norm(texto)):
            revisar.append(f"{p.get('nombre')}: va por OLVA, no entra al masivo de Shalom"); continue
        k9 = re.sub(r"\D", "", str(p.get("whatsapp") or ""))[-9:]
        # LA agencia la decide `elegir_agencia` (la misma que ve Jennifer en la revisión). Un ajuste de `--agencias` es una
        # confirmación de una persona: se pasa por la misma función para llegar al nombre exacto de la plantilla.
        if k9 in ajustes:
            e = elegir_agencia({"whatsapp": k9, "direccion_o_agencia": texto}, confirmadas={k9: {"agencia": nombre_plantilla(str(ajustes[k9]).strip().upper()) or str(ajustes[k9]).strip().upper(), "quien": "ajuste --agencias"}})
            if e["confianza"] != "confirmada":
                revisar.append(f"{p.get('nombre')}: la agencia del ajuste «{ajustes[k9]}» no existe o no recibe envíos (usa el nombre exacto de `triangular`)")
        else:
            e = elegir_agencia(p)
        destino = e["agencia"] if e["segura"] else ""
        # El Excel identifica la agencia SOLO por el texto exacto de Hoja2!C: lo que no esté ahí no va.
        if destino and destino not in destinos_ok:
            aviso.append(f"«{destino}» no está en la lista de destinos de la plantilla"); destino = ""
        if not destino:
            aviso.append(("Shalom no recibe envíos ahí: " if e.get("sin_servicio") else "agencia dudosa: ") + e["porque"])
            revisar.append(f"{p.get('nombre')} ({p.get('whatsapp')}): {'SIN SERVICIO' if e.get('sin_servicio') else 'agencia dudosa'} para «{texto.strip()}» → {e['porque']}"
                           + (" · candidatas: " + " | ".join(f"{c['agencia']} ({c['direccion'][:40]})" for c in ([{"agencia": e["agencia"], "direccion": e["direccion"]}] if e["agencia"] else []) + e["candidatas"][:4]) if e["agencia"] or e["candidatas"] else ""))
        tel = re.sub(r"\D", "", str(p.get("telefono") or p.get("whatsapp") or ""))[-9:]
        dni = dni_de(p)
        clave = "PENDIENTE (la da el dueño)"
        if p.get("_atrasado"):
            aviso.append(f"ATRASADO: previsto para {p.get('_fecha')} y sin boleta; confirmar que no salió por otro lado antes de mandarlo")
        adelanto, saldo, aviso_monto = montos(p)
        if aviso_monto:
            aviso.append(aviso_monto); revisar.append(f"{p.get('nombre')}: {aviso_monto}")
        completo_previo = bool(dni) and len(dni) in (8, 9) and bool(destino) and bool(re.fullmatch(r"9\d{8}", tel or ""))
        if completo_previo:
            lote.append({"whatsapp": p.get("whatsapp"), "nombre": p.get("nombre"), "dni": dni, "tel": tel, "destino": destino, "adelanto": adelanto, "saldo": saldo})
        if con_ventas and completo_previo:
            r = poner_clave(dni, tel, clave_dia, adelanto, saldo, f"{p.get('nombre') or ''} · {destino}"[:80])
            clave = clave_dia if r.get("ok") else "ERROR"
            if r.get("error"):
                aviso.append(f"Ventas: {r['error']}"); revisar.append(f"{p.get('nombre')}: no se pudo crear/actualizar la venta en la hoja Ventas: {r['error']}")
            elif r.get("existia"):
                aviso.append("ya tenía venta abierta en la hoja Ventas: se le puso la clave del día")
            claves[k9] = clave
        if not dni:
            aviso.append("sin DNI en el registro: pedirlo o buscarlo en el chat"); revisar.append(f"{p.get('nombre')}: sin DNI en el registro")
        elif len(dni) == 9:
            # Carnet de extranjería (dueño 2026-11-13): va al Excel igual, marcado, para ver si el masivo lo acepta.
            aviso.append("documento de 9 dígitos (¿carnet de extranjería?): va al Excel; mirar si Shalom Pro acepta la fila"); revisar.append(f"{p.get('nombre')}: documento de 9 dígitos ({dni}): mirar si Shalom Pro acepta la fila")
        elif len(dni) != 8:
            aviso.append(f"documento de {len(dni)} dígitos: NO va al Excel; confirmarlo con el cliente"); revisar.append(f"{p.get('nombre')}: documento de {len(dni)} dígitos ({dni})")
        if not re.fullmatch(r"9\d{8}", tel or ""):
            aviso.append("celular que no es de 9 dígitos: NO va al Excel"); revisar.append(f"{p.get('nombre')}: celular «{tel}» no es de 9 dígitos")
        completo = bool(dni) and len(dni) in (8, 9) and bool(destino) and bool(re.fullmatch(r"9\d{8}", tel or ""))
        kits = int(p.get("kits")) if str(p.get("kits")).isdigit() else 1
        # Dueño 2026-11-11: 2 o más kits viajan en UN paquete XS (no N paquetes XXS). 1 kit (o «no es kit») = 1 paquete XXS.
        mercaderia, kits_bultos = ("PAQUETE XS", 1) if kits >= 2 else ("PAQUETE XXS", 1)
        # Al Excel solo entran las filas completas (DNI y agencia); las dudosas quedan en la referencia y en las preguntas.
        if completo:
            filas_excel.append({"dni": dni, "tel": tel, "origen": ORIGEN, "destino": destino, "mercaderia": mercaderia, "cantidad": kits_bultos})
        else:
            aviso.append("NO entra al Excel hasta resolverlo")
        ref.append([len(filas_excel) + 1 if completo else "—", p.get("_fecha"), p.get("nombre"), p.get("whatsapp"), dni, texto.strip(), e["codigo"], {"confirmada": "CONFIRMADA", "segura": "sí", "dudosa": "NO"}[e["confianza"]],
                    " | ".join(f"{c['agencia']} ({c['direccion'][:50]})" for c in e["candidatas"][:4]), kits, ((f"QUÉ LLEVA: {p.get('empaque')} · " if p.get("empaque") else "") + str(p.get("nota") or ""))[:220], "; ".join(aviso), clave, adelanto, saldo,
                    destino if completo else "", e["direccion"], e["porque"][:200], mercaderia if completo else "", tel])
        fila += 1
    for col, w in zip("ABCDEFGHIJKLMNOPQRST", (9, 11, 30, 14, 10, 45, 50, 7, 60, 5, 50, 45, 14, 9, 9, 34, 60, 60, 14, 12)):
        ref.column_dimensions[col].width = w
    llenar_plantilla(filas_excel, salida)
    salida_ref = re.sub(r"\.xlsx$", "", salida) + "-referencia.xlsx"
    wb_ref.save(salida_ref)
    # Antes de decir «listo»: el Excel generado se vuelve a abrir y se compara celda por celda con la referencia.
    problemas = verificar_excel(salida, salida_ref)
    print("🔎 VERIFICACIÓN DEL EXCEL: " + ("✅ " + str(len(filas_excel)) + " fila(s); cada DESTINO está en la lista de la plantilla (Hoja2), recibe envíos y coincide con la referencia; documento, celular, origen, mercadería y cantidad iguales"
                                         if not problemas else "❌ NO SUBIR: " + " · ".join(problemas)), flush=True)
    json.dump({"fecha": fecha, "clave": clave_dia, "lote": lote}, open(os.path.join(os.path.dirname(os.path.abspath(salida)), "lote.json"), "w"), ensure_ascii=False, indent=1)
    print(f"{salida} · {len(filas_excel)} fila(s) en el Excel de {fila - 2} pedido(s) de provincia para {', '.join(fechas)} (origen {ORIGEN}; 1 kit = PAQUETE XXS, 2 o más kits = 1 PAQUETE XS)")
    print(f"{salida_ref} · referencia para revisar (nombre, texto del cliente, agencia elegida, candidatas, CLAVE); NO se sube a Shalom")
    if con_ventas:
        print(f"Ventas en la hoja Ventas con la clave del día: {sum(1 for c in claves.values() if c == clave_dia)} de {len(lote)} (CLAVE MASIVA en Shalom Pro).")
    else:
        print("Sin clave del día: no se tocó la hoja Ventas. Cuando el dueño la dé: python3 scripts/asesor/shalom.py clave NNNN " + os.path.join(os.path.dirname(os.path.abspath(salida)), "lote.json"))
    if "--subir" in args:
        import base64
        links = {}
        for ruta, titulo in ((salida, f"Shalom masivo {fecha} (subir a Shalom Pro)"), (salida_ref, f"Shalom masivo {fecha} · referencia y claves")):
            r = pedir_worker("/reporte", {"archivo_base64": base64.b64encode(open(ruta, "rb").read()).decode(), "nombre": os.path.basename(ruta), "titulo": titulo})
            links[os.path.basename(ruta)] = r.get("url") or r.get("error")
        print("CRM → Reportes:", json.dumps(links, ensure_ascii=False))
    for r in revisar:
        print(f"⚠️ {r}")


def verificar_excel(ruta_excel, ruta_ref):
    """Abre el Excel masivo generado y lo compara con la referencia: misma cantidad de filas; cada G (DESTINO) está en `Hoja2!C`,
    sin espacios de más, y es una agencia que recibe envíos; documento, celular, origen, mercadería y cantidad coinciden fila a fila.
    Devuelve la lista de problemas (vacía = todo bien)."""
    import openpyxl
    problemas = []
    hoja = openpyxl.load_workbook(ruta_excel)["Hoja1"]
    filas = [r for r in hoja.iter_rows(min_row=2, max_row=500, values_only=True) if r[0] not in (None, "")]
    ref = openpyxl.load_workbook(ruta_ref).active
    cab = [str(c.value or "") for c in ref[1]]
    col = lambda nombre: next(i for i, c in enumerate(cab) if c.startswith(nombre))
    esperadas = sorted((r for r in ref.iter_rows(min_row=2, values_only=True) if str(r[0] or "").isdigit()), key=lambda r: int(r[0]))
    if len(filas) != len(esperadas):
        problemas.append(f"el Excel tiene {len(filas)} fila(s) y la referencia {len(esperadas)}")
    destinos = set(plantilla_destinos())
    reciben = {nombre_plantilla(a["agencia"]) for a in cargar()["agencias"] if recibe(a)}
    solo_dig = lambda v: re.sub(r"\D", "", str(v if v is not None else ""))
    for n, (f, r) in enumerate(zip(filas, esperadas), 2):
        g = str(f[6] or "")
        if g not in destinos:
            problemas.append(f"fila {n}: DESTINO «{g}» no está en Hoja2!C")
        if g != g.strip():
            problemas.append(f"fila {n}: DESTINO con espacios de más")
        if g not in reciben:
            problemas.append(f"fila {n}: «{g}» no recibe envíos")
        if g != str(r[col("DESTINO en el Excel")] or ""):
            problemas.append(f"fila {n}: G «{g}» distinto de la referencia «{r[col('DESTINO en el Excel')]}»")
        if solo_dig(f[0]).lstrip("0") != solo_dig(r[col("DNI")]).lstrip("0"):
            problemas.append(f"fila {n}: documento distinto de la referencia")
        if solo_dig(f[1]) != solo_dig(r[col("Celular en el Excel")]):
            problemas.append(f"fila {n}: celular distinto de la referencia")
        if str(f[5] or "") != ORIGEN:
            problemas.append(f"fila {n}: origen «{f[5]}»")
        if str(f[7] or "") != str(r[col("Mercadería")] or "") or int(f[12] or 0) != 1:
            problemas.append(f"fila {n}: mercadería o cantidad distinta ({f[7]} × {f[12]})")
    return problemas


def poner_clave(dni, tel, clave, adelanto, saldo, notas=""):
    """Crea la venta en la hoja Ventas si no existe y le pone la clave; si ya existía, le corrige la clave. {ok, existia, error}."""
    v = pedir_worker("/ventas", {"accion": "crear", "dni": dni, "celular": tel, "envio": "Shalom", "adelanto": adelanto, "saldo": saldo, "clave": clave, "notas": notas})
    if v.get("error"):
        return {"ok": False, "error": v["error"]}
    existia = v.get("nuevo") is False
    if existia and str(v.get("clave") or "") != clave:
        u = pedir_worker("/ventas", {"accion": "estado", "dni": dni, "clave": clave})
        if u.get("error"):
            return {"ok": False, "error": u["error"], "existia": True}
    return {"ok": True, "existia": existia, "codigo": v.get("codigo")}


def clave_crm(tel, clave="", pisar=False):
    """La clave en la FICHA del cliente del CRM (lo que el equipo ve como «Clave Shalom»). Sin clave solo consulta.
    El Worker nunca devuelve la clave: solo si quedó puesta."""
    cuerpo = {"accion": "clave_crm", "whatsapp": re.sub(r"\D", "", str(tel or ""))[-9:]}
    if clave:
        cuerpo["clave"] = clave
    if pisar:
        cuerpo["pisar"] = True
    return pedir_worker("/ventas", cuerpo)


def _lote_de_hoja(fecha):
    """Los envíos de provincia de este despacho cuando NO hubo Excel masivo (el equipo los registró a mano en Shalom Pro): filas de
    «Pedidos auto» cerradas en este ciclo con «Shalom NNN», más las de provincia CONFIRMADAS aún abiertas de esa fecha."""
    r = pedir_worker(f"/pedidos-sheet?hoy={fecha}&enviadas=1") or {}
    ayer = (dt.date.fromisoformat(fecha) - dt.timedelta(days=1)).isoformat()
    lote, vistos = [], set()
    def agregar(f):
        tel = re.sub(r"\D", "", str(f.get("whatsapp") or ""))[-9:]
        if not tel or tel in vistos or str(f.get("destino") or "").upper() != "PROVINCIA":
            return
        vistos.add(tel)
        adelanto, saldo, _ = montos(f)
        olva = "olva" in f"{f.get('direccion_o_agencia') or ''} {f.get('enviado') or ''}".lower()
        lote.append({"nombre": f.get("nombre"), "dni": dni_de(f), "tel": tel, "adelanto": adelanto, "saldo": saldo, "destino": str(f.get("direccion_o_agencia") or "")[:60], "olva": olva})
    for f in r.get("enviadas") or []:
        env_ = str(f.get("enviado") or "")
        act = str(f.get("actualizado") or "")[:16]
        if re.search(r"Shalom\s+\d{6,}|Olva", env_, re.I) and (f"{ayer} 06:00" < act or fecha in env_ or str(f.get("fecha_entrega") or "") == fecha):
            agregar(f)
    for k in ("hoy", "atrasados"):
        for f in r.get(k) or []:
            if str(f.get("estado") or "").upper().startswith("CONFIRMADO") and (k == "hoy" or str(f.get("fecha_entrega") or "") >= ayer):
                agregar(f)
    return lote


def cmd_clave(args):
    """clave NNNN [lote.json] [AAAA-MM-DD] [--pisar] [--solo 51…,51…]: pone la clave de recojo del día en la FICHA del CRM de cada
    cliente del despacho (y en su venta de la hoja Ventas). Sin lote.json (no hubo Excel masivo) toma los envíos del despacho de la
    hoja «Pedidos auto». Imprime por cliente si quedó en el CRM; NUNCA imprime la clave. `clave ver [FECHA]` solo consulta."""
    solo_ver = args[0] == "ver"
    clave = "" if solo_ver else args[0]
    if not solo_ver and not re.fullmatch(r"\d{4}", clave):
        sys.exit("La clave debe ser de 4 dígitos (o usa `clave ver`).")
    ruta = next((a for a in args[1:] if a.endswith(".json")), "/tmp/shalom/lote.json")
    fecha = next((a for a in args[1:] if len(a) == 10 and a[4] == "-"), None)
    if not fecha:
        t = dt.datetime.now(LIMA); fecha = (t.date() if t.hour < 6 else t.date() + dt.timedelta(days=1)).isoformat()
    lote_json = json.load(open(ruta)) if os.path.exists(ruta) else None
    lote = list((lote_json or {}).get("lote") or [])
    en_lote = {re.sub(r"\D", "", str(f.get("tel") or ""))[-9:] for f in lote}
    de_hoja = [f for f in _lote_de_hoja(fecha) if f["tel"] not in en_lote]
    lote += de_hoja
    if "--solo" in args:
        quienes = {re.sub(r"\D", "", x)[-9:] for x in args[args.index("--solo") + 1].split(",")}
        lote = [f for f in lote if re.sub(r"\D", "", str(f.get("tel") or ""))[-9:] in quienes]
    if not lote:
        sys.exit(f"No encontré envíos de provincia para el despacho del {fecha} (ni lote.json ni filas de «Pedidos auto»). Pasa la fecha: `clave NNNN AAAA-MM-DD`, o los WhatsApp: `--solo 51…,51…`.")
    print(f"Despacho {fecha} · {len(lote)} envío(s) de provincia ({len(lote) - len(de_hoja)} del Excel masivo, {len(de_hoja)} de la hoja «Pedidos auto»)")
    ok_crm = 0
    for f in lote:
        nombre = f.get("nombre") or f.get("tel")
        if f.get("olva") and not solo_ver and "--olva" not in args:
            print(f"🟠 {nombre} · {f.get('tel')} · va por OLVA: su clave es la de Olva (`shalom.py clave \"$OLVA_CLAVE\" --solo {f.get('tel')} --olva`); no se le pone la de Shalom")
            continue
        c = clave_crm(f.get("tel"), clave, "--pisar" in args)
        if c.get("sin_chat"):
            estado_crm = "❌ CRM: no hay chat con ese número"
        elif c.get("tenia_otra"):
            estado_crm = "⚠️ CRM: ya tenía OTRA clave (pedido anterior); no se cambió. Si corresponde: repite con --pisar --solo " + str(f.get("tel"))
        elif c.get("tiene_clave"):
            estado_crm = "✅ CRM: clave puesta" + (" (ya estaba)" if c.get("ya_estaba") else "") if not solo_ver else "✅ CRM: tiene clave"
            ok_crm += 1
        elif c.get("error"):
            estado_crm = f"❌ CRM: {c['error']}"
        else:
            estado_crm = "❌ CRM: SIN clave"
        estado_ventas = ""
        if not solo_ver and f.get("dni") and not f.get("olva"):
            r = poner_clave(f["dni"], f["tel"], clave, f.get("adelanto", 20), f.get("saldo", 69), f"{f.get('nombre') or ''} · {f.get('destino') or ''}"[:80])
            estado_ventas = " · " + ("✅ hoja Ventas" if r.get("ok") else f"❌ hoja Ventas: {r.get('error')}")
        elif not solo_ver and not f.get("dni"):
            estado_ventas = " · ⚠️ hoja Ventas: sin DNI en el registro, no se creó la venta"
        print(f"{nombre} · {f.get('tel')} · {estado_crm}{estado_ventas}")
    if lote_json is not None and not solo_ver:
        lote_json["clave"] = clave
        json.dump(lote_json, open(ruta, "w"), ensure_ascii=False, indent=1)
    print(f"\nCLAVE EN EL CRM: {ok_crm} de {len(lote)}." + ("" if ok_crm == len(lote) else " ⛔ NO digas que está listo: resuelve los que faltan o dilo tal cual."))


def cmd_agregar(args):
    """shalom.py agregar <whatsapp> --nombre "…" --dni 12345678 --agencia "texto del cliente" [--pago "Adelanto S/20 Yape 08-11; saldo S/69"]
    [--nota "…"] [--vendedora X] [--fecha AAAA-MM-DD] [--kits 1] [--empaque "…"]
    Un pedido de provincia que el reporte no trajo (viene del CRM / del chat) se agrega a la hoja «Pedidos auto» como CONFIRMADO para
    que entre al masivo. Lo usa la Routine solo con los datos leídos en el chat (nombre, DNI, agencia, adelanto); nunca inventa."""
    wa = re.sub(r"\D", "", args[0]) if args else ""
    if len(wa) < 9:
        sys.exit("Falta el WhatsApp (51…).")
    def opt(n, d=""):
        return args[args.index(n) + 1] if n in args and args.index(n) + 1 < len(args) else d
    nombre, dni, agencia = opt("--nombre"), re.sub(r"\D", "", opt("--dni")), opt("--agencia")
    if not (nombre and agencia):
        sys.exit("Faltan --nombre y --agencia (lo que escribió el cliente).")
    t = dt.datetime.now(LIMA); fecha = opt("--fecha") or (t.date() if t.hour < 3 else t.date() + dt.timedelta(days=1)).isoformat()
    ped = {"estado": "CONFIRMADO", "destino": "PROVINCIA", "nombre": nombre, "whatsapp": wa if wa.startswith("51") else "51" + wa[-9:], "telefono": wa[-9:], "dni": dni,
           "direccion_o_agencia": agencia, "courier": "Shalom", "kits": int(opt("--kits", "1") or 1), "empaque": opt("--empaque"), "pago": opt("--pago"),
           "fecha_entrega": fecha, "vendedora": opt("--vendedora"), "nota": ("🚨 AGREGADO DESDE EL CHAT (no estaba en el reporte): " + opt("--nota")).strip(), "fecha_venta": (t - dt.timedelta(hours=3)).date().isoformat()}
    r = pedir_worker("/pedidos-sheet", {"fecha_objetivo": fecha, "origen": f"shalom.py agregar {t.strftime('%H:%M')}", "pedidos": [ped]})
    print(f"Hoja «Pedidos auto»: {json.dumps(r, ensure_ascii=False)[:160]} · {nombre} queda como provincia CONFIRMADO para el despacho {fecha}; vuelve a correr `presentar` y entra al masivo.")


def cmd_telegram(texto, callar=False):
    if callar:  # avisos del propio sistema (agencias, plantilla): cualquier número suelto de 4 dígitos se tapa, por si acaso
        texto = re.sub(r"\b\d{4}\b(?!-\d{2})", "····", texto)
    elif re.search(r"clave\D{0,8}\d{4}", texto, re.I) or re.search(r"\b\d{4}\b(?!-\d{2})", texto):
        sys.exit("El aviso lleva una clave de 4 dígitos: quítala (las claves solo van en el archivo de referencia).")
    r = pedir_worker("/avisos", {"informe": f"Shalom — envío masivo\n\n{texto}", "origen": "shalom (aviso)"})
    if not callar:
        print(json.dumps(r, ensure_ascii=False))


def main():
    a = sys.argv[1:]
    cmd, resto = (a[0], a[1:]) if a else ("", [])
    if cmd == "agregar" and resto:
        cmd_agregar(resto)
    elif cmd == "telegram" and resto:
        cmd_telegram(" ".join(resto))
    elif cmd == "clave" and resto:
        cmd_clave(resto)
    elif cmd == "triangular" and resto:
        cmd_triangular(resto)
    elif cmd == "recomendar":
        cmd_recomendar(resto)
    elif cmd == "agencias":
        if "--actualizar" in resto:
            # El Worker es quien las baja (una vez al día); esto lo fuerza. `--archivo` además refresca el respaldo del repo.
            if os.environ.get("ASESOR_CLAVE"):
                r = pedir_worker("/shalom-agencias?forzar=1")
                print(f"Worker: {len(r.get('agencias') or [])} agencias · versión {r.get('version')} · bajadas {r.get('bajado')}" + (f" · ⚠️ {r['error']}" if r.get("error") else ""))
            if "--archivo" in resto or not os.environ.get("ASESOR_CLAVE"):
                v, n = actualizar(); print(f"Archivo del repo actualizado: {n} agencias (versión {v})")
        print(agencias_al_dia(avisar="--avisar" in resto))
        d = cargar()
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

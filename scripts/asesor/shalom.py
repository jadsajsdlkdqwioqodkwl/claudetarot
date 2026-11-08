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
  MERCADERIA = PAQUETE XXS (la medida más barata, S/8; las medidas y el peso los calcula la plantilla). CANTIDAD = kits del pedido.
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


def cargar():
    return json.load(open(DATOS, encoding="utf-8"))


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
    for a in cargar()["agencias"]:
        segmentos = [palabras(x) for x in str(a["codigo"]).split(" / ")]  # departamento, provincia, distrito, agencia
        dire = palabras(a["direccion"]); nom = segmentos[-1] if segmentos else []
        geo = {c for seg in segmentos[:-1] for c in seg}
        p = 0; especifico = False
        for w in q:
            parecido = lambda c: w == c or (len(w) > 4 and (c.startswith(w) or w.startswith(c)))
            niveles = sum(1 for seg in segmentos[:-1] if any(parecido(c) for c in seg))
            p += 3 * niveles                                                            # cada nivel (dep/prov/dist) que calza
            propia = w not in GENERICO and not any(parecido(c) for c in geo)
            if propia and any(parecido(c) for c in nom): p += 6; especifico = True      # una palabra PROPIA del nombre de la agencia
            if propia and w in dire: p += 2; especifico = True
            elif propia and any(len(w) > 4 and d.startswith(w) for d in dire): p += 1; especifico = True
        if p:
            res.append((p, especifico, a))
    res.sort(key=lambda x: (-x[0], x[2]["codigo"]))
    if not res:
        return []
    tope, esp = res[0][0], res[0][1]
    segundo = res[1][0] if len(res) > 1 else 0
    top = res[0][2]
    # Única agencia de su distrito y el texto nombró ese distrito: también es segura (p. ej. «Shalom Huarmey»).
    unica = sum(1 for a in cargar()["agencias"] if (a["departamento"], a["provincia"], a["distrito"]) == (top["departamento"], top["provincia"], top["distrito"])) == 1
    # Seguro si el texto nombra algo propio de la agencia y saca al menos 3 puntos al siguiente, o si es la única agencia del distrito nombrado.
    return [{"puntos": p, "seguro": p == tope and ((e and tope - segundo >= 3) or (unica and tope >= 6)), **a} for p, e, a in res[:n]]


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


def montos(p):
    """Adelanto y saldo de un pedido de provincia según el reporte («Adelanto S/20; saldo S/69»); por defecto 20 y precio − 20."""
    texto = f"{p.get('pago') or ''} {p.get('nota') or ''}"
    kits = int(str(p.get("kits") or 1)) if str(p.get("kits") or "1").isdigit() else 1
    precio = {1: 89, 2: 149, 3: 199}.get(kits, 89 * kits)
    m = re.search(r"adelanto\D{0,12}(\d{2,3})", texto, re.I) or re.search(r"(?:yape|plin)\s*s?/?\s*(\d{2,3})", texto, re.I)
    adelanto = int(m.group(1)) if m else 20
    if re.search(r"pag[oó] (todo|completo|el total)|pago completo|s/\s*%d completo" % precio, texto, re.I):
        adelanto = precio
    m2 = re.search(r"saldo\D{0,12}(\d{2,3})", texto, re.I)
    saldo = int(m2.group(1)) if m2 else max(0, precio - adelanto)
    return adelanto, saldo


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
    if not pedidos:
        sys.exit(f"No hay pedidos de provincia confirmados registrados para el despacho de {', '.join(fechas)}.")
    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    filas_excel = []
    # La referencia para la persona va en OTRO archivo: Shalom solo debe recibir su plantilla tal cual (sin hojas extra).
    wb_ref = openpyxl.Workbook(); ref = wb_ref.active; ref.title = "Referencia"
    ref.append(["Fila Excel", "Despacho", "Nombre", "WhatsApp", "DNI", "Lo que escribió el cliente", "Agencia elegida (código Shalom Pro)", "Seguro", "Otras candidatas", "Kits", "Nota del reporte", "Revisar", "CLAVE de seguridad (teclear en Shalom Pro)", "Adelanto", "Saldo"])
    tope = int(args[args.index("--solo") + 1]) if "--solo" in args else 0  # --solo N: solo las primeras N filas (pruebas)
    ajustes = {}
    if "--agencias" in args:
        ajustes = {re.sub(r"\D", "", k)[-9:]: v for k, v in json.load(open(args[args.index("--agencias") + 1])).items()}
    nombres_agencia = {a["agencia"] for a in cargar()["agencias"]}
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
        cand = buscar(texto, 3)
        k9 = re.sub(r"\D", "", str(p.get("whatsapp") or ""))[-9:]
        if k9 in ajustes:
            destino = str(ajustes[k9]).strip().upper()
            if destino not in nombres_agencia:
                revisar.append(f"{p.get('nombre')}: la agencia del ajuste «{destino}» no existe en Shalom (usa el nombre exacto de `buscar`)"); destino = ""
        else:
            destino = cand[0]["agencia"] if cand and cand[0]["seguro"] else ""
        if not destino:
            aviso.append("agencia dudosa: elegir entre las candidatas o preguntar al cliente")
            revisar.append(f"{p.get('nombre')} ({p.get('whatsapp')}): agencia dudosa para «{texto.strip()}» → " + (" | ".join(c["codigo"] for c in cand) if cand else "sin candidatas"))
        tel = re.sub(r"\D", "", str(p.get("telefono") or p.get("whatsapp") or ""))[-9:]
        dni = re.sub(r"\D", "", str(p.get("dni") or ""))
        clave = "PENDIENTE (la da el dueño)"
        adelanto, saldo = montos(p)
        if dni and destino:
            lote.append({"whatsapp": p.get("whatsapp"), "nombre": p.get("nombre"), "dni": dni, "tel": tel, "destino": destino, "adelanto": adelanto, "saldo": saldo})
        if con_ventas and dni and destino:
            r = poner_clave(dni, tel, clave_dia, adelanto, saldo, f"{p.get('nombre') or ''} · {destino}"[:80])
            clave = clave_dia if r.get("ok") else "ERROR"
            if r.get("error"):
                aviso.append(f"Ventas: {r['error']}"); revisar.append(f"{p.get('nombre')}: no se pudo crear/actualizar la venta en la hoja Ventas: {r['error']}")
            elif r.get("existia"):
                aviso.append("ya tenía venta abierta en la hoja Ventas: se le puso la clave del día")
            claves[k9] = clave
        if not dni:
            aviso.append("sin DNI en el registro: pedirlo o buscarlo en el chat"); revisar.append(f"{p.get('nombre')}: sin DNI en el registro")
        elif len(dni) != 8:
            aviso.append(f"DNI de {len(dni)} dígitos: verificar"); revisar.append(f"{p.get('nombre')}: DNI de {len(dni)} dígitos ({dni})")
        kits = int(str(p.get("kits") or 1)) if str(p.get("kits") or "1").isdigit() else 1
        # Al Excel solo entran las filas completas (DNI y agencia); las dudosas quedan en la referencia y en las preguntas.
        if dni and destino:
            filas_excel.append({"dni": dni, "tel": tel, "origen": ORIGEN, "destino": destino, "mercaderia": "PAQUETE XXS", "cantidad": kits})
        else:
            aviso.append("NO entra al Excel hasta resolverlo")
        ref.append([len(filas_excel) + 1 if dni and destino else "—", p.get("_fecha"), p.get("nombre"), p.get("whatsapp"), dni, texto.strip(), next((c["codigo"] for c in cand if c["agencia"] == destino), cand[0]["codigo"] if cand else ""), "sí" if destino else "NO",
                    " | ".join(c["codigo"] for c in cand if c["agencia"] != destino) if cand else "", kits, str(p.get("nota") or "")[:160], "; ".join(aviso), clave, adelanto, saldo])
        fila += 1
    for col, w in zip("ABCDEFGHIJKLMNO", (9, 11, 30, 14, 10, 45, 50, 7, 60, 5, 50, 45, 14, 9, 9)):
        ref.column_dimensions[col].width = w
    llenar_plantilla(filas_excel, salida)
    salida_ref = re.sub(r"\.xlsx$", "", salida) + "-referencia.xlsx"
    wb_ref.save(salida_ref)
    json.dump({"fecha": fecha, "clave": clave_dia, "lote": lote}, open(os.path.join(os.path.dirname(os.path.abspath(salida)), "lote.json"), "w"), ensure_ascii=False, indent=1)
    print(f"{salida} · {len(filas_excel)} fila(s) en el Excel de {fila - 2} pedido(s) de provincia para {', '.join(fechas)} (origen {ORIGEN}, PAQUETE XXS)")
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


def cmd_clave(args):
    clave = args[0]
    if not re.fullmatch(r"\d{4}", clave):
        sys.exit("La clave debe ser de 4 dígitos.")
    ruta = next((a for a in args[1:] if a.endswith(".json")), "/tmp/shalom/lote.json")
    if not os.path.exists(ruta):
        sys.exit(f"No existe {ruta}: primero corre `masivo`.")
    lote = json.load(open(ruta))
    ok = 0
    for f in lote.get("lote", []):
        r = poner_clave(f["dni"], f["tel"], clave, f.get("adelanto", 20), f.get("saldo", 69), f"{f.get('nombre') or ''} · {f.get('destino') or ''}"[:80])
        print(f"{'✅' if r.get('ok') else '❌'} {f.get('nombre')} · DNI {f['dni']} · {'ya existía, clave corregida' if r.get('existia') else 'venta creada'}{' · ' + r['error'] if r.get('error') else ''}")
        ok += bool(r.get("ok"))
    lote["clave"] = clave
    json.dump(lote, open(ruta, "w"), ensure_ascii=False, indent=1)
    print(f"Clave del día puesta en {ok} de {len(lote.get('lote', []))} ventas. En Shalom Pro: CLAVE MASIVA.")


def cmd_telegram(texto):
    if re.search(r"clave\D{0,8}\d{4}", texto, re.I) or re.search(r"\b\d{4}\b(?!-\d{2})", texto):
        sys.exit("El aviso lleva una clave de 4 dígitos: quítala (las claves solo van en el archivo de referencia).")
    r = pedir_worker("/avisos", {"informe": f"Shalom — envío masivo\n\n{texto}", "origen": "shalom (aviso)"})
    print(json.dumps(r, ensure_ascii=False))


def main():
    a = sys.argv[1:]
    cmd, resto = (a[0], a[1:]) if a else ("", [])
    if cmd == "telegram" and resto:
        cmd_telegram(" ".join(resto))
    elif cmd == "clave" and resto:
        cmd_clave(resto)
    elif cmd == "agencias":
        if "--actualizar" in resto:
            v, n = actualizar(); print(f"Agencias actualizadas: {n} (versión {v})")
        d = cargar(); print(f"{len(d['agencias'])} agencias · versión {d.get('version')} · bajado {d.get('bajado')}")
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

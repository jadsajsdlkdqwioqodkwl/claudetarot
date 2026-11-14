"""
Etiquetas de pedidos en PDF (A4, 3 × 5 = 15 por hoja), generadas DESDE LOS DATOS, no desde fotos (dueño, 2026-11-08):
el mismo formato del Project «Etiquetas de pedidos en PDF» que usaba el dueño (Shalom → Lima → Olva, huecos rellenos con
etiquetas en blanco, línea de corte, pie «Envía: 76250205» en las de Shalom).

    ASESOR_CLAVE=... python3 scripts/asesor/etiquetas.py [AAAA-MM-DD] [--shalom datos.json] [--olva datos.json] [--salida /tmp/etiquetas.pdf] [--subir]
        AAAA-MM-DD      día de RECOJO de Dinsides (por defecto hoy antes de las 6:00, si no mañana). Salen las etiquetas de Lima de lo
                        REGISTRADO en ese ciclo (desde las 6:00 del día anterior hasta las 6:00 de ese día), sea cual sea su fecha de
                        entrega: Dinsides pasa a las ~8:00, se lleva todo lo registrado que aún no tiene en su almacén y guarda lo de
                        otros días hasta su fecha (dueño, 2026-11-09). Lo registrado en ciclos anteriores ya está en su almacén y NO se
                        vuelve a imprimir. Datos del historial de Dinsides (`GET /api/asesor/dinsides?listado=1`): ID PEDIDO, Negocio,
                        ENTREGAR A, Teléfono, Producto, Cobrar, Distrito, Fecha Entrega, Detalle (observaciones). Los ANULADOS no salen.
        --entrega       (modo viejo) filtrar por fecha de ENTREGA en vez de por ciclo de registro.
        --shalom-hoja   además las etiquetas de Shalom de lo que el equipo registró A MANO en Shalom Pro en ese ciclo (hoja «Pedidos
                        auto», «Enviado» = «sí FECHA Shalom NNN (registrado a mano)»): orden, destinatario, DNI de la nota, destino y
                        agencia (data/shalom-agencias.json). El «Código» que imprime Shalom no se guarda: queda en blanco para escribirlo.
        --shalom f.json lista [{"orden": "103026403", "codigo": "7D9K", "destinatario": "…", "doc": "42371371",
                        "destino": "La Libertad - Sanchez Carrion - Huamachuco", "agencia": "Huamachuco", "direccion": "Jr. …"}]
                        (lo que imprime Shalom Pro; cuando Shalom se automatice saldrá solo de ahí).
        --olva f.json   lista [{"nombre": "…", "dni": "…", "telefono": "…", "destino": "CALLE MORAL 105, AREQUIPA"}]
        --olva-hoja     además las etiquetas de OLVA de los pedidos de provincia confirmados (reporte del despacho + hoja «Pedidos
                        auto») cuya agencia dice «Olva»: destinatario, DNI de la nota, teléfono y «Olva de destino» = la tienda o
                        agente de https://www.olvacourier.com/ubicanos/ que calza con lo que escribió el cliente (data/olva-agencias.json).
        Todas las etiquetas llevan la fecha del despacho (Lima: Fecha Entrega; Shalom y Olva: «Despacho dd/mm/aaaa») y el script avisa
        si las de Lima no dicen todas la misma fecha (dueño, 2026-11-10).
        --sin-blancos   no rellena la última hoja con etiquetas en blanco.
        --subir         además guarda el PDF en CRM → Reportes (como los reportes) e imprime el link.
    Sin ASESOR_CLAVE solo arma Shalom y Olva desde los archivos (sin Lima).
"""
import base64, datetime as dt, json, os, re, sys, textwrap, urllib.error, urllib.request

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

API_BASE = os.environ.get("ASESOR_API_BASE") or "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor"
LIMA = dt.timezone(dt.timedelta(hours=-5))
REMITENTE = {"nombre": "MOISES EDUARD OLORTEGUI HUAMAN", "dni": "76250205", "tel": "927633099"}
NEGOCIO = "Tarot Store Peru"

page_w, page_h = A4
# Bien pegado a los bordes de la A4 (dueño 2026-11-10): 4 mm de margen, lo mínimo que imprimen las impresoras caseras, y las 5 filas
# reparten todo el alto.
margin, gap, cols, rows = 4 * mm, 1 * mm, 3, 5
cell_w = (page_w - 2 * margin - (cols - 1) * gap) / cols
cell_h = (page_h - 2 * margin - (rows - 1) * gap) / rows
per_page = rows * cols
BLANK_H = 50 * mm


def pedir(ruta):
    clave = os.environ.get("ASESOR_CLAVE")
    if not clave:
        return None
    req = urllib.request.Request(f"{API_BASE}{ruta}", headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def _fecha_pe(iso):
    iso = str(iso or "")[:10]
    return f"{iso[8:10]}/{iso[5:7]}/{iso[0:4]}" if len(iso) == 10 and iso[4] == "-" else iso


def fecha_por_defecto():
    """Día de recojo: hasta las 6:00 todavía es el de hoy (Dinsides pasa ~8:00); después, mañana."""
    t = dt.datetime.now(LIMA)
    base = t.date() if t.hour < 6 else t.date() + dt.timedelta(days=1)
    return base.isoformat()


def en_ciclo(fecha_pedido, recojo):
    """¿Se registró entre las 6:00 del día anterior y las 6:00 del día de recojo? (fecha_pedido de Dinsides: 'AAAA-MM-DD HH:MM:SS')."""
    fp = str(fecha_pedido or "")[:19]
    if len(fp) < 16:
        return False
    d = dt.date.fromisoformat(recojo)
    return f"{(d - dt.timedelta(days=1)).isoformat()} 06:00:00" < fp <= f"{recojo} 06:00:00"


def olva_de_hoja(recojo):
    """Etiquetas de Olva: provincia CONFIRMADO con «Olva» en la agencia, del reporte del despacho y de la hoja (sin «Enviado»)."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import olva as ov
    vistos, out = set(), []
    def agregar(f, origen):
        wa = re.sub(r"\D", "", str(f.get("whatsapp") or ""))[-9:]
        texto = f"{f.get('direccion_o_agencia') or ''} {f.get('nota') or ''}"
        if not wa or wa in vistos or "olva" not in texto.lower() or str(f.get("destino") or "").upper() != "PROVINCIA" or not str(f.get("estado") or "").upper().startswith("CONFIRMADO"):
            return
        vistos.add(wa)
        cand = ov.buscar(str(f.get("direccion_o_agencia") or ""))
        a = cand[0] if cand else {}
        dni = re.search(r"\b(\d{8})\b", f"{f.get('dni') or ''} {f.get('nota') or ''}")
        out.append({"nombre": f.get("nombre"), "dni": dni.group(1) if dni else "", "telefono": wa, "empaque": con_collar_extra(empaque_shalom(f.get("kits"), f.get("empaque")), wa), "destino": ov.destino_de(a) if a else str(f.get("direccion_o_agencia") or ""),
                    "despacho": recojo, "_seguro": bool(a and a.get("seguro")), "_origen": origen})
    est = pedir(f"/ventas-estado?fecha={recojo}&tipo=pedidos") or {}
    for f in ((est.get("estado") or {}).get("pedidos") or []):
        agregar(f, "reporte")
    r = pedir(f"/pedidos-sheet?hoy={recojo}") or {}
    for k in ("atrasados", "hoy", "futuros"):
        for f in r.get(k) or []:
            agregar(f, f"hoja {k}")
    return out


def shalom_de_hoja(recojo):
    """Etiquetas de Shalom de lo registrado a mano por el equipo en este ciclo (hoja «Pedidos auto», columna Enviado)."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import shalom as sh
    r = pedir(f"/pedidos-sheet?hoy={recojo}&enviadas=1") or {}
    ayer = (dt.date.fromisoformat(recojo) - dt.timedelta(days=1)).isoformat()
    out = []
    for f in r.get("enviadas") or []:
        env_ = str(f.get("enviado") or "")
        m = re.search(r"Shalom\s+(\d{6,})", env_)
        # Solo lo cerrado en ESTE ciclo (6:00 del día anterior → 6:00 del recojo, por la columna «actualizado» de la fila): lo del ciclo
        # anterior ya se imprimió (2026-11-10: los 7 del día 9 volvían a salir).
        act = str(f.get("actualizado") or "")[:16]
        # … o la fila dice la fecha del recojo en «Enviado» (una fila cerrada que se volvió a marcar no cambia «actualizado»).
        if not m or "mano" not in env_.lower() or not (f"{ayer} 06:00" < act <= f"{recojo} 06:00" or recojo in env_):
            continue
        texto = str(f.get("direccion_o_agencia") or "")
        # La misma agencia que el Excel y la revisión (`shalom.elegir_agencia`), no una búsqueda aparte.
        e = sh.elegir_agencia(f) if texto.strip() else {}
        a = next((x for x in sh.cargar()["agencias"] if x["codigo"] == e.get("codigo")), {}) if e.get("agencia") else {}
        if a:
            a = dict(a, agencia=e["agencia"], seguro=e["segura"])
        dni = re.search(r"\b(\d{8})\b", str(f.get("nota") or ""))
        cod = re.search(r"c[oó]d\.?\s*:?\s*([A-Z0-9]{4})\b", env_, re.I)
        kits = str(f.get("kits") or "1").strip()
        empaque = con_collar_extra(empaque_shalom(kits, f.get("empaque")), f.get("whatsapp"))
        out.append({"orden": m.group(1), "codigo": cod.group(1).upper() if cod else "", "despacho": recojo, "empaque": empaque, "destinatario": str(f.get("nombre") or "").upper(), "doc": dni.group(1) if dni else "",
                    "destino": f"{a.get('departamento', '')} - {a.get('provincia', '')} - {a.get('distrito', '')}" if a else texto[:60],
                    "agencia": a.get("agencia", "") if a else "", "direccion": a.get("direccion", "") if a else "", "_seguro": bool(a and a.get("seguro"))})
    return out


RE_NOTA_PAGO = re.compile(r"ya pag[oó]|\bpagad[oa]\b|\bpaga(r[aá]|ria|ría)?\b|\bpago\b|no cobrar|\bcobrar\b|yape|\bplin\b|efectivo|tarjeta|\bpos\b|adelanto|\bsaldo\b|contra ?entrega|S/\s*\d|\bop\.?\s*\d|dep[oó]sito|transferencia", re.I)
RE_NOTA_PIN = re.compile(r"\bpin\b|ubicaci[oó]n (enviada|del cliente)|coordenad|\d{1,2}°\s*\d{1,2}['′]|-?\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}|maps\.|goo\.gl", re.I)
RE_NOTA_INTERNA = re.compile(r"confirm(ar|ado|ó)|escribi[oó]|dos versiones|sin n[uú]mero en el crm|nombre de usuario|captura|reporte|asesora|vendedora|\ble (pidi[oó]|pregunt[oó])|corrigi[oó]|aclar[oó]|agendad[oa]|reagendar|ya dio su direcci|seguimiento autom|prometi|\bkits?\b|\bmand[oó]\b|\bcrm\b", re.I)


def nota_motorizado(texto, telefono=""):
    """La nota que lee el MOTORIZADO en la etiqueta (dueño 2026-11-11): cómo contactar, a quién entregar, dónde dejarlo, horario.
    Sin pagos («ya pagó 89», «cobrar 0»: ya va en Cobrar), sin pines ni coordenadas (la etiqueta va pegada a la caja) y sin apuntes
    internos («confirmar, escribió dos versiones»). Es la misma regla de `notaParaMotorizado` en src/lib/dinsides.js; aquí limpia
    también lo que se registró en Dinsides antes de esa regla."""
    malo = lambda t: RE_NOTA_PAGO.search(t) or RE_NOTA_PIN.search(t) or RE_NOTA_INTERNA.search(t)
    texto = re.sub(r"\(([^)]*)\)", lambda m: " " if malo(m.group(1)) else m.group(0), str(texto or ""))
    quedan = []
    for f0 in re.split(r"(?<=[.;:])\s+|\s+·\s+", texto):
        dos = f0.rstrip().endswith(":")  # «DISCRECIÓN: que no toque…»: si las dos mitades quedan, se unen con «: »
        f = f0.strip(" ,;:.·-")
        if not f or malo(f):
            continue
        sin_tel = re.sub(r"(?:\+?51[\s-]?)?9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}", lambda m: "" if telefono and re.sub(r"\D", "", m.group(0))[-9:] == str(telefono) else m.group(0), f)
        if sin_tel != f and re.fullmatch(r"(dio su |su )?(tel[eé]fono|tel|cel|celular|n[uú]mero)?( de contacto)?\W*", sin_tel.strip(), re.I):
            continue
        quedan.append(f + (":" if dos else ""))
    return re.sub(r"\s+", " ", ". ".join(quedan).replace(":. ", ": ")).strip().rstrip(":")


RE_HORARIO = re.compile(r"((?:a las|antes de las?|despu[eé]s de las?|desde las?|hasta las?|a partir de las?|pasad[oa]s? las?|entre las?)\s*\d{1,2}(?::\d{2})?\s*(?:(?:y|a)\s*(?:las\s*)?\d{1,2}(?::\d{2})?\s*)?(?:am|pm|a\.?\s?m\.?|p\.?\s?m\.?|de la (?:mañana|tarde|noche)|h\b)?"
                        r"|\bde\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*a\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)"
                        r"|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b"
                        r"|\b(?:en la mañana|por la mañana|temprano|lo m[aá]s temprano posible|en la tarde|por la tarde|en la noche|de noche|al mediod[ií]a|hora exacta|solo (?:en la )?(?:mañana|tarde|noche)))", re.I)


def horario_lima(d):
    """El horario ofrecido al cliente, para la etiqueta (dueño 2026-11-13): «12 a 5 pm» (el regular de Dinsides) o el ESPECIAL que
    pidió el cliente, si la nota del pedido lo dice («en la tarde», «de 3 a 5 pm», «antes de las 3»)."""
    obs = re.sub(r"12\s*(?:p\.?\s?m\.?)?\s*(?:a|-|–|y)\s*(?:las\s*)?5\s*(?:pm|p\.?\s?m\.?)?", " ", str(d.get("observaciones", "") or ""), flags=re.I)
    m = RE_HORARIO.search(obs)
    return f"ESPECIAL: {m.group(0).strip()}" if m else "12 a 5 pm (regular)"


def detalle_lima(d):
    """El «Detalle» de la etiqueta de Lima: SIEMPRE empieza con «Escribir al cliente por WhatsApp: …» (dueño 2026-11-11) y sigue
    con la nota del motorizado. Si la observación de Dinsides ya trae esa línea (pedidos registrados desde hoy) no se repite."""
    obs = re.sub(r"\s*Paquete:[^.]+\.?", "", str(d.get("observaciones", "") or ""))
    m = re.search(r"Escribir al cliente por WhatsApp:\s*((?:9\d{8}|@[\w.]+)(?:\s+o\s+(?:9\d{8}|@[\w.]+))*)", obs)
    nums = [n.rstrip(".") for n in re.findall(r"9\d{8}|@[\w.]+", m.group(1))] if m else []
    obs = re.sub(r"Escribir al cliente por WhatsApp:\s*(?:9\d{8}|@[\w.]+)(?:\s+o\s+(?:9\d{8}|@[\w.]+))*\.?", "", obs)
    for n in (re.sub(r"\D", "", str(d.get("_whatsapp") or ""))[-9:], str(d.get("telefono") or "")):
        if re.fullmatch(r"9\d{8}", n) and n not in nums:
            nums.append(n)
    linea = f"Escribir al cliente por WhatsApp: {' o '.join(nums)}" if nums else ""
    return ". ".join(x for x in (linea, nota_motorizado(obs, d.get("telefono"))) if x)


_PROMESAS = None


def con_collar_extra(empaque, *telefonos):
    """Si al cliente se le ofreció en el chat un collar amuleto EXTRA (seguimientos del equipo), la etiqueta lo dice (dueño
    2026-11-11, caso Alicia): «+ 1 COLLAR AMULETO EXTRA». Se mira al imprimir, así también vale para lo ya registrado.
    Dueño 2026-11-14: si la búsqueda general no lo trae (se corta en los 5000 mensajes más nuevos), se lee el chat de ese cliente."""
    global _PROMESAS
    import promesas as prom
    clave = os.environ.get("ASESOR_CLAVE", "")
    if _PROMESAS is None:
        _PROMESAS = prom.traer(clave, 30) if clave else {}
    emp = str(empaque or "")
    if re.search(r"collar[^·]*(extra|adicional)|(extra|adicional)[^·]*collar", emp, re.I):
        return emp
    for t in telefonos:
        k = prom.nueve(t) if not re.fullmatch(r"[A-Za-z]{2}\.\d+", str(t or "")) else str(t)
        if k and (prom.collar_extra(_PROMESAS.get(k)) or prom.collar_extra_del_chat(clave, t)):
            return (emp + " " if emp else "") + prom.TEXTO_COLLAR
    return emp


def regular(texto):
    """Dueño 2026-11-14: en etiquetas y empaques NUNCA «normal»; se dice «regular» («1 kit regular»)."""
    return re.sub(r"\bnormal(es)?\b", lambda m: "regular" + (m.group(1) or ""), str(texto or ""), flags=re.I)


def empaque_shalom(kits, empaque=""):
    """«EMPAQUE: …» de una etiqueta de provincia. SIEMPRE dice algo (dueño 2026-11-11: las de 1 kit salían sin nada): «1 kit regular»
    (dueño 2026-11-14: nunca «normal»), «N KITS (Paquete XS)» con 2 o más, y lo extra que traiga el reporte."""
    kits = int(kits) if str(kits).strip().isdigit() else 1
    base = f"{kits} KITS (Paquete XS)" if kits >= 2 else ("1 kit regular" if kits == 1 else "NO es kit")
    extra = " · ".join(t for t in re.split(r"\s+·\s+", str(empaque or "").strip()) if t and not re.search(r"VERIFICAR|en el chat se le prometi", t))
    if extra and re.fullmatch(r"\d+\s*kits?\b.*|(1\s+)?kit (normal|regular|completo).*", extra, re.I) and "+" not in extra:
        extra = ""
    return regular(f"{base} · {extra}" if extra else base)


def completar_empaque_shalom(items, recojo):
    """El empaque de las etiquetas de Shalom/Olva que vienen de un archivo (--shalom / --olva) lo pone SIEMPRE el sistema (dueño
    2026-11-14: el Claude de la operadora escribía «1 kit normal» a mano y se perdían los collares extra): se busca por DNI en el
    reporte del despacho y en la hoja «Pedidos auto», se suman los extras que el archivo traiga, y se revisa el chat del cliente
    por si se le ofreció un collar extra. Si no aparece en el reporte, va «1 kit regular» (y el chat igual se revisa)."""
    por_dni = {}
    try:
        est = pedir(f"/ventas-estado?fecha={recojo}&tipo=pedidos") or {}
        r = pedir(f"/pedidos-sheet?hoy={recojo}&enviadas=1") or {}
    except Exception:  # noqa: BLE001
        est, r = {}, {}
    for f in ((est.get("estado") or {}).get("pedidos") or []) + [x for k in ("atrasados", "hoy", "futuros", "enviadas") for x in (r.get(k) or [])]:
        m = re.search(r"\b(\d{8,9})\b", f"{f.get('dni') or ''} {f.get('nota') or ''}")
        if m and m.group(1) not in por_dni:
            por_dni[m.group(1)] = f
    for d in items:
        f = por_dni.get(str(d.get("doc") or d.get("dni") or ""), {})
        base = empaque_shalom(f.get("kits") if f else 1, f.get("empaque") if f else "")
        propio = regular(d.get("empaque") or "")
        propio = re.sub(r"^\s*(EMPAQUE:\s*)?(1\s+)?kit (tarot de aprendizaje )?(regular|completo)\b[^·]*", "", propio, flags=re.I).strip(" ·")
        if propio and propio.lower() not in base.lower():
            base = f"{base} · {propio}"
        d["empaque"] = con_collar_extra(base, (f or {}).get("whatsapp"), d.get("telefono"), d.get("whatsapp"))
        if not f:
            print(f"⚠️ {d.get('destinatario') or d.get('nombre')}: DNI {d.get('doc') or d.get('dni') or '?'} no está en el reporte del {recojo}; EMPAQUE = {d['empaque']}")


# ---------- dibujo ----------
def cut(c, x, y, w, h):
    c.saveState(); c.setDash(2, 2); c.setStrokeColorRGB(.7, .7, .7); c.setLineWidth(.4)
    c.rect(x, y, w, h); c.restoreState()


def ajustar(c, texto, fuente, tam, ancho, minimo=6):
    while c.stringWidth(texto, fuente, tam) > ancho and tam > minimo:
        tam -= .25
    return tam


def partir(c, texto, fuente, tam, ancho, primera=None):
    """Parte un texto en líneas que ENTRAN en `ancho` midiendo el ancho real de cada palabra con esa letra (dueño 2026-11-13:
    el Detalle y el EMPAQUE se cortaban por cantidad de letras y a veces se salían de la etiqueta o partían mal). `primera` =
    ancho de la primera línea si es más corta. Una palabra más larga que la línea (un link) se corta en pedazos."""
    lineas, actual, lim = [], "", (primera if primera is not None else ancho)
    for pal in str(texto or "").split():
        while c.stringWidth(pal, fuente, tam) > lim and not actual:
            n = len(pal)
            while n > 1 and c.stringWidth(pal[:n], fuente, tam) > lim:
                n -= 1
            lineas.append(pal[:n]); pal = pal[n:]; lim = ancho
        cand = f"{actual} {pal}".strip()
        if c.stringWidth(cand, fuente, tam) <= lim:
            actual = cand
        else:
            lineas.append(actual); lim = ancho
            while c.stringWidth(pal, fuente, tam) > lim:
                n = len(pal)
                while n > 1 and c.stringWidth(pal[:n], fuente, tam) > lim:
                    n -= 1
                lineas.append(pal[:n]); pal = pal[n:]
            actual = pal
    if actual:
        lineas.append(actual)
    return lineas


def campo(c, x, y, etiqueta, valor, ancho, tam=7.5, negrita_valor=False, max_lineas=1):
    """«Etiqueta: valor» en una o varias líneas; devuelve cuánto bajó."""
    c.setFont("Helvetica-Bold", tam); c.drawString(x, y, etiqueta)
    lx = x + c.stringWidth(etiqueta, "Helvetica-Bold", tam) + 1.2 * mm
    fuente = "Helvetica-Bold" if negrita_valor else "Helvetica"
    lineas = partir(c, valor, fuente, tam, ancho, primera=ancho - (lx - x)) or [""]
    if len(lineas) > max_lineas:  # lo que no entra se marca con «…» (lo completo va en EMPAQUE)
        lineas = lineas[:max_lineas]; lineas[-1] = lineas[-1].rstrip(" +:,") + "…"
    c.setFont(fuente, tam); c.drawString(lx, y, lineas[0])
    bajo = tam * 1.45
    for ln in lineas[1:max_lineas]:
        y -= bajo; c.setFont(fuente, tam); c.drawString(x, y, ln)
    return bajo * min(len(lineas), max_lineas)


def etiqueta_lima(c, x0, yb, d):
    """Como la etiqueta que imprime Dinsides (ID PEDIDO, Negocio, ENTREGAR A, Teléfono, Detalle, Cobrar, Distrito, Fecha Entrega)."""
    p = 2.2 * mm; x = x0 + p; R = x0 + cell_w - p; ancho = R - x
    y = yb + cell_h - p - 2.8 * mm
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 7); c.drawString(x, y, "ID PEDIDO:"); c.setFont("Helvetica", 7)
    c.drawString(x + c.stringWidth("ID PEDIDO:", "Helvetica-Bold", 7) + 1.2 * mm, y, str(d.get("id_pedido", "")))
    c.setFont("Helvetica-Bold", 7); c.drawRightString(R, y, "Negocio: " + NEGOCIO); y -= 4 * mm
    c.setFont("Helvetica-Bold", 7.5); c.drawString(x, y, "ENTREGAR A:"); y -= 4 * mm
    nombre = str(d.get("nombre", "")).upper(); tam = ajustar(c, nombre, "Helvetica-Bold", 10, ancho)
    c.setFont("Helvetica-Bold", tam); c.drawString(x, y, nombre); y -= 4.2 * mm
    y -= campo(c, x, y, "Teléfono:", d.get("telefono", ""), ancho)
    # Cuánto sitio queda para el Detalle (dueño 2026-11-13: se cortaba o no salía). Se calcula ANTES de dibujar: si el Detalle no
    # entra, el Producto baja a una línea (lo completo ya va en EMPAQUE) y la letra del Detalle se achica hasta que entre todo.
    obs = str(d.get("observaciones", "") or "").strip()
    paq = re.search(r"Paquete:\s*([^.]+)", obs)
    empaque = con_collar_extra((paq.group(1).strip() if paq else str(d.get("detalle", "") or "")).strip(), d.get("_whatsapp"), d.get("telefono"))
    lineas_emp = partir(c, "EMPAQUE: " + empaque, "Helvetica-Bold", 5.2, ancho)[:3] if empaque else []
    pie = (len(lineas_emp) * 2.5 * mm + 0.8 * mm) if lineas_emp else 0
    det = detalle_lima(d)
    ancho_det0 = ancho - c.stringWidth("Detalle:", "Helvetica-Bold", 7) - 1.2 * mm
    prod_n = min(2, len(partir(c, d.get("detalle", ""), "Helvetica", 7.5, ancho, primera=ancho - c.stringWidth("Producto:", "Helvetica-Bold", 7.5) - 1.2 * mm)) or 1)
    lineas_det, tam_det = [], 6.3
    while det:
        sitio = y - (7.5 * 1.45 * (3 + prod_n) + 8 * 1.45 + 7 * 1.45) - (yb + p + pie) + 1.2 * mm
        for tam_det in (6.3, 6.0, 5.7, 5.4, 5.1, 4.8):
            lineas_det = partir(c, det, "Helvetica", tam_det, ancho, primera=ancho_det0)
            if len(lineas_det) * tam_det * 1.22 <= sitio:
                break
        if len(lineas_det) * tam_det * 1.22 <= sitio or prod_n == 1:
            lineas_det = lineas_det[:max(1, int(sitio / (tam_det * 1.22)))]
            break
        prod_n = 1
    y -= campo(c, x, y, "Producto:", d.get("detalle", ""), ancho, max_lineas=prod_n)
    cobrar = str(d.get("monto_cobrar", "")); pago = str(d.get("tipo_pago", "") or "")
    texto_cobrar = f"S/. {cobrar}" + (f" - {pago}" if pago and pago != "YAPE" else "")
    y -= campo(c, x, y, "Cobrar:", texto_cobrar, ancho, negrita_valor=True)
    y -= campo(c, x, y, "Distrito:", d.get("distrito", ""), ancho, tam=8, negrita_valor=True)
    fe = str(d.get("fecha_entrega", ""))[:10]
    if len(fe) == 10 and fe[4] == "-":
        fe = f"{fe[8:10]}/{fe[5:7]}/{fe[0:4]}"
    y -= campo(c, x, y, "Fecha Entrega:", fe, ancho, negrita_valor=True)
    y -= campo(c, x, y, "Horario:", horario_lima(d), ancho, tam=7, negrita_valor=True)
    # Nota para el que empaca (dueño 2026-11-09): qué lleva la caja, en letra chica al pie, en varias líneas.
    if lineas_det:
        c.setFont("Helvetica-Bold", 7); c.drawString(x, y, "Detalle:")
        c.setFont("Helvetica", tam_det)
        c.drawString(x + ancho - ancho_det0, y, lineas_det[0]); y -= tam_det * 1.22
        for ln in lineas_det[1:]:
            c.drawString(x, y, ln); y -= tam_det * 1.22
    if lineas_emp:
        c.setFont("Helvetica-Bold", 5.2)
        ye = yb + p + 0.4 * mm
        for ln in reversed(lineas_emp):
            c.drawString(x, ye, ln); ye += 2.5 * mm
    cut(c, x0, yb, cell_w, cell_h)


def etiqueta_shalom(c, x0, yb, d):
    """Formato del ticket de Shalom (N° de Orden, Código, Destinatario, N°DOC, Destino, agencia y dirección) + pie «Envía» y, debajo,
    la nota para el que empaca («EMPAQUE: …», dueño 2026-11-10)."""
    p = 2 * mm; x = x0 + p; R = x0 + cell_w - p; ancho = R - x
    lineas_emp = partir(c, "EMPAQUE: " + regular(d.get("empaque") or empaque_shalom(1)), "Helvetica-Bold", 5.2, ancho)[:3]
    pie_emp = len(lineas_emp) * 2.5 * mm + (0.8 * mm if lineas_emp else 0)
    pie = 4.5 * mm + pie_emp; top = yb + cell_h
    c.setFillColorRGB(.93, .96, .99); c.rect(x0 + .8 * mm, top - 12.5 * mm, cell_w - 1.6 * mm, 11.5 * mm, stroke=0, fill=1)
    c.setFillColorRGB(.1, .2, .45)
    y = top - p - 3.2 * mm
    c.setFont("Helvetica-Bold", 8.5); c.drawString(x, y, f"N° de Orden: {d.get('orden', '')}"); y -= 4.6 * mm
    c.drawString(x, y, f"Código: {d.get('codigo', '')}")
    if d.get("despacho"):  # la fecha va en el encabezado azul: en el pie chocaba con «Envía» (2026-11-10)
        c.setFont("Helvetica", 6.5); c.drawRightString(R, y, f"Despacho {_fecha_pe(d['despacho'])}")
    y -= 6.5 * mm
    c.setFillColorRGB(.35, .35, .35); c.setFont("Helvetica", 6.5); c.drawString(x, y, "Destinatario:"); y -= 3.6 * mm
    c.setFillColorRGB(.1, .1, .1)
    nombre = str(d.get("destinatario", "")); tam = ajustar(c, nombre, "Helvetica-Bold", 9.5, ancho)
    c.setFont("Helvetica-Bold", tam); c.drawString(x, y, nombre); y -= 3.8 * mm
    c.setFont("Helvetica", 6.3); c.drawString(x, y, f"N°DOC. {d.get('doc', '')}"); y -= 4 * mm
    c.setFillColorRGB(.35, .35, .35); c.setFont("Helvetica", 6.5); c.drawString(x, y, "Destino:"); y -= 3.2 * mm
    c.setFont("Helvetica", 6.3); c.drawString(x, y, str(d.get("destino", ""))); y -= 4 * mm
    c.setFillColorRGB(.1, .1, .1)
    agencia = str(d.get("agencia", "")); tam = ajustar(c, agencia, "Helvetica-Bold", 9.5, ancho)
    c.setFont("Helvetica-Bold", tam); c.drawString(x, y, agencia); y -= 3.6 * mm
    c.setFont("Helvetica", 6)
    for ln in partir(c, d.get("direccion", ""), "Helvetica", 6, ancho)[:3]:
        c.drawString(x, y, ln); y -= 2.8 * mm
    c.setFillColorRGB(.05, .05, .05); c.setFont("Helvetica-Bold", 8.5)
    c.drawCentredString(x0 + cell_w / 2, yb + pie_emp + 1.2 * mm, f"Envía: {REMITENTE['dni']}")
    if lineas_emp:
        c.setFont("Helvetica-Bold", 5.2); ye = yb + 1 * mm
        for ln in reversed(lineas_emp):
            c.drawString(x, ye, ln); ye += 2.5 * mm
    cut(c, x0, yb, cell_w, cell_h)
    c.setLineWidth(.3); c.line(x0, yb + pie, x0 + cell_w, yb + pie)


def field(c, x, y, label, right, size=7.5):
    c.setFont("Helvetica-Bold", size); c.drawString(x, y, label)
    lx = x + c.stringWidth(label, "Helvetica-Bold", size) + 1.5 * mm
    c.setLineWidth(.3); c.line(lx, y - .8 * mm, right, y - .8 * mm)


def etiqueta_olva(c, x0, yb, d=None):
    """Etiqueta Olva generada (datos) o en blanco (d=None), como en el Project del dueño."""
    w, h = cell_w, (cell_h if d else BLANK_H)
    y_top = yb + cell_h - (0 if d else (cell_h - h) / 2)
    yb2 = y_top - h
    p = 2.2 * mm; x = x0 + p; R = x0 + w - p; y = y_top - p - 2.6 * mm
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 7.5); c.drawString(x, y, "Destinatario:")
    if d and d.get("despacho"):
        c.setFont("Helvetica", 6.5); c.drawRightString(R, y, f"Despacho {_fecha_pe(d['despacho'])}")
    y -= 4 * mm
    if d:
        nm = str(d["nombre"]).upper(); fs = ajustar(c, nm, "Helvetica-Bold", 9.5, R - x, 6.5)
        c.setFont("Helvetica-Bold", fs); c.drawString(x, y, nm); y -= 4.2 * mm
        for k, v in (("DNI: ", d.get("dni", "")), ("Teléfono: ", d.get("telefono", ""))):
            c.setFont("Helvetica-Bold", 7.5); c.drawString(x, y, k)
            c.setFont("Helvetica", 7.5); c.drawString(x + c.stringWidth(k, "Helvetica-Bold", 7.5), y, str(v)); y -= 3.8 * mm
        c.setFont("Helvetica-Bold", 7.5); c.drawString(x, y, "Olva de destino:"); y -= 3.5 * mm
        c.setFont("Helvetica-Bold", 6.8)  # 6.8 pt y 38 caracteres: cabe en los 66 mm de la etiqueta (antes se salía del margen)
        for ln in partir(c, str(d.get("destino", "")).upper(), "Helvetica-Bold", 6.8, R - x)[:3]:
            c.drawString(x, y, ln); y -= 3.1 * mm
    else:
        c.setLineWidth(.3); c.line(x, y, R, y); y -= 4.5 * mm
        for lb in ("DNI:", "Teléfono:", "Olva de destino:"):
            field(c, x, y, lb, R); y -= 5 * mm
        c.line(x, y, R, y); y -= 4.5 * mm
    y -= .5 * mm; c.setLineWidth(.6); c.line(x, y + 2.5 * mm, R, y + 2.5 * mm)
    c.setFont("Helvetica-Bold", 7.5); c.drawString(x, y - .5 * mm, "Envía:"); y -= 3.8 * mm
    c.setFont("Helvetica", 6.8)
    for t in (f"Nombre: {REMITENTE['nombre']}", f"DNI: {REMITENTE['dni']}", f"TEL: {REMITENTE['tel']}"):
        c.drawString(x, y, t); y -= 3.1 * mm
    if d:  # nota para el que empaca, como en Shalom y Lima (dueño 2026-11-11: las de Olva no la traían)
        c.setFont("Helvetica-Bold", 5.2); ye = yb2 + 1 * mm
        for ln in reversed(partir(c, "EMPAQUE: " + regular(d.get("empaque") or empaque_shalom(1)), "Helvetica-Bold", 5.2, R - x)[:3]):
            c.drawString(x, ye, ln); ye += 2.5 * mm
    cut(c, x0, yb2, w, h)


def blank_shalom(c, x0, yb):
    h = BLANK_H; y_top = yb + (cell_h + h) / 2; p = 2.2 * mm; x = x0 + p; R = x0 + cell_w - p
    y = y_top - p - 3 * mm; c.setFillColorRGB(0, 0, 0)
    for lb in ("N° de Orden:", "Código:", "Destinatario:", "N° DOC:", "Destino:", ""):
        field(c, x, y, lb, R, 7.5); y -= 5.6 * mm
    c.setFont("Helvetica-Bold", 8.5); c.drawCentredString(x0 + cell_w / 2, y_top - h + 1.2 * mm, f"Envía: {REMITENTE['dni']}")
    cut(c, x0, y_top - h, cell_w, h)


def blank_lima(c, x0, yb):
    h = BLANK_H; y_top = yb + (cell_h + h) / 2; p = 2.2 * mm; x = x0 + p; R = x0 + cell_w - p
    y = y_top - p - 3 * mm; c.setFillColorRGB(0, 0, 0)
    for lb in ("ID PEDIDO:", "Negocio:", "ENTREGAR A:", "Teléfono:", "Detalle:", "Cobrar: S/.", "Distrito:", "Fecha Entrega:"):
        field(c, x, y, lb, R, 7.3); y -= 5.4 * mm
    cut(c, x0, y_top - h, cell_w, h)


def armar_pdf(items, salida, rellenar=True, checklist=None):
    items = list(items)
    if rellenar and len(items) % per_page:
        ciclo = ["blank_shalom", "blank_lima", "blank_olva"]
        for i in range(per_page - len(items) % per_page):
            items.append({"tipo": ciclo[i % 3]})
    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    c = canvas.Canvas(salida, pagesize=A4)
    for i, e in enumerate(items):
        k = i % per_page
        if i and k == 0:
            c.showPage()
        r, col = divmod(k, cols)
        x0 = margin + col * (cell_w + gap)
        yb = page_h - margin - r * (cell_h + gap) - cell_h
        t = e["tipo"]
        if t == "shalom":
            etiqueta_shalom(c, x0, yb, e["datos"])
        elif t == "lima":
            etiqueta_lima(c, x0, yb, e["datos"])
        elif t == "olva":
            etiqueta_olva(c, x0, yb, e["datos"])
        elif t == "blank_olva":
            etiqueta_olva(c, x0, yb)
        elif t == "blank_shalom":
            blank_shalom(c, x0, yb)
        elif t == "blank_lima":
            blank_lima(c, x0, yb)
    if checklist:  # última hoja: el checklist de Lima (no se recorta)
        c.showPage(); pagina_checklist(c, checklist)
    c.save()
    return len(items), -(-len(items) // per_page)


def chequeo(items):
    avisos = []
    tels, docs = {}, {}
    for e in items:
        d = e.get("datos", {})
        tel = str(d.get("telefono", "") or "").replace(" ", "")
        if tel and not (len(tel) == 9 and tel.startswith("9")):
            avisos.append(f"teléfono raro en {d.get('nombre') or d.get('destinatario')}: {tel}")
        if tel:
            tels.setdefault(tel, []).append(d.get("nombre") or d.get("destinatario"))
        doc = str(d.get("doc") or d.get("dni") or "")
        if doc:
            docs.setdefault(doc, []).append(d.get("nombre") or d.get("destinatario"))
    for k, v in tels.items():
        if len(v) > 1:
            avisos.append(f"teléfono repetido {k}: {', '.join(map(str, v))}")
    for k, v in docs.items():
        if len(v) > 1:
            avisos.append(f"documento repetido {k}: {', '.join(map(str, v))}")
    return avisos


def main():
    args = sys.argv[1:]
    fecha = next((a for a in args if len(a) == 10 and a[4] == "-"), fecha_por_defecto())
    salida = args[args.index("--salida") + 1] if "--salida" in args else f"/tmp/etiquetas/etiquetas-{fecha}.pdf"
    items = []
    if "--shalom" in args:
        de_archivo = json.load(open(args[args.index("--shalom") + 1]))
        if os.environ.get("ASESOR_CLAVE"):
            completar_empaque_shalom(de_archivo, fecha)
        for d in de_archivo:
            items.append({"tipo": "shalom", "datos": {**d, "despacho": d.get("despacho") or fecha}})
    if "--shalom-hoja" in args and os.environ.get("ASESOR_CLAVE"):
        for d in shalom_de_hoja(fecha):
            items.append({"tipo": "shalom", "datos": d})
            if not d.get("_seguro"):
                print(f"⚠️ Shalom {d['orden']} {d['destinatario']}: agencia no segura ({d.get('agencia') or '?'}); revisar la etiqueta.")
    lima = []
    try:
        r = pedir("/dinsides?listado=1")  # el filtro por fecha de Dinsides es por fecha de REGISTRO; aquí se filtra por fecha de ENTREGA
    except urllib.error.HTTPError as err:
        sys.exit(f"El Worker respondió {err.code} al pedir el listado de Dinsides.")
    wa_por_id = {}
    if r:
        try:  # el WhatsApp del chat de cada pedido (Dinsides guarda el teléfono de quien recibe, que puede ser otro)
            for dia in {fecha, (dt.date.fromisoformat(fecha) - dt.timedelta(days=1)).isoformat()}:
                for x in (pedir(f"/dinsides?fecha={dia}&candidatos=0") or {}).get("registrados") or []:
                    if x.get("nro"):
                        wa_por_id[str(x["nro"])] = x.get("whatsapp") or ""
        except Exception:  # noqa: BLE001
            pass
    if r:
        for p in r.get("pedidos", []):
            p["_whatsapp"] = wa_por_id.get(str(p.get("id_pedido")), "")
            if "ANULADO" in str(p.get("seguimiento", "")).upper():
                continue
            if re.search(r"regularizaci", f"{p.get('nombre', '')} {p.get('observaciones', '')}", re.I):
                continue  # registros de regularización (paquetes ya en Dinsides, devoluciones): no son cajas por recoger
            if "--entrega" in args:
                if p.get("fecha_entrega") != fecha:
                    continue
            elif not en_ciclo(p.get("fecha_pedido"), fecha):
                continue  # registrado en otro ciclo: ya está (o estará) en el almacén de Dinsides
            lima.append({"tipo": "lima", "datos": {**p, "tipo_pago": ""}})
    # Un pedido registrado como «Reposición / cambio» sin serlo (2026-11-11, cuenco + mazo de Cristofer): la etiqueta dice el nombre
    # de lo que va, tomado del empaque del reporte de ese despacho.
    genericos = [e for e in lima if re.fullmatch(r"\s*Reposici[oó]n / cambio\s*", str(e["datos"].get("detalle") or ""), re.I)]
    for fe in sorted({str(e["datos"].get("fecha_entrega") or "")[:10] for e in genericos}):
        try:
            est = pedir(f"/ventas-estado?fecha={fe}&tipo=pedidos") or {}
        except Exception:  # noqa: BLE001
            est = {}
        por_tel = {re.sub(r"\D", "", str(x.get("whatsapp") or ""))[-9:]: x for x in ((est.get("estado") or {}).get("pedidos") or [])}
        for e in genericos:
            x = por_tel.get(str(e["datos"].get("telefono") or ""))
            emp = " · ".join(t for t in re.split(r"\s+·\s+", str((x or {}).get("empaque") or "")) if t and not re.search(r"VERIFICAR|en el chat se le prometi", t))
            emp = re.sub(r"\s*\(\s*S/\s*\d+[^)]*\)", "", re.sub(r"^\W*no es (un )?kit\s*[:;,.-]?\s*", "", emp, flags=re.I)).strip()
            if emp:
                e["datos"]["detalle"] = emp[0].upper() + emp[1:]
    items += sorted(lima, key=lambda e: e["datos"].get("distrito", ""))
    if "--olva" in args:
        de_olva = json.load(open(args[args.index("--olva") + 1]))
        if os.environ.get("ASESOR_CLAVE"):
            completar_empaque_shalom(de_olva, fecha)
        for d in de_olva:
            items.append({"tipo": "olva", "datos": {**d, "despacho": d.get("despacho") or fecha}})
    if "--olva-hoja" in args and os.environ.get("ASESOR_CLAVE"):
        for d in olva_de_hoja(fecha):
            items.append({"tipo": "olva", "datos": d})
            if not d.get("_seguro"):
                print(f"⚠️ Olva {d['nombre']}: «Olva de destino» no segura ({d.get('destino') or '?'}); revisar la etiqueta.")
    # Todas las etiquetas del mismo despacho (dueño 2026-11-10): si las de Lima no dicen la misma fecha, se avisa.
    fechas_lima = sorted({str(e["datos"].get("fecha_entrega") or "")[:10] for e in items if e["tipo"] == "lima"})
    if len(fechas_lima) > 1:
        print(f"⚠️ Las etiquetas de Lima no dicen todas la misma fecha: {', '.join(_fecha_pe(x) for x in fechas_lima)} (las de otro día Dinsides las guarda en su almacén)")
    if not items:
        sys.exit(f"No hay etiquetas: nada registrado en Dinsides para el recojo del {fecha} (6:00 del día anterior a 6:00 de ese día) y no se pasaron --shalom, --shalom-hoja, --olva ni --olva-hoja.")
    verif = verificar_lima(items) if os.environ.get("ASESOR_CLAVE") else []
    total, hojas = armar_pdf(items, salida, rellenar="--sin-blancos" not in args, checklist=verif)
    reales = len(items)
    por_tipo = {t: sum(1 for e in items if e["tipo"] == t) for t in ("shalom", "lima", "olva")}
    print(f"{salida} | reales: {reales} (Shalom {por_tipo['shalom']}, Lima {por_tipo['lima']}, Olva {por_tipo['olva']}) | blancos: {total - reales} | hojas: {hojas}")
    for a in chequeo(items):
        print(f"⚠️ {a}")
    for v in verif:
        if not (v["pol_ok"] and v["fecha_ok"]):
            print(f"❌ CHECKLIST {v['nombre']} #{v['id']}: distrito {v['distrito']} → {v['pol']} · fecha {v['fecha']} → {v['fch']}")
    if "--subir" in args and os.environ.get("ASESOR_CLAVE"):
        cuerpo = {"pdf_base64": base64.b64encode(open(salida, "rb").read()).decode(), "nombre": os.path.basename(salida),
                  "titulo": f"Etiquetas {fecha}"}
        req = urllib.request.Request(f"{API_BASE}/reporte", data=json.dumps(cuerpo).encode(),
                                     headers={"Content-Type": "application/json", "x-asesor-clave": os.environ["ASESOR_CLAVE"], "User-Agent": "tarot-asesor/1.0"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            print("CRM → Reportes:", json.load(resp).get("url"))


def distritos_dinsides():
    """Nombres de distrito del formulario de Dinsides (tabla DISTRITOS de src/lib/dinsides.js), sin tildes y en minúsculas."""
    try:
        js = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "lib", "dinsides.js"), encoding="utf-8").read()
        bloque = js[js.index("export const DISTRITOS"):]
        return sorted(set(re.findall(r'"([a-z ]+)":\s*\["\d+"', bloque[:bloque.index("};")])), key=len, reverse=True)
    except Exception:  # noqa: BLE001
        return []


def _plano(t):
    import unicodedata
    return re.sub(r"\s+", " ", unicodedata.normalize("NFD", str(t or "")).encode("ascii", "ignore").decode().lower())


def distrito_en_notas(fecha):
    """{últimos 9 del WhatsApp: (distrito, día de la nota)}: el distrito que la asesora ESCRIBIÓ en la página de revisión de ese
    despacho o de los 2 anteriores (caso Carmela: escribió «San Martin de Porres» el 11/11 y se registró en Callao)."""
    out, nombres = {}, distritos_dinsides()
    for i in (2, 1, 0):
        dia = (dt.date.fromisoformat(fecha) - dt.timedelta(days=i)).isoformat()
        try:
            r = pedir(f"/revision?id=envios-{dia}") or {}
        except Exception:  # noqa: BLE001
            continue
        for wa, n in (r.get("notas") or {}).items():
            texto = " " + _plano(n.get("texto")) + " "
            for d in nombres:
                if re.search(rf"(?<![a-z]){re.escape(d)}(?![a-z])", texto) and (len(d) > 4 or re.search(rf"distrito\W+{re.escape(d)}(?![a-z])", texto)):
                    out[str(wa)[-9:]] = (d, dia); break
    return out


def verificar_lima(items):
    """Checklist del final de la hoja (dueño 2026-11-13, caso Carmela): por cada etiqueta de Lima, el distrito que Dinsides tiene
    AHORA contra el polígono de su mapa de cobertura (con el pin del pedido) y la fecha de entrega contra la que quedó en el chat."""
    lima = [e["datos"] for e in items if e["tipo"] == "lima" and e["datos"].get("id_pedido")]
    if not lima:
        return []
    try:
        r = pedir("/dinsides?chequeo=" + ",".join(str(d["id_pedido"]) for d in lima)) or {}
    except Exception as err:  # noqa: BLE001
        print(f"⚠️ No se pudo armar el checklist de Lima: {err}")
        return []
    por_id = {str(x.get("id_pedido")): x for x in r.get("chequeo") or []}
    fechas = sorted({str(d.get("fecha_entrega") or "")[:10] for d in lima if d.get("fecha_entrega")})
    de_notas = distrito_en_notas(min(fechas[0], dt.datetime.now(LIMA).date().isoformat())) if fechas else {}
    de_notas.update(distrito_en_notas(dt.datetime.now(LIMA).date().isoformat()))
    out = []
    for d in lima:
        x = por_id.get(str(d["id_pedido"])) or {}
        pol = x.get("poligono") or {}
        if x.get("error"):
            pol_txt, pol_ok = "NO SE PUDO LEER EN DINSIDES", False
        elif de_notas.get(str(x.get("whatsapp") or "")[-9:]) and _plano(de_notas[str(x.get("whatsapp"))[-9:]][0]) != _plano(d.get("distrito")):
            nd = de_notas[str(x.get("whatsapp"))[-9:]]
            pol_txt, pol_ok = f"NO ES EL DISTRITO QUE ESCRIBIÓ LA ASESORA: en la revisión del {_fecha_pe(nd[1])} puso «{nd[0].upper()}»", False
        elif x.get("cambiado_fuera"):
            pol_txt, pol_ok = f"CAMBIADO EN EL PORTAL DE DINSIDES: el sistema lo registró en «{str(x['cambiado_fuera'].get('distrito_registrado') or '?').upper()}». Confirmar con el cliente cuál es", False
        elif x.get("poligono_ok"):
            pol_txt, pol_ok = "OK: el pin cae en ese distrito del mapa de Dinsides", True
        elif pol:
            pol_txt, pol_ok = f"NO COINCIDE: el pin cae en «{(pol.get('distrito') or pol.get('nombre') or '?').upper()}» ({pol.get('clase')})", False
        else:
            pol_txt, pol_ok = "SIN PIN: distrito puesto por texto, NO corroborado", False
        fch = x.get("fecha_chat")
        fch_ok = bool(x.get("fecha_ok"))
        fch_txt = "OK: es la fecha del chat" if fch_ok else (f"NO COINCIDE: en el chat quedó {_fecha_pe(fch)}" if fch else "SIN FECHA anotada del chat: confirmar")
        out.append({"id": d["id_pedido"], "nombre": str(d.get("nombre") or ""), "distrito": str(d.get("distrito") or ""), "pol": pol_txt, "pol_ok": pol_ok,
                    "fecha": _fecha_pe(str(d.get("fecha_entrega") or "")[:10]), "fch": fch_txt, "fecha_ok": fch_ok})
    return out


def pagina_checklist(c, filas):
    """Última hoja: «nombre · distrito · ¿corroborado en el polígono? · fecha de entrega · ¿corroborada con el chat?»."""
    x, y = margin, page_h - margin - 6 * mm
    c.setFillColorRGB(0, 0, 0); c.setFont("Helvetica-Bold", 12); c.drawString(x, y, "CHECKLIST DE LIMA — distrito en el mapa de cobertura y fecha de entrega"); y -= 5 * mm
    c.setFont("Helvetica", 7.5); c.drawString(x, y, "[X] = corroborado por el sistema   [  ] = NO corroborado: revisar antes de entregar el paquete a Dinsides"); y -= 6 * mm
    cols = (x, x + 16 * mm, x + 62 * mm, x + 92 * mm, x + 150 * mm, x + 170 * mm)
    c.setFont("Helvetica-Bold", 7.5)
    for cx, t in zip(cols, ("Pedido", "Nombre", "Distrito", "Polígono de Dinsides", "Entrega", "Fecha con el chat")):
        c.drawString(cx, y, t)
    y -= 1.5 * mm; c.setLineWidth(.5); c.line(x, y, page_w - margin, y); y -= 4 * mm
    for f in filas:
        alto = 0
        for cx, t, w, negr in ((cols[0], str(f["id"]), 15 * mm, False), (cols[1], f["nombre"], 44 * mm, True), (cols[2], f["distrito"], 28 * mm, True),
                               (cols[3], ("[X] " if f["pol_ok"] else "[  ] ") + f["pol"], 56 * mm, not f["pol_ok"]), (cols[4], f["fecha"], 19 * mm, True),
                               (cols[5], ("[X] " if f["fecha_ok"] else "[  ] ") + f["fch"], page_w - margin - cols[5], not f["fecha_ok"])):
            fuente = "Helvetica-Bold" if negr else "Helvetica"
            c.setFont(fuente, 7); yy = y
            lns = partir(c, t, fuente, 7, w)[:3]
            for ln in lns:
                c.drawString(cx, yy, ln); yy -= 3 * mm
            alto = max(alto, len(lns))
        y -= alto * 3 * mm + 1.2 * mm
        c.setLineWidth(.2); c.setStrokeColorRGB(.7, .7, .7); c.line(x, y + 2.2 * mm, page_w - margin, y + 2.2 * mm); c.setStrokeColorRGB(0, 0, 0)
        if y < margin + 10 * mm:
            c.showPage(); y = page_h - margin - 6 * mm


if __name__ == "__main__":
    import al_dia
    al_dia.asegurar()  # siempre la última versión de main (dueño 2026-11-14)
    main()

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
margin, gap, cols = 3 * mm, 1 * mm, 3
cell_w = (page_w - 2 * margin - (cols - 1) * gap) / cols
cell_h = 56 * mm
rows = int((page_h - 2 * margin + gap) // (cell_h + gap))
per_page = rows * cols
BLANK_H = 50 * mm


def pedir(ruta):
    clave = os.environ.get("ASESOR_CLAVE")
    if not clave:
        return None
    req = urllib.request.Request(f"{API_BASE}{ruta}", headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


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
        if not m or "mano" not in env_.lower() or not (recojo in env_ or ayer in env_):
            continue
        texto = str(f.get("direccion_o_agencia") or "")
        cand = sh.buscar(texto) if texto.strip() else []
        a = cand[0] if cand else {}
        dni = re.search(r"\b(\d{8})\b", str(f.get("nota") or ""))
        out.append({"orden": m.group(1), "codigo": "", "destinatario": str(f.get("nombre") or "").upper(), "doc": dni.group(1) if dni else "",
                    "destino": f"{a.get('departamento', '')} - {a.get('provincia', '')} - {a.get('distrito', '')}" if a else texto[:60],
                    "agencia": a.get("agencia", "") if a else "", "direccion": a.get("direccion", "") if a else "", "_seguro": bool(a and a.get("seguro"))})
    return out


# ---------- dibujo ----------
def cut(c, x, y, w, h):
    c.saveState(); c.setDash(2, 2); c.setStrokeColorRGB(.7, .7, .7); c.setLineWidth(.4)
    c.rect(x, y, w, h); c.restoreState()


def ajustar(c, texto, fuente, tam, ancho, minimo=6):
    while c.stringWidth(texto, fuente, tam) > ancho and tam > minimo:
        tam -= .25
    return tam


def campo(c, x, y, etiqueta, valor, ancho, tam=7.5, negrita_valor=False, max_lineas=1):
    """«Etiqueta: valor» en una o varias líneas; devuelve cuánto bajó."""
    c.setFont("Helvetica-Bold", tam); c.drawString(x, y, etiqueta)
    lx = x + c.stringWidth(etiqueta, "Helvetica-Bold", tam) + 1.2 * mm
    fuente = "Helvetica-Bold" if negrita_valor else "Helvetica"
    lineas = textwrap.wrap(str(valor), max(10, int((ancho - (lx - x)) / (tam * 0.5)))) or [""]
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
    y -= campo(c, x, y, "Producto:", d.get("detalle", ""), ancho, max_lineas=2)
    cobrar = str(d.get("monto_cobrar", "")); pago = str(d.get("tipo_pago", "") or "")
    texto_cobrar = f"S/. {cobrar}" + (f" - {pago}" if pago and pago != "YAPE" else "")
    y -= campo(c, x, y, "Cobrar:", texto_cobrar, ancho, negrita_valor=True)
    y -= campo(c, x, y, "Distrito:", d.get("distrito", ""), ancho, tam=8, negrita_valor=True)
    fe = str(d.get("fecha_entrega", ""))[:10]
    if len(fe) == 10 and fe[4] == "-":
        fe = f"{fe[8:10]}/{fe[5:7]}/{fe[0:4]}"
    y -= campo(c, x, y, "Fecha Entrega:", fe, ancho, negrita_valor=True)
    obs = str(d.get("observaciones", "") or "").strip()
    # Nota para el que empaca (dueño 2026-11-09): qué lleva la caja, en letra chica al pie (del producto de Dinsides: «Kit Tarot de
    # aprendizaje + Extra: collar», «Tarot de aprendizaje», «2 Kits …»; y lo que diga «Paquete: …» en la observación).
    paq = re.search(r"Paquete:\s*([^.]+)", obs)
    empaque = (paq.group(1).strip() if paq else str(d.get("detalle", "") or "")).strip()
    # Varias líneas (dueño 2026-11-09: en una sola se superponía y no se leía).
    lineas_emp = textwrap.wrap("EMPAQUE: " + empaque, 68)[:3] if empaque else []
    pie = (len(lineas_emp) * 2.5 * mm + 0.8 * mm) if lineas_emp else 0
    if obs:
        c.setFont("Helvetica-Bold", 7); c.drawString(x, y, "Detalle:"); y -= 3.2 * mm
        c.setFont("Helvetica", 6.3)
        restante = int((y - yb - p - pie) / (6.3 * 1.3))
        for ln in textwrap.wrap(re.sub(r"\s*Paquete:[^.]+\.?", "", obs).strip(), 62)[:max(0, restante)]:
            c.drawString(x, y, ln); y -= 6.3 * 1.3
    if lineas_emp:
        c.setFont("Helvetica-Bold", 5.2)
        ye = yb + p + 0.4 * mm
        for ln in reversed(lineas_emp):
            c.drawString(x, ye, ln); ye += 2.5 * mm
    cut(c, x0, yb, cell_w, cell_h)


def etiqueta_shalom(c, x0, yb, d):
    """Formato del ticket de Shalom (N° de Orden, Código, Destinatario, N°DOC, Destino, agencia y dirección) + pie «Envía»."""
    p = 2 * mm; x = x0 + p; R = x0 + cell_w - p; ancho = R - x
    pie = 4.5 * mm; top = yb + cell_h
    c.setFillColorRGB(.93, .96, .99); c.rect(x0 + .8 * mm, top - 12.5 * mm, cell_w - 1.6 * mm, 11.5 * mm, stroke=0, fill=1)
    c.setFillColorRGB(.1, .2, .45)
    y = top - p - 3.2 * mm
    c.setFont("Helvetica-Bold", 8.5); c.drawString(x, y, f"N° de Orden: {d.get('orden', '')}"); y -= 4.6 * mm
    c.drawString(x, y, f"Código: {d.get('codigo', '')}"); y -= 6.5 * mm
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
    for ln in textwrap.wrap(str(d.get("direccion", "")), 50)[:3]:  # 50 por línea: con 64 se salía de la etiqueta (2026-11-09)
        c.drawString(x, y, ln); y -= 2.8 * mm
    c.setFillColorRGB(.05, .05, .05); c.setFont("Helvetica-Bold", 8.5)
    c.drawCentredString(x0 + cell_w / 2, yb + 1.2 * mm, f"Envía: {REMITENTE['dni']}")
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
    c.setFont("Helvetica-Bold", 7.5); c.drawString(x, y, "Destinatario:"); y -= 4 * mm
    if d:
        nm = str(d["nombre"]).upper(); fs = ajustar(c, nm, "Helvetica-Bold", 9.5, R - x, 6.5)
        c.setFont("Helvetica-Bold", fs); c.drawString(x, y, nm); y -= 4.2 * mm
        for k, v in (("DNI: ", d.get("dni", "")), ("Teléfono: ", d.get("telefono", ""))):
            c.setFont("Helvetica-Bold", 7.5); c.drawString(x, y, k)
            c.setFont("Helvetica", 7.5); c.drawString(x + c.stringWidth(k, "Helvetica-Bold", 7.5), y, str(v)); y -= 3.8 * mm
        c.setFont("Helvetica-Bold", 7.5); c.drawString(x, y, "Olva de destino:"); y -= 3.5 * mm
        for ln in textwrap.wrap(str(d.get("destino", "")).upper(), 40)[:3]:
            c.drawString(x, y, ln); y -= 3.3 * mm
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


def armar_pdf(items, salida, rellenar=True):
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
        for d in json.load(open(args[args.index("--shalom") + 1])):
            items.append({"tipo": "shalom", "datos": d})
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
    if r:
        for p in r.get("pedidos", []):
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
    items += sorted(lima, key=lambda e: e["datos"].get("distrito", ""))
    if "--olva" in args:
        for d in json.load(open(args[args.index("--olva") + 1])):
            items.append({"tipo": "olva", "datos": d})
    if not items:
        sys.exit(f"No hay etiquetas: nada registrado en Dinsides para el recojo del {fecha} (6:00 del día anterior a 6:00 de ese día) y no se pasaron --shalom ni --olva.")
    total, hojas = armar_pdf(items, salida, rellenar="--sin-blancos" not in args)
    reales = len(items)
    por_tipo = {t: sum(1 for e in items if e["tipo"] == t) for t in ("shalom", "lima", "olva")}
    print(f"{salida} | reales: {reales} (Shalom {por_tipo['shalom']}, Lima {por_tipo['lima']}, Olva {por_tipo['olva']}) | blancos: {total - reales} | hojas: {hojas}")
    for a in chequeo(items):
        print(f"⚠️ {a}")
    if "--subir" in args and os.environ.get("ASESOR_CLAVE"):
        cuerpo = {"pdf_base64": base64.b64encode(open(salida, "rb").read()).decode(), "nombre": os.path.basename(salida),
                  "titulo": f"Etiquetas {fecha}"}
        req = urllib.request.Request(f"{API_BASE}/reporte", data=json.dumps(cuerpo).encode(),
                                     headers={"Content-Type": "application/json", "x-asesor-clave": os.environ["ASESOR_CLAVE"], "User-Agent": "tarot-asesor/1.0"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            print("CRM → Reportes:", json.load(resp).get("url"))


if __name__ == "__main__":
    main()

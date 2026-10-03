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
# Lo que sale el día del despacho sin ser venta nueva: cambio, reposición o un
# pedido de un día pasado agendado para esta fecha. Va en su propia sección,
# después de los confirmados y ANTES de los por confirmar, para que no se pierda.
ESPECIALES = {"CAMBIO": "🔁 Cambio", "REPOSICION": "♻️ Reposición", "AGENDADO": "📌 Agendado de otro día"}
# Incidencia que obliga a mandar algo (reposición, cambio, motorizado…): va arriba y marcada.
ENVIO = re.compile(r"reposici|repon[eé]|cambi(o|ar) (de|el|la|por)|motoriz|devoluci|llev[aá](r|rle|rsela)\b"
                   r"|falt\w* (la |el |una |un )?(carta|mazo|collar|manual|tapete|kit)", re.I)
especial = lambda p: str(p.get("tipo") or "").upper().replace("Ó", "O") in ESPECIALES
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


def armar_pdf(datos, carpeta):
    fecha = datos.get("fecha_objetivo", "")
    todos = datos.get("pedidos", [])
    # Las incidencias van en su propia sección, no como filas de pedidos.
    pedidos = [p for p in todos if (p.get("nombre") or "").upper() != "INCIDENCIA"]
    incidencias = datos.get("incidencias") or [p.get("nota", "").lstrip("🚨 ") for p in todos if p not in pedidos]
    pedidos = [dict(p, _empaque=empaque(p)) for p in pedidos]
    cols = [("Cliente", "nombre"), ("WhatsApp", "whatsapp"), ("Teléfono recibe", "telefono"), ("DNI", "dni"),
            ("Dirección / Agencia", "direccion_o_agencia"), ("Courier", "courier"), ("Kits", "kits"),
            ("📦 Empaque (extras)", "_empaque"), ("Pago", "pago"), ("Fecha", "fecha_entrega"), ("Nota", "nota")]
    partes = []
    # Primero, para el que empaca: todo lo que sale y NO es 1 kit normal.
    salen = [p for p in pedidos if p.get("estado") == "CONFIRMADO" or especial(p)]
    raros = [p for p in salen if p["_empaque"]]
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
    if inc_filas:
        partes.append(f"<h2 class=inc>🚨🚨 ATENCIÓN — INCIDENCIAS ({len(inc_filas)})</h2><div class=inc>"
                      + tabla(inc_filas, [("Qué pasa / qué hacer", "texto"), ("¿Requiere envío?", "envio"),
                                          ("WhatsApp", "whatsapp")]) + "</div>")
    esp = [dict(p, tipo=ESPECIALES[str(p.get("tipo")).upper().replace("Ó", "O")]) for p in pedidos if especial(p)]
    for (estado, destino), titulo in TITULOS.items():
        if estado == "POR_CONFIRMAR" and esp:
            partes.append(f"<h2 class=esp>🚨 SALEN EN ESTE DESPACHO: cambios, reposiciones y agendados de otros días ({len(esp)})</h2>"
                          + "<div class=esp>" + tabla(esp, [("Tipo", "tipo"), ("Destino", "destino"), ("Cliente", "nombre"),
                                                            ("WhatsApp", "whatsapp"), ("Dirección / Agencia", "direccion_o_agencia"),
                                                            ("Kits", "kits"), ("📦 Qué lleva", "_empaque"), ("Nota", "nota")]) + "</div>")
        filas = [p for p in pedidos if not especial(p) and p.get("estado") == estado and (destino is None or p.get("destino") == destino)]
        if filas:
            partes.append(f"<h2>{titulo} ({len(filas)})</h2>" + tabla(filas, cols))
    # Todos los formularios de la página de las últimas 24 h, hayan terminado o no
    # en venta (GET /api/asesor/pedidos-web; main() los trae y los deja en datos).
    web = datos.get("pedidos_web") or []
    if web:
        compraron = sum(1 for w in web if w.get("resultado") == "COMPRÓ")
        partes.append(f"<h2 class=web>🌐 Pedidos de la web — últimas 24 h ({len(web)}; compraron {compraron})</h2>"
                      + "<div class=web>" + tabla(web, [("Hora", "hora"), ("Cliente", "nombre"), ("WhatsApp", "whatsapp"),
                                                        ("Destino", "destino"), ("Dirección / Agencia", "direccion_o_agencia"),
                                                        ("Producto", "producto"), ("Total S/", "total"),
                                                        ("Resultado", "resultado")]) + "</div>")
    conf = [p for p in pedidos if p.get("estado") == "CONFIRMADO" or especial(p)]
    kits = sum(num_kits(p) for p in conf)
    cuenta = lambda f: sum(1 for p in pedidos if f(p))
    normal = lambda est, des=None: lambda p: not especial(p) and p.get("estado") == est and (des is None or p.get("destino") == des)
    cajas = [("Kits a despachar", kits),
             ("Lima confirmados", cuenta(normal("CONFIRMADO", "LIMA"))),
             ("Provincia confirmados", cuenta(normal("CONFIRMADO", "PROVINCIA"))),
             ("Cambios / reposiciones / agendados", len(esp)),
             ("Por confirmar", cuenta(normal("POR_CONFIRMAR"))),
             ("Otros días", cuenta(normal("OTRO_DIA"))),
             ("Intención", cuenta(normal("INTENCION"))),
             ("Incidencias", len(incidencias)),
             ("Pedidos web (24 h)", len(datos.get("pedidos_web") or []))]
    resumen = "<div class=cajas>" + "".join(f"<div><b>{v}</b><span>{e(k)}</span></div>" for k, v in cajas) + "</div>"
    origen = datos.get("origen", "asesor")
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
<h1>Reporte de ventas · despacho del {e(fecha)}</h1>
<p class=sub>Tarot Store Perú · generado por {e(origen)}</p>{resumen}{''.join(partes)}"""
    ruta_html, ruta_pdf = os.path.join(carpeta, "pedidos.html"), os.path.join(carpeta, f"pedidos-{fecha}.pdf")
    with open(ruta_html, "w") as fh:
        fh.write(doc)
    chrome = (glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome") or ["chromium"])[0]
    subprocess.run([chrome, "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={ruta_pdf}", ruta_html], check=True, capture_output=True)
    return ruta_pdf, kits


AVISOS = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/avisos"
SUGERENCIAS = AVISOS.replace("/avisos", "/sugerencias")
PEDIDOS_WEB = AVISOS.replace("/avisos", "/pedidos-web")
ANALISIS = AVISOS.replace("/avisos", "/analisis")


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


# Lo que delata a un bot (ver .claude/skills/voz-tarot-store). Las vendedoras
# no escriben así; si un texto lo tiene, no se guarda y la Routine lo rehace.
RE_ROBOT = [
    (re.compile(r"—|–"), "usa guion largo (—)"),
    (re.compile(r"\bno dude[sn]? en\b|\bestoy aqu[ií] para\b|\bcon gusto te ayudo\b|\bespero que est[eé]s? bien\b", re.I), "frase de plantilla"),
    (re.compile(r"\bentiendo (tu|su) (preocupaci[oó]n|inquietud)\b|\bcomprendo perfectamente\b", re.I), "frase de manual de ventas"),
    (re.compile(r"\b[A-ZÁÉÍÓÚÑ]{5,}\b"), "palabra en MAYÚSCULAS"),
    (re.compile(r"\b(tú|tu|te|tienes|puedes|quieres)\b", re.I), "tutea (el equipo trata de usted)"),
]


def problemas_de(texto):
    """Lo que delata a un bot en un texto para clientes (vacío = pasa)."""
    p = [motivo for patron, motivo in RE_ROBOT if patron.search(texto)]
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

    if informe:  # informe CRO: queda en CRM → Reportes y en el resumen semanal; no va por Telegram
        texto = open(informe).read().strip()
        if prueba:
            print(texto + "\n(prueba, nada se guardó)")
            return
        r = al_worker(clave, {"informe": texto, "origen": "director CRO"})
        print(f"Informe guardado: {r.get('link') or 'ok'}")
        return

    ruta = next(a for a in args if not a.startswith("--"))
    datos = json.load(open(ruta))
    fuera = revisar_estilo(datos)
    if fuera:
        print("NO SE GUARDARON (suenan a bot; reescríbelas como las vendedoras, skill voz-tarot-store, "
              "y vuelve a mandarlas en otro salida.json):\n" + "\n".join(fuera), flush=True)
    carpeta = os.path.dirname(os.path.abspath(ruta))
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
                                     f"Pedidos {datos.get('fecha_objetivo', '')} · {datos.get('origen', 'asesor')}")
            print(f"REPORTE PDF: {link}")
        return
    ped = datos.get("pedidos", [])
    cuenta = lambda est, des=None: sum(1 for p in ped if not especial(p) and p.get("estado") == est and (des is None or p.get("destino") == des))
    cuerpo = {"mensajes": datos.get("mensajes", [])}
    if not solo_mensajes:
        pdf, kits = armar_pdf(datos, carpeta)
        cuerpo["resumen"] = (f"🧭 Asesor — pedidos para {datos.get('fecha_objetivo', '')}\n"
                             f"✅ Lima: {cuenta('CONFIRMADO', 'LIMA')} · Provincia: {cuenta('CONFIRMADO', 'PROVINCIA')} · {kits} kits\n"
                             + (f"🔁 Cambios / reposiciones / agendados de otros días: {sum(1 for p in ped if especial(p))}\n" if any(especial(p) for p in ped) else "")
                             + f"🟡 Por confirmar: {cuenta('POR_CONFIRMAR')} · 📅 Otros días: {cuenta('OTRO_DIA')}\n"
                             + (f"🌐 Pedidos de la web (24 h): {len(datos['pedidos_web'])} · compraron "
                                f"{sum(1 for w in datos['pedidos_web'] if w.get('resultado') == 'COMPRÓ')}\n" if datos.get("pedidos_web") else "")
                             + f"✍️ Mensajes sugeridos a las vendedoras: {len(cuerpo['mensajes'])}")
        with open(pdf, "rb") as fh:
            cuerpo["pdf_base64"] = base64.b64encode(fh.read()).decode()
        cuerpo["pdf_nombre"] = os.path.basename(pdf)
        print(f"PDF: {pdf}")
        if not prueba:
            link = subir_reporte(clave, cuerpo["pdf_base64"], cuerpo["pdf_nombre"],
                                 f"Pedidos {datos.get('fecha_objetivo', '')} · {datos.get('origen', 'asesor')}")
            cuerpo["resumen"] += f"\n📄 Reporte: {link}"
            print(f"REPORTE PDF: {link}", flush=True)
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
    if not cuerpo["mensajes"] and "resumen" not in cuerpo and not any(datos.get(k) for k in ("respuestas_rapidas", "envios", "variantes", "saldos", "preguntas")):
        print("Nada que avisar.")
        return
    mensajes = cuerpo.pop("mensajes")
    total = {"enviados": 0, "fallidos": [], "sugerencias": 0}
    # Primero ✨ Sugerencias del CRM (aprobar = programarlo): si Telegram
    # falla después, las propuestas ya quedaron guardadas.
    propuestas = [{"tipo": "seguimiento", "whatsapp": m.get("whatsapp"), "nombre": m.get("nombre"),
                   "motivo": m.get("motivo"), "texto": m.get("mensaje"), "objecion": m.get("objecion"),
                   "idea": m.get("idea") if isinstance(m.get("idea"), dict) else None,
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
    print(json.dumps(total, ensure_ascii=False))


if __name__ == "__main__":
    main()

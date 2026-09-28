"""
Manda el resultado de la lectura nocturna al Telegram del equipo:

  1. Un PDF con los pedidos de la fecha objetivo (confirmados Lima/provincia,
     por confirmar, otros días, intención).
  2. Un mensaje por cliente pendiente: "Manda este mensaje" con el texto listo
     (un toque lo copia) y un botón que abre ese chat en el CRM.

    python3 scripts/asesor/enviar.py /tmp/asesor/salida.json [--prueba]

Lee TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID del entorno. Con --prueba no manda
nada: imprime lo que mandaría y deja el PDF en /tmp/asesor.

salida.json:
{
  "fecha_objetivo": "2026-09-29",
  "pedidos": [{"estado": "CONFIRMADO|POR_CONFIRMAR|OTRO_DIA|INTENCION",
               "destino": "LIMA|PROVINCIA", "nombre": "", "whatsapp": "",
               "telefono": "", "dni": "", "direccion_o_agencia": "",
               "courier": "", "kits": 1, "pago": "", "fecha_entrega": "", "nota": ""}],
  "mensajes": [{"whatsapp": "", "nombre": "", "motivo": "", "mensaje": ""}]
}
"""
import glob, html, json, os, subprocess, sys, time, urllib.parse, urllib.request

CRM = "https://kit-tarot-para-principiantes.tarotperu.store/crm/?wa="
CHAT_DEFAULT = "8780926886"
ORDEN = ["CONFIRMADO", "POR_CONFIRMAR", "OTRO_DIA", "INTENCION"]
TITULOS = {
    ("CONFIRMADO", "LIMA"): "✅ Lima — confirmados", ("CONFIRMADO", "PROVINCIA"): "✅ Provincia — confirmados",
    ("POR_CONFIRMAR", None): "🟡 Por confirmar", ("OTRO_DIA", None): "📅 Otros días", ("INTENCION", None): "🔥 Intención de compra",
}
e = lambda s: html.escape(str(s if s is not None else ""))


def tabla(filas, cols):
    cab = "".join(f"<th>{e(n)}</th>" for n, _ in cols)
    cuerpo = "".join("<tr>" + "".join(f"<td>{e(p.get(k, ''))}</td>" for _, k in cols) + "</tr>" for p in filas)
    return f"<table><tr><th>#</th>{cab}</tr>" + cuerpo.replace("<tr>", "<tr><td class=n></td>", -1) + "</table>"


def armar_pdf(datos, carpeta):
    pedidos, fecha = datos.get("pedidos", []), datos.get("fecha_objetivo", "")
    cols = [("Cliente", "nombre"), ("WhatsApp", "whatsapp"), ("Teléfono recibe", "telefono"), ("DNI", "dni"),
            ("Dirección / Agencia", "direccion_o_agencia"), ("Courier", "courier"), ("Kits", "kits"),
            ("Pago", "pago"), ("Fecha", "fecha_entrega"), ("Nota", "nota")]
    partes = []
    for (estado, destino), titulo in TITULOS.items():
        filas = [p for p in pedidos if p.get("estado") == estado and (destino is None or p.get("destino") == destino)]
        if filas:
            partes.append(f"<h2>{titulo} ({len(filas)})</h2>" + tabla(filas, cols))
    kits = sum(int(p.get("kits") or 1) for p in pedidos if p.get("estado") == "CONFIRMADO")
    doc = f"""<!doctype html><meta charset=utf-8><style>
@page{{size:A4 landscape;margin:10mm}} body{{font-family:'Noto Sans','DejaVu Sans',sans-serif;font-size:10px}}
h1{{font-size:18px;margin:0}} h2{{font-size:13px;border-bottom:2px solid #333;margin:14px 0 4px}}
table{{border-collapse:collapse;width:100%;counter-reset:n}} tr{{page-break-inside:avoid}}
th{{background:#333;color:#fff;text-align:left;padding:3px 5px}} td{{border:1px solid #ccc;padding:3px 5px;vertical-align:top}}
td.n::before{{counter-increment:n;content:counter(n)}}</style>
<h1>Pedidos para {e(fecha)}</h1><p>{kits} kits confirmados · generado por el asesor nocturno</p>{''.join(partes)}"""
    ruta_html, ruta_pdf = os.path.join(carpeta, "pedidos.html"), os.path.join(carpeta, f"pedidos-{fecha}.pdf")
    with open(ruta_html, "w") as fh:
        fh.write(doc)
    chrome = (glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome") or ["chromium"])[0]
    subprocess.run([chrome, "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={ruta_pdf}", ruta_html], check=True, capture_output=True)
    return ruta_pdf, kits


def telegram(metodo, token, campos=None, archivo=None):
    url = f"https://api.telegram.org/bot{token}/{metodo}"
    if archivo:
        limite = "----asesor" + str(int(time.time()))
        cuerpo = b""
        for k, v in (campos or {}).items():
            cuerpo += f"--{limite}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
        with open(archivo, "rb") as fh:
            cuerpo += (f"--{limite}\r\nContent-Disposition: form-data; name=\"document\"; filename=\"{os.path.basename(archivo)}\"\r\n"
                       "Content-Type: application/pdf\r\n\r\n").encode() + fh.read() + f"\r\n--{limite}--\r\n".encode()
        req = urllib.request.Request(url, data=cuerpo, headers={"Content-Type": f"multipart/form-data; boundary={limite}"})
    else:
        req = urllib.request.Request(url, data=json.dumps(campos).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    prueba = "--prueba" in sys.argv
    ruta = next(a for a in sys.argv[1:] if not a.startswith("--"))
    datos = json.load(open(ruta))
    carpeta = os.path.dirname(os.path.abspath(ruta))
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN", ""), os.environ.get("TELEGRAM_CHAT_ID", CHAT_DEFAULT)
    if not token and not prueba:
        sys.exit("Falta TELEGRAM_BOT_TOKEN en el entorno (o usa --prueba).")

    pdf, kits = armar_pdf(datos, carpeta)
    ped = datos.get("pedidos", [])
    cuenta = lambda est, des=None: sum(1 for p in ped if p.get("estado") == est and (des is None or p.get("destino") == des))
    resumen = (f"🧭 Asesor nocturno — pedidos para {datos.get('fecha_objetivo', '')}\n"
               f"✅ Lima: {cuenta('CONFIRMADO', 'LIMA')} · Provincia: {cuenta('CONFIRMADO', 'PROVINCIA')} · {kits} kits\n"
               f"🟡 Por confirmar: {cuenta('POR_CONFIRMAR')} · 📅 Otros días: {cuenta('OTRO_DIA')}\n"
               f"✍️ Mensajes para mandar: {len(datos.get('mensajes', []))}")

    salidas = [("documento", {"chat_id": chat, "caption": resumen}, pdf)]
    for m in datos.get("mensajes", []):
        wa = "".join(c for c in str(m.get("whatsapp", "")) if c.isdigit())
        texto = (f"✍️ <b>Manda este mensaje</b> a {e(m.get('nombre') or 'sin nombre')} (+{e(wa)})\n"
                 f"<i>{e(m.get('motivo', ''))}</i>\n\n<code>{e(m.get('mensaje', ''))}</code>\n\n<i>Toca el texto para copiarlo.</i>")
        salidas.append(("mensaje", {"chat_id": chat, "text": texto, "parse_mode": "HTML", "disable_web_page_preview": True,
                                    "reply_markup": {"inline_keyboard": [[{"text": "💬 Abrir chat en el CRM", "url": CRM + wa}]]}}, None))

    for tipo, campos, archivo in salidas:
        if prueba:
            print(f"[{tipo}]", campos.get("caption") or campos.get("text"), "\n")
            continue
        r = telegram("sendDocument" if archivo else "sendMessage", token, campos, archivo)
        if not r.get("ok"):
            print("Telegram rechazó:", r, file=sys.stderr)
        time.sleep(0.4)  # lejos del límite de 20 mensajes/min por grupo
    print(f"PDF: {pdf}\nEnviados: {len(salidas)}{' (prueba, nada salió)' if prueba else ''}")


if __name__ == "__main__":
    main()

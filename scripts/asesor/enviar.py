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

salida.json:
{
  "fecha_objetivo": "2026-09-29",
  "pedidos": [{"estado": "CONFIRMADO|POR_CONFIRMAR|OTRO_DIA|INTENCION",
               "destino": "LIMA|PROVINCIA", "nombre": "", "whatsapp": "",
               "telefono": "", "dni": "", "direccion_o_agencia": "",
               "courier": "", "kits": 1, "pago": "", "fecha_entrega": "", "nota": ""}],
  "mensajes": [{"whatsapp": "", "nombre": "", "motivo": "", "mensaje": "",
                "pasos": [{"horas": 5, "mensaje": ""}]}],   # opcional: secuencia si no responde
  "respuestas_rapidas": [{"titulo": "", "texto": "", "motivo": "",
                          "destinatarios": [{"whatsapp": "", "nombre": ""}]}],
  "envios": [{"whatsapp": "", "nombre": "", "link": "https://…/TS-…", "motivo": "", "mensaje": ""}],
  "origen": "asesor 16:30"
}

Cada mensaje llega por Telegram a todo el equipo Y queda en ✨ Sugerencias del
CRM, donde una persona lo aprueba (se programa) o lo descarta. Las respuestas
rápidas propuestas solo van a ✨ Sugerencias. Los "envios" (link con la boleta
ya lista) no van a Telegram ni a las vendedoras: solo al admin en ✨ Sugerencias.
"""
import base64, glob, html, json, os, subprocess, sys, time, urllib.error, urllib.request

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


LOTE = 5
AVISOS = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor/avisos"
SUGERENCIAS = AVISOS.replace("/avisos", "/sugerencias")


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


def main():
    args = sys.argv[1:]
    prueba, solo_mensajes = "--prueba" in args, "--solo-mensajes" in args
    informe = args[args.index("--informe") + 1] if "--informe" in args else None
    clave = os.environ.get("ASESOR_CLAVE", "")
    if not clave and not prueba:
        sys.exit("Falta ASESOR_CLAVE en el entorno (o usa --prueba).")

    if informe:  # informe CRO: solo al dueño, en trozos que entren en un mensaje
        texto = open(informe).read().strip()
        trozos = [texto[i:i + 3800] for i in range(0, len(texto), 3800)]
        for t in trozos:
            print(t) if prueba else al_worker(clave, {"resumen": t, "solo_dueno": True})
        print(f"Informe: {len(trozos)} mensaje(s){' (prueba, nada salió)' if prueba else ''}")
        return

    ruta = next(a for a in args if not a.startswith("--"))
    datos = json.load(open(ruta))
    carpeta = os.path.dirname(os.path.abspath(ruta))
    ped = datos.get("pedidos", [])
    cuenta = lambda est, des=None: sum(1 for p in ped if p.get("estado") == est and (des is None or p.get("destino") == des))
    cuerpo = {"mensajes": datos.get("mensajes", [])}
    if not solo_mensajes:
        pdf, kits = armar_pdf(datos, carpeta)
        cuerpo["resumen"] = (f"🧭 Asesor — pedidos para {datos.get('fecha_objetivo', '')}\n"
                             f"✅ Lima: {cuenta('CONFIRMADO', 'LIMA')} · Provincia: {cuenta('CONFIRMADO', 'PROVINCIA')} · {kits} kits\n"
                             f"🟡 Por confirmar: {cuenta('POR_CONFIRMAR')} · 📅 Otros días: {cuenta('OTRO_DIA')}\n"
                             f"✍️ Mensajes sugeridos a las vendedoras: {len(cuerpo['mensajes'])}")
        with open(pdf, "rb") as fh:
            cuerpo["pdf_base64"] = base64.b64encode(fh.read()).decode()
        cuerpo["pdf_nombre"] = os.path.basename(pdf)
        print(f"PDF: {pdf}")
    elif cuerpo["mensajes"]:
        cuerpo["resumen"] = f"🧭 Asesor — {len(cuerpo['mensajes'])} mensajes sugeridos a las vendedoras"

    if prueba:
        print(cuerpo.get("resumen", ""))
        for m in cuerpo["mensajes"]:
            print(f"\n→ {m.get('nombre')} (+{m.get('whatsapp')}) — {m.get('motivo', '')}\n{m.get('mensaje')}")
        print("\n(prueba, nada salió)")
        return
    if not cuerpo["mensajes"] and "resumen" not in cuerpo and not datos.get("respuestas_rapidas") and not datos.get("envios"):
        print("Nada que avisar.")
        return
    mensajes = cuerpo.pop("mensajes")
    total = {"enviados": 0, "fallidos": [], "sugerencias": 0}
    # Primero ✨ Sugerencias del CRM (aprobar = programarlo): si Telegram
    # falla después, las propuestas ya quedaron guardadas.
    propuestas = [{"tipo": "seguimiento", "whatsapp": m.get("whatsapp"), "nombre": m.get("nombre"),
                   "motivo": m.get("motivo"), "texto": m.get("mensaje"),
                   "pasos": [{"horas": p.get("horas"), "texto": p.get("mensaje") or p.get("texto")}
                             for p in m.get("pasos") or []]} for m in mensajes]
    propuestas += [dict(r, tipo="respuesta_rapida") for r in datos.get("respuestas_rapidas", [])]
    # Links con la boleta lista: solo al admin, en el CRM. No van a Telegram.
    propuestas += [{"tipo": "envio", "whatsapp": e.get("whatsapp"), "nombre": e.get("nombre"), "link": e.get("link"),
                    "motivo": e.get("motivo"), "texto": e.get("mensaje")} for e in datos.get("envios", [])]
    for i in range(0, len(propuestas), 20):
        r = al_worker(clave, {"origen": datos.get("origen", "asesor"), "sugerencias": propuestas[i:i + 20]}, SUGERENCIAS)
        total["sugerencias"] += r.get("creadas", 0) + r.get("actualizadas", 0)
        total.setdefault("sin_chat", []).extend(r.get("sin_chat", []))
    print(f"Sugerencias guardadas en el CRM: {total['sugerencias']}", flush=True)
    # Luego Telegram, de a pocos: cada aviso va a todo el equipo.
    lotes = [dict(cuerpo)] if "resumen" in cuerpo else []
    lotes += [{"mensajes": mensajes[i:i + LOTE]} for i in range(0, len(mensajes), LOTE)]
    for n, lote in enumerate(lotes):
        r = al_worker(clave, lote)
        total["enviados"] += r.get("enviados", 0)
        total["fallidos"] += r.get("fallidos", [])
        if n < len(lotes) - 1:
            time.sleep(1.5)
    print(json.dumps(total, ensure_ascii=False))


if __name__ == "__main__":
    main()

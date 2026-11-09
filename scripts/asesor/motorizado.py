#!/usr/bin/env python3
"""
Motorizado de confianza (domingos y clientes que piden hora específica; dueño 2026-11-09). El motorizado no tiene web: recibe por
WhatsApp UN mensaje con todos los pedidos del día, y para el empaque se imprimen etiquetas con el mismo formato de Dinsides.

    ASESOR_CLAVE=… python3 scripts/asesor/motorizado.py [AAAA-MM-DD] [--solo 51…,51…] [--salida /tmp/motorizado] [--subir] [--marcar]

- Toma las fichas LISTAS del Worker para esa fecha (`GET /api/asesor/dinsides?fecha=`; las mismas que se registrarían en Dinsides),
  o solo las de `--solo` (también las que el Worker tenga como ya registradas o pendientes de dato, si una persona lo decide).
- Escribe `mensaje.txt` (el texto para pegar en el WhatsApp del motorizado, formato del dueño) y `etiquetas.pdf` (3×5 por hoja, formato
  Dinsides, sin blancos). `--subir` deja el PDF en CRM → Reportes e imprime el link.
- `--marcar`: anota cada pedido como ENVIADO POR MOTORIZADO EXTERNO en la memoria del sistema (no se vuelve a registrar en Dinsides) y
  en la hoja «Pedidos auto» (Enviado = «Motorizado externo FECHA»). Nunca escribe al cliente ni registra en Dinsides.
"""
import datetime as dt, json, os, re, sys, urllib.error, urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
API_BASE = os.environ.get("ASESOR_API_BASE") or "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor"
LIMA = dt.timezone(dt.timedelta(hours=-5))
NUMEROS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]


def clave():
    return os.environ.get("ASESOR_CLAVE") or sys.exit("Falta ASESOR_CLAVE en el entorno.")


def pedir(ruta, body=None, timeout=180):
    datos = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = urllib.request.Request(f"{API_BASE}{ruta}", data=datos, method="POST" if datos else "GET",
                                 headers={"x-asesor-clave": clave(), "User-Agent": "tarot-asesor/1.0", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def fecha_por_defecto():
    t = dt.datetime.now(LIMA)
    return (t.date() if t.hour < 3 else t.date() + dt.timedelta(days=1)).isoformat()


def n9(v):
    return re.sub(r"\D", "", str(v or ""))[-9:]


def titulo(nombre):
    return (nombre or "").strip().split()[0].upper() if (nombre or "").strip() else "CLIENTE"


def distrito_bonito(f):
    d = str(f["campos"].get("distrito") or "").strip()
    return " ".join(w.capitalize() if w not in ("de", "del", "la", "el") else w for w in d.split())


def bloque(i, f):
    c = f["campos"]
    obs = re.sub(r"^\s*discreci[oó]n\s*:\s*", "", str(c.get("obs") or ""), flags=re.I)
    obs = re.sub(r"\.?\s*Pago:\s*[^.]*\.?$", "", obs).strip()
    lineas = [f"{NUMEROS[i] if i < len(NUMEROS) else str(i + 1) + '.'} {titulo(c.get('nombre'))} – {distrito_bonito(f)}",
              f"Cliente: {c.get('nombre')} · {c.get('telefono')}",
              f"Dirección: {c.get('direccion')}"]
    ref = re.search(r"(?:ref(?:erencia)?[.:]?\s*)(.+?)(?:\.|$)", obs, re.I)
    if ref:
        lineas.append(f"Referencia: {ref.group(1).strip()}")
    hor = re.search(r"(horario[^.;]*|de \d{1,2} a \d{1,2}\s*(?:pm|am)?[^.;]*|a las \d{1,2}[^.;]*)", obs, re.I)
    if hor:
        lineas.append(f"Horario: {hor.group(1).strip()}")
    lineas.append(f"Producto: {c.get('producto')}")
    if c.get("tipo_pago") == "NO COBRAR" or str(c.get("cobrar")) in ("0", "0.0"):
        lineas.append("💰 NO COBRAR – ya está pagado")
    else:
        lineas.append(f"💰 COBRAR S/ {c.get('cobrar')} por {c.get('tipo_pago') or 'YAPE'} contraentrega")
    if re.search(r"discre|sin logo|no mencionar|no decir", obs, re.I):
        lineas.append("🤫 DISCRECIÓN: " + obs.strip())
    elif obs and not hor and not ref:
        lineas.append(f"Nota: {obs.strip()}")
    if c.get("coordenadas"):
        lineas.append(f"📍 https://maps.google.com/?q={c['coordenadas']}")
    return "\n".join(lineas)


def mensaje(fecha, fichas):
    d = dt.date.fromisoformat(fecha)
    partes = [f"📦 ENTREGAS {d.strftime('%d/%m/%Y')} – {len(fichas)} pedido{'s' if len(fichas) != 1 else ''}", ""]
    for i, f in enumerate(fichas):
        partes += ["━━━━━━━━━━━━━━", bloque(i, f), ""]
    partes += ["━━━━━━━━━━━━━━", "✅ Los clientes pueden revisar el pedido al recibirlo.", "📲 Avisar al llegar a cada entrega o si hay algún inconveniente."]
    return "\n".join(partes)


def etiquetas(fecha, fichas, salida):
    import etiquetas as et
    items = []
    for f in fichas:
        c = f["campos"]
        items.append({"tipo": "lima", "datos": {"id_pedido": "MOTORIZADO", "nombre": c.get("nombre"), "telefono": c.get("telefono"), "detalle": c.get("producto"),
                                               "monto_cobrar": f"{float(c.get('cobrar') or 0):.2f}", "tipo_pago": c.get("tipo_pago") if c.get("tipo_pago") != "YAPE" else "",
                                               "distrito": distrito_bonito(f), "fecha_entrega": fecha,
                                               "observaciones": f"{c.get('direccion')}. {c.get('obs') or ''}".strip()}})
    return et.armar_pdf(items, salida, rellenar=False)


def main():
    args = sys.argv[1:]
    fecha = next((a for a in args if len(a) == 10 and a[4] == "-"), fecha_por_defecto())
    carpeta = args[args.index("--salida") + 1] if "--salida" in args else f"/tmp/motorizado/{fecha}"
    solo = {n9(x) for x in args[args.index("--solo") + 1].split(",")} if "--solo" in args else set()
    r = pedir(f"/dinsides?fecha={fecha}&candidatos=0")
    fichas = [f for f in r.get("pedidos", []) if (n9(f.get("whatsapp")) in solo) if solo] if solo else [f for f in r.get("pedidos", []) if f.get("listo")]
    faltan = solo - {n9(f.get("whatsapp")) for f in fichas}
    if faltan:
        print(f"⚠️ Sin ficha en el sistema para: {', '.join(sorted(faltan))} (no están en el reporte de esa fecha; agrégalos primero o pásalos por Dinsides).")
    if not fichas:
        sys.exit(f"No hay pedidos para el motorizado el {fecha}.")
    os.makedirs(carpeta, exist_ok=True)
    txt = mensaje(fecha, fichas)
    open(os.path.join(carpeta, "mensaje.txt"), "w", encoding="utf-8").write(txt + "\n")
    pdf = os.path.join(carpeta, "etiquetas.pdf")
    total, hojas = etiquetas(fecha, fichas, pdf)
    print(f"{len(fichas)} pedido(s) para el motorizado el {fecha}. Mensaje: {carpeta}/mensaje.txt · Etiquetas: {pdf} ({hojas} hoja(s))")
    for f in fichas:
        for a in f.get("alertas", []):
            if re.search(r"HORA|MONTO|NO COBRAR|PAGO", a):
                print(f"   · {f['campos'].get('nombre')}: {a}")
    print("\n" + txt)
    if "--subir" in args:
        import base64
        cuerpo = {"pdf_base64": base64.b64encode(open(pdf, "rb").read()).decode(), "nombre": f"etiquetas-motorizado-{fecha}.pdf", "titulo": f"Etiquetas motorizado {fecha}"}
        print("CRM → Reportes:", pedir("/reporte", cuerpo).get("url"))
    if "--marcar" in args:
        for f in fichas:
            res = pedir("/dinsides", {"accion": "marcar", "fecha": fecha, "whatsapp": f["whatsapp"], "nro": "MOTORIZADO", "motivo": f"motorizado de confianza {fecha}", "origen": "motorizado.py"})
            print(f"marcado como enviado por motorizado: {f['campos'].get('nombre')} · {json.dumps(res.get('hoja'), ensure_ascii=False)[:120]}")


if __name__ == "__main__":
    main()

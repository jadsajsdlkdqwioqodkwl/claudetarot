"""
Herramienta de la Routine «Despacho automático de boletas». Todo pasa por aquí para que el modelo
no tenga que armar curl ni conocer la clave. Flujo: el dueño manda al número de la empresa las fotos
(boleta + caja por cliente) → la Routine corre `bajar`, lee las fotos, `buscar` al cliente, arma el
texto y `despachar`; el Worker decide ventana, duplicados, cobro, etiquetas y registros.

  python3 scripts/asesor/boletas.py bajar                       → descarga las fotos de HOY y escribe boletas.md
  python3 scripts/asesor/boletas.py historial [dias]            → qué ya se procesó (para no repetir)
  python3 scripts/asesor/boletas.py buscar --dni 12345678 --apellido PEREZ --telefono 987654321
                                                                → Sheets + CRM (DNI, apellido, teléfono) y el chat de cada candidato
  python3 scripts/asesor/boletas.py chat <conversation_id|wa_id>  → últimos mensajes, ventana, etiquetas, si ya recibió boleta
  python3 scripts/asesor/boletas.py reportes [n]                → baja los últimos n PDF «Ventas» (para leerlos con Read)
  python3 scripts/asesor/boletas.py rotar <staging_id> <90|180|270>  → gira la foto (sentido horario) y la sube de nuevo
  python3 scripts/asesor/boletas.py despachar <archivo.json>    → UNA llamada por cliente (ver despachar en asesor-mandar.js)
  python3 scripts/asesor/boletas.py error <staging_id> "<motivo>"   → marca una foto como error (vencida, duplicada)
  python3 scripts/asesor/boletas.py telegram "<texto>"          → reporte al dueño

Carpeta de trabajo: BOLETAS_DIR o /tmp/ventas. Variables: ASESOR_CLAVE (obligatoria);
TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID solo para `telegram`.
"""
import base64, datetime as dt, io, json, os, re, sys, urllib.error, urllib.parse, urllib.request

API_BASE = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor"
SITIO = "https://kit-tarot-para-principiantes.tarotperu.store"
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
LIMA = dt.timezone(dt.timedelta(hours=-5))
CARPETA = os.environ.get("BOLETAS_DIR") or "/tmp/ventas"

GUIA = """
## Cómo leer cada foto (antes de emparejar)
- TICKET SHALOM: papel impreso "DATOS TICKET SHALOM". Trae NRO. ORDEN, CÓDIGO (4 letras, compartible),
  destino/agencia, y abajo DATOS DEL DESTINATARIO: nombre, DNI y teléfono del cliente.
- ETIQUETA GR SHALOM: pegada en la caja, "GR: 1020xxxxx" arriba a la derecha, DESTINATARIO y ciudad.
  GR = NRO ORDEN. No trae CÓDIGO compartible (el mensaje va sin la línea *Código:*).
- CAJA: cartón/paquete con etiqueta "DESTINATARIO: APELLIDOS NOMBRES" y destino.
- OLVA: guía con código de seguimiento; si empieza con "26", quitar ese prefijo en el mensaje.
- El PAR es del mismo cliente si coinciden apellido y/o NRO ORDEN entre ambas fotos. El dueño no
  siempre manda boleta→caja en orden ni los pares contiguos: empareja por apellido entre TODAS las fotos de hoy.
- Si una foto se ve de lado o cabeza abajo: `boletas.py rotar <staging_id> <90|180|270>` (horario) ANTES de despachar.
- ⚠️ El shalom_code del contacto (3114/3143/3144…) es el código de RETIRO: NUNCA va en ningún mensaje.
- Género: estimado / estimada según el primer nombre; estimad@ solo si no queda claro.
"""


def clave():
    return os.environ.get("ASESOR_CLAVE") or sys.exit("Falta ASESOR_CLAVE en el entorno.")


def pedir(ruta, method="GET", body=None, timeout=90, crudo=False):
    """Llama al Worker. Devuelve (status, json|bytes). Nunca lanza por HTTP: el error viene en el cuerpo."""
    datos = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = urllib.request.Request(
        f"{API_BASE}{ruta}", data=datos, method=method,
        headers={"x-asesor-clave": clave(), "User-Agent": "tarot-asesor/1.0", "Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            cuerpo = r.read()
            status = r.status
            mime = r.headers.get("Content-Type", "").split(";")[0]
    except urllib.error.HTTPError as e:
        cuerpo, status, mime = e.read(), e.code, "application/json"
    if crudo:
        return status, cuerpo, mime
    try:
        return status, json.loads(cuerpo)
    except ValueError:
        return status, {"error": cuerpo.decode(errors="replace")[:300]}


def salida(obj):
    print(json.dumps(obj, ensure_ascii=False, indent=1))


def fecha_lima(created_at):
    """created_at viene en UTC 'YYYY-MM-DD HH:MM:SS' (D1) → fecha de Lima."""
    try:
        t = dt.datetime.strptime(str(created_at)[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return None
    return t.astimezone(LIMA).date()


def subir_foto(staging_id, datos, mime="image/jpeg"):
    return pedir("/imagen", "POST", {"staging_id": staging_id, "imagen_base64": base64.b64encode(datos).decode(), "mime": mime})


def enderezar_exif(datos):
    """Si la foto trae orientación EXIF distinta de la normal, la aplica. Devuelve (bytes, cambió)."""
    try:
        from PIL import Image, ImageOps
        img = Image.open(io.BytesIO(datos))
        if (img.getexif().get(274) or 1) == 1:
            return datos, False
        fija = ImageOps.exif_transpose(img).convert("RGB")
        out = io.BytesIO()
        fija.save(out, "JPEG", quality=90)
        return out.getvalue(), True
    except Exception:
        return datos, False


# ---------- comandos ----------

def cmd_bajar():
    status, resp = pedir("/boletas_staging")
    if status != 200:
        salida(resp); sys.exit(1)
    items = resp.get("items", [])
    if not items:
        salida({"items": 0, "mensaje": "No hay boletas pendientes de análisis."}); return

    hoy = dt.datetime.now(LIMA).date()
    vencidos = [i for i in items if (fecha_lima(i.get("created_at")) or hoy) < hoy]
    de_hoy = [i for i in items if i not in vencidos]
    directorio = os.path.join(CARPETA, "boletas")
    os.makedirs(directorio, exist_ok=True)

    descargadas, fallo, enderezadas = [], 0, []
    for item in de_hoy:
        id_ = item["id"]
        lote = item.get("lote_id") or "sin ENVIAR"
        st, datos, mime = pedir(f"/imagen?staging_id={id_}", crudo=True)
        if st != 200:
            fallo += 1
            descargadas.append({"id": id_, "lote": lote, "error": f"HTTP {st}"})
            continue
        datos, cambio = enderezar_exif(datos)
        if cambio:
            mime = "image/jpeg"
            st2, r2 = subir_foto(id_, datos, mime)
            if st2 == 200:
                enderezadas.append(id_)
        ruta = os.path.join(directorio, f"{id_}.{EXT.get(mime, 'jpg')}")
        open(ruta, "wb").write(datos)
        descargadas.append({"id": id_, "lote": lote, "ruta": ruta, "hora": item.get("created_at")})

    ok_items = [d for d in descargadas if "ruta" in d]
    err_items = [d for d in descargadas if "error" in d]
    lote_grupos = {}
    for d in ok_items:
        lote_grupos.setdefault(d["lote"], []).append(d)
    pares, sueltas = [], []
    for lote_key in sorted(lote_grupos):
        grupo = lote_grupos[lote_key]
        for i in range(0, len(grupo), 2):
            if i + 1 < len(grupo):
                pares.append({"a": grupo[i], "b": grupo[i + 1], "lote": lote_key})
            else:
                sueltas.append(grupo[i])

    lineas = [f"# Boletas para despachar HOY ({hoy.isoformat()}, Lima)", "",
              f"Fotos de hoy: {len(ok_items)} · pares: {len(pares)} · sueltas: {len(sueltas)} · vencidas: {len(vencidos)}",
              GUIA, "## Pares (orden tentativo; verifica apellido/NRO entre las dos fotos)"]
    for n, par in enumerate(pares, start=1):
        lineas.append(f"\n### Cliente {n}  (lote {par['lote']})")
        for k in ("a", "b"):
            f = par[k]
            lineas.append(f"  - staging_id={f['id']}  ruta={f['ruta']}  llegó={f['hora']}")
    if sueltas:
        lineas.append("\n## Fotos SIN PAR (no despachar; avisar al dueño qué falta: boleta o caja)")
        for f in sueltas:
            lineas.append(f"  - staging_id={f['id']}  lote={f['lote']}  ruta={f['ruta']}  llegó={f['hora']}")
        lineas.append("  Si una suelta hace par con otra de otro lote por apellido/NRO, sí van juntas.")
    if vencidos:
        lineas.append("\n## Fotos VENCIDAS (de días anteriores: NO se mandan)")
        for i in vencidos:
            lineas.append(f"  - staging_id={i['id']}  lote={i.get('lote_id')}  llegó={i.get('created_at')} UTC")
        lineas.append("  Para cada una: `boletas.py error <staging_id> \"vencida: foto de <fecha>\"` y avísalo en el reporte.")
    if err_items:
        lineas.append("\n## Fotos que no se pudieron bajar")
        for e in err_items:
            lineas.append(f"  - staging_id={e['id']}  lote={e['lote']}  error={e['error']}")

    indice = os.path.join(CARPETA, "boletas.md")
    open(indice, "w", encoding="utf-8").write("\n".join(lineas) + "\n")
    salida({"hoy": hoy.isoformat(), "fotos_hoy": len(ok_items), "pares": len(pares),
            "sueltas": [f["id"] for f in sueltas], "vencidas": [i["id"] for i in vencidos],
            "enderezadas_por_exif": enderezadas, "fotos_fallidas": fallo, "indice": indice})


def cmd_historial(dias="3"):
    status, resp = pedir(f"/boletas_staging?historial=1&dias={int(dias)}")
    if status != 200:
        salida(resp); sys.exit(1)
    for r in resp.get("historial", []):
        print(f"{r['id']:>4}  {r['status']:<18} {str(r.get('nombre_boleta') or ''):<40} orden={r.get('nro_orden') or '-':<10} chat={r.get('conversation_id') or '-':<6} {r['created_at']}  {r.get('error') or ''}")


def chat_de(**q):
    status, resp = pedir("/chat?" + urllib.parse.urlencode({k: v for k, v in q.items() if v}))
    return resp if status == 200 else {"error": resp.get("error", f"HTTP {status}")}


def recortar_chat(c, n=20):
    if not c.get("encontrado"):
        return c
    c = dict(c)
    c["mensajes"] = [{"q": m["direction"], "t": m["type"], "txt": (m.get("body") or "")[:160], "de": m.get("sent_by"), "cuando": m["created_at"]}
                     for m in c.get("mensajes", [])[-n:]]
    return c


def cmd_buscar(args):
    opc = {"dni": None, "apellido": None, "telefono": None}
    i = 0
    while i < len(args):
        k = args[i].lstrip("-")
        if k in opc and i + 1 < len(args):
            opc[k] = args[i + 1]; i += 2
        else:
            i += 1
    if not any(opc.values()):
        sys.exit("Uso: buscar --dni X --apellido Y --telefono Z (al menos uno).")
    out, candidatos = {}, []
    dni = re.sub(r"\D", "", opc["dni"] or "")
    if dni:
        st, r = pedir(f"/ventas-lista?dni={dni}")
        out["sheets_ventas"] = r
        if r.get("encontrado") and r.get("wa_id"):
            candidatos.append(("wa_id", r["wa_id"]))
        st, r = pedir(f"/buscar-dni?dni={dni}")
        out["crm_por_dni"] = r
        if r.get("encontrado"):
            candidatos.append(("conversation_id", r["conversation_id"]))
    if opc["apellido"]:
        st, r = pedir("/buscar-nombre?" + urllib.parse.urlencode({"nombre": opc["apellido"]}))
        out["crm_por_apellido"] = r
        for c in (r.get("coincidencias") or [])[:3]:
            candidatos.append(("conversation_id", c["conversation_id"]))
    tel = re.sub(r"\D", "", opc["telefono"] or "")[-9:]
    if len(tel) == 9:
        candidatos.append(("telefono", tel))
    vistos, chats = set(), []
    for k, v in candidatos:
        c = chat_de(**{k: v})
        cid = c.get("conversation_id")
        if not c.get("encontrado") or cid in vistos:
            continue
        vistos.add(cid)
        c["hallado_por"] = k
        chats.append(recortar_chat(c))
    out["chats_candidatos"] = chats
    if not chats:
        out["aviso"] = "No encontré el chat: prueba `reportes` (PDF de ventas con WhatsApp y DNI) y vuelve a buscar por teléfono; si no, repórtalo al dueño sin despachar."
    salida(out)


def cmd_chat(ref, n="30"):
    ref = str(ref).strip()
    q = {"conversation_id": ref} if ref.isdigit() and len(ref) < 9 else {"wa_id": ref}
    q["mensajes"] = n
    salida(recortar_chat(chat_de(**q), int(n)))


def cmd_reportes(n="2"):
    status, resp = pedir("/reportes")
    if status != 200:
        salida(resp); sys.exit(1)
    ventas = [r for r in resp.get("reportes", []) if str(r.get("titulo", "")).startswith("Ventas")][:int(n)]
    directorio = os.path.join(CARPETA, "reportes")
    os.makedirs(directorio, exist_ok=True)
    rutas = []
    for r in ventas:
        nombre = re.sub(r"[^A-Za-z0-9._-]+", "-", r["titulo"])[:60] + ".pdf"
        ruta = os.path.join(directorio, nombre)
        req = urllib.request.Request(SITIO + r["url"], headers={"User-Agent": "tarot-asesor/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp_pdf:
            open(ruta, "wb").write(resp_pdf.read())
        rutas.append({"titulo": r["titulo"], "ruta": ruta})
    salida({"reportes": rutas, "nota": "Léelos con Read; busca al cliente por apellido o DNI y toma su WhatsApp."})


def cmd_rotar(staging_id, grados):
    from PIL import Image
    staging_id, grados = int(staging_id), int(grados) % 360
    st, datos, mime = pedir(f"/imagen?staging_id={staging_id}", crudo=True)
    if st != 200:
        salida({"error": f"HTTP {st} al bajar la foto"}); sys.exit(1)
    img = Image.open(io.BytesIO(datos)).convert("RGB").rotate(-grados, expand=True)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=90)
    st2, r = subir_foto(staging_id, out.getvalue())
    if st2 == 200:
        ruta = os.path.join(CARPETA, "boletas", f"{staging_id}.jpg")
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        open(ruta, "wb").write(out.getvalue())
        r["ruta"] = ruta
    salida(r)
    if st2 != 200:
        sys.exit(1)


def cmd_despachar(archivo):
    cuerpo = json.load(open(archivo, encoding="utf-8"))
    cuerpo["tipo"] = "despachar"
    faltan = [k for k in ("conversation_id", "staging_ids", "texto", "courier", "saldo", "nro_orden") if not cuerpo.get(k) and cuerpo.get(k) != 0]
    if faltan:
        salida({"error": f"faltan campos en {archivo}: {', '.join(faltan)}"}); sys.exit(1)
    status, resp = pedir("/mandar", "POST", cuerpo)
    resp["http"] = status
    salida(resp)
    if status != 200:
        sys.exit(1)


def cmd_error(staging_id, motivo):
    status, resp = pedir("/boletas_staging", "PATCH", {"id": int(staging_id), "status": "error", "error": motivo})
    salida(resp)


def cmd_telegram(texto):
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        sys.exit("Faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID.")
    datos = urllib.parse.urlencode({"chat_id": chat, "text": texto}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=datos)
    with urllib.request.urlopen(req, timeout=30) as r:
        print(json.loads(r.read()).get("ok"))


def main():
    a = sys.argv[1:]
    if not a or a[0].startswith("/"):
        cmd, resto = "bajar", a
    else:
        cmd, resto = a[0], a[1:]
    if cmd == "bajar":
        if resto and resto[0].startswith("/"):
            globals()["CARPETA"] = resto[0]
        cmd_bajar()
    elif cmd == "historial":
        cmd_historial(*resto[:1])
    elif cmd == "buscar":
        cmd_buscar(resto)
    elif cmd == "chat":
        cmd_chat(*resto[:2])
    elif cmd == "reportes":
        cmd_reportes(*resto[:1])
    elif cmd == "rotar":
        cmd_rotar(*resto[:2])
    elif cmd == "despachar":
        cmd_despachar(resto[0])
    elif cmd == "error":
        cmd_error(resto[0], " ".join(resto[1:]) or "error")
    elif cmd == "telegram":
        cmd_telegram(" ".join(resto))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()

"""
Baja las fotos de boleta que el dueño mandó al staging para analizarlas con visión.
Flujo: dueño manda fotos al número empresa → manda "ENVIAR" (o dispara la Routine a mano)
→ este script las descarga → la Routine lee las imágenes y despacha cada par con
POST /api/asesor/mandar { tipo: "despachar" } (ventana, dedup, cobro y registro los decide el Worker).

    ASESOR_CLAVE=... python3 scripts/asesor/boletas.py /tmp/ventas
        → /tmp/ventas/boletas/<id>.<ext>
          /tmp/ventas/boletas.md   (índice: pares de HOY, fotos sueltas, fotos vencidas)

Solo cuenta lo que el dueño mandó HOY (hora de Lima). Lo de días anteriores sale aparte como
"vencido": la Routine lo marca error y lo avisa, nunca lo manda (regla del dueño, 2026-10-31).
Cada cliente tiene DOS fotos (boleta/ticket y caja), en cualquier orden. Un número impar deja
una foto sin par: se avisa al dueño y NO se despacha.
"""
import datetime as dt
import json, os, sys, urllib.error, urllib.request

API_BASE = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor"
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
LIMA = dt.timezone(dt.timedelta(hours=-5))

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
- ⚠️ El shalom_code del contacto (3114/3143/3144…) es el código de RETIRO: NUNCA va en ningún mensaje.
- Género: estimado / estimada según el primer nombre; estimad@ solo si no queda claro.
"""


def pedir(clave, ruta, timeout=30):
    req = urllib.request.Request(
        f"{API_BASE}{ruta}",
        headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.headers.get("Content-Type", "").split(";")[0]


def listar_staging(clave):
    datos, _ = pedir(clave, "/boletas_staging")
    return json.loads(datos)["items"]


def fecha_lima(created_at):
    """created_at viene en UTC 'YYYY-MM-DD HH:MM:SS' (D1) → fecha de Lima."""
    try:
        t = dt.datetime.strptime(created_at[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=dt.timezone.utc)
    except (TypeError, ValueError):
        return None
    return t.astimezone(LIMA).date()


def main():
    a = sys.argv[1:]
    carpeta = a[0] if a else "/tmp/ventas"
    clave = os.environ.get("ASESOR_CLAVE") or sys.exit("Falta ASESOR_CLAVE en el entorno.")

    items = listar_staging(clave)
    if not items:
        print(json.dumps({"items": 0, "mensaje": "No hay boletas pendientes de análisis."}, ensure_ascii=False))
        return

    hoy = dt.datetime.now(LIMA).date()
    vencidos = [i for i in items if (fecha_lima(i.get("created_at")) or hoy) < hoy]
    de_hoy = [i for i in items if i not in vencidos]

    directorio = os.path.join(carpeta, "boletas")
    os.makedirs(directorio, exist_ok=True)

    descargadas, fallo = [], 0
    for item in de_hoy:
        id_ = item["id"]
        lote = item.get("lote_id") or "sin ENVIAR"
        try:
            datos, mime = pedir(clave, f"/imagen?staging_id={id_}", timeout=60)
        except (urllib.error.URLError, OSError) as err:
            fallo += 1
            descargadas.append({"id": id_, "lote": lote, "error": str(err)})
            continue
        ext = EXT.get(mime, "jpg")
        ruta = os.path.join(directorio, f"{id_}.{ext}")
        open(ruta, "wb").write(datos)
        descargadas.append({"id": id_, "lote": lote, "ruta": ruta, "mime": mime, "hora": item.get("created_at")})

    ok_items = [d for d in descargadas if "ruta" in d]
    err_items = [d for d in descargadas if "error" in d]

    # Pares POR LOTE (nunca cruzar fotos de distintos ENVIAR); la Routine confirma el par por apellido/NRO.
    lote_grupos = {}
    for d in ok_items:
        lote_grupos.setdefault(d["lote"], []).append(d)
    pares, sueltas = [], []
    for lote_key in sorted(lote_grupos.keys()):
        grupo = lote_grupos[lote_key]
        for i in range(0, len(grupo), 2):
            if i + 1 < len(grupo):
                pares.append({"a": grupo[i], "b": grupo[i + 1], "lote": lote_key})
            else:
                sueltas.append(grupo[i])

    lineas = ["# Boletas para despachar HOY (%s, Lima)" % hoy.isoformat(), "",
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
        lineas.append("  Para cada una: PATCH /api/asesor/boletas_staging { id, status: 'error', error: 'vencida: foto de <fecha>, no se procesa' } y avísalo en el reporte.")
    if err_items:
        lineas.append("\n## Fotos que no se pudieron bajar")
        for e in err_items:
            lineas.append(f"  - staging_id={e['id']}  lote={e['lote']}  error={e['error']}")

    indice = os.path.join(carpeta, "boletas.md")
    open(indice, "w", encoding="utf-8").write("\n".join(lineas) + "\n")

    resumen = {
        "hoy": hoy.isoformat(),
        "fotos_hoy": len(ok_items),
        "pares": len(pares),
        "sueltas": [f["id"] for f in sueltas],
        "vencidas": [i["id"] for i in vencidos],
        "fotos_fallidas": fallo,
        "indice": indice
    }
    print(json.dumps(resumen, ensure_ascii=False))


if __name__ == "__main__":
    main()

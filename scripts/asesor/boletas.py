"""
Baja las fotos de boleta que el dueño mandó al staging para analizarlas con visión.
Flujo: dueño manda fotos al número empresa → manda "ENVIAR" → lote queda en staging
→ este script las descarga → la Routine lee las imágenes y despacha cada boleta.

    ASESOR_CLAVE=... python3 scripts/asesor/boletas.py /tmp/ventas
        → /tmp/ventas/boletas/<id>.<ext>
          /tmp/ventas/boletas.md   (índice de qué descargar y sus IDs de staging)

Después de analizar y despachar cada una, la Routine llama:
    PATCH /api/asesor/boletas_staging  { id, status, conversation_id, courier, nombre_boleta, dni_boleta }
    PATCH /api/asesor/boletas_staging  { id, status: "error", error: "..." }
"""
import json, os, sys, urllib.error, urllib.request

API_BASE = "https://kit-tarot-para-principiantes.tarotperu.store/api/asesor"
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def listar_staging(clave):
    req = urllib.request.Request(
        f"{API_BASE}/boletas_staging",
        headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["items"]


def bajar_imagen(clave, media_id):
    req = urllib.request.Request(
        f"{API_BASE}/imagen?id={media_id}",
        headers={"x-asesor-clave": clave, "User-Agent": "tarot-asesor/1.0"}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read(), r.headers.get("Content-Type", "image/jpeg").split(";")[0]


def main():
    a = sys.argv[1:]
    carpeta = a[0] if a else "/tmp/ventas"
    clave = os.environ.get("ASESOR_CLAVE") or sys.exit("Falta ASESOR_CLAVE en el entorno.")

    items = listar_staging(clave)
    if not items:
        print(json.dumps({"items": 0, "mensaje": "No hay boletas pendientes de análisis."}, ensure_ascii=False))
        return

    directorio = os.path.join(carpeta, "boletas")
    os.makedirs(directorio, exist_ok=True)

    lineas = []
    ok = fallo = 0
    for item in items:
        id_ = item["id"]
        media_id = item["media_id"]
        lote = item.get("lote_id", "")
        try:
            datos, mime = bajar_imagen(clave, media_id)
        except (urllib.error.URLError, OSError) as err:
            fallo += 1
            lineas.append(f"- ID {id_} (lote {lote}): NO SE PUDO BAJAR ({err})")
            continue
        ext = EXT.get(mime, "jpg")
        ruta = os.path.join(directorio, f"{id_}.{ext}")
        open(ruta, "wb").write(datos)
        ok += 1
        lineas.append(
            f"- staging_id={id_}  lote={lote}  ruta={ruta}\n"
            f"  → Leer con Read y extraer: NOMBRE, DNI, COURIER (Shalom o Olva).\n"
            f"    Luego: buscar contacto por DNI, enviar boleta, activar plan cobro,\n"
            f"    PATCH /api/asesor/boletas_staging con {{id:{id_}, status, conversation_id, courier, nombre_boleta, dni_boleta}}."
        )

    indice = os.path.join(carpeta, "boletas.md")
    open(indice, "w", encoding="utf-8").write(
        "# Boletas para despachar (leer con Read y analizar)\n\n"
        "Para cada imagen: extrae NOMBRE, DNI y COURIER (Shalom / Olva).\n"
        "Busca el contacto en CRM por DNI. Mira si tiene ventana de 24 h abierta:\n"
        "  - Sí → manda la foto directamente como media.\n"
        "  - No → usa la plantilla PLANTILLA_ENVIO (cliente aprieta botón → se le manda la boleta).\n"
        "Después de enviar: activa plan de cobro según courier (Shalom: días 4/7/21; Olva: días 3/7/13).\n"
        "Marca la boleta como 'enviado' en el staging con PATCH /api/asesor/boletas_staging.\n\n"
        + "\n".join(lineas) + "\n"
    )
    print(json.dumps({"bajadas": ok, "fallidas": fallo, "total": len(items), "indice": indice}, ensure_ascii=False))


if __name__ == "__main__":
    main()

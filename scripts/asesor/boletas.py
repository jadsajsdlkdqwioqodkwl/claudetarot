"""
Baja las fotos de boleta que el dueño mandó al staging para analizarlas con visión.
Flujo: dueño manda fotos al número empresa → manda "ENVIAR" → lote queda en staging
→ este script las descarga → la Routine lee las imágenes y despacha cada boleta.

    ASESOR_CLAVE=... python3 scripts/asesor/boletas.py /tmp/ventas
        → /tmp/ventas/boletas/<id>.<ext>
          /tmp/ventas/boletas.md   (índice de qué analizar y sus IDs de staging)

Cada cliente tiene DOS fotos: primero la boleta/guía de remisión (orden 1),
luego la foto de la caja/paquete (orden 2). Se envían en ese orden consecutivo.
Si hay un número impar de fotos, la última no tiene par: hay que pedirle al dueño
la foto faltante antes de procesar.

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

    # Descargar todas las fotos
    descargadas = []
    fallo = 0
    for item in items:
        id_ = item["id"]
        media_id = item["media_id"]
        lote = item.get("lote_id", "")
        try:
            datos, mime = bajar_imagen(clave, media_id)
        except (urllib.error.URLError, OSError) as err:
            fallo += 1
            descargadas.append({"id": id_, "lote": lote, "error": str(err)})
            continue
        ext = EXT.get(mime, "jpg")
        ruta = os.path.join(directorio, f"{id_}.{ext}")
        open(ruta, "wb").write(datos)
        descargadas.append({"id": id_, "lote": lote, "ruta": ruta, "mime": mime})

    # Agrupar en pares (orden de llegada: boleta, caja, boleta, caja…)
    ok_items = [d for d in descargadas if "ruta" in d]
    err_items = [d for d in descargadas if "error" in d]

    pares = []
    for i in range(0, len(ok_items), 2):
        boleta = ok_items[i]
        caja = ok_items[i + 1] if i + 1 < len(ok_items) else None
        pares.append({"boleta": boleta, "caja": caja})

    # Construir boletas.md
    lineas = []
    alertas = []

    for n, par in enumerate(pares, start=1):
        b = par["boleta"]
        c = par["caja"]
        lineas.append(f"\n## Cliente {n}")
        lineas.append(f"  - BOLETA  → staging_id={b['id']}  lote={b['lote']}  ruta={b['ruta']}")
        if c:
            lineas.append(f"  - CAJA    → staging_id={c['id']}  lote={c['lote']}  ruta={c['ruta']}")
        else:
            lineas.append(f"  - CAJA    → ⚠️ FALTA — pedir al dueño la foto del paquete antes de continuar.")
            alertas.append(f"Cliente {n} (staging_id={b['id']}): falta foto de la caja.")
        lineas.append(
            f"  → Leer BOLETA con Read, extraer: NOMBRE COMPLETO, DNI, COURIER (Shalom o Olva).\n"
            f"    CALIDAD DE FOTO: si la imagen es borrosa o ilegible, notificar al dueño en\n"
            f"    esta sesión y pedir que la reenvíe; el batch sigue con los demás clientes.\n"
            f"    Si está parcialmente legible, extraer lo posible y anotar '(ilegible)' donde falte.\n"
            f"    Si es duplicada (mismo DNI en el mismo lote), preguntar al dueño cuál usar.\n"
            f"\n"
            f"    GÉNERO: usar 'estimado' o 'estimada' según el primer nombre (nombres peruanos\n"
            f"    comunes: Pedro/Carlos/Luis/Juan/Miguel/Jorge/Manuel → estimado;\n"
            f"    Rosa/Carmen/María/Ana/Luz/Patricia/Sandra/Jessica → estimada).\n"
            f"    Si el nombre no deja claro el género, usar 'estimad@'.\n"
            f"\n"
            f"    Según courier, extraer también:\n"
            f"      Shalom → (a) NÚMERO DE ORDEN y (b) CÓDIGO COMPARTIBLE de la boleta\n"
            f"               ⚠️ El shalom_code de contacts (3114/3144/3143) es el código de\n"
            f"               RETIRO en agencia — NO va en el mensaje al cliente ni se menciona\n"
            f"               hasta que pague su saldo. Solo el código de la boleta va al cliente.\n"
            f"      Olva   → código de seguimiento; si empieza con '26', quitar ese prefijo\n"
            f"               (Olva lo imprime con '26' pero la web ya lo pre-pone al buscar)\n"
            f"\n"
            f"    1. Buscar en Sheets Ventas la fila con ese DNI (GET /api/asesor/ventas-lista o leerFilas).\n"
            f"       La columna 'DNI / WSP' tiene el DNI y/o el número WhatsApp del cliente.\n"
            f"    2. Leer el adelanto de la columna 'Adelanto' de esa fila.\n"
            f"       Leer las imágenes del chat del cliente (api/asesor/imagenes) para confirmar\n"
            f"       el monto Yape/Plin si difiere de la Sheets. Precio base: S/89 (1 kit);\n"
            f"       ajustar si pidió 2+ kits o extras (revisar notas o mensajes del chat).\n"
            f"       Saldo = precio_total - adelanto (ejemplo: S/89 - S/30 = S/59).\n"
            f"    3. Preparar el mensaje de envío según courier (completar campos entre []):\n"
            f"\n"
            f"       SHALOM — mensaje raw (completar campos entre []):\n"
            f"       ---\n"
            f"       Buenas [estimado/estimada/estimad@] [PRIMER NOMBRE] le envío su comprobante ✨ le agradecemos la\n"
            f"       confianza depositada, el saldo restante de [S/SALDO] sería al mismo número\n"
            f"       927633099 (Moises O.) para poder compartirle su código de recojo.\n"
            f"       Nuevamente le agradecemos la confianza depositada en nosotros!\n"
            f"\n"
            f"       Puede rastrear su envío también por aquí, de igual manera le avisaremos\n"
            f"       cuando llegue👉 https://shalom.com.pe/rastrea\n"
            f"\n"
            f"       *Nro de orden:* [NUMERO DE ORDEN DE LA BOLETA]\n"
            f"       *Código:* [CODIGO COMPARTIBLE DE LA BOLETA — no el retiro 3114/3144/3143]\n"
            f"       ---\n"
            f"\n"
            f"       OLVA — mensaje raw (completar campos entre []):\n"
            f"       ---\n"
            f"       Buenas [estimado/estimada/estimad@] [PRIMER NOMBRE] le envío su comprobante ✨ le agradecemos la\n"
            f"       confianza depositada, el saldo restante de [S/SALDO] sería al mismo número\n"
            f"       927633099 (Moises O.) para poder compartirle su código de recojo.\n"
            f"       Nuevamente le agradecemos la confianza depositada en nosotros!\n"
            f"\n"
            f"       Puede rastrear su envío también por aquí, de igual manera le avisaremos\n"
            f"       cuando llegue👉 👉 https://tracking.olvaexpress.pe/\n"
            f"\n"
            f"       *Código de seguimiento:* [TRACKING SIN PREFIJO '26']\n"
            f"       ---\n"
            f"\n"
            f"    4. Ver si la ventana de 24 h está abierta (last_inbound_at < 24 h):\n"
            f"       - Abierta → mandar de forma AUTOMÁTICA (POST {API_BASE}/mandar, header x-asesor-clave):\n"
            f"           1. foto boleta: {{tipo:'foto-staging', wa_id, staging_id: {b['id']}}}\n"
            f"           2. foto caja:   {{tipo:'foto-staging', wa_id, staging_id: <id_caja>}}  (si hay)\n"
            f"           3. texto:       {{tipo:'texto', wa_id, texto: '<mensaje completo>'}}\n"
            f"       - Cerrada → mandar plantilla aviso_envio_shalom ({{{{1}}}} = primer nombre);\n"
            f"                   cliente aprieta botón → ventana abre → se mandan fotos + mensaje.\n"
            f"    5. Activar plan de cobro según courier:\n"
            f"       Shalom → PATCH /api/crm/contacts {{ contact_id, shalom_code: <codigo_recojo> }}\n"
            f"       Olva   → PATCH /api/crm/contacts {{ contact_id, olva: true }}\n"
            f"    6. Actualizar ventas y saldo en un solo call:\n"
            f"       POST /api/asesor/ventas {{\n"
            f"         accion: 'boleta', dni: '<DNI>', imagen_base64: '<base64>',\n"
            f"         mime: 'image/jpeg', saldo: '<monto>'\n"
            f"       }}\n"
            f"    7. Marcar las dos boletas como 'enviado':\n"
            f"       PATCH /api/asesor/boletas_staging {{id:{b['id']}, status:'enviado', courier, nombre_boleta, dni_boleta}}"
        )
            if c:
            lineas.append(
                f"       PATCH /api/asesor/boletas_staging {{id:{c['id']}, status:'enviado'}}"
            )

    if err_items:
        lineas.append("\n## Fotos que no se pudieron bajar")
        for e in err_items:
            lineas.append(f"  - staging_id={e['id']}  lote={e['lote']}  error={e['error']}")

    alerta_encabezado = ""
    if alertas:
        alerta_encabezado = (
            "\n⚠️ FOTOS FALTANTES — pedir al dueño antes de continuar:\n" +
            "\n".join(f"  • {a}" for a in alertas) + "\n"
        )

    indice = os.path.join(carpeta, "boletas.md")
    open(indice, "w", encoding="utf-8").write(
        "# Boletas para despachar\n\n"
        "Cada cliente tiene DOS fotos en orden: boleta/guía (orden 1) y foto de la caja (orden 2).\n"
        "Si una caja dice FALTA, notificar al dueño en esta sesión y esperar su respuesta.\n"
        "Si el dueño no puede mandar la foto, proceder con solo la boleta.\n"
        + alerta_encabezado
        + "\n".join(lineas) + "\n"
    )

    resumen = {
        "clientes": len(pares),
        "fotos_ok": len(ok_items),
        "fotos_fallidas": fallo,
        "pares_completos": sum(1 for p in pares if p["caja"]),
        "pares_incompletos": sum(1 for p in pares if not p["caja"]),
        "indice": indice
    }
    if alertas:
        resumen["alertas"] = alertas

    print(json.dumps(resumen, ensure_ascii=False))


if __name__ == "__main__":
    main()

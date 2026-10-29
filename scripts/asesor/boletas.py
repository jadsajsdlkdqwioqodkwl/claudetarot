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


def bajar_imagen(clave, staging_id):
    req = urllib.request.Request(
        f"{API_BASE}/imagen?staging_id={staging_id}",
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
        lote = item.get("lote_id", "")
        try:
            datos, mime = bajar_imagen(clave, id_)
        except (urllib.error.URLError, OSError) as err:
            fallo += 1
            descargadas.append({"id": id_, "lote": lote, "error": str(err)})
            continue
        ext = EXT.get(mime, "jpg")
        ruta = os.path.join(directorio, f"{id_}.{ext}")
        open(ruta, "wb").write(datos)
        descargadas.append({"id": id_, "lote": lote, "ruta": ruta, "mime": mime})

    # Agrupar en pares POR LOTE: nunca cruzar fotos de distintos ENVIAR.
    # Si el dueño mandó 10 fotos → ENVIAR y luego 2 más → ENVIAR, cada lote
    # se empareja por separado: {lote_1: [b1,c1,b2,c2,...], lote_2: [b3,c3]}.
    ok_items = [d for d in descargadas if "ruta" in d]
    err_items = [d for d in descargadas if "error" in d]

    lote_grupos = {}
    for d in ok_items:
        lote_grupos.setdefault(d["lote"], []).append(d)

    pares = []
    for lote_key in sorted(lote_grupos.keys()):
        grupo = lote_grupos[lote_key]
        for i in range(0, len(grupo), 2):
            boleta = grupo[i]
            caja = grupo[i + 1] if i + 1 < len(grupo) else None
            pares.append({"boleta": boleta, "caja": caja, "lote": lote_key})

    # Construir boletas.md
    lineas = []
    alertas = []

    for n, par in enumerate(pares, start=1):
        b = par["boleta"]
        c = par["caja"]
        lineas.append(f"\n## Cliente {n}")
        lineas.append(f"  - FOTO-1  → staging_id={b['id']}  lote={b['lote']}  ruta={b['ruta']}")
        if c:
            lineas.append(f"  - FOTO-2  → staging_id={c['id']}  lote={c['lote']}  ruta={c['ruta']}")
        else:
            lineas.append(f"  - FOTO-2  → ⚠️ FALTA — pedir al dueño la foto faltante antes de continuar. NUNCA despachar con solo una foto.")
            alertas.append(f"Cliente {n} (staging_id={b['id']}): falta foto del par.")
        lineas.append(
            f"  → ⚠️ VERIFICAR ANTES DE PAREAR: el dueño no siempre manda las fotos en orden\n"
            f"    boleta-caja. Lee AMBAS fotos primero para clasificarlas:\n"
            f"      • BOLETA/TICKET: papel impreso con 'DATOS TICKET SHALOM', 'GUIA DE REMISION' o\n"
            f"        similar. Tiene DNI, NRO ORDEN, CODIGO, nombre del destinatario.\n"
            f"      • CAJA: etiqueta sobre cartón o paquete. Dice DESTINATARIO: APELLIDO NOMBRE.\n"
            f"    Si ambas fotos son del mismo tipo (ej. dos cajas o dos tickets), es un lote\n"
            f"    mezclado: reparear por nombre — la caja y el ticket del mismo apellido van juntos.\n"
            f"\n"
            f"    VERIFICAR QUE EL PAR ES DEL MISMO CLIENTE: el APELLIDO o DNI del ticket debe\n"
            f"    coincidir con el DESTINATARIO de la caja. Si no coinciden → NO despachar;\n"
            f"    reparear correctamente entre todos los staging de este lote antes de continuar.\n"
            f"\n"
            f"    REGLA CRÍTICA: NUNCA mandar boleta sola ni caja sola. Solo despachar\n"
            f"    cuando tienes AMBAS fotos (boleta+caja) identificadas para el mismo cliente.\n"
            f"    Si falta una foto del par → esperar al dueño.\n"
            f"\n"
            f"    CALIDAD DE FOTO: si la imagen es borrosa o ilegible, notificar al dueño en\n"
            f"    esta sesión y pedir que la reenvíe; el batch sigue con los demás clientes.\n"
            f"    Si está parcialmente legible, extraer lo posible y anotar '(ilegible)' donde falte.\n"
            f"\n"
            f"    DUPLICADOS: mismo NRO ORDEN en dos fotos = mismo envío del mismo cliente.\n"
            f"    Descartar el duplicado (PATCH status=error, error='duplicado de staging X').\n"
            f"    NO descartar una caja como duplicado solo por estar en posición par — verificar\n"
            f"    que realmente tenga el mismo NRO ORDEN o el mismo DESTINATARIO antes de descartar.\n"
            f"\n"
            f"    TRIANGULACIÓN (usar al menos 2 datos para identificar al cliente):\n"
            f"    Al buscar por DNI y encontrar match, confirmar también que el NOMBRE de Sheets\n"
            f"    coincide con el NOMBRE de la boleta (al menos el apellido). Si solo hay un dato\n"
            f"    que coincide pero el otro no, es sospechoso — preguntar al dueño antes de despachar.\n"
            f"\n"
            f"    GÉNERO: usar 'estimado' o 'estimada' según el primer nombre.\n"
            f"    Femeninos comunes (no exhaustiva): Rosa/Carmen/María/Ana/Luz/Patricia/Sandra/Jessica/\n"
            f"    Pepita/Fiorella/Janet/Jennifer/Milagros/Flor/Karen/Diana/Claudia/Carla/Rocío/Nelly/\n"
            f"    Susana/Elizabeth/Verónica/Vanessa/Paola/Laura/Andrea/Alejandra/Grecia/Stefany/Ingrid/\n"
            f"    Marisol/Yolanda/Consuelo/Gladys/Soledad/Maritza/Mariela/Giuliana/Evelyn/Gisela/Jimena.\n"
            f"    Masculinos comunes: Pedro/Carlos/Luis/Juan/Miguel/Jorge/Manuel/José/Roberto/Ricardo/\n"
            f"    Víctor/Oscar/Raúl/Eduardo/Fernando/César/Hugo/Sergio/Gonzalo/Javier/Alejandro.\n"
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
            f"    1. Identificar al cliente (tres pasos en orden; para en el primero que funcione):\n"
            f"       a) Buscar en Sheets por DNI:\n"
            f"          GET {API_BASE}/ventas-lista?dni=<DNI_EXTRAIDO>\n"
            f"          Respuesta: {{encontrado, wa_id (51XXXXXXXXX), adelanto, saldo, codigo, courier, clave, estado}}\n"
            f"          Si encontrado=true → tienes wa_id y adelanto; ir al paso 2.\n"
            f"          Si encontrado=false → continúa con (b).\n"
            f"       b) Buscar en el CRM por DNI (mensajes del cliente):\n"
            f"          GET {API_BASE}/buscar-dni?dni=<DNI_EXTRAIDO>\n"
            f"          Respuesta: {{encontrado, conversation_id, wa_id, nombre}}\n"
            f"          Si encontrado=true → tienes wa_id y conversation_id; adelanto=null (leerás el Yape en paso 2).\n"
            f"          Si encontrado=false → continúa con (c).\n"
            f"       c) No se encontró al cliente en Sheets ni en el CRM:\n"
            f"          Preguntar al dueño en esta sesión. Puede que la venta no esté registrada\n"
            f"          (pedido verbal, clave sin asignar, etc.). No procesar esta boleta hasta confirmar.\n"
            f"\n"
            f"    2. Calcular el saldo a cobrar.\n"
            f"       - Si Sheets devolvió 'adelanto' en el paso 1a → ese es el monto pagado; usarlo.\n"
            f"       - Si solo tienes CRM (sin Sheets) → preguntar al dueño cuánto fue el adelanto\n"
            f"         antes de continuar (no mandes el mensaje con saldo incorrecto).\n"
            f"       - Si Sheets tiene adelanto pero parece incorrecto → preguntar al dueño.\n"
            f"       Precio base: S/89 (1 kit); ajustar si pidió 2+ kits o extras.\n"
            f"       Saldo = precio_total - adelanto (ejemplo: S/89 - S/20 = S/69).\n"
            f"       Si adelanto = precio_total → saldo = 0 (pago completo); usar variante sin saldo.\n"
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
            f"       Recordarle también que la agencia tiene un tiempo limitado de retención del paquete ☺️\n"
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
            f"       Recordarle también que la agencia tiene un tiempo limitado de retención del paquete ☺️\n"
            f"\n"
            f"       *Código de seguimiento:* [TRACKING SIN PREFIJO '26']\n"
            f"       ---\n"
            f"\n"
            f"       ⚠️ Si saldo = 0 (pago completo, sin deuda), usar los mensajes de abajo.\n"
            f"       NO mencionar saldo ni código de recojo (el cobro ya fue completado).\n"
            f"\n"
            f"       SHALOM — pago completo:\n"
            f"       ---\n"
            f"       Buenas [estimado/estimada/estimad@] [PRIMER NOMBRE] le envío su comprobante ✨ muchas gracias por su pago completo, le agradecemos la confianza depositada!\n"
            f"\n"
            f"       Puede rastrear su envío por aquí, le avisaremos cuando llegue👉 https://shalom.com.pe/rastrea\n"
            f"\n"
            f"       Recordarle también que la agencia tiene un tiempo limitado de retención del paquete ☺️\n"
            f"\n"
            f"       *Nro de orden:* [NUMERO DE ORDEN DE LA BOLETA]\n"
            f"       *Código:* [CODIGO COMPARTIBLE DE LA BOLETA — no el retiro 3114/3144/3143]\n"
            f"       ---\n"
            f"\n"
            f"       OLVA — pago completo:\n"
            f"       ---\n"
            f"       Buenas [estimado/estimada/estimad@] [PRIMER NOMBRE] le envío su comprobante ✨ muchas gracias por su pago completo, le agradecemos la confianza depositada!\n"
            f"\n"
            f"       Puede rastrear su envío por aquí, le avisaremos cuando llegue👉 https://tracking.olvaexpress.pe/\n"
            f"\n"
            f"       Recordarle también que la agencia tiene un tiempo limitado de retención del paquete ☺️\n"
            f"\n"
            f"       *Código de seguimiento:* [TRACKING SIN PREFIJO '26']\n"
            f"       ---\n"
            f"\n"
            f"    4. Ver si la ventana de 24 h está abierta (last_inbound_at < 24 h):\n"
            f"       - Abierta → mandar de forma AUTOMÁTICA (POST {API_BASE}/mandar, header x-asesor-clave):\n"
            f"           1. foto boleta: {{tipo:'foto-staging', wa_id, staging_id: {b['id']}}}\n"
            f"           2. foto caja:   {{tipo:'foto-staging', wa_id, staging_id: <id_caja>}}  (si hay)\n"
            f"           3. texto:       {{tipo:'texto', wa_id, texto: '<mensaje completo>'}}\n"
            f"          Verificar que cada POST devuelva {{ok:true}}; si falla, marcar staging con status='error'.\n"
            f"       - Cerrada → guardar mensaje para auto-despacho cuando el cliente abra la ventana:\n"
            f"           a. PATCH {API_BASE}/boletas_staging (header x-asesor-clave) PRIMERO para la boleta:\n"
            f"              {{id:{b['id']}, status:'pendiente_ventana', conversation_id:<conv_id>,\n"
            f"               courier:'<Shalom|Olva>', nombre_boleta:'<nombre>', dni_boleta:'<dni>',\n"
            f"               mensaje_texto:'<mensaje completo que se mandará cuando abra la ventana>'}}\n"
            f"           b. Si hay caja: PATCH para su id con {{status:'pendiente_ventana', conversation_id:<conv_id>}}\n"
            f"           c. Luego mandar plantilla aviso_envio_shalom\n"
            f"              POST /api/crm/sugerencias {{tipo:'plantilla', wa_id, plantilla:'aviso_envio_shalom', params:['<primer_nombre>']}}\n"
            f"              El Worker despachará las fotos+mensaje automáticamente cuando el cliente toque el botón.\n"
            f"    5. Plan de cobro (SIEMPRE, ventana abierta o cerrada):\n"
            f"       Shalom → el shalom_code (código de retiro en agencia) lo ingresa el dueño a mano\n"
            f"                en el CRM. NUNCA lo asignes ni lo menciones en el mensaje al cliente.\n"
            f"                El plan de seguimiento se activa automáticamente cuando el dueño lo pone.\n"
            f"       Olva   → el plan de recojo (3-7-13 días) se activa automáticamente cuando haces\n"
            f"                el PATCH del paso 7 con status='enviado' o 'pendiente_ventana'.\n"
            f"                No necesitas ninguna llamada adicional.\n"
            f"    6. Actualizar ventas y saldo en un solo call:\n"
            f"       POST /api/asesor/ventas {{\n"
            f"         accion: 'boleta', dni: '<DNI>', imagen_base64: '<base64>',\n"
            f"         mime: 'image/jpeg', saldo: '<monto>'\n"
            f"       }}\n"
            f"    7. Marcar como 'enviado' (SOLO si la ventana estaba ABIERTA y mandaste tú):\n"
            f"       Si la ventana estaba CERRADA, el paso 4b ya hizo el PATCH con status='pendiente_ventana'; no repetir aquí.\n"
            f"       PATCH /api/asesor/boletas_staging {{id:{b['id']}, status:'enviado', courier:'<Shalom|Olva>', nombre_boleta:'<nombre>', dni_boleta:'<dni>'}}"
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
        "⚠️ REGLA CRÍTICA: NUNCA despachar boleta sola ni caja sola — siempre AMBAS fotos del mismo cliente.\n"
        "Las fotos están numeradas como FOTO-1 y FOTO-2 pero el dueño NO siempre las manda en orden boleta→caja.\n"
        "LEE AMBAS fotos de cada par antes de despachar para verificar que pertenecen al mismo cliente.\n"
        "Si una foto dice FALTA, notificar al dueño y esperar — NO procesar hasta tener el par completo.\n"
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

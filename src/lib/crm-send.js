/**
 * Envío compartido entre /api/crm/messages, el botón de "mandar" de una
 * respuesta rápida y los seguimientos programados: todos terminan subiendo
 * un archivo de R2 a la Cloud API y guardando el mensaje saliente igual.
 */

import { enviarTexto, enviarMedia, enviarReaccion, subirMedia, mostrarEscribiendo } from "./whatsapp.js";
import { registrarMensajeSaliente, guardarReaccionPropia, guardarAjuste, obtenerAjuste } from "./crm-db.js";
import { envDeConversacion } from "./lineas.js";

/*
 * Varios números (src/lib/lineas.js): cada envío sale por el número al que
 * escribió el cliente. Aquí se resuelve solo con el id del chat
 * (envDeConversacion), así ningún llamador tiene que acordarse.
 */

/**
 * Antes de mandarle un TEXTO al cliente: le muestra "escribiendo…" y espera 1,5 s,
 * para que no llegue al instante como un bot. La espera no es CPU ni suma
 * requests del Worker; el "escribiendo" es una llamada más a Meta
 * (subrequest, sin costo). WhatsApp lo muestra marcando como leído el último
 * mensaje del cliente: si el cliente nunca escribió, no hay cómo mostrarlo
 * (solo queda la espera).
 */
/*
 * ⚠️ NO TOCAR — REGLA DEL DUEÑO, IMPORTANTÍSIMA.
 * Todo TEXTO que sale a un cliente (a mano, pegado, respuesta rápida,
 * bienvenida, seguimiento, sugerencia aprobada, link de Shalom, plantilla)
 * va precedido de "escribiendo…" en su WhatsApp durante 2 s (respuesta rápida 1,5 s, texto de bienvenida 1 s) y recién el
 * mensaje. No se quita, no se acorta, no se salta "para que vaya más rápido".
 *
 * Fotos, videos, audios, documentos, stickers, catálogo y producto salen al
 * toque, sin "escribiendo…" (así es en WhatsApp: eso no se escribe).
 * Decisión del dueño (2026-09-29). Si llevan texto aparte (audio/sticker con
 * texto), ese texto sí va con su "escribiendo…".
 *
 * Está garantizado aquí mismo, no depende de quien llama: mandarTexto() y
 * mandarConEscribiendo() (plantilla) hacen su propia pausaEnvio() si nadie
 * la hizo justo antes para ese mensaje. Cada pausa sirve para UN solo
 * mensaje. `npm run check` falla si algún envío a Meta no pasa por estas
 * funciones o si este valor cambia.
 */
export const PAUSA_ENVIO_MS = 2000; // mensaje normal: 2 s
export const PAUSA_RAPIDA_MS = 1500; // respuesta rápida: 1,5 s
/*
 * Bienvenida automática: el TEXTO lleva "escribiendo…" de 1 s y sin el
 * espacio entre mensajes. Fotos y archivos, sin "escribiendo…".
 */
export const PAUSA_BIENVENIDA_MS = 1000;
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * Mensajes seguidos: si el anterior a este chat salió hace un instante,
 * WhatsApp todavía lo está entregando y el "escribiendo…" nuevo no llega a
 * verse (el celular lo apaga al recibir el mensaje anterior). Por eso, antes
 * del "escribiendo…", se espera a que pasen ESPACIO_ENTRE_MENSAJES_MS desde
 * el último envío a ese chat. No reemplaza los 1,5 s: se suman.
 *
 * Dos envíos al mismo chat a la vez (dos Enter seguidos, pegar y mandar
 * rápido, un seguimiento que sale justo cuando la vendedora escribe) toman
 * turno en D1 (envio_turnos): cada uno tiene su propio "escribiendo…"
 * visible, uno detrás del otro.
 */
export const ESPACIO_ENTRE_MENSAJES_MS = 2000;
const ESPERA_MAXIMA_TURNO_MS = 30000;
const ultimoEnvio = new Map(); // conversation_id -> ms del último envío (dentro de esta ejecución)
const pausasHechas = new Map(); // conversation_id -> [ms] pausas hechas que todavía no usó ningún mensaje

async function esperarEspacio(conversationId, ultimoOutDb) {
  const previo = Math.max(ultimoEnvio.get(conversationId) || 0, ultimoOutDb || 0);
  const falta = previo + ESPACIO_ENTRE_MENSAJES_MS - Date.now();
  if (previo && falta > 0) await esperar(Math.min(falta, ESPACIO_ENTRE_MENSAJES_MS));
}

/** Reserva el turno de este mensaje en el chat; devuelve cuántos ms esperar antes del "escribiendo…". */
async function reservarTurno(env, conversationId, ms, espacio = ESPACIO_ENTRE_MENSAJES_MS) {
  if (!env?.CRM_DB || !conversationId) return 0;
  try {
    const ahora = Date.now();
    const r = await env.CRM_DB.prepare(
      `INSERT INTO envio_turnos (conversation_id, fin) VALUES (?1, ?2 + ?4)
       ON CONFLICT(conversation_id) DO UPDATE SET fin = MAX(fin + ?3, ?2) + ?4
       RETURNING fin`
    ).bind(conversationId, ahora, espacio, ms).first();
    return Math.min(Math.max((r?.fin || 0) - ms - ahora, 0), ESPERA_MAXIMA_TURNO_MS);
  } catch (err) {
    console.error("Turno de envío:", err.message);
    return 0;
  }
}

async function avisarErrorEscribiendo(env, conversationId, err) {
  console.error("Escribiendo:", err.message);
  if (env?.CRM_DB) await guardarAjuste(env.CRM_DB, "ultimo_error_escribiendo", `${new Date().toISOString()} conv ${conversationId}: ${err.message}`).catch(() => {});
}

/*
 * Ajuste "sin visto" (CRM → Equipo, solo admin): el cliente nunca ve en
 * azul que leímos lo suyo. Meta solo deja mostrar "escribiendo…" marcando
 * como leído, así que con esto encendido no hay "escribiendo…": la pausa
 * de antes de cada texto se respeta igual. Los vistos del cliente a lo
 * nuestro llegan por el webhook como siempre.
 */
let sinVistoCache = { at: 0, valor: false };
export async function sinVisto(env) {
  if (!env?.CRM_DB) return false;
  if (Date.now() - sinVistoCache.at < 30000) return sinVistoCache.valor;
  try {
    sinVistoCache = { at: Date.now(), valor: (await obtenerAjuste(env.CRM_DB, "sin_visto")) === "1" };
  } catch (err) {
    console.error("Ajuste sin_visto:", err.message);
  }
  return sinVistoCache.valor;
}

/** "Escribiendo…" con un reintento: nunca frena el envío. */
async function escribiendoEn(env, conversationId, waMessageId) {
  if (!waMessageId) return;
  if (await sinVisto(env)) return;
  env = await envDeConversacion(env, conversationId);
  try {
    await mostrarEscribiendo(env, waMessageId);
  } catch {
    try {
      await esperar(300);
      await mostrarEscribiendo(env, waMessageId);
    } catch (err) {
      await avisarErrorEscribiendo(env, conversationId, err);
    }
  }
}

export async function pausaEnvio(env, conversationId, ms = PAUSA_ENVIO_MS, { ultimoWaId, rapido = false } = {}) {
  // Nunca menos que el mínimo, pase lo que pase (bienvenida `rapido`: 1 s; respuesta rápida: 1,5 s; normal: 2 s).
  ms = rapido ? Math.max(Number(ms) || 0, PAUSA_BIENVENIDA_MS) : Math.max(Number(ms) || 0, PAUSA_RAPIDA_MS);
  // `ultimoWaId`: el id del último mensaje del cliente si quien llama ya lo
  // tiene (el cron, el webhook), así no se gasta una consulta a D1 por envío.
  let waIn = ultimoWaId || null;
  let ultimoOut = 0;
  if (env?.CRM_DB && conversationId) {
    try {
      const ultimo = await env.CRM_DB.prepare(
        `SELECT
           ${waIn ? "NULL" : `(SELECT wa_message_id FROM messages
            WHERE conversation_id = ?1 AND direction = 'in' AND type NOT IN ('call', 'reaction', 'system') AND wa_message_id IS NOT NULL
            ORDER BY id DESC LIMIT 1)`} AS wa_message_id,
           (SELECT MAX(created_at) FROM messages WHERE conversation_id = ?1 AND direction = 'out') AS ultimo_out`
      )
        .bind(conversationId)
        .first();
      waIn = waIn || ultimo?.wa_message_id || null;
      const t = ultimo?.ultimo_out ? new Date(String(ultimo.ultimo_out).replace(" ", "T") + "Z").getTime() : 0;
      ultimoOut = Number.isNaN(t) ? 0 : t;
    } catch (err) {
      await avisarErrorEscribiendo(env, conversationId, err);
    }
  }
  if (!rapido) await esperarEspacio(conversationId, ultimoOut);
  const turno = await reservarTurno(env, conversationId, ms, rapido ? 0 : ESPACIO_ENTRE_MENSAJES_MS);
  if (turno) await esperar(turno);
  await escribiendoEn(env, conversationId, waIn);
  await esperar(ms);
  if (conversationId) (pausasHechas.get(conversationId) || pausasHechas.set(conversationId, []).get(conversationId)).push(Date.now());
}

/**
 * Cada mensaje usa una pausa hecha para él (hace menos de 10 s); si no hay
 * ninguna, la hace aquí. Así ningún envío sale sin "escribiendo…", aunque
 * quien llama se haya olvidado de pausaEnvio().
 */
async function asegurarPausa(env, conversationId) {
  if (!conversationId) return pausaEnvio(env, conversationId);
  const lista = (pausasHechas.get(conversationId) || []).filter((t) => Date.now() - t < 10000);
  if (!lista.length) {
    pausasHechas.delete(conversationId);
    await pausaEnvio(env, conversationId);
    return asegurarPausa(env, conversationId);
  }
  lista.shift();
  if (lista.length) pausasHechas.set(conversationId, lista);
  else pausasHechas.delete(conversationId);
}

async function marcarEnviado(env, conversationId) {
  ultimoEnvio.set(conversationId, Date.now());
  // Si el envío tardó (subir un video), el turno del siguiente cuenta desde ahora.
  await env?.CRM_DB?.prepare("UPDATE envio_turnos SET fin = MAX(fin, ?2) WHERE conversation_id = ?1")
    .bind(conversationId, Date.now()).run().catch(() => {});
}

/**
 * Plantilla (texto que no pasa por mandarTexto): `enviar` es la llamada a
 * Meta; antes va su "escribiendo…" de 1,5 s.
 */
export async function mandarConEscribiendo(env, conversationId, enviar) {
  await asegurarPausa(env, conversationId);
  const waMessageId = await enviar(await envDeConversacion(env, conversationId));
  await marcarEnviado(env, conversationId);
  return waMessageId;
}

/** Catálogo o producto: sale al toque, sin "escribiendo…". `enviar(envDeLaLinea)`. */
export async function mandarAlToque(env, conversationId, enviar) {
  const waMessageId = await enviar(await envDeConversacion(env, conversationId));
  await marcarEnviado(env, conversationId);
  return waMessageId;
}

export async function mandarTexto(env, conversationId, waId, texto, sentBy, replyTo, opciones) {
  await asegurarPausa(env, conversationId);
  const waMessageId = await enviarTexto(await envDeConversacion(env, conversationId), waId, texto, replyTo?.wa_message_id);
  await marcarEnviado(env, conversationId);
  await registrarMensajeSaliente(env.CRM_DB, conversationId, { waMessageId, type: "text", body: texto, sentBy, replyToMessageId: replyTo?.id }, opciones);
  return waMessageId;
}

/**
 * El archivo de R2 ya subido a WhatsApp: { mediaId, mime, fileName }. Reusa
 * el media id de wa_media_cache (Meta lo guarda ~30 días; aquí 25) para no
 * volver a subir la misma foto en cada envío; `fresca` fuerza subirla de nuevo.
 */
export async function subidaDe(env, mediaKey, { fresca = false } = {}) {
  // El media id es de cada número: en otra línea se guarda con su phone id delante.
  const claveCache = env.LINEA_ID ? `${env.WHATSAPP_PHONE_NUMBER_ID}|${mediaKey}` : mediaKey;
  if (!fresca) {
    const c = await env.CRM_DB?.prepare(
      "SELECT media_id, mime, file_name FROM wa_media_cache WHERE media_key = ? AND created_at >= datetime('now', '-25 days')"
    ).bind(claveCache).first().catch(() => null);
    if (c?.media_id) return { mediaId: c.media_id, mime: c.mime, fileName: c.file_name || undefined, deCache: true };
  }
  const obj = await env.CRM_MEDIA.get(mediaKey);
  if (!obj) throw new Error("El archivo ya no está disponible.");
  const mime = obj.httpMetadata?.contentType || "application/octet-stream";
  const fileName = obj.customMetadata?.originalName || undefined;
  const mediaId = await subirMedia(env, await obj.blob(), mime, mediaKey.split("/").pop());
  await env.CRM_DB?.prepare(
    `INSERT INTO wa_media_cache (media_key, media_id, mime, file_name) VALUES (?, ?, ?, ?)
     ON CONFLICT(media_key) DO UPDATE SET media_id = excluded.media_id, mime = excluded.mime, file_name = excluded.file_name, created_at = datetime('now')`
  ).bind(claveCache, mediaId, mime, fileName || null).run().catch(() => {});
  return { mediaId, mime, fileName, deCache: false };
}

/** Sube de antemano (en paralelo) los archivos que se van a mandar, para que después salgan seguidos. */
export async function prepararMedias(env, mediaKeys) {
  await Promise.all([...new Set(mediaKeys)].map((k) => subidaDe(env, k).catch((err) => console.error("Preparar media:", err.message))));
}

/**
 * `mediaKey` es la clave en R2 (CRM_MEDIA). La manda a WhatsApp (subida una
 * sola vez y reusada, ver subidaDe). `caption` es el pie de foto/video/documento. `fileName` queda en
 * el registro interno (Sheets) y, si el tipo es "document", también se
 * manda como el nombre visible del archivo (ver enviarMedia).
 */
export async function mandarMediaGuardada(env, conversationId, waId, mediaKey, type, caption, sentBy, fileName, replyTo, opciones) {
  // Audio y sticker no admiten texto en WhatsApp: el archivo va solo y el
  // texto sale justo después como mensaje aparte, para que no se pierda.
  if (caption && (type === "audio" || type === "sticker")) {
    const waMessageId = await mandarMediaGuardada(env, conversationId, waId, mediaKey, type, null, sentBy, fileName, replyTo, opciones);
    await mandarTexto(env, conversationId, waId, caption, sentBy, null, opciones);
    return waMessageId;
  }
  const envL = await envDeConversacion(env, conversationId);
  let subida = await subidaDe(envL, mediaKey);
  // Seguimientos, secuencias, respuestas rápidas y bienvenida no traen el
  // nombre: sale del que se guardó al subir el archivo (upload-media.js),
  // así el cliente recibe el documento con su nombre original.
  // Foto, video, audio, documento: al toque, sin "escribiendo…".
  let waMessageId;
  try {
    waMessageId = await enviarMedia(envL, waId, type, subida.mediaId, caption, replyTo?.wa_message_id, fileName || subida.fileName);
  } catch (err) {
    // El media id guardado venció en Meta: se sube de nuevo y se reintenta.
    if (!subida.deCache) throw err;
    subida = await subidaDe(envL, mediaKey, { fresca: true });
    waMessageId = await enviarMedia(envL, waId, type, subida.mediaId, caption, replyTo?.wa_message_id, fileName || subida.fileName);
  }
  fileName = fileName || subida.fileName;
  const mime = subida.mime;
  await marcarEnviado(env, conversationId);

  await registrarMensajeSaliente(env.CRM_DB, conversationId, {
    waMessageId,
    type,
    body: caption || null,
    mediaKey,
    mediaMime: mime,
    sentBy,
    replyToMessageId: replyTo?.id,
    fileName
  }, opciones);
  return waMessageId;
}

/** Reacciona (o quita la reacción, con emoji null) a un mensaje ya mandado, de cualquiera de los dos lados. */
export async function mandarReaccion(env, waId, mensajeObjetivo, emoji) {
  await enviarReaccion(await envDeConversacion(env, mensajeObjetivo.conversation_id), waId, mensajeObjetivo.wa_message_id, emoji);
  await guardarReaccionPropia(env.CRM_DB, mensajeObjetivo.id, emoji);
}

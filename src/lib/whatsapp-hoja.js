/**
 * Esquema de las dos pestañas del CRM de WhatsApp. Las crea solas
 * POST /api/setup — ver crm-setup.js.
 *
 * "WSP_Mensajes" es el log crudo: una fila por mensaje, entrante o saliente,
 * sin formato ni columnas calculadas. No es para que lo lea una persona —
 * es la materia prima para, más adelante, dársela a un LLM (resumen de
 * conversación, detección de intención, lo que haga falta). Por eso no
 * intenta ser bonito.
 *
 * "WSP_Contactos" es una fila por wa_id, con lo que sí edita un humano:
 * la estrella, las etiquetas, notas. El Worker la actualiza solo en
 * Nombre, Última actividad y Último mensaje; nunca toca Estrella/Etiquetas/
 * Notas una vez que existen, para no pisar lo que el vendedor ya escribió ahí.
 */
import { appendRow, getValues, updateValues } from "./google-sheets.js";

export const COLUMNAS_MENSAJES = [
  "Fecha",
  "Dirección", // "in" | "out"
  "wa_id",
  "Nombre",
  "Tipo",
  "Texto",
  // Id del mensaje en WhatsApp: sirve para no duplicar la fila si Meta
  // reintenta el mismo webhook (los reintentos mandan el mismo Message ID).
  "Message ID",
  // Quién lo mandó, solo en salientes: el trabajador que contestó desde el panel.
  "Worker"
];

export const COLUMNAS_CONTACTOS = [
  "wa_id",
  "Nombre",
  "Estrella",
  "Etiquetas",
  "Última actividad",
  "Notas",
  // Preview para la lista del panel: evita releer todo WSP_Mensajes solo
  // para mostrar el último mensaje de cada conversación.
  "Último mensaje"
];

export function hojaMensajes(env) {
  return env.GOOGLE_WHATSAPP_MENSAJES_NAME || "WSP_Mensajes";
}

export function hojaContactos(env) {
  return env.GOOGLE_WHATSAPP_CONTACTOS_NAME || "WSP_Contactos";
}

/** Agrega una fila cruda al log de mensajes. */
export function registrarMensaje(env, { fecha, direccion, waId, nombre, tipo, texto, messageId, worker = "" }) {
  return appendRow(env, [fecha, direccion, waId, nombre || "", tipo, texto, messageId, worker], hojaMensajes(env));
}

/** Número de fila (1-based) de un wa_id en WSP_Contactos, o -1 si no existe. */
async function filaDeContacto(env, waId) {
  const columnaA = await getValues(env, `${hojaContactos(env)}!A:A`);
  for (let i = 1; i < columnaA.length; i++) {
    if (columnaA[i]?.[0] === waId) return i + 1;
  }
  return -1;
}

/**
 * Crea el contacto si no existe, o le actualiza Nombre, Última actividad y
 * Último mensaje si ya existe. Nunca toca Estrella, Etiquetas ni Notas:
 * esas son del trabajador.
 */
export async function upsertContacto(env, { waId, nombre, fecha, ultimoMensaje }) {
  const hoja = hojaContactos(env);
  const numeroFila = await filaDeContacto(env, waId);

  if (numeroFila === -1) {
    await appendRow(env, [waId, nombre || "", "", "", fecha, "", ultimoMensaje || ""], hoja);
    return;
  }

  const escrituras = [updateValues(env, `${hoja}!E${numeroFila}:E${numeroFila}`, [[fecha]])];
  if (nombre) escrituras.push(updateValues(env, `${hoja}!B${numeroFila}:B${numeroFila}`, [[nombre]]));
  if (ultimoMensaje !== undefined) escrituras.push(updateValues(env, `${hoja}!G${numeroFila}:G${numeroFila}`, [[ultimoMensaje]]));
  await Promise.all(escrituras);
}

/** Estrella, etiquetas y/o notas: lo único que edita el trabajador a mano. */
export async function actualizarContacto(env, waId, { estrella, etiquetas, notas }) {
  const hoja = hojaContactos(env);
  const numeroFila = await filaDeContacto(env, waId);
  if (numeroFila === -1) throw new Error(`El contacto ${waId} no existe en "${hoja}".`);

  const escrituras = [];
  if (estrella !== undefined) escrituras.push(updateValues(env, `${hoja}!C${numeroFila}:C${numeroFila}`, [[estrella]]));
  if (etiquetas !== undefined) escrituras.push(updateValues(env, `${hoja}!D${numeroFila}:D${numeroFila}`, [[etiquetas]]));
  if (notas !== undefined) escrituras.push(updateValues(env, `${hoja}!F${numeroFila}:F${numeroFila}`, [[notas]]));
  await Promise.all(escrituras);
}

/** Todos los contactos, el más reciente primero. Para la lista del panel. */
export async function listarContactos(env) {
  const filas = await getValues(env, `${hojaContactos(env)}!A2:G`);
  return filas
    .filter((f) => f[0])
    .map((f) => ({
      waId: f[0],
      nombre: f[1] || "",
      estrella: f[2] === true || f[2] === "TRUE",
      etiquetas: f[3] || "",
      ultimaActividad: f[4] || "",
      notas: f[5] || "",
      ultimoMensaje: f[6] || ""
    }))
    .sort((a, b) => (b.ultimaActividad || "").localeCompare(a.ultimaActividad || ""));
}

/** La conversación completa con un wa_id, en orden cronológico. */
export async function listarMensajesDe(env, waId) {
  const filas = await getValues(env, `${hojaMensajes(env)}!A2:H`);
  return filas
    .filter((f) => f[2] === waId)
    .map((f) => ({
      fecha: f[0],
      direccion: f[1],
      waId: f[2],
      nombre: f[3] || "",
      tipo: f[4],
      texto: f[5] || "",
      messageId: f[6] || "",
      worker: f[7] || ""
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

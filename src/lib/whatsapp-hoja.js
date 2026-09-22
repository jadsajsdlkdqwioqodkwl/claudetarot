/**
 * Esquema de las dos pestañas del CRM de WhatsApp. Se crean a mano en el
 * mismo libro que "Pedidos" y "Ventas" — el Worker solo escribe filas, no
 * crea pestañas ni encabezados.
 *
 * "WSP_Mensajes" es el log crudo: una fila por mensaje, entrante o saliente,
 * sin formato ni columnas calculadas. No es para que lo lea una persona —
 * es la materia prima para, más adelante, dársela a un LLM (resumen de
 * conversación, detección de intención, lo que haga falta). Por eso no
 * intenta ser bonito.
 *
 * "WSP_Contactos" es una fila por wa_id, con lo que sí edita un humano:
 * la estrella, las etiquetas, notas. El Worker la actualiza sola en
 * Nombre y Última actividad; nunca toca Estrella/Etiquetas/Notas una vez
 * que existen, para no pisar lo que el vendedor ya escribió ahí.
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
  "Notas"
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

/**
 * Crea el contacto si no existe, o le actualiza Nombre y Última actividad
 * si ya existe. Nunca toca Estrella, Etiquetas ni Notas: esas son del
 * trabajador.
 */
export async function upsertContacto(env, { waId, nombre, fecha }) {
  const hoja = hojaContactos(env);
  const columnaA = await getValues(env, `${hoja}!A:A`);

  let indiceFila = -1;
  for (let i = 1; i < columnaA.length; i++) {
    if (columnaA[i]?.[0] === waId) {
      indiceFila = i;
      break;
    }
  }

  if (indiceFila === -1) {
    await appendRow(env, [waId, nombre || "", "", "", fecha, ""], hoja);
    return;
  }

  const numeroFila = indiceFila + 1; // filas de Sheets son 1-based
  if (nombre) {
    await updateValues(env, `${hoja}!B${numeroFila}:B${numeroFila}`, [[nombre]]);
  }
  await updateValues(env, `${hoja}!E${numeroFila}:E${numeroFila}`, [[fecha]]);
}

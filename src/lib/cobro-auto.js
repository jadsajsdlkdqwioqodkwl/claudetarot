/**
 * Respuesta automática de cobro (dueño, 2026-11-04). Después de la boleta, el cliente de provincia con saldo pendiente
 * escribe «¿cuánto es mi saldo?», «el yape?», «mi clave» o toca un botón del recordatorio de recojo: antes una persona
 * tenía que contestar a mano; ahora sale sola la respuesta rápida «Cobro» (ajuste `cobro_rapida_id`, por defecto la 116)
 * con el saldo del cliente y el número de Yape (ajuste `yape_numero`) puestos en el texto.
 *
 * Solo si: el chat tiene la etiqueta cobro_3x y no saldo_pagado, el saldo del contacto es > 0, el chat no está en pausa,
 * el ajuste `cobro_auto` no está en 0, y no salió ya una respuesta de estas en las últimas 6 h. Nunca manda la clave de
 * retiro (shalom_code): esa la manda una persona cuando confirma el pago.
 */
import { mandarTexto, pausaEnvio } from "./crm-send.js";
import { obtenerAjuste } from "./crm-db.js";

export const ORIGEN_COBRO_AUTO = "Automático (cobro: saldo y Yape)";
const RE_SALDO = /\b(saldo|yape|yapear|yapeo|yapeé|yapee|plin|cu[aá]nto (debo|falta|es|pago|abono|le debo)|clave|c[oó]digo de retiro|retirar|recoger|recojo|abonar|abono|pagar|pago|monto|deuda|restante)\b/i;

export const pareceConsultaDeSaldo = (texto) => RE_SALDO.test(String(texto || ""));

export async function respuestaCobroSiAplica(env, conversationId, waId, texto) {
  if (!pareceConsultaDeSaldo(texto)) return false;
  const db = env.CRM_DB;
  const r = await db.prepare(
    "SELECT conv.pausa_auto, conv.meta_tags, c.saldo FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?"
  ).bind(conversationId).first();
  if (!r || r.pausa_auto) return false;
  const tags = ` ${r.meta_tags || ""} `;
  if (!tags.includes(" cobro_3x ") || tags.includes(" saldo_pagado ")) return false;
  const saldo = Number(String(r.saldo || "").replace(/[^\d.]/g, ""));
  if (!(saldo > 0)) return false;
  if ((await obtenerAjuste(db, "cobro_auto")) === "0") return false;
  const reciente = await db.prepare(
    "SELECT 1 FROM messages WHERE conversation_id = ? AND direction = 'out' AND sent_by = ? AND created_at >= datetime('now', '-6 hours') LIMIT 1"
  ).bind(conversationId, ORIGEN_COBRO_AUTO).first();
  if (reciente) return false;
  const rapidaId = Number(await obtenerAjuste(db, "cobro_rapida_id")) || 116;
  const q = await db.prepare("SELECT body FROM quick_replies WHERE id = ?").bind(rapidaId).first().catch(() => null);
  if (!q?.body) return false;
  const yape = String((await obtenerAjuste(db, "yape_numero")) || "927633099").trim();
  const montoTexto = Number.isInteger(saldo) ? String(saldo) : saldo.toFixed(2).replace(/\.?0+$/, "");
  const cuerpo = q.body
    .replace(/S\/\s*\d+(?:[.,]\d+)?/g, `S/${montoTexto}`)
    .replace(/\b9\d{8}\b/g, yape)
    .replace(/\{saldo\}/gi, montoTexto)
    .replace(/\{yape\}/gi, yape);
  await pausaEnvio(env, conversationId); // «escribiendo…» 1,5 s, como todo texto a un cliente
  await mandarTexto(env, conversationId, waId, cuerpo, ORIGEN_COBRO_AUTO);
  return true;
}

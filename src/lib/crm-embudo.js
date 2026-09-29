/**
 * Etapa del embudo de cada chat, calculada en el Worker sin IA (cron de 15 min).
 * Mismas reglas que scripts/asesor/embudo.py, para que el CRM y el informe
 * del director CRO cuenten igual:
 *
 *   1 escribió            el cliente escribió (aunque sea el saludo del anuncio)
 *   2 conversó            escribió algo más que el saludo
 *   3 dijo destino        dijo Lima/distrito o provincia (o la vendedora ya le dio la opción de envío)
 *   4 le pidieron cierre  la vendedora pidió ubicación (Lima) o adelanto (provincia)
 *   5 cerró               quedó agendado / mandó adelanto + datos, o tiene la etiqueta purchase
 *
 * La etapa nunca baja: es la más alta a la que llegó el chat en los últimos
 * DIAS_EMBUDO días. Sirve para medir las pruebas de mensajes (¿el chat avanzó
 * después de esta versión?) y para el resumen semanal.
 */

export const RE_AUTO = /autom[aá]tic|masivo|carrito|prueba de bienvenida/i;
export const RE_SALUDO = /^¡?hola!? me gustar[ií]a m[aá]s informaci[oó]n\.?$/i;
const RE_DESTINO = /lima|provincia|para (lima|provincia)|le podemos enviar mediante|para .{3,25} le podemos hacer envio/i;
const RE_PIDE_CIERRE = /ubicaci[oó]n|qui[eé]n lo va a recibir|confirma(r)? (el|la) (pago|captura|adelanto)|adelanto/i;
export const RE_CERRO = /queda(do)? (todo )?agendad|le estamos enviando el comprobante|le env[ií]o el comprobante|su clave es|mañana mismo le estamos enviando/i;

const DIAS_EMBUDO = 14;
const LOTE = 40;

/**
 * mensajes: [{ direction: "in"|"out", body, sent_by }] en orden.
 * Devuelve 0 si el cliente no escribió nada.
 */
export function calcularEtapa(mensajes, metaTags = "") {
  const cli = mensajes.filter((m) => m.direction === "in");
  const humanos = mensajes.filter((m) => m.direction === "out" && !RE_AUTO.test(m.sent_by || ""));
  const textoC = cli.map((m) => m.body || "").join("\n");
  const textoV = humanos.map((m) => m.body || "").join("\n");
  let etapa = cli.length ? 1 : 0;
  if (cli.length && !cli.every((m) => RE_SALUDO.test(String(m.body || "").trim()))) etapa = 2;
  if (etapa >= 2 && (RE_DESTINO.test(textoC) || RE_DESTINO.test(textoV))) etapa = 3;
  if (etapa >= 2 && RE_PIDE_CIERRE.test(textoV)) etapa = 4;
  if (RE_CERRO.test(textoV) || /\bpurchase\b/.test(metaTags || "")) etapa = 5;
  return etapa;
}

/**
 * Recalcula la etapa de los chats que se movieron desde la última pasada.
 * Tres llamadas a D1 en total (chats, sus mensajes con un IN, y un batch con
 * los cambios): el plan gratis corta en 50 consultas por ejecución y un
 * SELECT por chat no escalaba.
 */
export async function actualizarEtapas(env) {
  if (!env.CRM_DB) return;
  const { results: convs } = await env.CRM_DB.prepare(
    `SELECT id, etapa, meta_tags FROM conversations
     WHERE last_message_at >= datetime('now', ?)
       AND (etapa_revisada_at IS NULL OR last_message_at > etapa_revisada_at
            OR (COALESCE(meta_tags, '') LIKE '%purchase%' AND etapa < 5))
     ORDER BY last_message_at DESC LIMIT ?`
  ).bind(`-${DIAS_EMBUDO} days`, LOTE).all();
  if (!convs.length) return;

  const marcas = convs.map(() => "?").join(",");
  const { results: mensajes } = await env.CRM_DB.prepare(
    `SELECT conversation_id, direction, body, sent_by FROM messages
     WHERE conversation_id IN (${marcas}) AND created_at >= datetime('now', ?) ORDER BY id ASC`
  ).bind(...convs.map((c) => c.id), `-${DIAS_EMBUDO} days`).all();
  const porConv = {};
  for (const m of mensajes) (porConv[m.conversation_id] ||= []).push(m);

  await env.CRM_DB.batch(convs.map((c) => {
    const nueva = Math.max(calcularEtapa(porConv[c.id] || [], c.meta_tags), c.etapa || 0);
    return nueva > (c.etapa || 0)
      ? env.CRM_DB.prepare("UPDATE conversations SET etapa = ?, etapa_at = datetime('now'), etapa_revisada_at = datetime('now') WHERE id = ?").bind(nueva, c.id)
      : env.CRM_DB.prepare("UPDATE conversations SET etapa_revisada_at = datetime('now') WHERE id = ?").bind(c.id);
  }));
}

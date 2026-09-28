/**
 * Carrito abandonado: un recordatorio automático, uno solo, al cliente que se
 * quedó callado justo cuando la vendedora le pidió lo último para cerrar —
 * la ubicación (Lima) o el adelanto (provincia). Sin IA: el texto sale de una
 * plantilla fija con su nombre, así que no gasta ningún crédito.
 *
 * Apagado por defecto. Se enciende con CARRITO_AUTO_HORAS (wrangler.jsonc →
 * vars): horas de silencio del cliente antes de escribirle. Corre en el cron
 * de 5 min, antes de mandar los seguimientos: solo agenda una fila en
 * scheduled_messages y el mismo cron la manda en esa pasada, así queda visible
 * en el panel y se cancela sola si el cliente escribe antes.
 *
 * Por qué no arriesga el número:
 *   - Solo dentro de la ventana de 24 h (texto libre, nunca plantilla de
 *     marketing): el cliente nos escribió hace menos de 22 h.
 *   - Solo a quien ya estaba cerrando: la vendedora le pidió ubicación o pago.
 *   - Uno por chat cada 7 días, nunca si hay otro seguimiento pendiente, si
 *     el chat ya tiene la etiqueta de venta o si ya se agendó/despachó.
 *   - Nunca si el último mensaje es del cliente: ahí le toca responder a una
 *     persona, y eso lo avisa el asesor por Telegram.
 */

const AUTOR = "Carrito abandonado";

// Lo que la vendedora pide para cerrar. Salen de sus respuestas rápidas.
const RE_PIDE_UBICACION = /ubicaci[oó]n|qui[eé]n lo va a recibir|direcci[oó]n/i;
const RE_PIDE_PAGO = /confirma(r|ci[oó]n)? (el|la|de su) (pago|captura|adelanto)|adelanto|yape|shalom|olva|agencia|\bdni\b/i;
// Si después de eso ya se cerró, no hay carrito que recuperar.
const RE_YA_CERRADO = /queda(do)? (todo )?agendad|comprobante|clave de (retiro|recojo)|su clave es/i;
// Mensajes del sistema, no de una persona.
const RE_AUTOMATICO = /autom[aá]tic|masivo|carrito/i;

const MENSAJES = {
  lima:
    "Hola{nombre} 😊 ¿Te agendo tu Kit Tarot para mañana? Solo envíame tu ubicación 📍 y el teléfono de quien recibe, " +
    "y el motorizado te lo lleva de 12 a 5 pm. Pagas al recibir ✨",
  provincia:
    "Hola{nombre} 😊 ¿Te separo tu Kit Tarot? Con el adelanto de S/20 al Yape 927633099 (Moisés O.) lo despachamos mañana " +
    "por Shalom u Olva y el resto lo pagas al recoger ✨"
};

function primerNombre(nombre) {
  const primer = String(nombre || "").trim().split(/\s+/)[0] || "";
  return /^[\p{L}]{2,20}$/u.test(primer) ? " " + primer.charAt(0).toUpperCase() + primer.slice(1).toLowerCase() : "";
}

export function armarMensajeCarrito(plantilla, nombre) {
  return plantilla.replace(/\{nombre\}/g, primerNombre(nombre));
}

/**
 * Mira lo que mandó el equipo después del último mensaje del cliente y dice
 * qué le falta para cerrar: "lima", "provincia" o null (nada que recuperar).
 */
export function queLeFalta(salientesDespues) {
  const humanos = salientesDespues.filter((m) => !RE_AUTOMATICO.test(m.sent_by || ""));
  const texto = humanos.map((m) => m.body || "").join("\n");
  if (!texto || RE_YA_CERRADO.test(texto)) return null;
  if (RE_PIDE_PAGO.test(texto)) return "provincia";
  if (RE_PIDE_UBICACION.test(texto)) return "lima";
  return null;
}

export async function agendarCarritosAbandonados(env) {
  const horas = Number(env.CARRITO_AUTO_HORAS);
  if (!env.CRM_DB || !(horas >= 1 && horas <= 20)) return;

  const { results } = await env.CRM_DB.prepare(
    `SELECT conv.id, conv.last_inbound_at, COALESCE(c.name, c.profile_name) AS nombre
     FROM conversations conv
     JOIN contacts c ON c.id = conv.contact_id
     WHERE conv.last_inbound_at IS NOT NULL
       AND datetime(conv.last_inbound_at) <= datetime('now', ?1)
       AND datetime(conv.last_inbound_at) > datetime('now', '-22 hours')
       AND instr(' ' || COALESCE(conv.meta_tags, '') || ' ', ' purchase ') = 0
       AND NOT EXISTS (SELECT 1 FROM scheduled_messages s WHERE s.conversation_id = conv.id
                       AND (s.status = 'pendiente'
                            OR (s.created_by = ?2 AND datetime(s.created_at) > datetime('now', '-7 days'))))
       AND (SELECT m2.direction FROM messages m2 WHERE m2.conversation_id = conv.id
            ORDER BY m2.id DESC LIMIT 1) = 'out'
     LIMIT 30`
  )
    .bind(`-${horas} hours`, AUTOR)
    .all();

  for (const r of results) {
    const { results: salientes } = await env.CRM_DB.prepare(
      `SELECT body, sent_by FROM messages
       WHERE conversation_id = ? AND direction = 'out' AND datetime(created_at) >= datetime(?)
       ORDER BY id`
    )
      .bind(r.id, r.last_inbound_at)
      .all();
    const falta = queLeFalta(salientes);
    if (!falta) continue;

    const plantilla = falta === "lima" ? env.CARRITO_MENSAJE_LIMA || MENSAJES.lima : env.CARRITO_MENSAJE_PROVINCIA || MENSAJES.provincia;
    await env.CRM_DB.prepare(
      "INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by) VALUES (?, ?, datetime('now'), ?)"
    )
      .bind(r.id, armarMensajeCarrito(plantilla, r.nombre), AUTOR)
      .run();
  }
}

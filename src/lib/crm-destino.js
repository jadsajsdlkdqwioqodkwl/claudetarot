/**
 * ¿El chat es de Lima o de provincia? ¿Y el mensaje? Sin IA, por las frases
 * que ya usa el equipo. Sirve para que un envío a varios chats (sugerencia de
 * respuesta rápida con destinatarios) nunca le pida el adelanto de Shalom a
 * alguien de Lima, ni la ubicación para el motorizado a alguien de provincia.
 *
 * Gana la ÚLTIMA señal del chat: si dijo "Lima" y después "estoy en
 * provincia", es provincia. "¿Lima o provincia?" (la pregunta) no cuenta.
 */

const DISTRITOS = "smp|san martin de porres|san juan de (lurigancho|miraflores)|sjl|sjm|los olivos|comas|callao|surco|santiago de surco|" +
  "miraflores|chorrillos|\\bate\\b|villa el salvador|ves|villa maria del triunfo|vmt|puente piedra|carabayllo|independencia|" +
  "la molina|san borja|jesus maria|lince|bre[nñ]a|r[ií]mac|el agustino|santa anita|lur[ií]n|pachac[aá]mac|barranco|" +
  "magdalena|pueblo libre|san miguel|surquillo|la victoria|cercado|bellavista|ventanilla|san isidro|chaclacayo|chosica";

const RE_LIMA = new RegExp(
  `para lima|en lima\\b|motorizado|ubicaci[oó]n|12 ?(pm)? a 5|de 12 a 5|contra ?entrega al recibir|(^|\\W)lima(\\W|$)|${DISTRITOS}`, "i"
);
const RE_PROVINCIA = /shalom|olva|agencia|provincia|adelanto|s\/ ?20\b|20 soles/i;
const RE_PREGUNTA = /lima o provincia/i;

const quitarTildes = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** 'lima' | 'provincia' | null, según la última señal de los mensajes (en orden). */
export function destinoDeChat(mensajes) {
  let destino = null;
  for (const m of mensajes) {
    const t = quitarTildes(m.body);
    if (!t || RE_PREGUNTA.test(t)) continue;
    const lima = RE_LIMA.test(t);
    const prov = RE_PROVINCIA.test(t);
    if (lima && !prov) destino = "lima";
    else if (prov && !lima) destino = "provincia";
  }
  return destino;
}

/** A quién va dirigido un texto: 'lima' | 'provincia' | null (sirve para los dos). */
export function destinoDeTexto(texto) {
  const t = quitarTildes(texto);
  const lima = /motorizado|ubicaci[oó]n|12 ?(pm)? a 5|de 12 a 5|al recibir/i.test(t);
  const prov = /shalom|olva|agencia|adelanto|s\/ ?20\b|20 soles|al recoger/i.test(t);
  if (lima && !prov) return "lima";
  if (prov && !lima) return "provincia";
  return null;
}

/**
 * Para cada chat, su destino. Una sola consulta (tope de 50 por ejecución).
 * Devuelve { [conversation_id]: 'lima' | 'provincia' | null }.
 */
export async function destinosDeChats(db, conversationIds) {
  const ids = [...new Set(conversationIds.map(Number).filter(Boolean))].slice(0, 90);
  if (!ids.length) return {};
  const { results } = await db.prepare(
    `SELECT conversation_id, body FROM messages
     WHERE conversation_id IN (${ids.map(() => "?").join(",")}) AND type = 'text' AND body IS NOT NULL
       AND created_at >= datetime('now', '-14 days')
       AND COALESCE(sent_by, '') NOT LIKE '%utom%tic%' AND COALESCE(sent_by, '') NOT LIKE '%masivo%'
     ORDER BY id`
  ).bind(...ids).all();
  const porConv = {};
  for (const m of results) (porConv[m.conversation_id] ||= []).push(m);
  const salida = {};
  for (const id of ids) salida[id] = destinoDeChat(porConv[id] || []);
  return salida;
}

/** ¿Este texto le sirve a este chat? (false solo si es claramente del otro destino). */
export function textoSirvePara(texto, destinoChat) {
  const paraQuien = destinoDeTexto(texto);
  return !paraQuien || !destinoChat || paraQuien === destinoChat;
}

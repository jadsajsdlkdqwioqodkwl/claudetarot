/**
 * Que las sugerencias no se acumulen: una sugerencia para un chat deja de
 * tener sentido en cuanto una persona del equipo le escribe al cliente (a mano,
 * una respuesta rápida u otra sugerencia; los automáticos NO la cierran desde el
 * 2026-11-04), o si el cliente ya compró. Las que quedaron con la ventana de 24 h cerrada NO se cierran: siguen en la cola «Atención
 * pendiente» para que la asesora evalúe mandarles una plantilla (2026-10-18). Se cierran solas (estado
 * 'obsoleta', con el motivo en resuelto_por) antes de listar o contar.
 * Dos UPDATE en un batch; nada de IA.
 * Y el cron (sugerirSinPregunta) propone «agéndale seguimiento o hazle una pregunta» cuando el último mensaje
 * nuestro no tiene pregunta y el chat no tiene nada programado (2026-10-23).
 */
import { proponerPlanPorVentanaCerrada } from "./planes-plantilla.js";
import { enSilencio } from "./horario.js";

/**
 * Un seguimiento que cuenta como «tiene seguimiento» para la recomendación sin pregunta. El rescate universal
 * (día 7 y «Rescate de interesado») no cuenta: está agendado a casi todos los leads, sin importar la conversación.
 */
const SEGUIMIENTO_PROPIO = "instr(sm.created_by, 'Automático (día 7)') = 0 AND instr(sm.created_by, 'Rescate de interesado') = 0";

/**
 * Lo escribió una PERSONA del equipo (una cuenta del CRM). Los automáticos (seguimientos, envío masivo, planes con
 * plantilla, toques, boletas, bienvenida) no cuentan: desde que casi todos los chats tienen un plan corriendo,
 * cerraban las recomendaciones del asesor antes de que nadie las viera (2026-11-04).
 */
const ESCRITO_POR_PERSONA = (m) => `${m}.sent_by IN (SELECT display_name FROM agents UNION SELECT username FROM agents)`;

/**
 * Lo que sale solo y NO es una respuesta al cliente: plantillas, planes de seguimiento, seguimientos automáticos,
 * envíos masivos y toques. Sí cuentan como respuesta lo que escribe el equipo, la bienvenida (contesta su saludo),
 * las boletas y los automáticos que contestan un botón (dueño, 2026-11-06).
 */
const NO_ES_RESPUESTA = (m) => `(${m}.type = 'template' OR substr(COALESCE(${m}.sent_by, ''), 1, 5) IN ('Plan ', 'Toque')
  OR substr(COALESCE(${m}.sent_by, ''), 1, 11) = 'Seguimiento' OR substr(COALESCE(${m}.sent_by, ''), 1, 12) = 'Envío masivo')`;

/**
 * «Falta respuesta» (SQL; `conv` = alias de conversations): el cliente escribió, nadie le contestó después y nadie
 * marcó «Ya respondí» (atendido_at). Desde el 2026-11-06 un seguimiento automático que salió después de su mensaje
 * NO cuenta como respuesta (antes la etiqueta se apagaba sola con cualquier plantilla del plan); eso aplica a lo
 * que escribió en los últimos 3 días; en chats más viejos sigue la regla de antes (cualquier salida lo apaga), para
 * no llenar de etiquetas los leads viejos que recibieron un envío masivo.
 * Desde el 2026-11-12 ya no es condición para reflotar una recomendación: solo le da prioridad (reflotarSugerencia).
 */
export const FALTA_RESPUESTA = (conv) => `(${conv}.last_inbound_at IS NOT NULL
  AND (${conv}.atendido_at IS NULL OR ${conv}.atendido_at < ${conv}.last_inbound_at)
  AND NOT EXISTS (SELECT 1 FROM messages mr WHERE mr.conversation_id = ${conv}.id AND mr.direction = 'out' AND mr.created_at >= ${conv}.last_inbound_at
                  AND (${conv}.last_inbound_at < datetime('now', '-3 days') OR NOT ${NO_ES_RESPUESTA("mr")})))`;

/** Un texto con un celular peruano (9 dígitos que empiezan con 9; acepta espacios). Para SQL. */
export const TIENE_CELULAR = (col) => `replace(replace(COALESCE(${col}, ''), ' ', ''), '-', '') GLOB '*9[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]*'`;

/**
 * Venta sin teléfono (dueño, 2026-11-13): cuando se marca la compra de un cliente que escribe con nombre de usuario de WhatsApp
 * (sin número: su id no es un teléfono) y que no escribió ningún celular en el chat, queda una recomendación «dato_envio» para la
 * vendedora: pedirle el celular (el courier de Lima y Shalom lo necesitan). Sube a la bandeja como las demás y se cierra sola
 * cuando el cliente escribe un celular. Nunca le escribe al cliente: la manda una persona.
 */
export async function sugerirTelefonoDeVenta(db, conversationId) {
  const c = await db.prepare(
    `SELECT ct.wa_id, COALESCE(ct.name, ct.profile_name, '') AS nombre,
       EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = conv.id AND m.direction = 'in' AND ${TIENE_CELULAR("m.body")}) AS dio_celular,
       EXISTS (SELECT 1 FROM asesor_sugerencias s WHERE s.conversation_id = conv.id AND s.tipo = 'dato_envio' AND s.estado = 'pendiente') AS ya
     FROM conversations conv JOIN contacts ct ON ct.id = conv.contact_id WHERE conv.id = ?`
  ).bind(conversationId).first();
  if (!c || c.ya || c.dio_celular) return false;
  if (/^\d{8,15}$/.test(String(c.wa_id || ""))) return false; // escribe con su número: ese es el teléfono
  await db.prepare(
    `INSERT INTO asesor_sugerencias (tipo, conversation_id, wa_id, nombre, texto, texto_original, motivo, origen)
     VALUES ('dato_envio', ?, ?, ?, ?, ?, ?, 'cron (venta sin teléfono)')`
  ).bind(conversationId, c.wa_id, String(c.nombre).slice(0, 80),
    "Muchas gracias estimad@ ☺️ ¿Me indica por favor un número de celular para su envío? Así el courier le avisa al llegar 📦",
    "Muchas gracias estimad@ ☺️ ¿Me indica por favor un número de celular para su envío? Así el courier le avisa al llegar 📦",
    "Venta sin teléfono: el cliente escribe con nombre de usuario de WhatsApp (sin número) y no dio un celular. Pídeselo: el courier lo necesita.").run();
  return true;
}

export async function limpiarSugerenciasViejas(db, env = null) {
  // Con `env`, lo que vence por ventana cerrada se reemplaza por un plan con plantilla por aprobar.
  if (env) await proponerPlanPorVentanaCerrada(env).catch((err) => console.error("Plan por ventana cerrada:", err.message));
  await db.batch([
    db.prepare(
      `UPDATE asesor_sugerencias SET estado = 'obsoleta', resuelto_por = 'se le escribió al cliente', resuelto_at = datetime('now')
       WHERE estado = 'pendiente' AND tipo IN ('seguimiento', 'envio', 'sin_pregunta') AND conversation_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = asesor_sugerencias.conversation_id
                     AND m.direction = 'out' AND m.created_at > asesor_sugerencias.created_at AND ${ESCRITO_POR_PERSONA("m")}
                     -- Una plantilla no la cierra (2026-11-07): con la ventana cerrada se manda la plantilla y la
                     -- recomendación queda esperando que el cliente conteste para mandar su texto.
                     AND m.type <> 'template')`
    ),
    // «Sin pregunta»: ya no hace falta cuando el chat tiene un seguimiento programado.
    db.prepare(
      `UPDATE asesor_sugerencias SET estado = 'obsoleta', resuelto_por = 'ya tiene seguimiento', resuelto_at = datetime('now')
       WHERE estado = 'pendiente' AND tipo = 'sin_pregunta'
         AND EXISTS (SELECT 1 FROM scheduled_messages sm WHERE sm.conversation_id = asesor_sugerencias.conversation_id
                     AND sm.status IN ('pendiente', 'por_aprobar') AND ${SEGUIMIENTO_PROPIO})`
    ),
    // «Falta un dato» (dato_envio): se cierra cuando el cliente ya escribió un celular (9 dígitos que empiezan con 9) después.
    db.prepare(
      `UPDATE asesor_sugerencias SET estado = 'obsoleta', resuelto_por = 'el cliente ya dio su celular', resuelto_at = datetime('now')
       WHERE estado = 'pendiente' AND tipo = 'dato_envio' AND motivo LIKE 'Venta sin teléfono%'
         AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = asesor_sugerencias.conversation_id AND m.direction = 'in'
                     AND m.created_at > asesor_sugerencias.created_at AND ${TIENE_CELULAR("m.body")})`
    ),
    db.prepare(
      `UPDATE asesor_sugerencias SET estado = 'obsoleta', resuelto_por = 'ya compró', resuelto_at = datetime('now')
       WHERE estado = 'pendiente' AND tipo = 'seguimiento'
         AND conversation_id IN (SELECT id FROM conversations WHERE etapa >= 5)`
    )
  ]);
}

/**
 * Cada 10 min (cron) sube a la bandeja UNA recomendación pendiente del asesor, y cada recomendación sube UNA sola vez
 * (`reflotada_at`). Dentro del chat se ve el mensaje recomendado, editable, con «Enviar», «Ya respondí» y «Descartar».
 * No sube de madrugada (horario de envío). Devuelve los ids reflotados.
 * Historia: 2026-10-17 subían hasta 3 por pasada y volvían a subir cada 3 h; 2026-11-06 solo por FALTA DE RESPUESTA
 * (casi ninguna subía: 47 de 48 eran de clientes que callaron). Dueño, 2026-11-12: «nadie abre la estrellita; las
 * recomendaciones deben reflotarse en el chat, una cada 10 minutos, una sola vez; la asesora manda el mensaje o marca
 * que ya se envió y ya está». Orden: primero los chats a los que les falta respuesta (FALTA_RESPUESTA), luego los de
 * ventana de 24 h abierta (el texto sale gratis) y, entre iguales, la recomendación más antigua (solo las de 3 días).
 * Si ya se le mandó la plantilla (2026-11-07), espera: sube solo cuando el cliente escribe DESPUÉS de esa plantilla.
 */
const POR_PASADA = 1;
export async function reflotarSugerencia(env) {
  const db = env.CRM_DB;
  if (!db || enSilencio(Date.now(), env.HORARIO_ENVIO)) return [];
  await limpiarSugerenciasViejas(db).catch((err) => console.error("Limpiar sugerencias:", err.message));
  // «Sin pregunta» (dueño, 2026-11-06): APAGADO. Ajuste `sin_pregunta_auto` = 1 lo prende (y entonces también reflota,
  // solo con la ventana de 24 h abierta: es para escribirle ya).
  const sinPregunta = await db.prepare("SELECT value FROM crm_settings WHERE key = 'sin_pregunta_auto'").first().catch(() => null);
  if (sinPregunta?.value === "1") await sugerirSinPregunta(db).catch((err) => console.error("Sugerir sin pregunta:", err.message));
  const TIPO = sinPregunta?.value === "1"
    ? "(s.tipo IN ('seguimiento', 'dato_envio') OR (s.tipo = 'sin_pregunta' AND conv.last_inbound_at >= datetime('now', '-24 hours')))"
    : "s.tipo IN ('seguimiento', 'dato_envio')";
  const { results } = await db.prepare(
    `SELECT s.id, s.conversation_id FROM asesor_sugerencias s JOIN conversations conv ON conv.id = s.conversation_id
     WHERE s.estado = 'pendiente' AND ${TIPO} AND s.reflotada_at IS NULL AND conv.blocked = 0
       AND COALESCE(s.plantilla_enviada_at, s.created_at) >= datetime('now', '-3 days')
       AND (s.plantilla_enviada_at IS NULL OR conv.last_inbound_at > s.plantilla_enviada_at)
     ORDER BY CASE WHEN s.tipo = 'dato_envio' THEN 0 ELSE 1 END,
              CASE WHEN ${FALTA_RESPUESTA("conv")} THEN 0 ELSE 1 END,
              CASE WHEN conv.last_inbound_at >= datetime('now', '-24 hours') THEN 0 ELSE 1 END,
              s.created_at ASC, s.id ASC
     LIMIT ?`
  ).bind(POR_PASADA).all();
  if (!results.length) return [];
  await db.batch(results.flatMap((s) => [
    db.prepare("UPDATE asesor_sugerencias SET reflotada_at = datetime('now') WHERE id = ?").bind(s.id),
    db.prepare("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?").bind(s.conversation_id)
  ]));
  return results.map((s) => s.conversation_id);
}

/**
 * Último mensaje nuestro de un chat activo SIN pregunta (ni «?» ni «¿»), sin nada programado y sin una
 * sugerencia ya hecha para ese mensaje: se propone «agéndale seguimiento o hazle una pregunta». Lo sube
 * reflotarSugerencia. Solo chats dentro de la ventana de 24 h y de clientes que todavía no compraron.
 */
export async function sugerirSinPregunta(db) {
  const { results } = await db.prepare(
    `SELECT conv.id AS conversation_id FROM conversations conv
     JOIN messages m ON m.id = (SELECT MAX(id) FROM messages WHERE conversation_id = conv.id)
     WHERE m.direction = 'out' AND m.type = 'text' AND m.body IS NOT NULL AND m.body <> '' AND ${ESCRITO_POR_PERSONA("m")}
       AND m.body NOT LIKE '%?%' AND m.body NOT LIKE '%¿%'
       AND conv.blocked = 0 AND COALESCE(conv.etapa, 0) < 5
       AND conv.last_inbound_at >= datetime('now', '-24 hours')
       AND NOT EXISTS (SELECT 1 FROM scheduled_messages sm WHERE sm.conversation_id = conv.id AND sm.status IN ('pendiente', 'por_aprobar') AND ${SEGUIMIENTO_PROPIO})
       AND NOT EXISTS (SELECT 1 FROM asesor_sugerencias s WHERE s.conversation_id = conv.id AND s.tipo = 'sin_pregunta' AND s.created_at >= m.created_at)
     LIMIT 50`
  ).all();
  if (!results.length) return 0;
  const motivo = "Tu último mensaje no tenía pregunta y el chat no tiene seguimiento: agéndale seguimiento o hazle una pregunta.";
  await db.batch(results.map((r) => db.prepare(
    "INSERT INTO asesor_sugerencias (tipo, conversation_id, texto, motivo, origen) VALUES ('sin_pregunta', ?, '', ?, 'cron (sin pregunta)')"
  ).bind(r.conversation_id, motivo)));
  return results.length;
}

/**
 * La recomendación del asesor pendiente de un chat (el banner del chat y `/api/asesor/chat`): la última de tipo
 * «seguimiento», con `ventana_abierta` (si el texto todavía puede salir) y, con la ventana cerrada, las plantillas aprobadas
 * para mandarla igual. Una sola función para el CRM y para el asesor, así se prueba y se depura desde afuera (dueño, 6/11).
 * `listar(env, conversationId)` → plantillas aprobadas [{ name, language, texto }] (inyectado para no depender de Meta en pruebas).
 */
export async function recomendacionDeChat(db, conversationId, listar = null) {
  await limpiarSugerenciasViejas(db).catch(() => {});
  const s = await db.prepare(
    `SELECT s.id, s.texto, s.motivo, s.objecion, s.origen, s.pasos, s.idea, s.created_at, s.reflotada_at, conv.last_inbound_at
     FROM asesor_sugerencias s JOIN conversations conv ON conv.id = s.conversation_id
     WHERE s.estado = 'pendiente' AND s.tipo IN ('seguimiento', 'dato_envio') AND s.conversation_id = ?
     ORDER BY CASE WHEN s.tipo = 'dato_envio' THEN 0 ELSE 1 END, s.created_at DESC LIMIT 1`
  ).bind(conversationId).first();
  if (!s) return null;
  const parse = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
  const ventanaAbierta = Boolean(s.last_inbound_at) && new Date(String(s.last_inbound_at).replace(" ", "T") + "Z").getTime() + 24 * 3600 * 1000 > Date.now();
  const plantillas = !ventanaAbierta && listar ? await listar(conversationId).catch(() => []) : [];
  return { id: s.id, texto: s.texto, motivo: s.motivo, objecion: s.objecion, origen: s.origen, created_at: s.created_at, reflotada_at: s.reflotada_at,
    pasos: parse(s.pasos), idea: parse(s.idea), ventana_abierta: ventanaAbierta, plantillas };
}

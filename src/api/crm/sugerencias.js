/**
 * ✨ Sugerencias del asesor: lo que la Routine de Claude propone y una
 * persona aprueba. Nada sale al cliente sin pasar por aquí.
 *
 * GET  /api/crm/sugerencias — las pendientes (y cuántas hay).
 * POST /api/crm/sugerencias
 *   { id, accion: "descartar" }
 *   { id, accion: "aprobar", modo?: "ahora" | "programar", send_at?, texto?, titulo?, destinatarios?: [conversation_id] }
 *     · modo "ahora" → sale en este momento por WhatsApp.
 *     · modo "programar" → queda en scheduled_messages para `send_at` (o
 *       dentro de 1 minuto si no viene); sale por el cron de siempre y se
 *       cancela solo si el cliente escribe antes.
 *     · respuesta_rapida → se crea la respuesta rápida y, a cada destinatario
 *       elegido, se le manda o programa ese texto.
 *   Los chats con la ventana de 24 h cerrada no se programan: vuelven en
 *   `saltados` con el motivo, para que la vendedora use una plantilla.
 *
 * Tipo "variante" (solo admin): otra versión del texto de una respuesta
 * rápida o de un paso de la bienvenida. Aprobarla la mete en la prueba
 * (tabla `variantes`); no manda nada a nadie.
 *
 * Tipo "saldo" (quien maneja Shalom): el asesor vio la captura del pago del
 * saldo; aprobarla deja el saldo en 0 en la hoja (la página muestra la clave).
 *
 * Tipo "pregunta" (solo admin): el bot pregunta si puede ofrecer algo que
 * no está en docs/negocio.md. { id, accion: "responder", respuesta } guarda
 * la respuesta en asesor_memoria (la lee en la próxima corrida).
 *
 * Los seguimientos traen `objecion` (lo que probablemente frena al cliente)
 * e `idea` ({ titulo, texto }: otra opción para la próxima), que la
 * vendedora usa con un toque o ignora.
 *
 * Tipo "prueba_lista" (solo admin, la crea el cron): una prueba de mensajes
 * ya tiene ganadora (`titulo` = id de la versión, 0 = la original).
 * Aprobarla deja esa versión como el texto de siempre; descartarla sigue
 * probando.
 *
 * Tipo "envio" (link de seguimiento con la boleta de Shalom lista): solo lo
 * ve y lo manda el admin. Como la boleta sale días después, casi siempre la
 * ventana ya cerró: entonces "Enviar ahora" usa la plantilla utility de
 * PLANTILLA_ENVIO ({{1}} = nombre, {{2}} = link), si está configurada.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { fueraDeVentana } from "./scheduled.js";
import { mandarTexto, pausaEnvio } from "../../lib/crm-send.js";
import { limpiarSugerenciasViejas } from "../../lib/crm-sugerencias.js";
import { cancelarSeguimientosDeLead } from "../../lib/crm-db.js";
import { enviarTemplate } from "../../lib/whatsapp.js";
import { registrarMensajeSaliente, origenSugerencia } from "../../lib/crm-db.js";
import { normalizarPasos } from "../asesor.js";
import { cerrarPrueba } from "../../lib/crm-variantes.js";
import { manejaShalom } from "../../lib/ventas.js";
import { saldoPagado } from "./shalom.js";
import { destinosDeChats, textoSirvePara } from "../../lib/crm-destino.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const parsear = (texto) => {
  try {
    return JSON.parse(texto || "[]") || [];
  } catch {
    return [];
  }
};

const esAdmin = (agent) => !agent || agent.role === "admin";

async function get({ request, env, agent }) {
  // ?chat=<conversation_id>: los últimos mensajes de ese chat, para editar la
  // sugerencia viendo la conversación. No lo marca como leído.
  const chat = Number(new URL(request.url).searchParams.get("chat"));
  if (chat) {
    const { results: mensajes } = await env.CRM_DB.prepare(
      `SELECT id, direction, type, body, file_name, sent_by, created_at, (media_key IS NOT NULL OR media_id IS NOT NULL) AS tiene_media FROM messages
       WHERE conversation_id = ? ORDER BY id DESC LIMIT 20`
    ).bind(chat).all();
    return json({ mensajes: mensajes.reverse() });
  }
  // Las que ya no sirven (se le escribió, compró, ventana cerrada) se cierran solas.
  await limpiarSugerenciasViejas(env.CRM_DB).catch((err) => console.error("Limpiar sugerencias:", err.message));
  const { results } = await env.CRM_DB.prepare(
    `SELECT s.*, conv.assigned_agent, conv.last_inbound_at
     FROM asesor_sugerencias s LEFT JOIN conversations conv ON conv.id = s.conversation_id
     WHERE s.estado = 'pendiente' AND s.tipo != 'envio' AND (s.tipo NOT IN ('variante', 'prueba_lista', 'pregunta') OR ?1 = 1)
       AND (s.tipo != 'saldo' OR ?2 = 1)
     ORDER BY s.tipo DESC, s.created_at DESC LIMIT 200`
  ).bind(esAdmin(agent) ? 1 : 0, manejaShalom(agent, env) ? 1 : 0).all();
  // Las versiones propuestas llevan el texto actual al lado, para comparar.
  for (const s of results) {
    if (s.tipo !== "variante" && s.tipo !== "prueba_lista") continue;
    const ref = await env.CRM_DB.prepare(
      s.ref_tipo === "bienvenida" ? "SELECT title, body FROM welcome_steps WHERE id = ?" : "SELECT title, body FROM quick_replies WHERE id = ?"
    ).bind(s.ref_id).first();
    s.ref_titulo = ref ? `${s.ref_tipo === "bienvenida" ? "Bienvenida · " : ""}${ref.title}` : "(ya no existe)";
    s.ref_texto = ref?.body || "";
  }
  // Para el cronómetro: cuándo escribió por última vez cada destinatario de
  // una respuesta rápida (una consulta por cada 90 chats, tope de parámetros de D1).
  const lista = results.map((s) => ({ ...s, destinatarios: parsear(s.destinatarios), pasos: parsear(s.pasos), idea: s.idea ? parsear(s.idea) : null }));
  const ids = [...new Set(lista.flatMap((s) => (Array.isArray(s.destinatarios) ? s.destinatarios : []).map((d) => Number(d?.conversation_id)).filter(Boolean)))];
  const ultimo = {};
  for (let i = 0; i < ids.length && i < 450; i += 90) {
    const lote = ids.slice(i, i + 90);
    const { results: filas } = await env.CRM_DB.prepare(
      `SELECT id, last_inbound_at FROM conversations WHERE id IN (${lote.map(() => "?").join(",")})`
    ).bind(...lote).all();
    for (const f of filas) ultimo[f.id] = f.last_inbound_at;
  }
  for (const s of lista) {
    if (!Array.isArray(s.destinatarios)) continue;
    for (const d of s.destinatarios) if (d && typeof d === "object") d.last_inbound_at = ultimo[Number(d.conversation_id)] || null;
  }
  // Los seguimientos que ya tiene programados cada chat: se ven en la tarjeta
  // para no mandarle una sugerencia encima de otra cadena.
  const chats = [...new Set(lista.flatMap((s) => [s.conversation_id, ...(Array.isArray(s.destinatarios) ? s.destinatarios.map((d) => d?.conversation_id) : [])]).map(Number).filter(Boolean))];
  const pendientesDe = {};
  for (let i = 0; i < chats.length && i < 450; i += 90) {
    const lote = chats.slice(i, i + 90);
    const { results: filas } = await env.CRM_DB.prepare(
      `SELECT s.conversation_id, s.send_at, s.created_by, substr(COALESCE(s.body, q.body, s.catalogo_nombre, ''), 1, 160) AS texto
       FROM scheduled_messages s LEFT JOIN quick_replies q ON q.id = s.quick_reply_id
       WHERE s.status = 'pendiente' AND s.conversation_id IN (${lote.map(() => "?").join(",")}) ORDER BY s.send_at`
    ).bind(...lote).all();
    for (const f of filas) (pendientesDe[f.conversation_id] ||= []).push(f);
  }
  for (const s of lista) {
    if (s.conversation_id) s.seguimientos = pendientesDe[s.conversation_id] || [];
    if (Array.isArray(s.destinatarios)) for (const d of s.destinatarios) if (d && typeof d === "object") d.seguimientos = pendientesDe[Number(d.conversation_id)] || [];
  }
  return json({ pendientes: results.length, sugerencias: lista });
}

async function programar(env, conversationId, texto, quien, cuando) {
  const sendAt = cuando instanceof Date ? cuando : new Date(Date.now() + 60 * 1000);
  const error = await fueraDeVentana(env.CRM_DB, conversationId, sendAt);
  if (error) return error;
  if (cuando === "ahora") {
    const conv = await env.CRM_DB.prepare(
      "SELECT c.wa_id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?"
    ).bind(conversationId).first();
    if (!conv) return "No encontré el chat.";
    try {
      // Como todo lo que sale: "escribiendo…" 1,5 s y recién el mensaje.
      await pausaEnvio(env, conversationId);
      await mandarTexto(env, conversationId, conv.wa_id, texto, quien);
    } catch (err) {
      return `WhatsApp no lo aceptó: ${err.message}`;
    }
    return null;
  }
  await env.CRM_DB.prepare(
    "INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by) VALUES (?, ?, ?, ?)"
  )
    .bind(conversationId, texto, sendAt.toISOString(), origenSugerencia(quien))
    .run();
  return null;
}

/** Ventana cerrada: el link sale con la plantilla utility aprobada en Meta. */
async function conPlantilla(env, s, quien) {
  if (!env.PLANTILLA_ENVIO) {
    return "Pasaron más de 24 h y todavía no hay plantilla de envío aprobada (PLANTILLA_ENVIO): no se le puede escribir gratis.";
  }
  const conv = await env.CRM_DB.prepare(
    "SELECT c.wa_id FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?"
  ).bind(s.conversation_id).first();
  if (!conv) return "No encontré el chat.";
  const nombre = (s.nombre || "").split(/\s+/)[0] || "estimad@";
  try {
    const waMessageId = await enviarTemplate(env, conv.wa_id, env.PLANTILLA_ENVIO, "es", [nombre, s.titulo]);
    await registrarMensajeSaliente(env.CRM_DB, s.conversation_id, {
      waMessageId, type: "template", body: `Plantilla: ${env.PLANTILLA_ENVIO} · ${s.titulo}`, sentBy: quien
    });
    return null;
  } catch (err) {
    return `WhatsApp rechazó la plantilla: ${err.message}`;
  }
}

async function post({ request, env, agent }) {
  const payload = await request.json().catch(() => null);
  const id = Number(payload?.id);
  if (!id || !["aprobar", "descartar", "responder", "enviar_a"].includes(payload?.accion)) return json({ error: "Solicitud inválida." }, 400);

  const s = await env.CRM_DB.prepare("SELECT * FROM asesor_sugerencias WHERE id = ?").bind(id).first();
  if (!s) return json({ error: "Esa sugerencia ya no existe." }, 404);
  if (s.tipo === "envio" && !esAdmin(agent)) return json({ error: "Solo el admin maneja los envíos." }, 403);
  if ((s.tipo === "variante" || s.tipo === "prueba_lista" || s.tipo === "pregunta") && !esAdmin(agent)) return json({ error: "Solo el admin decide qué se prueba." }, 403);
  if (s.estado !== "pendiente") return json({ error: `Ya fue ${s.estado} por ${s.resuelto_por || "otra persona"}.` }, 409);

  const quien = agent?.displayName || agent?.username || "CRM";
  const cerrar = (estado) =>
    // 'obsoleta' también: si justo se limpió porque ESTE envío ya quedó en el chat.
    env.CRM_DB.prepare("UPDATE asesor_sugerencias SET estado = ?, resuelto_por = ?, resuelto_at = datetime('now') WHERE id = ? AND estado IN ('pendiente', 'obsoleta')")
      .bind(estado, quien, id)
      .run();

  if (payload.accion === "descartar") {
    await cerrar("descartada");
    return json({ ok: true });
  }

  // Sin envíos en bloque: una respuesta rápida propuesta para varios chats se
  // manda de a uno, después de que la vendedora abrió y leyó ese chat.
  if (payload.accion === "enviar_a") {
    if (s.tipo !== "respuesta_rapida") return json({ error: "Solicitud inválida." }, 400);
    const convId = Number(payload.conversation_id);
    const lista = parsear(s.destinatarios);
    const d = lista.find((x) => Number(x?.conversation_id) === convId);
    if (!d) return json({ error: "Ese chat no está en esta sugerencia." }, 404);
    if (d.enviado) return json({ error: `Ya se le mandó (${d.enviado_por || "otra persona"}).` }, 409);
    const texto = String(payload.texto ?? s.texto).trim().slice(0, 4096);
    if (!texto) return json({ error: "El mensaje está vacío." }, 400);
    const destino = (await destinosDeChats(env.CRM_DB, [convId]))[convId];
    if (!textoSirvePara(texto, destino)) return json({ error: `Este chat es de ${destino}: el mensaje es para el otro destino.` }, 422);
    await cancelarSeguimientosDeLead(env.CRM_DB, convId);
    const error = await programar(env, convId, texto, quien, "ahora");
    if (error) return json({ error }, 422);
    d.enviado = new Date().toISOString();
    d.enviado_por = quien;
    // Cuando ya se le mandó a todos los chats, la sugerencia se cierra sola.
    const quedan = lista.filter((x) => x && typeof x === "object" && !x.enviado).length;
    await env.CRM_DB.prepare(
      `UPDATE asesor_sugerencias SET destinatarios = ?, estado = CASE WHEN ? = 0 THEN 'aprobada' ELSE estado END,
         resuelto_por = CASE WHEN ? = 0 THEN ? ELSE resuelto_por END, resuelto_at = CASE WHEN ? = 0 THEN datetime('now') ELSE resuelto_at END
       WHERE id = ?`
    ).bind(JSON.stringify(lista), quedan, quedan, quien, quedan, id).run();
    return json({ ok: true, quedan });
  }

  if (s.tipo === "pregunta" || payload.accion === "responder") {
    const respuesta = String(payload.respuesta || "").trim().slice(0, 1000);
    if (s.tipo !== "pregunta" || !respuesta) return json({ error: "Escribe la respuesta." }, 400);
    await env.CRM_DB.batch([
      env.CRM_DB.prepare("UPDATE asesor_sugerencias SET estado = 'respondida', respuesta = ?, resuelto_por = ?, resuelto_at = datetime('now') WHERE id = ? AND estado = 'pendiente'")
        .bind(respuesta, quien, id),
      env.CRM_DB.prepare("INSERT INTO asesor_memoria (tema, nota, fuente) VALUES ('respuesta del dueño', ?, ?)")
        .bind(`Pregunta: ${s.texto}\nRespuesta: ${respuesta}`, `${quien} (✨ Sugerencias)`)
    ]);
    return json({ ok: true, enviados: 0, programados: 0, saltados: [] });
  }

  if (s.tipo === "saldo") {
    if (!manejaShalom(agent, env)) return json({ error: "Solo quien maneja los envíos de Shalom confirma saldos." }, 403);
    const r = await saldoPagado(env, s.titulo);
    if (!r.ok) return r;
    await cerrar("aprobada");
    return json({ ok: true, enviados: 0, programados: 0, saltados: [] });
  }

  if (s.tipo === "prueba_lista") {
    try {
      await cerrarPrueba(env.CRM_DB, s.ref_tipo, s.ref_id, Number(s.titulo) || 0, quien);
    } catch (err) {
      return json({ error: err.message }, 409);
    }
    await cerrar("aprobada");
    return json({ ok: true, enviados: 0, programados: 0, saltados: [] });
  }

  let cuando = null;
  if (payload.modo === "ahora") cuando = "ahora";
  else if (payload.send_at) {
    cuando = new Date(payload.send_at);
    if (Number.isNaN(cuando.getTime())) return json({ error: "Fecha u hora inválida." }, 400);
    if (cuando.getTime() < Date.now() - 60 * 1000) return json({ error: "Esa hora ya pasó." }, 400);
  }
  const texto = String(payload.texto ?? s.texto).trim().slice(0, 4096);
  if (!texto) return json({ error: "El mensaje quedó vacío." }, 400);
  const programados = [];
  const saltados = [];

  if (s.tipo === "variante") {
    const tabla = s.ref_tipo === "bienvenida" ? "welcome_steps" : "quick_replies";
    if (!(await env.CRM_DB.prepare(`SELECT 1 FROM ${tabla} WHERE id = ?`).bind(s.ref_id).first())) {
      return json({ error: "Ese mensaje ya no existe." }, 422);
    }
    const { n } = await env.CRM_DB.prepare("SELECT COUNT(*) AS n FROM variantes WHERE tipo = ? AND ref_id = ? AND estado = 'activa'").bind(s.ref_tipo, s.ref_id).first();
    if (n >= 3) return json({ error: "Ya hay 3 versiones en prueba de ese mensaje: cierra o quita una antes." }, 409);
    await env.CRM_DB.prepare("INSERT INTO variantes (tipo, ref_id, texto, origen, motivo) VALUES (?, ?, ?, ?, ?)")
      .bind(s.ref_tipo, s.ref_id, texto, s.origen || "asesor", s.motivo)
      .run();
    await env.CRM_DB.prepare("UPDATE asesor_sugerencias SET texto = ? WHERE id = ?").bind(texto, id).run();
    await cerrar("aprobada");
    return json({ ok: true, enviados: 0, programados: 0, saltados });
  }

  if (s.tipo !== "respuesta_rapida") {
    if (!s.conversation_id) return json({ error: "No encontré el chat de este cliente en el CRM." }, 422);
    // Una sola cadena por chat: lo que se aprueba reemplaza a los automáticos pendientes.
    await cancelarSeguimientosDeLead(env.CRM_DB, s.conversation_id);
    let error = await programar(env, s.conversation_id, texto, quien, cuando);
    // Envío con la ventana cerrada: sale con la plantilla.
    if (error && s.tipo === "envio" && cuando === "ahora" && s.titulo && (await fueraDeVentana(env.CRM_DB, s.conversation_id, new Date()))) {
      error = await conPlantilla(env, s, quien);
    }
    if (error) return json({ error }, 422);
    programados.push(s.conversation_id);
    // Secuencia: los pasos siguientes quedan programados después del
    // primero; se cancelan solos si el cliente responde.
    const pasos = parsear(payload.pasos !== undefined ? normalizarPasos(payload.pasos) : s.pasos);
    let base = cuando instanceof Date ? cuando.getTime() : Date.now() + (cuando === "ahora" ? 0 : 60 * 1000);
    for (const [i, paso] of pasos.entries()) {
      base += paso.horas * 3600 * 1000;
      const err = await programar(env, s.conversation_id, paso.texto, quien, new Date(base));
      if (err) saltados.push({ nombre: `Paso ${i + 2}`, motivo: err });
      else programados.push(s.conversation_id);
    }
    if (payload.pasos !== undefined) {
      await env.CRM_DB.prepare("UPDATE asesor_sugerencias SET pasos = ? WHERE id = ?").bind(normalizarPasos(payload.pasos), id).run();
    }
  } else {
    const titulo = String(payload.titulo ?? s.titulo ?? "").trim().slice(0, 80);
    if (!titulo) return json({ error: "La respuesta rápida necesita un título." }, 400);
    // Aprobar = guardarla como respuesta rápida. A los chats sugeridos ya no
    // se les manda en bloque: cada uno se abre, se lee y se manda aparte
    // (accion "enviar_a").
    await env.CRM_DB.prepare("INSERT INTO quick_replies (title, body, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM quick_replies))").bind(titulo, texto).run();
  }

  await env.CRM_DB.prepare("UPDATE asesor_sugerencias SET texto = ?, titulo = COALESCE(?, titulo) WHERE id = ?")
    .bind(texto, payload.titulo ? String(payload.titulo).slice(0, 80) : null, id)
    .run();
  await cerrar("aprobada");
  // Con "ahora" sale ya el primer mensaje (o el de cada destinatario de una
  // respuesta rápida); lo demás queda programado.
  const enviados = cuando !== "ahora" || s.tipo === "respuesta_rapida" ? 0 : 1;
  return json({ ok: true, enviados, programados: programados.length - enviados, saltados });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);

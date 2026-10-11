/**
 * Planes de seguimiento CON PLANTILLA (fuera de la ventana de 24 h), que una
 * vendedora marca en un chat y el dueño (admin) autoriza:
 *  - "shalom": su pedido ya está en la agencia Shalom y no lo recoge
 *    (plantillas de categoría UTILITY, más baratas).
 *  - "lead": vino de un anuncio, recibió la bienvenida o una respuesta rápida
 *    y no respondió (MARKETING).
 * Cada plan son 3 envíos a los 4, 7 y 21 días: el rescate cuenta desde el último mensaje del cliente;
 * el recojo en Shalom, desde que se programa (el despacho).
 * Quedan en scheduled_messages con status 'por_aprobar' (el cron no los
 * toca) hasta que el admin los aprueba ('pendiente'); si los marca el admin,
 * salen aprobados. Si el cliente escribe, lo que falta se cancela solo
 * (cancelarSeguimientosPendientes), como cualquier seguimiento.
 *
 * Cada marca tiene SUS textos (Tarot Store y URO no se mezclan) y SUS plantillas
 * en la cuenta (WABA) de su número. Las plantillas NO se mandan solas a Meta: el
 * admin las revisa y las manda desde CRM → Herramientas → Plantillas para Meta
 * (src/lib/plantillas-propuestas.js). Mientras no estén aprobadas, el envío espera.
 */

import { primerNombre } from "./plantillas.js";
import { lineaPorId } from "./lineas.js";
import { obtenerAjuste, esOrigenAutomatico } from "./crm-db.js";
import { productoPorId } from "./productos.js";
import { destinosDeChats } from "./crm-destino.js";

export const IDIOMA_PLAN = "es_PE";
export const PREFIJO_PLAN = "Plan con plantilla";

/** 'tarot' (número principal) | 'uro' (línea con marca URO) | null (otra línea: sin plantillas propuestas). */
export const marcaDeLinea = (linea) => (!linea ? "tarot" : String(linea.marca || "").toLowerCase() === "uro" ? "uro" : null);

export const PLANES = {
  shalom: {
    titulo: "Recojo en Shalom",
    categoria: "UTILITY",
    pasos: [
      { dias: 4, nombre: "recojo_shalom_1", texto: "Hola {{1}}, su pedido ya está en su agencia Shalom y está listo para recoger. Lleve su DNI y la clave de retiro; si no la tiene, respóndanos aquí y se la enviamos." },
      { dias: 7, nombre: "recojo_shalom_2", texto: "Hola {{1}}, le recordamos que su pedido sigue esperándolo en su agencia Shalom. Si tiene algún problema para recogerlo, respóndanos y le ayudamos." },
      { dias: 21, nombre: "recojo_shalom_3", texto: "Hola {{1}}, su pedido todavía está en la agencia Shalom. Las agencias devuelven los envíos que no se recogen, ¿podrá recogerlo esta semana?" }
    ],
    botones: ["Ya lo recogí", "Necesito ayuda"],
    ejemplo: ["María"]
  },
  lead: {
    titulo: "Rescate de interesado",
    categoria: "MARKETING",
    pasos: [
      { dias: 4, nombre: "rescate_lead_1", texto: "Hola {{1}} ☺️ le escribo por su consulta sobre {{2}}. ¿Le quedó alguna duda? Con gusto le ayudo por aquí." },
      { dias: 7, nombre: "rescate_lead_2", texto: "Hola {{1}}, le cuento que el envío de {{2}} es gratis a todo el Perú ✨ Si quiere, le paso los detalles para hacer su pedido." },
      { dias: 21, nombre: "rescate_lead_3", texto: "Hola {{1}}, le dejo mi contacto por si más adelante quiere {{2}} ☺️ Solo responda este mensaje y lo vemos." }
    ],
    botones: ["Quiero hacer mi pedido", "Tengo una duda"],
    ejemplo: ["María", "el kit de tarot"],
    conProducto: true // {{2}} = el producto del chat
  }
};

// URO: su propio texto y sus propias plantillas (prefijo uro_). Sin nombrar síntomas ni el producto
// de más: es un tema íntimo y el aviso se ve en la pantalla de bloqueo.
export const PLANES_URO = {
  shalom: {
    titulo: "Recojo en Shalom",
    categoria: "UTILITY",
    pasos: [
      { dias: 4, nombre: "uro_recojo_shalom_1", texto: "Hola {{1}}, le escribimos de URO: su pedido ya está en su agencia Shalom y listo para recoger. Lleve su DNI y la clave de retiro; si no la tiene, respóndanos aquí y se la enviamos." },
      { dias: 7, nombre: "uro_recojo_shalom_2", texto: "Hola {{1}}, de URO: su pedido sigue a su nombre en su agencia Shalom. Si tiene algún problema para recogerlo, respóndanos y le ayudamos." },
      { dias: 21, nombre: "uro_recojo_shalom_3", texto: "Hola {{1}}, de URO: su pedido todavía está en la agencia Shalom. Las agencias devuelven los envíos que no se recogen, ¿podrá recogerlo esta semana?" }
    ],
    botones: ["Ya lo recogí", "Necesito ayuda"],
    ejemplo: ["María"]
  },
  lead: {
    titulo: "Rescate de interesado",
    categoria: "MARKETING",
    pasos: [
      { dias: 4, nombre: "uro_rescate_lead_1", texto: "Hola {{1}} 🌸 le escribimos de URO por su consulta. ¿Le quedó alguna duda? Con gusto le ayudamos por aquí." },
      { dias: 7, nombre: "uro_rescate_lead_2", texto: "Hola {{1}} 🌸 le cuento que el envío de URO es gratis a todo el Perú. Si gusta, le tomamos su pedido por aquí." },
      { dias: 21, nombre: "uro_rescate_lead_3", texto: "Hola {{1}} 🌸 le dejamos nuestro contacto por si más adelante quiere hacer su pedido de URO. Solo responda este mensaje y lo vemos." }
    ],
    botones: ["Quiero hacer mi pedido", "Tengo una duda"],
    ejemplo: ["María"]
  }
};

/**
 * "Aviso de envío": la plantilla que la vendedora manda desde el chat (botón de plantillas) cuando
 * despacha el pedido. Trae dos botones: al tocarlo el cliente abre la ventana de 24 h, ahí va la
 * boleta de Shalom, y al responder se activa solo el plan de recojo (4, 7 y 21 días).
 */
export const AVISOS_ENVIO = {
  tarot: { nombre: "aviso_envio_shalom", categoria: "UTILITY", texto: "Hola {{1}}, ya despachamos su pedido ✅ Toque uno de los botones de abajo para enviarle por este chat su boleta de Shalom y los datos para recogerlo.", botones: ["Ver mi boleta", "Tengo una consulta"], ejemplo: ["María"] },
  uro: { nombre: "uro_aviso_envio_shalom", categoria: "UTILITY", texto: "Hola {{1}}, de URO: ya despachamos su pedido ✅ Toque uno de los botones de abajo para enviarle por este chat su boleta de Shalom y los datos para recogerlo.", botones: ["Ver mi boleta", "Tengo una consulta"], ejemplo: ["María"] }
};

export const planesDe = (marca) => (marca === "uro" ? PLANES_URO : PLANES);



/** Los pasos de un plan en el orden que eligió el admin (ajuste plantillas_textos, clave `orden:marca:plan`); los días van por posición. */
export function pasosOrdenados(pasos, orden) {
  const lista = Array.isArray(orden) ? orden : [];
  const pos = (p, i) => (lista.includes(p.nombre) ? lista.indexOf(p.nombre) : i);
  return pasos.map((p, i) => ({ p, k: pos(p, i) })).sort((a, b) => a.k - b.k).map((x) => x.p);
}
export async function ordenDelPlan(db, marca, plan) {
  try { return JSON.parse((await obtenerAjuste(db, "plantillas_textos")) || "{}")[`orden:${marca}:${plan}`] || []; } catch { return []; }
}

/** El texto con los parámetros puestos, para mostrarlo en el CRM. */
export const textoDePaso = (paso, params) => paso.texto.replace(/\{\{(\d)\}\}/g, (m, n) => params[Number(n) - 1] ?? m);

/** Los días de los 3 envíos (ajuste `plan_dias`, lo cambia el admin en Herramientas). */
export const DIAS_POR_DEFECTO = [4, 7, 21];
export function leerDias(texto) {
  const d = String(texto || "").split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 60);
  return d.length === 3 && d[0] < d[1] && d[1] < d[2] ? d : DIAS_POR_DEFECTO;
}

/**
 * Los 3 envíos del plan para un chat: { send_at, template_name, params, body }.
 * Cada uno a los N días del último mensaje del cliente; si ese día ya pasó,
 * sale en 10 min (y los siguientes conservan su orden).
 */
export function pasosDelPlan(plan, { lastInboundAt, nombre, producto }, ahora = Date.now(), dias = DIAS_POR_DEFECTO, marca = "tarot", orden = []) {
  const p = planesDe(marca)[plan];
  // El recojo en Shalom cuenta desde hoy (el despacho), no desde el último mensaje del cliente: ese puede ser de hace días.
  const base = plan === "shalom" || !lastInboundAt ? ahora : new Date(String(lastInboundAt).replace(" ", "T") + (String(lastInboundAt).includes("Z") ? "" : "Z")).getTime();
  const params = p.conProducto ? [primerNombre(nombre), producto || "el kit de tarot"] : [primerNombre(nombre)];
  let previo = 0;
  return pasosOrdenados(p.pasos, orden).map((paso, i) => {
    const cuando = Math.max(base + (dias[i] ?? paso.dias) * 86400000, ahora + 10 * 60000 + i * 60000, previo + 60000);
    previo = cuando;
    return { send_at: new Date(cuando).toISOString(), template_name: paso.nombre, params, body: textoDePaso(paso, params) };
  });
}

/**
 * Programa el plan en un chat. `estado`: 'por_aprobar' (lo marcó una vendedora
 * o la cadena automática) o 'pendiente' (lo marcó el admin). Devuelve los
 * pasos, o { error } si no corresponde.
 */
export async function programarPlan(env, conversationId, plan, { estado, quien }) {
  const db = env.CRM_DB;
  const conv = await db.prepare(
    `SELECT conv.id, conv.last_inbound_at, conv.producto_id, conv.linea_id, COALESCE(c.name, c.profile_name) AS nombre
     FROM conversations conv JOIN contacts c ON c.id = conv.contact_id WHERE conv.id = ?`
  ).bind(conversationId).first();
  if (!conv) return { error: "Conversación no encontrada." };
  if (!conv.last_inbound_at) return { error: "El cliente nunca escribió: no se le puede mandar un plan." };
  const yaHay = await db.prepare(
    "SELECT 1 FROM scheduled_messages WHERE conversation_id = ? AND status IN ('pendiente', 'por_aprobar') AND created_by LIKE ? LIMIT 1"
  ).bind(conversationId, `${PREFIJO_PLAN}%`).first();
  if (yaHay) return { error: "Este chat ya tiene un plan con plantilla programado. Cancélalo primero si quieres cambiarlo." };

  const marca = marcaDeLinea(conv.linea_id ? await lineaPorId(db, conv.linea_id) : null);
  if (!marca) return { error: "Este número no tiene plantillas propuestas todavía." };
  const producto = await productoPorId(db, conv.producto_id);
  const dias = leerDias(await obtenerAjuste(db, "plan_dias").catch(() => null));
  const pasos = pasosDelPlan(plan, { lastInboundAt: conv.last_inbound_at, nombre: conv.nombre, producto: producto?.nombre }, Date.now(), dias, marca, await ordenDelPlan(db, marca, plan));
  const origen = `${PREFIJO_PLAN} · ${planesDe(marca)[plan].titulo} · ${quien || "CRM"}`;
  await db.batch(pasos.map((p) => db.prepare(
    `INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, template_name, template_language, template_params, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(conversationId, p.body, p.send_at, origen, p.template_name, IDIOMA_PLAN, JSON.stringify(p.params), estado)));
  return { pasos };
}

/**
 * Después de mandar un seguimiento automático de texto (bienvenida, respuesta
 * rápida, secuencia de leads): si era el último de la cadena de 24 h y el
 * cliente no compró, deja el rescate con plantilla POR APROBAR. Si el cliente
 * responde antes, se cancela solo. Se apaga con el ajuste `plan_auto` = "0".
 */
export async function encadenarRescate(env, conversationId, createdBy, etapa) {
  if (!esOrigenAutomatico(createdBy) || etapa >= 5) return;
  if (etapa < 2) return; // solo saludo del anuncio: frío, no se gasta plantilla pagada (plan-seguimientos.md)
  const db = env.CRM_DB;
  if ((await obtenerAjuste(db, "plan_auto").catch(() => null)) === "0") return;
  const { results } = await db.prepare(
    "SELECT created_by FROM scheduled_messages WHERE conversation_id = ? AND status IN ('pendiente', 'enviando') AND template_name IS NULL"
  ).bind(conversationId).all();
  if (results.some((r) => esOrigenAutomatico(r.created_by))) return; // la cadena sigue
  await programarPlan(env, conversationId, "lead", { estado: "por_aprobar", quien: "cadena automática" });
}

/**
 * Sugerencias de seguimiento cuyo chat cerró su ventana de 24 h (el cronómetro
 * llegó a 0): ya no se pueden mandar como texto, así que en su lugar el bot deja
 * un plan con plantilla POR APROBAR, según el caso:
 *  - no compró y conversó (etapa 2+): rescate de interesado;
 *  - ya compró y es de provincia: recojo en Shalom;
 *  - compró en Lima, o solo saludó: nada.
 * Se llama antes de cerrar esas sugerencias (limpiarSugerenciasViejas).
 */
export async function proponerPlanPorVentanaCerrada(env, limite = 5) {
  const db = env.CRM_DB;
  const { results } = await db.prepare(
    `SELECT DISTINCT conv.id, conv.etapa, conv.meta_tags
     FROM asesor_sugerencias s JOIN conversations conv ON conv.id = s.conversation_id
     WHERE s.estado = 'pendiente' AND s.tipo = 'seguimiento'
       AND conv.last_inbound_at IS NOT NULL AND conv.last_inbound_at < datetime('now', '-24 hours')
       AND NOT EXISTS (SELECT 1 FROM scheduled_messages m WHERE m.conversation_id = conv.id AND m.template_name IS NOT NULL AND m.status IN ('pendiente', 'por_aprobar'))
     LIMIT ?`
  ).bind(limite).all();
  if (!results.length) return 0;
  const destinos = await destinosDeChats(db, results.map((c) => c.id)).catch(() => ({}));
  let n = 0;
  for (const c of results) {
    const compro = (c.etapa || 0) >= 5 || /\bpurchase\b/.test(c.meta_tags || "");
    const plan = compro ? (destinos[c.id] === "provincia" ? "shalom" : null) : (c.etapa || 0) >= 2 ? "lead" : null;
    if (!plan) continue;
    const r = await programarPlan(env, c.id, plan, { estado: "por_aprobar", quien: "Asesor (se cerró la ventana)" }).catch(() => ({ error: true }));
    if (!r.error) n++;
  }
  return n;
}

/**
 * El cliente respondió (tocó un botón o escribió) justo después del "aviso de envío": se abrió su
 * ventana y el plan de recojo en Shalom queda programado desde ESTE mensaje (4, 7 y 21 días).
 * Solo la primera respuesta tras el aviso, hasta 3 días después.
 */
export async function activarPlanTrasAviso(env, conversationId) {
  const db = env.CRM_DB;
  const aviso = await db.prepare(
    `SELECT created_at, body FROM messages WHERE conversation_id = ? AND direction = 'out' AND type = 'template'
       AND body LIKE '%aviso_envio_shalom%' AND created_at >= datetime('now', '-3 days') ORDER BY id DESC LIMIT 1`
  ).bind(conversationId).first();
  if (!aviso) return null;
  // Si el admin le dejó a esa plantilla otro seguimiento (o ninguno), no se arma el recojo por encima.
  const nombreAviso = String(aviso.body).includes("uro_aviso_envio_shalom") ? "uro_aviso_envio_shalom" : "aviso_envio_shalom";
  try {
    const cfg = JSON.parse((await obtenerAjuste(db, "plantillas_seguimiento")) || "{}")?.[nombreAviso];
    if (cfg && !(cfg.pasos?.length && cfg.pasos.every((p) => /recojo_shalom_\d$/.test(p.plantilla)))) return null;
  } catch { /* sin configuración: de fábrica */ }
  const { n } = await db.prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND direction = 'in' AND created_at >= ?").bind(conversationId, aviso.created_at).first();
  if (n !== 1) return null;
  return programarPlan(env, conversationId, "shalom", { estado: "pendiente", quien: "Tras el aviso de envío" });
}

/**
 * El cliente escribió con un recojo en Shalom ya aprobado en marcha: los 3 envíos se vuelven a contar
 * desde este mensaje (4, 7 y 21 días). Si dice "ya lo recogí" (el botón), el plan termina.
 */
export async function rearmarPlanShalom(env, conversationId, texto) {
  const db = env.CRM_DB;
  const { results } = await db.prepare(
    "SELECT id, template_name FROM scheduled_messages WHERE conversation_id = ? AND status = 'pendiente' AND created_by LIKE ?"
  ).bind(conversationId, `${PREFIJO_PLAN} · Recojo en Shalom%`).all();
  if (!results.length) return;
  if (/ya lo recog/i.test(texto || "")) {
    await db.batch(results.map((r) => db.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE id = ?").bind(r.id)));
    return;
  }
  const dias = leerDias(await obtenerAjuste(db, "plan_dias").catch(() => null));
  const ahora = Date.now();
  const marca = String(results[0].template_name).startsWith("uro_") ? "uro" : "tarot";
  const orden = pasosOrdenados(planesDe(marca).shalom.pasos, await ordenDelPlan(db, marca, "shalom")).map((p) => p.nombre);
  await db.batch(results.map((r) => {
    const i = Math.max(0, orden.indexOf(r.template_name));
    return db.prepare("UPDATE scheduled_messages SET send_at = ? WHERE id = ?").bind(new Date(ahora + (dias[i] ?? 4) * 86400000).toISOString(), r.id);
  }));
}

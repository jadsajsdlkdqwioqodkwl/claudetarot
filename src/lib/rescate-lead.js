/**
 * Rescate de lead con plantilla (planes-plantilla.js, plan "lead"):
 *
 * 1. rescate7Dias (cron de 15 min): a TODOS los contactos que no compraron, a los 7 días de su inicio de
 *    chat (la ventana de 7 días de Meta tras el clic del anuncio), sin excepción, sale el rescate 2
 *    (`rescate_lead_2`). Las únicas salidas son las del dueño: chat bloqueado, killswitch del chat
 *    (`pausa_auto`), ya compró, o que ese mensaje ya se haya programado antes (aunque lo hayan cancelado).
 *    Solo corre para chats cuyo día 7 cae DESPUÉS de activarlo (ajuste `rescate7_desde`), para no
 *    escribirle de golpe a todo el historial. Se apaga con el ajuste `rescate7_auto` = "0".
 * 2. rescateUnoPorAsesor: el asesor (la Routine de Claude Code) decide a quién mandarle el rescate 1
 *    (`rescate_lead_1`, fuera de la ventana de 24 h) y lo manda por /api/asesor/rescates.
 */

import { obtenerAjuste, guardarAjuste, siempreGlobal } from "./crm-db.js";
import { listarLineas } from "./lineas.js";
import { planesDe, marcaDeLinea, IDIOMA_PLAN, PREFIJO_PLAN, textoDePaso } from "./planes-plantilla.js";
import { primerNombre } from "./plantillas.js";
import { productoPorId } from "./productos.js";

const nombrePaso = (marca, n) => `${marca === "uro" ? "uro_" : ""}rescate_lead_${n}`;

async function filaDePaso(db, c, marca, n, sendAt, quien) {
  const paso = planesDe(marca).lead.pasos.find((p) => p.nombre === nombrePaso(marca, n));
  if (!paso) return null;
  const producto = await productoPorId(db, c.producto_id);
  const params = planesDe(marca).lead.conProducto ? [primerNombre(c.nombre), producto?.nombre || "el kit de tarot"] : [primerNombre(c.nombre)];
  return db.prepare(
    `INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, template_name, template_language, template_params, status, mandar_siempre)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', 1)`
  ).bind(c.id, textoDePaso(paso, params), sendAt, `${PREFIJO_PLAN} · ${planesDe(marca).lead.titulo} · ${quien}`, paso.nombre, IDIOMA_PLAN, JSON.stringify(params));
}

const NO_COMPRO = "COALESCE(conv.etapa, 0) < 5 AND instr(' ' || COALESCE(conv.meta_tags, '') || ' ', ' purchase ') = 0";

export async function rescate7Dias(env, limite = 25) {
  const db = env.CRM_DB;
  if (!db || (await obtenerAjuste(db, "rescate7_auto").catch(() => null)) === "0") return 0;
  let desde = await obtenerAjuste(db, "rescate7_desde").catch(() => null);
  if (!desde) {
    desde = new Date().toISOString().slice(0, 19).replace("T", " ");
    await guardarAjuste(db, "rescate7_desde", desde);
  }
  const { results } = await db.prepare(
    `SELECT conv.id, conv.linea_id, conv.producto_id, COALESCE(c.name, c.profile_name) AS nombre
     FROM conversations conv JOIN contacts c ON c.id = conv.contact_id
     WHERE conv.created_at <= datetime('now', '-7 days') AND conv.created_at >= datetime('now', '-8 days')
       AND conv.created_at >= datetime(?, '-7 days')
       AND conv.last_inbound_at IS NOT NULL AND conv.blocked = 0 AND conv.pausa_auto = 0 AND ${NO_COMPRO}
       AND NOT EXISTS (SELECT 1 FROM scheduled_messages m WHERE m.conversation_id = conv.id AND m.template_name IN ('rescate_lead_2', 'uro_rescate_lead_2'))
     LIMIT ?`
  ).bind(desde, limite).all();
  if (!results.length) return 0;
  const lineas = await listarLineas(db);
  const cuando = new Date(Date.now() + 5 * 60000).toISOString();
  const filas = [];
  for (const c of results) {
    const marca = marcaDeLinea(c.linea_id ? lineas.find((l) => l.id === c.linea_id) : null);
    if (!marca) continue;
    const f = await filaDePaso(db, c, marca, 2, cuando, "Automático (día 7)");
    if (f) filas.push(f);
  }
  if (filas.length) await db.batch(filas);
  return filas.length;
}

/** Los rescates 1 que decidió el asesor: [{ whatsapp, motivo }] → { programados, rechazados: [{ whatsapp, razon }] }. */
export async function rescateUnoPorAsesor(env, items) {
  const db = env.CRM_DB;
  const lineas = await listarLineas(db);
  const recientes = (await db.prepare(
    "SELECT COUNT(*) AS n FROM scheduled_messages WHERE created_by LIKE ? AND created_at >= datetime('now', '-1 day')"
  ).bind(`%Asesor IA%`).first())?.n || 0;
  let cupo = Math.max(0, 30 - recientes); // tope diario: son plantillas de marketing pagadas
  const programados = [];
  const rechazados = [];
  const filas = [];
  const cuando = new Date(Date.now() + 10 * 60000).toISOString();
  for (const it of items.slice(0, 15)) {
    const wa = String(it?.whatsapp || "").replace(/\D/g, "");
    const rechazar = (razon) => rechazados.push({ whatsapp: wa, razon });
    if (!wa) { rechazar("falta whatsapp"); continue; }
    const c = await db.prepare(
      `SELECT conv.id, conv.linea_id, conv.producto_id, conv.last_inbound_at, COALESCE(c.name, c.profile_name) AS nombre,
         (conv.blocked = 0 AND conv.pausa_auto = 0 AND ${NO_COMPRO}) AS elegible
       FROM conversations conv JOIN contacts c ON c.id = conv.contact_id
       WHERE c.wa_id LIKE ? ORDER BY conv.last_message_at DESC LIMIT 1`
    ).bind(`%${wa.slice(-9)}`).first();
    if (!c) { rechazar("no hay chat con ese número"); continue; }
    if (!c.elegible) { rechazar("bloqueado, con el automático detenido o ya compró"); continue; }
    if (!c.last_inbound_at || c.last_inbound_at >= new Date(Date.now() - 24 * 3600000).toISOString().slice(0, 19).replace("T", " ")) { rechazar("dentro de la ventana de 24 h (ahí van mensajes normales) o nunca escribió"); continue; }
    const marca = marcaDeLinea(c.linea_id ? lineas.find((l) => l.id === c.linea_id) : null);
    if (!marca) { rechazar("ese número no tiene plantillas de rescate"); continue; }
    const ya = await db.prepare("SELECT 1 FROM scheduled_messages WHERE conversation_id = ? AND template_name = ? LIMIT 1").bind(c.id, nombrePaso(marca, 1)).first();
    if (ya) { rechazar("ya se le programó o mandó el rescate 1"); continue; }
    if (cupo <= 0) { rechazar("tope diario de rescates del asesor"); continue; }
    const f = await filaDePaso(db, c, marca, 1, cuando, `Asesor IA${it.motivo ? ` · ${String(it.motivo).slice(0, 80)}` : ""}`);
    if (!f) { rechazar("sin plantilla"); continue; }
    filas.push(f); programados.push(wa); cupo--;
  }
  if (filas.length) await db.batch(filas);
  return { programados, rechazados };
}

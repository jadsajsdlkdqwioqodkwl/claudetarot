/**
 * Rescate de lead con plantilla (planes-plantilla.js, plan "lead"). Siempre la plantilla `rescate_lead_1`
 * (`uro_rescate_lead_1` en URO):
 *
 * 1. rescate7Dias (cron de 15 min, y al prender el interruptor en Herramientas): a TODO contacto que no
 *    compró y aún está dentro de la ventana gratis de 7 días del anuncio, se le AGENDA el rescate para el
 *    final de esa ventana (día 6 + 18 h desde el inicio del chat, para que salga adentro y no pase de los
 *    7 días), sin excepción: sin importar si respondió, si le escribimos o qué más pasó. Las únicas salidas:
 *    chat bloqueado, killswitch del chat (`pausa_auto`), o que ya se haya programado antes (aunque lo hayan
 *    cancelado). Si compra antes de que salga, el cron de envío lo cancela (crm-cron.js).
 *    Los que llegan después se agendan solos en la siguiente pasada. Se apaga con el ajuste `rescate7_auto` = "0".
 * 2. rescateUnoPorAsesor: el asesor (la Routine de Claude Code) revisa los chats PASADOS (ya fuera de esa
 *    ventana) y decide a quién mandarle el mismo rescate 1; sale solo (/api/asesor/rescates).
 */

import { obtenerAjuste, guardarAjuste } from "./crm-db.js";
import { listarLineas } from "./lineas.js";
import { planesDe, marcaDeLinea, IDIOMA_PLAN, PREFIJO_PLAN, textoDePaso } from "./planes-plantilla.js";
import { primerNombre } from "./plantillas.js";
import { listarProductos } from "./productos.js";

export const ORIGEN_DIA7 = "Automático (día 7)";
const HORAS_HASTA_RESCATE = 6 * 24 + 18; // dentro de la ventana de 7 días, con 6 h de margen
const nombrePaso = (marca, n) => `${marca === "uro" ? "uro_" : ""}rescate_lead_${n}`;

function filaDePaso(db, c, marca, n, sendAt, quien, productos) {
  const plan = planesDe(marca).lead;
  const paso = plan.pasos.find((p) => p.nombre === nombrePaso(marca, n));
  if (!paso) return null;
  const producto = productos.find((p) => p.id === c.producto_id);
  const params = plan.conProducto ? [primerNombre(c.nombre), producto?.nombre || "el kit de tarot"] : [primerNombre(c.nombre)];
  return db.prepare(
    `INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, template_name, template_language, template_params, status, mandar_siempre)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', 1)`
  ).bind(c.id, textoDePaso(paso, params), sendAt, `${PREFIJO_PLAN} · ${plan.titulo} · ${quien}`, paso.nombre, IDIOMA_PLAN, JSON.stringify(params));
}

const NO_COMPRO = "COALESCE(conv.etapa, 0) < 5 AND instr(' ' || COALESCE(conv.meta_tags, '') || ' ', ' purchase ') = 0";
const TEMPLATES_RESCATE_1 = "('rescate_lead_1', 'uro_rescate_lead_1')";

/** Agenda el rescate 1 de los chats que faltan. Devuelve cuántos agendó. */
export async function rescate7Dias(env, limite = 100) {
  const db = env.CRM_DB;
  if (!db || (await obtenerAjuste(db, "rescate7_auto").catch(() => null)) === "0") return 0;
  const { results } = await db.prepare(
    `SELECT conv.id, conv.linea_id, conv.producto_id, conv.created_at, COALESCE(c.name, c.profile_name) AS nombre
     FROM conversations conv JOIN contacts c ON c.id = conv.contact_id
     WHERE conv.created_at >= datetime('now', '-7 days')
       AND conv.last_inbound_at IS NOT NULL AND conv.blocked = 0 AND conv.pausa_auto = 0 AND ${NO_COMPRO}
       AND NOT EXISTS (SELECT 1 FROM scheduled_messages m WHERE m.conversation_id = conv.id AND m.template_name IN ${TEMPLATES_RESCATE_1})
     LIMIT ?`
  ).bind(limite).all();
  if (!results.length) return 0;
  const [lineas, productos] = await Promise.all([listarLineas(db), listarProductos(db)]);
  const minimo = Date.now() + 5 * 60000;
  const filas = [];
  for (const c of results) {
    const marca = marcaDeLinea(c.linea_id ? lineas.find((l) => l.id === c.linea_id) : null);
    if (!marca) continue;
    const llegada = new Date(c.created_at.replace(" ", "T") + "Z").getTime();
    const cuando = new Date(Math.max(llegada + HORAS_HASTA_RESCATE * 3600000, minimo)).toISOString();
    const f = filaDePaso(db, c, marca, 1, cuando, ORIGEN_DIA7, productos);
    if (f) filas.push(f);
  }
  if (filas.length) await db.batch(filas);
  return filas.length;
}

/** Estado para el interruptor de Herramientas: { activo, agendados, proximo }. */
export async function estadoRescate7(db) {
  const activo = (await obtenerAjuste(db, "rescate7_auto").catch(() => null)) !== "0";
  const r = await db.prepare(
    `SELECT COUNT(*) AS n, MIN(send_at) AS proximo FROM scheduled_messages WHERE status = 'pendiente' AND created_by LIKE ?`
  ).bind(`%${ORIGEN_DIA7}`).first().catch(() => null);
  return { activo, agendados: r?.n || 0, proximo: r?.proximo || null };
}

export async function ponerRescate7(db, activo) {
  await guardarAjuste(db, "rescate7_auto", activo ? "1" : "0");
}

/** Los rescates 1 que decidió el asesor: [{ whatsapp, motivo }] → { programados, rechazados: [{ whatsapp, razon }] }. */
export async function rescateUnoPorAsesor(env, items) {
  const db = env.CRM_DB;
  const [lineas, productos] = await Promise.all([listarLineas(db), listarProductos(db)]);
  const recientes = (await db.prepare(
    "SELECT COUNT(*) AS n FROM scheduled_messages WHERE created_by LIKE ? AND created_at >= datetime('now', '-1 day')"
  ).bind(`%Asesor IA%`).first())?.n || 0;
  let cupo = Math.max(0, 30 - recientes); // tope diario: son plantillas de marketing, fuera de la ventana gratis cuestan
  const programados = [];
  const rechazados = [];
  const filas = [];
  const cuando = new Date(Date.now() + 10 * 60000).toISOString();
  const hace24h = new Date(Date.now() - 24 * 3600000).toISOString().slice(0, 19).replace("T", " ");
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
    if (!c.last_inbound_at || c.last_inbound_at >= hace24h) { rechazar("escribió hace menos de 24 h (ahí van mensajes normales) o nunca escribió"); continue; }
    const marca = marcaDeLinea(c.linea_id ? lineas.find((l) => l.id === c.linea_id) : null);
    if (!marca) { rechazar("ese número no tiene plantillas de rescate"); continue; }
    const ya = await db.prepare("SELECT 1 FROM scheduled_messages WHERE conversation_id = ? AND template_name = ? LIMIT 1").bind(c.id, nombrePaso(marca, 1)).first();
    if (ya) { rechazar("ya se le programó o mandó el rescate 1"); continue; }
    if (cupo <= 0) { rechazar("tope diario de rescates del asesor"); continue; }
    const f = filaDePaso(db, c, marca, 1, cuando, `Asesor IA${it.motivo ? ` · ${String(it.motivo).slice(0, 80)}` : ""}`, productos);
    if (!f) { rechazar("sin plantilla"); continue; }
    filas.push(f); programados.push(wa); cupo--;
  }
  if (filas.length) await db.batch(filas);
  return { programados, rechazados };
}

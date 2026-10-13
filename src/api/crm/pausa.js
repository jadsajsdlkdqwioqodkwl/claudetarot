/**
 * Interruptor general de los mensajes programados (seguimientos, planes, plantillas) y rescate del día 7.
 *
 * GET  /api/crm/pausa → { pausa, pendientes, rescate7: { activo, agendados, proximo, plantillas } }
 * POST /api/crm/pausa { pausa: true }   → KILLSWITCH: cancela todo lo pendiente y, mientras esté puesto,
 *                                          nada programado sale (lo que venza se cancela, no se acumula).
 *      { pausa: false }                 → reanuda (lo cancelado no vuelve)
 *      { rescate7: true|false }         → prende/apaga el rescate de lead del día 7 (rescate-lead.js); al prender agenda de una vez
 *      { rescate7_plantilla: { marca: "tarot"|"uro", nombre } } → qué plantilla sale el día 7 en esa marca
 *                                          (también en los ya agendados que no salieron)
 * «Mandar toda la secuencia» (ajuste siempre_global) quedó DEPRECADO (2026-10-13, dueño): se reemplazó por
 * el botón «Reactivar seguimiento» de la burbuja de cada respuesta rápida con seguimiento.
 */

import { conAuth } from "../../lib/crm-auth.js";
import { obtenerAjuste, guardarAjuste } from "../../lib/crm-db.js";
import { estadoRescate7, ponerRescate7, rescate7Dias, elegirPlantillaDia7 } from "../../lib/rescate-lead.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function estado(db) {
  const [pausa, n] = await Promise.all([
    obtenerAjuste(db, "pausa_total"),
    db.prepare("SELECT COUNT(*) AS n FROM scheduled_messages WHERE status IN ('pendiente', 'por_aprobar')").first()
  ]);
  return { pausa: pausa === "1", pendientes: n?.n || 0, rescate7: await estadoRescate7(db) };
}

async function get({ env }) {
  return json(await estado(env.CRM_DB));
}

async function post({ request, env, agent }) {
  const p = await request.json().catch(() => null);
  if (!p) return json({ error: "Solicitud inválida." }, 400);
  const db = env.CRM_DB;
  let cambiados;
  if (p.rescate7_plantilla) {
    try { cambiados = await elegirPlantillaDia7(db, String(p.rescate7_plantilla.marca || ""), String(p.rescate7_plantilla.nombre || "")); }
    catch (err) { return json({ error: err.message }, 400); }
  }
  if (p.rescate7 !== undefined) {
    await ponerRescate7(db, Boolean(p.rescate7));
    if (p.rescate7) await rescate7Dias(env, 500).catch((err) => console.error("Rescate día 7:", err.message)); // agenda ya, sin esperar al cron
  }
  if (p.pausa !== undefined) {
    await guardarAjuste(db, "pausa_total", p.pausa ? "1" : "0");
    if (p.pausa) {
      await db.prepare("UPDATE scheduled_messages SET status = 'cancelado' WHERE status IN ('pendiente', 'por_aprobar')").run();
      console.log(`Killswitch puesto por ${agent?.displayName || agent?.username || "?"}`);
    }
  }
  return json({ ok: true, ...(cambiados !== undefined ? { cambiados } : {}), ...(await estado(db)) });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);

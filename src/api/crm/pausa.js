/**
 * Interruptor general de los mensajes programados (seguimientos, planes, plantillas) y "mandar todo".
 *
 * GET  /api/crm/pausa → { pausa, siempre, pendientes }
 * POST /api/crm/pausa { pausa: true }   → KILLSWITCH: cancela todo lo pendiente y, mientras esté puesto,
 *                                          nada programado sale (lo que venza se cancela, no se acumula).
 *      { pausa: false }                 → reanuda (lo cancelado no vuelve)
 *      { rescate7: true|false }         → prende/apaga el rescate de lead del día 7 (rescate-lead.js); al prender agenda de una vez
 *      { siempre: true|false }          → desde ahora, las secuencias que se programen salen completas
 *                                          aunque el cliente o nosotros escribamos (mandar_siempre)
 */

import { conAuth } from "../../lib/crm-auth.js";
import { obtenerAjuste, guardarAjuste } from "../../lib/crm-db.js";
import { estadoRescate7, ponerRescate7, rescate7Dias } from "../../lib/rescate-lead.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function estado(db) {
  const [pausa, siempre, n] = await Promise.all([
    obtenerAjuste(db, "pausa_total"),
    obtenerAjuste(db, "siempre_global"),
    db.prepare("SELECT COUNT(*) AS n FROM scheduled_messages WHERE status IN ('pendiente', 'por_aprobar')").first()
  ]);
  return { pausa: pausa === "1", siempre: siempre === "1", pendientes: n?.n || 0, rescate7: await estadoRescate7(db) };
}

async function get({ env }) {
  return json(await estado(env.CRM_DB));
}

async function post({ request, env, agent }) {
  const p = await request.json().catch(() => null);
  if (!p) return json({ error: "Solicitud inválida." }, 400);
  const db = env.CRM_DB;
  if (p.siempre !== undefined) await guardarAjuste(db, "siempre_global", p.siempre ? "1" : "0");
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
  return json({ ok: true, ...(await estado(db)) });
}

export const onRequestGet = conAuth(get);
export const onRequestPost = conAuth(post);

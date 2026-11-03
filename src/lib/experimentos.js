/**
 * Experimentos de flujo con testers (dueño, 2026-11-03): «Yape en 2 tiempos» y los que vengan.
 *
 * Un experimento compara dos flujos de respuestas rápidas en los chats de un segmento (provincia) que atienden las
 * vendedoras marcadas como tester (agents.tester = 1). Al abrir un chat del segmento (o al tocar la primera rápida de
 * cualquiera de los dos brazos), al chat le toca un brazo por hash (50/50 por defecto) y queda guardado para siempre:
 * si otra vendedora lo toma después, el brazo se respeta. Los chats de quien no es tester nunca entran.
 */

import { brazoPorHash } from "./crm-db.js";
import { destinosDeChats } from "./crm-destino.js";

const ids = (t) => { try { return [...new Set((JSON.parse(t || "[]") || []).map(Number).filter(Boolean))]; } catch { return []; } };

export function parsearExperimento(r) {
  if (!r) return null;
  return { ...r, solo_testers: r.solo_testers !== 0, reparto: Math.min(1, Math.max(0, Number(r.reparto) || 0.5)), brazo_a: ids(r.brazo_a), brazo_b: ids(r.brazo_b) };
}

export async function experimentosActivos(db) {
  const { results } = await db.prepare("SELECT * FROM experimentos WHERE estado = 'activo' ORDER BY id").all().catch(() => ({ results: [] }));
  return (results || []).map(parsearExperimento);
}

export async function esTester(db, agentId) {
  if (!agentId) return false;
  const r = await db.prepare("SELECT tester FROM agents WHERE id = ?").bind(agentId).first().catch(() => null);
  return Boolean(r?.tester);
}

/**
 * El brazo de un chat en los experimentos activos para esta vendedora: { experimento_id, nombre, brazo, etiqueta,
 * ocultar: [ids de rápidas del otro brazo], destacar: [ids del brazo propio] } o null.
 * `tocoRapida`: id de la rápida que está por mandar (si es de un brazo, asigna aunque el destino aún no se sepa).
 * Asigna solo si la vendedora es tester (o el experimento no exige testers) y el chat es del segmento.
 */
export async function brazoDeChat(db, { conversationId, agentId, agente, tocoRapida = null }) {
  const activos = await experimentosActivos(db);
  if (!activos.length) return null;
  for (const ex of activos) {
    const ya = await db.prepare("SELECT brazo FROM experimento_chats WHERE experimento_id = ? AND conversation_id = ?").bind(ex.id, conversationId).first();
    if (ya) return respuesta(ex, ya.brazo);
    if (ex.solo_testers && !(await esTester(db, agentId))) continue;
    const esDelBrazo = tocoRapida && (ex.brazo_a.includes(tocoRapida) || ex.brazo_b.includes(tocoRapida));
    if (!esDelBrazo) {
      const destino = (await destinosDeChats(db, [conversationId]).catch(() => ({})))[conversationId] || null;
      if (ex.segmento !== "general" && destino !== ex.segmento) continue;
    }
    const brazo = brazoPorHash(conversationId, 100000 + ex.id, ex.reparto);
    await db.prepare("INSERT OR IGNORE INTO experimento_chats (experimento_id, conversation_id, brazo, agente) VALUES (?, ?, ?, ?)").bind(ex.id, conversationId, brazo, agente || null).run();
    return respuesta(ex, brazo);
  }
  return null;
}

function respuesta(ex, brazo) {
  return {
    experimento_id: ex.id, nombre: ex.nombre, brazo,
    etiqueta: brazo === "B" ? ex.etiqueta_b : ex.etiqueta_a,
    ocultar: brazo === "B" ? ex.brazo_a.filter((id) => !ex.brazo_b.includes(id)) : ex.brazo_b.filter((id) => !ex.brazo_a.includes(id)),
    destacar: brazo === "B" ? ex.brazo_b : ex.brazo_a
  };
}

/**
 * Rápidas que solo existen para el brazo B de algún experimento (no están en su brazo A), de TODOS los experimentos
 * (activos, en pausa o terminados). El panel de rápidas las esconde en cualquier chat que no vaya por ese brazo B:
 * así una prueba en pausa no le muestra al equipo sus mensajes nuevos (dueño, 2026-11-03: «desactiva lo del Yape en 2
 * tiempos»). Se editan desde CRM → Pruebas con testers.
 */
export async function rapidasSoloDePrueba(db) {
  const { results } = await db.prepare("SELECT * FROM experimentos").all().catch(() => ({ results: [] }));
  const ids = new Set();
  for (const r of results || []) {
    const ex = parsearExperimento(r);
    for (const id of ex.brazo_b) if (!ex.brazo_a.includes(id)) ids.add(id);
  }
  return [...ids];
}

/** Métricas por brazo: chats, respondieron después de asignados, compraron en 72 h y en 7 días, horas hasta la compra. */
export async function metricasExperimento(db, ex) {
  const { results } = await db.prepare(
    `SELECT ec.brazo, ec.manual, ec.asignado_at,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = ec.conversation_id AND m.direction = 'in' AND m.created_at > ec.asignado_at) AS respuestas,
       (SELECT MIN(e.created_at) FROM capi_events e WHERE e.conversation_id = ec.conversation_id AND e.event_name = 'Purchase' AND e.created_at >= ec.asignado_at) AS compra_at,
       (SELECT etapa FROM conversations c WHERE c.id = ec.conversation_id) AS etapa
     FROM experimento_chats ec WHERE ec.experimento_id = ?`
  ).bind(ex.id).all();
  const brazos = { A: vacio(ex.etiqueta_a), B: vacio(ex.etiqueta_b) };
  const ms = (t) => new Date(String(t).replace(" ", "T") + "Z").getTime();
  for (const r of results || []) {
    if (r.manual) { brazos[r.brazo].manuales++; continue; } // cambiado a mano por el admin: fuera de la cuenta
    const b = brazos[r.brazo];
    b.chats++;
    if (r.respuestas > 0) b.respondieron++;
    const compro = r.compra_at ? ms(r.compra_at) - ms(r.asignado_at) : (r.etapa >= 5 ? null : -1);
    if (compro === null || compro >= 0) {
      const horas = compro === null ? null : compro / 3600000;
      if (horas === null || horas <= 7 * 24) b.compraron_7d++;
      if (horas !== null && horas <= 72) b.compraron_72h++;
      if (horas !== null) b.horas_compra.push(horas);
    }
  }
  for (const b of Object.values(brazos)) {
    b.tasa_7d = b.chats ? Math.round((b.compraron_7d / b.chats) * 1000) / 10 : null;
    b.horas_promedio = b.horas_compra.length ? Math.round(b.horas_compra.reduce((s, x) => s + x, 0) / b.horas_compra.length) : null;
    delete b.horas_compra;
  }
  const minimo = Number(ex.minimo_chats) || 150;
  return { brazos, faltan: Math.max(0, minimo - Math.min(brazos.A.chats, brazos.B.chats)), minimo };
}

const vacio = (etiqueta) => ({ etiqueta, chats: 0, respondieron: 0, compraron_72h: 0, compraron_7d: 0, horas_compra: [], manuales: 0 });

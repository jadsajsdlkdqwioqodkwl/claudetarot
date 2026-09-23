/**
 * PATCH /api/crm/assign — { conversation_id, action }
 *   action: "reclamar" — según cómo esté el chat:
 *             - libre → se lo asigna a quien pide.
 *             - ya es de otra persona y todavía nadie más lo comparte → deja
 *               a quien pide como el que comparte la comisión (no se lo
 *               quita al dueño, queda entre los dos).
 *             - ya lo tiene el que pide, o ya lo comparte → no hace nada.
 *             - ya lo tienen dos personas (dueño + quien comparte, ninguno
 *               es quien pide) → 409, no hay lugar para un tercero.
 *           "liberar"   — quien pide se saca a sí mismo:
 *             - si es el dueño y alguien lo comparte, ese pasa a ser el dueño.
 *             - si es el dueño y nadie más lo comparte, queda libre.
 *             - si solo lo comparte (no es el dueño), se saca y el dueño
 *               sigue igual.
 *           "reasignar" — se lo asigna a quien pide aunque ya sea de otra
 *                         persona, sacando a quien lo tuviera (transferir el
 *                         chat/venta a propósito).
 *           "quitar"    — solo un administrador: vacía el chat (dueño y
 *                         compartido) sin importar de quién sea.
 *           "definir"   — solo un administrador: { owner, shared: [...] }
 *                         deja la asignación exactamente así — a quien sea,
 *                         a sí mismo, a varios a la vez, o libre (owner null
 *                         y shared vacío). Sin owner pero con shared, el
 *                         primero de la lista pasa a ser el dueño.
 *           "entrar"    — se llama solo, cada vez que alguien ABRE un chat
 *                         (no es una acción que el vendedor elija a
 *                         propósito): si ya es de otra persona y todavía no
 *                         hay comisión compartida, deja a quien entró como
 *                         el que la comparte — sin botones, solo por haber
 *                         entrado al chat.
 *
 * `shared_with` guarda a todos los que comparten, uno por línea (el admin
 * puede sumar a varios con "definir"). Por su cuenta, un vendedor solo
 * puede sumarse si todavía nadie más comparte (máximo dos).
 *
 * "Reclamar" un chat que ya tienen dos personas devuelve 409 con quiénes lo
 * tienen, para que el frontend avise antes de que alguien mande "reasignar"
 * y le quite el lugar a uno de los dos.
 */

import { conAuth } from "../../lib/crm-auth.js";

const lista = (s) => (s ? String(s).split("\n").map((x) => x.trim()).filter(Boolean) : []);
const unir = (arr) => (arr.length ? arr.join("\n") : null);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function patch({ request, env, agent }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  const conversationId = Number(payload?.conversation_id);
  if (!conversationId) return json({ error: "Falta conversation_id." }, 400);

  const accion = String(payload?.action || "");
  if (!["reclamar", "liberar", "reasignar", "quitar", "entrar", "definir"].includes(accion)) {
    return json({ error: "Acción inválida." }, 400);
  }

  const nombre = agent?.displayName || agent?.username || "Alguien";

  const conv = await env.CRM_DB.prepare("SELECT id, assigned_agent, shared_with FROM conversations WHERE id = ?")
    .bind(conversationId)
    .first();
  if (!conv) return json({ error: "Conversación no encontrada." }, 404);

  const set = (assignedAgent, sharedWith) =>
    env.CRM_DB.prepare("UPDATE conversations SET assigned_agent = ?, shared_with = ? WHERE id = ?")
      .bind(assignedAgent, sharedWith, conversationId).run();

  if (accion === "quitar") {
    if (agent?.role !== "admin") return json({ error: "Solo un administrador puede hacer esto." }, 403);
    await set(null, null);
    return json({ ok: true, assigned_agent: null, shared_with: null });
  }

  const compartidos = lista(conv.shared_with);

  if (accion === "definir") {
    if (agent?.role !== "admin") return json({ error: "Solo un administrador puede hacer esto." }, 403);
    const limpiar = (x) => String(x || "").trim().slice(0, 80);
    let owner = limpiar(payload?.owner) || null;
    let shared = [...new Set((Array.isArray(payload?.shared) ? payload.shared : []).map(limpiar).filter(Boolean))];
    shared = shared.filter((n) => n !== owner);
    if (!owner && shared.length) owner = shared.shift();
    await set(owner, unir(shared));
    return json({ ok: true, assigned_agent: owner, shared_with: unir(shared) });
  }

  if (accion === "liberar") {
    if (conv.assigned_agent === nombre) {
      // Dueño se saca: el primero que lo comparte pasa a ser el dueño; si no hay nadie, queda libre.
      const [nuevoDueno = null, ...resto] = compartidos;
      await set(nuevoDueno, unir(resto));
      return json({ ok: true, assigned_agent: nuevoDueno, shared_with: unir(resto) });
    }
    if (compartidos.includes(nombre)) {
      // Solo lo compartía: se saca, el dueño y los demás siguen igual.
      const resto = unir(compartidos.filter((n) => n !== nombre));
      await set(conv.assigned_agent, resto);
      return json({ ok: true, assigned_agent: conv.assigned_agent, shared_with: resto });
    }
    // No tenía nada que liberar acá — nada que hacer.
    return json({ ok: true, assigned_agent: conv.assigned_agent, shared_with: conv.shared_with });
  }

  if (accion === "entrar") {
    // Silencioso: no es un botón, es que alguien distinto al dueño abrió el
    // chat. Solo se anota la PRIMERA vez — si un tercero lo abre después, no
    // se pisa la comisión ya compartida.
    if (conv.assigned_agent && conv.assigned_agent !== nombre && !conv.shared_with) {
      await set(conv.assigned_agent, nombre);
      return json({ ok: true, assigned_agent: conv.assigned_agent, shared_with: nombre });
    }
    return json({ ok: true, assigned_agent: conv.assigned_agent, shared_with: conv.shared_with });
  }

  if (accion === "reasignar") {
    await set(nombre, null);
    return json({ ok: true, assigned_agent: nombre, shared_with: null });
  }

  // "reclamar"
  if (!conv.assigned_agent) {
    await set(nombre, null);
    return json({ ok: true, assigned_agent: nombre, shared_with: null });
  }
  if (conv.assigned_agent === nombre || compartidos.includes(nombre)) {
    // Ya es suyo (dueño o compartido) — no hay nada que cambiar.
    return json({ ok: true, assigned_agent: conv.assigned_agent, shared_with: conv.shared_with });
  }
  if (conv.shared_with) {
    // Ya lo tienen dos personas y ninguna es quien pide — no hay lugar para un tercero.
    return json({ error: `Este chat ya lo tienen ${[conv.assigned_agent, ...compartidos].join(", ")}.`, assigned_agent: conv.assigned_agent, shared_with: conv.shared_with }, 409);
  }
  // Es de otra persona pero todavía nadie más lo comparte: se suma, no se lo quita.
  await set(conv.assigned_agent, nombre);
  return json({ ok: true, assigned_agent: conv.assigned_agent, shared_with: nombre });
}

export const onRequestPatch = conAuth(patch);

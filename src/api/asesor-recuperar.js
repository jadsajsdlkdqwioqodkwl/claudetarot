/**
 * POST /api/asesor/recuperar — con la cabecera x-asesor-clave.
 *   { horas?: 24, max?: 4, bienvenida?: true, probar?: false }
 * Recupera a las personas cuyos mensajes el webhook no pudo guardar (tabla webhook_errores): del 1 al 10/11/2026
 * fueron 241 clientes sin número (nombre de usuario de WhatsApp). Su id de negocio viene dentro del wa_message_id
 * (o en `payload`, desde la migración 0077); lo que escribieron entonces no se guardó, así que el chat se abre con
 * una nota en su lugar. Con `bienvenida`, a los que escribieron dentro de `horas` (ventana de 24 h abierta) les
 * sale la secuencia de bienvenida y su seguimiento de interesados, igual que a un chat nuevo (dueño, 2026-11-10).
 * De a `max` por llamada (cada bienvenida tarda varios segundos); se repite hasta que `faltan` sea 0.
 * No repite: quien ya tiene chat se salta.
 */
import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";
import { obtenerOCrearContacto, obtenerOCrearConversacion } from "../lib/crm-db.js";
import { mandarSecuenciaBienvenida } from "../lib/crm-welcome-sequence.js";
import { programarSeguimientoDeInteresados } from "../lib/crm-interesados.js";
import { esBsuid } from "../lib/whatsapp.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

/** El id de negocio que Meta mete dentro del id del mensaje («wamid.» + base64 con «PE.1122…» adentro). */
export function bsuidDeWamid(wamid) {
  try {
    const m = atob(String(wamid || "").replace(/^wamid\./, "")).match(/[A-Z]{2}\.[A-Za-z0-9]+/);
    return m && esBsuid(m[0]) ? m[0] : null;
  } catch {
    return null;
  }
}

export async function onRequestPost({ request, env }) {
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  const db = env.CRM_DB;
  if (!db) return json({ error: "Falta la base del CRM." }, 503);
  const p = (await request.json().catch(() => null)) || {};
  const horas = Math.min(Math.max(Number(p.horas) || 24, 1), 24 * 30);
  const max = Math.min(Math.max(Number(p.max) || 4, 1), 10);

  const { results: filas } = await db
    .prepare("SELECT wa_message_id, created_at FROM webhook_errores WHERE wa_id IS NULL AND created_at >= datetime('now', ?) ORDER BY id")
    .bind(`-${horas} hours`)
    .all();
  // Una entrada por persona: cuántos mensajes mandó y cuándo fue el último.
  const personas = new Map();
  for (const f of filas) {
    const id = bsuidDeWamid(f.wa_message_id);
    if (!id) continue;
    const x = personas.get(id) || { id, mensajes: 0, primero: f.created_at };
    x.mensajes++;
    x.ultimo = f.created_at;
    personas.set(id, x);
  }

  const res = { personas: personas.size, recuperados: [], ya_tenian_chat: 0, fallidos: [], faltan: 0 };
  for (const x of personas.values()) {
    if (await db.prepare("SELECT 1 FROM contacts WHERE wa_id = ?").bind(x.id).first()) { res.ya_tenian_chat++; continue; }
    if (res.recuperados.length + res.fallidos.length >= max || p.probar) { res.faltan++; continue; }
    try {
      const contacto = await obtenerOCrearContacto(db, null, null, null, { userId: x.id });
      const conv = await obtenerOCrearConversacion(db, contacto.id, null);
      const nota = `[Escribió ${x.mensajes === 1 ? "un mensaje" : `${x.mensajes} mensajes`} que el CRM no pudo guardar: es un cliente sin número (usa nombre de usuario de WhatsApp). Recuperado el 10/11.]`;
      await db.prepare("INSERT INTO messages (conversation_id, direction, type, body, status, created_at) VALUES (?, 'in', 'text', ?, 'received', ?)").bind(conv.id, nota, x.ultimo).run();
      await db.prepare("UPDATE conversations SET unread_count = unread_count + 1, last_message_at = ?, last_inbound_at = ?, status = 'abierta', hidden = 0 WHERE id = ?").bind(x.ultimo, x.ultimo, conv.id).run();
      let pasos = 0;
      // Solo con la ventana de 24 h abierta (con media hora de margen): fuera de ella WhatsApp rechaza el texto libre.
      const abierta = Date.now() - Date.parse(x.ultimo.replace(" ", "T") + "Z") < 23.5 * 3600e3;
      if (p.bienvenida !== false && abierta) {
        pasos = await mandarSecuenciaBienvenida(env, conv.id, contacto.wa_id, "Bienvenida automática (recuperado)", null, { pruebas: true });
        if (pasos) await programarSeguimientoDeInteresados(env, conv.id);
      }
      res.recuperados.push({ id: x.id, conversation_id: conv.id, ultimo: x.ultimo, bienvenida: pasos });
    } catch (err) {
      res.fallidos.push({ id: x.id, error: String(err.message).slice(0, 300) });
    }
  }
  return json(res);
}

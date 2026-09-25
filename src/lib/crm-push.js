/**
 * Dispara la notificación push (ver web-push.js) cuando llega algo nuevo por
 * WhatsApp. Vive aparte del webhook para no mezclar la lógica de parseo de
 * Meta con la de avisar a las vendedoras.
 */

import { suscripcionesParaAvisar, borrarSuscripcionPush } from "./crm-db.js";
import { mandarPush } from "./web-push.js";

const RESUMENES = { image: "📷 Foto", video: "🎥 Video", sticker: "Sticker", document: "📄 Documento", audio: "🎵 Audio", call: "📞 Llamada" };

export async function notificarMensajeNuevo(env, conversacion, contacto, { type, body }) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return; // no configurado — silencioso, no es un error del negocio

  const suscripciones = await suscripcionesParaAvisar(env.CRM_DB, conversacion.assigned_agent);
  if (!suscripciones.length) return;

  const titulo = contacto.profile_name || `+${contacto.wa_id}`;
  let cuerpo = (body && String(body).trim()) || RESUMENES[type] || "Mensaje nuevo";
  if (type === "location") cuerpo = `📍 ${String(body || "").split("|")[2] || "Ubicación"}`;
  if (type === "contacts") cuerpo = `👤 ${String(body || "").split("|")[0] || "Contacto"}`;

  const datos = {
    title: titulo,
    body: cuerpo.length > 120 ? cuerpo.slice(0, 120) + "…" : cuerpo,
    conversation_id: conversacion.id,
    tag: `chat-${conversacion.id}` // agrupa notificaciones del mismo chat en vez de amontonar una por mensaje
  };

  await Promise.all(
    suscripciones.map(async (sub) => {
      try {
        await mandarPush(env, sub, datos);
      } catch (err) {
        if (err.status === 404 || err.status === 410) {
          await borrarSuscripcionPush(env.CRM_DB, sub.endpoint).catch(() => {});
        } else {
          console.error("Push:", err.message);
        }
      }
    })
  );
}

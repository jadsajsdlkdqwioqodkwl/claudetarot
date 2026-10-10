/**
 * Planes de seguimiento CON PLANTILLA (fuera de la ventana de 24 h), que una
 * vendedora marca en un chat y el dueño (admin) autoriza:
 *  - "shalom": su pedido ya está en la agencia Shalom y no lo recoge
 *    (plantillas de categoría UTILITY, más baratas).
 *  - "lead": vino de un anuncio, recibió la bienvenida o una respuesta rápida
 *    y no respondió (MARKETING).
 * Cada plan son 3 envíos a los 4, 7 y 21 días del último mensaje del cliente.
 * Quedan en scheduled_messages con status 'por_aprobar' (el cron no los
 * toca) hasta que el admin los aprueba ('pendiente'); si los marca el admin,
 * salen aprobados. Si el cliente escribe, lo que falta se cancela solo
 * (cancelarSeguimientosPendientes), como cualquier seguimiento.
 *
 * Las plantillas se mandan a revisión de Meta solas, en la cuenta (WABA) del
 * número del chat, la primera vez que se marca un plan (plantillaAprobada).
 * Textos neutros: sirven para Tarot Store y para URO ({{2}} = el producto).
 */

import { plantillaAprobada, primerNombre } from "./plantillas.js";
import { envDeConversacion } from "./lineas.js";

export const IDIOMA_PLAN = "es_PE";
export const PREFIJO_PLAN = "Plan con plantilla";

const cuerpo = (text, ejemplo) => ({ type: "BODY", text, example: { body_text: [ejemplo] } });
const botones = (a, b) => ({ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: a }, { type: "QUICK_REPLY", text: b }] });

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
    ejemplo: ["María", "el kit de tarot"]
  }
};

/** El texto con los parámetros puestos, para mostrarlo en el CRM. */
export const textoDePaso = (paso, params) => paso.texto.replace(/\{\{(\d)\}\}/g, (m, n) => params[Number(n) - 1] ?? m);

/** Manda a revisión (si faltan) las plantillas del plan en la WABA del número de ese chat. Nunca frena. */
export async function asegurarPlantillasDelPlan(env, conversationId, plan) {
  const p = PLANES[plan];
  const envL = await envDeConversacion(env, conversationId);
  if (!envL.WHATSAPP_BUSINESS_ACCOUNT_ID) return;
  for (const paso of p.pasos) {
    await plantillaAprobada(envL, paso.nombre, {
      categoria: p.categoria,
      idioma: IDIOMA_PLAN,
      componentes: [cuerpo(paso.texto, p.ejemplo.slice(0, (paso.texto.match(/\{\{\d\}\}/g) || []).length)), botones(...p.botones)]
    }).catch((err) => console.error(`Plantilla ${paso.nombre}:`, err.message));
  }
}

/**
 * Los 3 envíos del plan para un chat: { send_at, template_name, params, body }.
 * Cada uno a los N días del último mensaje del cliente; si ese día ya pasó,
 * sale en 10 min (y los siguientes conservan su orden).
 */
export function pasosDelPlan(plan, { lastInboundAt, nombre, producto }, ahora = Date.now()) {
  const p = PLANES[plan];
  const base = lastInboundAt ? new Date(String(lastInboundAt).replace(" ", "T") + (String(lastInboundAt).includes("Z") ? "" : "Z")).getTime() : ahora;
  const params = plan === "lead" ? [primerNombre(nombre), producto || "su pedido"] : [primerNombre(nombre)];
  let previo = 0;
  return p.pasos.map((paso, i) => {
    const cuando = Math.max(base + paso.dias * 86400000, ahora + 10 * 60000 + i * 60000, previo + 60000);
    previo = cuando;
    return { send_at: new Date(cuando).toISOString(), template_name: paso.nombre, params, body: textoDePaso(paso, params) };
  });
}

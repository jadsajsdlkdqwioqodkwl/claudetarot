/**
 * Plantillas de WhatsApp (Message Templates) que el Worker manda solo:
 * pedido web (pedidos-web.js) y el plan de toques (toques.js).
 *
 * plantillaAprobada() dice si una plantilla ya está aprobada en Meta, en qué
 * idioma y si lleva {{1}} (el primer nombre). El estado se guarda 10 min en
 * crm_settings para no consultar a Meta en cada pasada del cron.
 *
 * Nunca crea plantillas: el admin las revisa y las manda a Meta desde el CRM
 * (plantillas-propuestas.js).
 */

import { listarTemplates } from "./whatsapp.js";
import { obtenerAjuste, guardarAjuste } from "./crm-db.js";

const CACHE_MS = 10 * 60 * 1000;

/** { idioma, conNombre, variables, conCopyCode } si está aprobada; null si no. */
export async function plantillaAprobada(env, nombre) {
  const db = env.CRM_DB;
  // Cada número de otra marca tiene su WABA: el estado se guarda por cuenta.
  const clave = env.LINEA_ID ? `plantilla_estado:${env.WHATSAPP_BUSINESS_ACCOUNT_ID}:${nombre}` : `plantilla_estado:${nombre}`;
  const guardado = await obtenerAjuste(db, clave).catch(() => null);
  if (guardado) {
    const [estado, at, idioma, conNombre, variables, conCopyCode] = String(guardado).split("|");
    // Las guardadas antes de tener variables o conCopyCode se vuelven a leer de Meta una vez.
    if (estado === "APPROVED" && variables !== undefined && conCopyCode !== undefined)
      return { idioma, conNombre: conNombre === "1", variables: Number(variables) || 0, conCopyCode: conCopyCode === "1" };
    if (estado !== "APPROVED" && Date.now() - Number(at) < CACHE_MS) return null;
  }
  const lista = (await listarTemplates(env)).filter((t) => t.name === nombre);
  const t = lista.find((x) => x.status === "APPROVED") || lista[0];
  const cuerpo = (t?.components || []).find((c) => String(c.type).toUpperCase() === "BODY")?.text || "";
  const conNombre = cuerpo.includes("{{1}}");
  // Cuántas variables lleva el texto APROBADO ({{1}}, {{2}}…): si se editó la plantilla, puede no
  // coincidir con las que se guardaron al programarla, y Meta rechaza el envío (#132000).
  const variables = Math.max(0, ...(cuerpo.match(/\{\{(\d+)\}\}/g) || []).map((v) => Number(v.slice(2, -2))));
  // ¿La plantilla tiene un botón COPY_CODE? Si sí, al mandarla se inyecta el número de Yape.
  const conCopyCode = (t?.components || []).some((c) =>
    String(c.type).toUpperCase() === "BUTTONS" &&
    (c.buttons || []).some((b) => String(b.type).toUpperCase() === "COPY_CODE")
  );
  await guardarAjuste(db, clave, `${t?.status || "NO_EXISTE"}|${Date.now()}|${t?.language || ""}|${conNombre ? 1 : 0}|${variables}|${conCopyCode ? 1 : 0}`);
  return t?.status === "APPROVED" ? { idioma: t.language, conNombre, variables, conCopyCode } : null;
}

export const primerNombre = (nombre) => String(nombre || "").trim().split(/\s+/)[0] || "estimad@";

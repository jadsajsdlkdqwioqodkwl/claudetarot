/**
 * Botón de respuesta «Ver catálogo» (dueño, 2026-10-18): cuando el cliente toca un botón con ese texto,
 * recibe el catálogo de SU número al toque (el toque abrió su ventana de 24 h, así que va como mensaje
 * normal). Sin «escribiendo…»: el catálogo sale como media (mandarAlToque). Con el killswitch del chat
 * puesto no sale nada automático.
 */
import { enviarCatalogoConPortada, listarProductosCatalogo } from "./whatsapp.js";
import { registrarMensajeSaliente } from "./crm-db.js";
import { mandarAlToque } from "./crm-send.js";
import { envDeConversacion } from "./lineas.js";

export const TEXTO_BOTON_CATALOGO = "Ver catálogo";
const RE_BOTON = /^\s*ver\s+cat[aá]logo\s*$/i;
export const esBotonVerCatalogo = (texto) => RE_BOTON.test(String(texto || ""));

export async function mandarCatalogoPorBoton(env, conversationId, waId) {
  const e = await envDeConversacion(env, conversationId);
  if (!e.WHATSAPP_CATALOG_ID) return false;
  let portadas = [];
  try {
    const productos = await listarProductosCatalogo(e, e.WHATSAPP_CATALOG_ID);
    portadas = [...productos.filter((p) => p.image_url && (!p.availability || p.availability === "in stock")), ...productos].map((p) => p.retailer_id);
  } catch { /* se manda igual sin portada elegida */ }
  const waMessageId = await mandarAlToque(env, conversationId, (x) => enviarCatalogoConPortada(x, waId, undefined, portadas));
  await registrarMensajeSaliente(env.CRM_DB, conversationId, { waMessageId, type: "catalog", body: "[Catálogo enviado]", sentBy: "Automático (botón Ver catálogo)" });
  return true;
}

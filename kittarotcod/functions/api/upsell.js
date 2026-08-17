/**
 * POST /api/upsell — el cliente aceptó un upsell después de dejar sus datos.
 * Busca su fila por código de pedido y actualiza las columnas Upsells y Total.
 *
 * Va aparte de /api/order a propósito: el pedido base se guarda apenas el
 * cliente envía el formulario, así que si abandona en la pantalla de upsell
 * el lead ya está en la hoja.
 */

import { findRowByOrderId, getValues, updateValues } from "../_lib/google-sheets.js";
import { sendWhatsAppText } from "../_lib/evolution.js";
import { UPSELLS, clean } from "../_lib/pedido.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

export async function onRequestPost({ request, env, waitUntil }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }

  const orderId = clean(payload.orderId, 20);
  const item = UPSELLS[payload.item];
  if (!/^TK-[A-Z2-9]{6}$/.test(orderId)) return json({ error: "Código de pedido inválido." }, 422);
  if (!item) return json({ error: "Upsell desconocido." }, 422);

  const sheetName = env.GOOGLE_SHEET_NAME || "Pedidos";

  try {
    const fila = await findRowByOrderId(env, orderId);
    if (!fila) return json({ error: "No encontramos ese pedido." }, 404);

    // K = Upsells, L = Total (ver encabezados en el README).
    const [actual = []] = await getValues(env, `${sheetName}!K${fila}:L${fila}`);
    const upsellsPrevios = clean(actual[0], 300);
    const totalPrevio = Number(actual[1]) || 0;

    const upsells = upsellsPrevios ? `${upsellsPrevios} + ${item.etiqueta}` : item.etiqueta;
    const total = totalPrevio + item.precio;

    await updateValues(env, `${sheetName}!K${fila}:L${fila}`, [[upsells, total]]);

    if (env.EVO_NOTIFY_NUMBER) {
      waitUntil(
        sendWhatsAppText(
          env,
          env.EVO_NOTIFY_NUMBER,
          `⬆️ Upsell en ${orderId}: ${item.etiqueta} (+S/ ${item.precio}). Nuevo total: S/ ${total}`
        ).catch((err) => console.error("Evolution (upsell):", err.message))
      );
    }

    return json({ ok: true, total });
  } catch (err) {
    console.error("Upsell:", err.message);
    return json({ error: "No pudimos añadir el extra al pedido." }, 502);
  }
}

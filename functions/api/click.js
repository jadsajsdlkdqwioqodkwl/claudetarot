/**
 * POST /api/click — marca que el cliente sí abrió el WhatsApp desde la página
 * de gracias. El vendedor filtra por esta columna para hacer outreach solo a
 * quienes no escribieron. Marca la columna K con "Sí".
 */

import { findRowByEventId, updateValues } from "../_lib/google-sheets.js";
import { clean, json } from "../_lib/pedido.js";

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }

  const eventId = clean(payload.eventId, 40);
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return json({ error: "Identificador inválido." }, 422);

  try {
    const fila = await findRowByEventId(env, eventId);
    if (!fila) return json({ error: "No encontramos ese pedido." }, 404);
    await updateValues(env, `${env.GOOGLE_SHEET_NAME || "Pedidos"}!K${fila}`, [["Sí"]]);
    return json({ ok: true });
  } catch (err) {
    console.error("Click:", err.message);
    return json({ error: "No pudimos registrar el clic." }, 502);
  }
}

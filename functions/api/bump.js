/**
 * POST /api/bump — el cliente aceptó el order bump después de dejar sus datos.
 * Localiza su fila por Event ID y actualiza Order bump y Total, sin crear
 * una fila nueva: un lead, una fila.
 */

import { findRowByEventId, getValues, updateValues } from "../_lib/google-sheets.js";
import { BUMPS, clean, json } from "../_lib/pedido.js";

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }

  const eventId = clean(payload.eventId, 40);
  const bump = BUMPS[payload.item];
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return json({ error: "Identificador inválido." }, 422);
  if (!bump) return json({ error: "Order bump desconocido." }, 422);

  const hoja = env.GOOGLE_SHEET_NAME || "Pedidos";

  try {
    const fila = await findRowByEventId(env, eventId);
    if (!fila) return json({ error: "No encontramos ese pedido." }, 404);

    // H = Order bump, I = Total
    const [actual = []] = await getValues(env, `${hoja}!H${fila}:I${fila}`);
    if (clean(actual[0], 200)) {
      // Ya lo tenía: no cobramos dos veces si el cliente hace doble clic.
      return json({ ok: true, total: Number(actual[1]) || 0, yaEstaba: true });
    }

    const total = (Number(actual[1]) || 0) + bump.precio;
    await updateValues(env, `${hoja}!H${fila}:I${fila}`, [[bump.etiqueta, total]]);

    return json({ ok: true, total });
  } catch (err) {
    console.error("Bump:", err.message);
    return json({ error: "No pudimos añadir el extra al pedido." }, 502);
  }
}

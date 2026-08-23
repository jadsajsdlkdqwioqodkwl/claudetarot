/**
 * POST /api/upsell — el cliente aceptó el order bump después de dejar sus datos.
 * Actualiza su fila: escribe el bump y recalcula el total.
 *
 * Va aparte de /api/order a propósito: el pedido base se guarda apenas el
 * cliente confirma, así que si abandona en la pantalla del bump el lead ya
 * está en la hoja. Aquí solo lo enriquecemos.
 *
 * La fila se localiza por su número, que /api/order devolvió al insertarla.
 * No hay código de pedido de por medio.
 */

import { getValues, updateValues } from "../lib/google-sheets.js";
import { COLUMNAS, indiceDe, letraDe } from "../lib/hoja.js";
import { UPSELLS } from "../lib/pedido.js";
import { notificarTelegram, mensajeBumpAgregado } from "../lib/telegram.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

/**
 * "S/ 139.00" o 139 -> 139.
 *
 * Las lecturas ya piden UNFORMATTED_VALUE, así que normalmente llega un
 * número. Esto es el cinturón de seguridad por si alguien formatea la columna
 * a mano o cambia el valueRenderOption: sin esto, Number("S/ 139.00") es NaN
 * y el pedido parecería no existir.
 */
function aNumero(valor) {
  if (typeof valor === "number") return valor;
  const limpio = String(valor ?? "").replace(/[^\d.-]/g, "");
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : 0;
}

export async function onRequestPost({ request, env, waitUntil }) {
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return json({ error: "Cuerpo inválido." }, 400);
  }

  const fila = Number(payload.fila);
  const item = UPSELLS[payload.item];
  // La fila 1 son los encabezados, así que cualquier pedido está en la 2 o más.
  if (!Number.isInteger(fila) || fila < 2) return json({ error: "Fila inválida." }, 422);
  if (!item) return json({ error: "Order bump desconocido." }, 422);

  const hoja = env.GOOGLE_SHEET_NAME || "Pedidos";
  const colBump = letraDe(indiceDe("Order bump"));
  const colTotal = letraDe(indiceDe("Total"));

  // Leemos desde Nombre hasta Total de una sola vez: además del subtotal,
  // es lo que necesita el aviso de Telegram sin hacer una segunda llamada.
  const colInicio = indiceDe("Nombre");
  const colFin = indiceDe("Total");

  try {
    const [valores = []] = await getValues(
      env, `${hoja}!${letraDe(colInicio)}${fila}:${letraDe(colFin)}${fila}`
    );
    const en = (nombreColumna) => valores[indiceDe(nombreColumna) - colInicio];

    // Releemos el subtotal en vez de fiarnos del navegador: el precio del
    // producto sigue saliendo del servidor.
    const subtotal = aNumero(en("Subtotal"));
    if (!subtotal) return json({ error: "No encontramos ese pedido." }, 404);

    const yaTenia = String(en("Order bump") || "").trim();
    if (yaTenia) {
      // Reintento o doble clic: no lo cobramos dos veces, ni avisamos otra vez.
      return json({ ok: true, total: aNumero(en("Total")) || subtotal, duplicado: true });
    }

    const total = subtotal + item.precio;
    await updateValues(env, `${hoja}!${colBump}${fila}:${colTotal}${fila}`, [[item.etiqueta, total]]);

    waitUntil(notificarTelegram(env, mensajeBumpAgregado({
      nombre: en("Nombre"),
      telefono: en("WhatsApp"),
      envio: en("Envío"),
      destino: en("Dirección / Agencia"),
      bump: item.etiqueta,
      total
    })));

    return json({ ok: true, total });
  } catch (err) {
    console.error("Upsell:", err.message);
    return json({ error: "No pudimos añadir el extra al pedido." }, 502);
  }
}

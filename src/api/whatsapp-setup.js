/**
 * POST /api/whatsapp-setup?token=… — registra el número en la Cloud API
 * desde el propio Worker, en vez de necesitar el token de WhatsApp en una
 * máquina local.
 *
 * Existe porque WHATSAPP_TOKEN ya vive como secret del Worker: un secret de
 * Cloudflare no se puede volver a leer una vez guardado, así que esto es lo
 * único que puede usarlo fuera del propio Worker en producción.
 *
 * Protegido con el mismo DIAG_TOKEN que /api/diag y /api/setup; sin él
 * responde 404. Body JSON: {"accion":"pedir-codigo"|"verificar"|"registrar",
 * "metodo"?:"SMS"|"VOICE", "codigo"?:"123456", "pin"?:"654321"}.
 */

import { pedirCodigo, verificarCodigo, registrarNumero } from "../lib/whatsapp.js";
import { mismoToken } from "../lib/token.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

function esSeisDigitos(valor) {
  return /^\d{6}$/.test(String(valor ?? ""));
}

export async function onRequestPost({ request, env }) {
  if (!env.DIAG_TOKEN) {
    return json({ error: "Apagado. Define el secret DIAG_TOKEN para encenderlo." }, 404);
  }
  if (!mismoToken(new URL(request.url).searchParams.get("token") || "", env.DIAG_TOKEN)) {
    return json({ error: "Token inválido." }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body inválido." }, 400);
  }

  try {
    if (body.accion === "pedir-codigo") {
      const metodo = body.metodo === "VOICE" ? "VOICE" : "SMS";
      const data = await pedirCodigo(env, { metodo });
      return json({ ok: true, paso: "pedir-codigo", metodo, data });
    }

    if (body.accion === "verificar") {
      if (!esSeisDigitos(body.codigo)) {
        return json({ error: "Falta 'codigo', el de 6 dígitos que llegó por SMS/voz." }, 400);
      }
      const data = await verificarCodigo(env, body.codigo);
      return json({ ok: true, paso: "verificar", data });
    }

    if (body.accion === "registrar") {
      if (!esSeisDigitos(body.pin)) {
        return json({ error: "Falta 'pin', un PIN NUEVO de 6 dígitos (no el del SMS)." }, 400);
      }
      const data = await registrarNumero(env, body.pin);
      return json({ ok: true, paso: "registrar", data });
    }

    return json({ error: "accion debe ser 'pedir-codigo', 'verificar' o 'registrar'." }, 400);
  } catch (err) {
    console.error("WhatsApp setup:", err.message);
    return json({ ok: false, error: err.message }, 502);
  }
}

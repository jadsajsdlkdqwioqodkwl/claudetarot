/**
 * GET /api/diag?token=… — diagnóstico forense de la conexión con Google Sheets.
 *
 * Recorre la cadena eslabón por eslabón y dice en cuál se rompe, en vez del
 * 502 genérico que ve el cliente. No devuelve ninguna credencial: de la clave
 * privada solo reporta su forma (largo, delimitadores, tipo de saltos de
 * línea), que es justo lo que suele estar mal al pegarla.
 *
 * Está apagado por defecto: sin el secret DIAG_TOKEN responde 404.
 *   npx wrangler secret put DIAG_TOKEN
 *
 * Con ?write=1 además intenta escribir una fila de prueba y borrarla no —
 * la deja marcada como "DIAGNÓSTICO" para que la borres a mano.
 */

import { pemToArrayBuffer, getAccessToken } from "../lib/google-sheets.js";
import { COLUMNAS } from "../lib/hoja.js";
import { mismoToken } from "../lib/token.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });


/** Saca el mensaje útil de un error de la API de Google sin volcar el cuerpo entero. */
function motivoGoogle(texto) {
  const crudo = String(texto ?? "").trim();
  if (!crudo) return "sin mensaje del servidor";

  // El error puede venir envuelto ("… falló (400): {json}"), así que buscamos
  // el JSON donde empiece. Si no hay, devolvemos el texto tal cual.
  const desde = crudo.indexOf("{");
  try {
    const cuerpo = JSON.parse(desde === -1 ? crudo : crudo.slice(desde));
    // Dos formas distintas: la API de Sheets anida en `error.message`, y OAuth
    // devuelve `error` / `error_description` en la raíz.
    const error = cuerpo.error;
    const detalle = [
      error && typeof error === "object" ? error.message : "",
      cuerpo.error_description,
      typeof error === "string" ? error : ""
    ].find(Boolean) || "";
    // Los patrones se buscan en el cuerpo entero: el código de error y el texto
    // legible viven en campos distintos según la API.
    for (const [patron, explicacion] of [
      [/has not been used in project|SERVICE_DISABLED/i,
        "La Google Sheets API no está habilitada en ese proyecto de Google Cloud."],
      [/caller does not have permission|PERMISSION_DENIED/i,
        "La cuenta de servicio no tiene acceso: comparte la hoja con ella como Editor."],
      [/Requested entity was not found/i,
        "No existe una hoja con ese GOOGLE_SHEET_ID."],
      [/invalid_grant|Invalid JWT Signature/i,
        "Google rechazó la firma del JWT: la clave privada no corresponde a ese client_email, o está mal pegada."],
      [/unauthorized_client/i,
        "La cuenta de servicio existe pero no está autorizada para este scope."]
    ]) {
      if (patron.test(crudo)) return explicacion;
    }
    return (detalle || crudo).slice(0, 300);
  } catch {
    return crudo.slice(0, 300);
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.DIAG_TOKEN) {
    return json({ error: "Diagnóstico apagado. Define el secret DIAG_TOKEN para encenderlo." }, 404);
  }
  const url = new URL(request.url);
  if (!mismoToken(url.searchParams.get("token") || "", env.DIAG_TOKEN)) {
    return json({ error: "Token inválido." }, 401);
  }

  const pasos = [];
  const anota = (nombre, ok, detalle) => { pasos.push({ paso: nombre, ok, detalle }); return ok; };
  const terminar = (veredicto) => json({ veredicto, pasos });

  /* 1 — ¿Están las variables? */
  const requeridas = ["GOOGLE_SHEET_ID", "GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY"];
  const faltan = requeridas.filter((k) => !env[k]);
  if (!anota("variables de entorno", faltan.length === 0,
    faltan.length ? `faltan: ${faltan.join(", ")}` : "las tres están definidas")) {
    return terminar("Faltan variables. Revisa wrangler.jsonc y los secrets del Worker.");
  }

  /* 2 — ¿Tiene forma de clave PEM? Aquí se cae la mayoría de los pegados. */
  const pk = env.GOOGLE_PRIVATE_KEY;
  const forma = {
    largo: pk.length,
    empieza_con_BEGIN: pk.trimStart().startsWith("-----BEGIN PRIVATE KEY-----"),
    termina_con_END: pk.trimEnd().endsWith("-----END PRIVATE KEY-----"),
    tiene_saltos_de_linea_reales: pk.includes("\n"),
    tiene_barra_n_literal: pk.includes("\\n"),
    viene_entre_comillas: /^["']|["']$/.test(pk.trim())
  };
  const formaOk = forma.empieza_con_BEGIN && forma.termina_con_END && !forma.viene_entre_comillas;
  anota("forma de la clave privada", formaOk, forma);

  /* 3 — ¿La acepta WebCrypto? */
  try {
    await crypto.subtle.importKey("pkcs8", pemToArrayBuffer(pk),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    anota("la clave privada se puede importar", true, "PKCS#8 válida");
  } catch (err) {
    anota("la clave privada se puede importar", false, err.message);
    return terminar(
      "La clave privada está corrupta. Vuelve a pegarla desde el JSON: " +
      "desde -----BEGIN hasta -----END, sin las comillas que la envuelven en el archivo."
    );
  }

  /* 4 — ¿Google nos da un token? */
  let accessToken;
  try {
    accessToken = await getAccessToken(env);
    anota("OAuth con Google", true, `token obtenido para ${env.GOOGLE_CLIENT_EMAIL}`);
  } catch (err) {
    // Un fallo de red no deja mensaje útil, así que arrastramos también el
    // nombre del error: sin esto el diagnóstico se queda mudo justo aquí.
    anota("OAuth con Google", false, {
      motivo: motivoGoogle(err?.message),
      tipo: err?.name || "Error"
    });
    return terminar("Google no emitió el token. La clave y el client_email no cuadran, o la API está deshabilitada.");
  }

  /* 5 — ¿Existe la hoja y tenemos permiso? */
  let pestanas = [];
  {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}` +
      `?fields=properties.title,sheets.properties.title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const cuerpo = await res.text();
    if (!res.ok) {
      anota("acceso a la hoja", false, `${res.status}: ${motivoGoogle(cuerpo)}`);
      return terminar(
        res.status === 403
          ? `Comparte la hoja con ${env.GOOGLE_CLIENT_EMAIL} como Editor (o habilita la Sheets API).`
          : "No pudimos abrir la hoja. Revisa GOOGLE_SHEET_ID."
      );
    }
    const meta = JSON.parse(cuerpo);
    pestanas = (meta.sheets || []).map((s) => s.properties.title);
    anota("acceso a la hoja", true, { titulo: meta.properties?.title, pestanas });
  }

  /* 6 — ¿Existe la pestaña con ese nombre exacto? */
  const pestana = env.GOOGLE_SHEET_NAME || "Pedidos";
  if (!anota("la pestaña existe", pestanas.includes(pestana),
    pestanas.includes(pestana) ? `"${pestana}"` : `no hay ninguna pestaña "${pestana}"; hay: ${pestanas.join(", ")}`)) {
    return terminar(`Renombra la pestaña a "${pestana}" o cambia GOOGLE_SHEET_NAME en wrangler.jsonc.`);
  }

  /* 7 — ¿Los encabezados son los que espera el backend? */
  {
    const rango = encodeURIComponent(`${pestana}!A1:${String.fromCharCode(64 + COLUMNAS.length)}1`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/${rango}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const actuales = res.ok ? ((await res.json()).values || [[]])[0] : [];
    const iguales = actuales.length === COLUMNAS.length &&
      actuales.every((v, i) => v === COLUMNAS[i]);
    anota("encabezados", iguales, iguales
      ? `${COLUMNAS.length} columnas, A–${String.fromCharCode(64 + COLUMNAS.length)}`
      : { esperados: COLUMNAS, encontrados: actuales, arreglo: "npm run setup:sheet" });
  }

  /* 8 — Escritura real, solo si la piden con ?write=1 */
  if (url.searchParams.get("write") === "1") {
    const fila = COLUMNAS.map((c) =>
      c === "Fecha" ? new Date().toISOString() :
      c === "Pedido" ? "TK-DIAG00" :
      c === "Nombre" ? "DIAGNÓSTICO — puedes borrar esta fila" :
      c === "Estado" ? "Prueba" : "");
    const rango = encodeURIComponent(`${pestana}!A:Z`);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/${rango}` +
      `:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [fila] })
      }
    );
    const cuerpo = await res.text();
    if (!anota("escritura de prueba", res.ok,
      res.ok ? JSON.parse(cuerpo).updates?.updatedRange : `${res.status}: ${motivoGoogle(cuerpo)}`)) {
      return terminar(
        `La cuenta de servicio puede leer pero no escribir. Compártela como **Editor**, no como Lector.`
      );
    }
  }


  const roto = pasos.find((p) => !p.ok);
  return terminar(roto
    ? `Todo conecta, pero revisa: ${roto.paso}.`
    : url.searchParams.get("write") === "1"
      ? "Cadena completa OK, incluida la escritura. Los pedidos deberían entrar."
      : "Lectura OK. Vuelve a llamar con &write=1 para probar la escritura.");
}

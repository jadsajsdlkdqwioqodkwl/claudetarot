/**
 * Cliente mínimo de Google Sheets para Cloudflare Workers.
 * Firma un JWT RS256 con la clave de la service account y lo canjea por
 * un access token OAuth2, luego hace values.append sobre la hoja.
 *
 * No usa librerías externas: todo con WebCrypto, que ya viene en el runtime.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

// Cache del token en memoria del isolate (se reusa entre requests calientes).
let cachedToken = null; // { value, expiresAt }

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeJson(value) {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

export function pemToArrayBuffer(pem) {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.value;

  const clientEmail = env.GOOGLE_CLIENT_EMAIL;
  const privateKey = env.GOOGLE_PRIVATE_KEY;
  if (!clientEmail || !privateKey) {
    throw new Error("Faltan GOOGLE_CLIENT_EMAIL o GOOGLE_PRIVATE_KEY");
  }

  const claims = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson(claims)}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const assertion = `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!res.ok) {
    throw new Error(`OAuth de Google falló (${res.status}): ${await res.text()}`);
  }

  const token = await res.json();
  cachedToken = { value: token.access_token, expiresAt: now + (token.expires_in || 3600) };
  return cachedToken.value;
}

/**
 * Agrega una fila al final de la hoja indicada.
 * @param {object} env  Variables de entorno del Worker
 * @param {Array<string|number>} row  Valores en el orden de las columnas
 */
export async function appendRow(env, row) {
  const accessToken = await getAccessToken(env);
  const sheetName = env.GOOGLE_SHEET_NAME || "Pedidos";
  const range = encodeURIComponent(`${sheetName}!A:Z`);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}` +
    `/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: [row] })
  });

  if (!res.ok) {
    // Un token revocado invalida el cache: el siguiente intento pedirá uno nuevo.
    if (res.status === 401) cachedToken = null;
    throw new Error(`Google Sheets rechazó la fila (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

/**
 * Lee un rango en formato A1 (ej. "Pedidos!B:B").
 * @returns {Promise<string[][]>} filas con sus valores
 */
export async function getValues(env, rangeA1) {
  const accessToken = await getAccessToken(env);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}` +
    `/values/${encodeURIComponent(rangeA1)}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    if (res.status === 401) cachedToken = null;
    throw new Error(`Google Sheets no pudo leer ${rangeA1} (${res.status}): ${await res.text()}`);
  }
  const body = await res.json();
  return body.values || [];
}

/** Escribe valores en un rango concreto (ej. "Pedidos!K7:L7"). */
export async function updateValues(env, rangeA1, values) {
  const accessToken = await getAccessToken(env);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}` +
    `/values/${encodeURIComponent(rangeA1)}?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values })
  });
  if (!res.ok) {
    if (res.status === 401) cachedToken = null;
    throw new Error(`Google Sheets no pudo escribir ${rangeA1} (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

/**
 * Busca el número de fila (1-indexado, como lo muestra Sheets) de un pedido
 * por su código en la columna B. Devuelve null si no existe.
 */
export async function findRowByOrderId(env, orderId) {
  const sheetName = env.GOOGLE_SHEET_NAME || "Pedidos";
  const columna = await getValues(env, `${sheetName}!B:B`);
  const index = columna.findIndex((fila) => fila[0] === orderId);
  return index === -1 ? null : index + 1;
}

/**
 * POST /api/asesor/ventas — el asesor (Routine de Claude) registra ventas de
 * provincia en la pestaña "Ventas" y les cuelga la boleta de Shalom, para que
 * cada cliente tenga su página de seguimiento /TS-… sin que nadie escriba a mano.
 *
 * Por qué existe: la boleta sale 1–3 días después de la venta, cuando la
 * ventana de 24 h de WhatsApp ya se cerró. Así que el link se crea el MISMO
 * día de la venta (accion "crear") y viaja en el mensaje de confirmación; la
 * boleta llega después a esa misma página (accion "boleta") sin escribirle.
 *
 * Misma clave que /api/asesor/avisos (x-asesor-clave). Cuerpos:
 *   { accion: "crear",  dni, celular, envio: "Shalom", adelanto, saldo, clave?, notas? }
 *       → { codigo, link, clave, nuevo }  (si ya hay una venta abierta con ese DNI, devuelve esa)
 *       Sin clave, un envío Shalom recibe una de las claves fijas (3114/3144/3143,
 *       la menos usada entre los pedidos abiertos) y queda anotada en la fila.
 *   { accion: "boleta", codigo? | dni, imagen_base64, mime?, orden?, cod_shalom?, estado? }
 *       → guarda la foto en R2 y pone la venta "En camino" (o el estado dado)
 *   { accion: "estado", codigo? | dni, estado, clave? }
 *
 * Nota: hasta ahora la pestaña Ventas la escribían solo las vendedoras. El
 * asesor escribe filas nuevas y, en filas existentes, solo Estado, la clave
 * (antes de la barra, respetando las notas) y el voucher si no tenía.
 */

import { getValues, updateValues } from "../lib/google-sheets.js";
import { COLUMNAS_VENTA, RANGO_DATOS_VENTA, ESTADOS_ENVIO, ENVIOS, nuevoCodigo, indiceVenta, letraVenta, esCodigo, claveDe, clavesShalom, elegirClaveShalom } from "../lib/ventas.js";
import { hojaVentas, olvidarCache } from "../lib/ventas-hoja.js";
import { autorizadoAsesor, dentroDelLimiteAsesor } from "./asesor.js";

const SITIO = "https://kit-tarot-para-principiantes.tarotperu.store";
const MAX_IMAGEN = 6 * 1024 * 1024;
const CERRADOS = new Set(["Pagado", "Cancelado"]);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

const col = (nombre) => letraVenta(indiceVenta(nombre));
const soloDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/** Fila (número de hoja) y valores de la venta que calza con el código o el DNI. */
export function buscarFila(filas, { codigo, dni }) {
  const iCod = indiceVenta("Código");
  const iCont = indiceVenta("DNI / WSP");
  const iEst = indiceVenta("Estado");
  const cod = String(codigo || "").trim().toUpperCase();
  const d = soloDigitos(dni);
  for (let i = filas.length - 1; i >= 0; i--) {
    const f = filas[i];
    if (cod && String(f[iCod] || "").trim().toUpperCase() === cod) return { fila: i + 2, valores: f };
    if (!cod && d.length >= 8 && new RegExp(`(^|\\D)${d}(\\D|$)`).test(String(f[iCont] || "")) && !CERRADOS.has(String(f[iEst] || "").trim())) {
      return { fila: i + 2, valores: f };
    }
  }
  return null;
}

/** La celda "Clave Shalom / Notas" con la clave nueva adelante y las notas intactas. */
export function conClave(celda, clave) {
  const partes = String(celda || "").split("/");
  const notas = partes.length > 1 ? partes.slice(1).join("/").trim() : (partes[0].trim() && !/^[A-Za-z0-9-]{1,12}$/.test(partes[0].trim()) ? partes[0].trim() : "");
  return notas ? `${clave} / ${notas}` : String(clave);
}

/** Claves de los pedidos abiertos (una por pedido), para repartir las fijas parejo. */
export function clavesAbiertas(filas) {
  return filas
    .filter((f) => !CERRADOS.has(String(f[indiceVenta("Estado")] || "").trim()) && String(f[indiceVenta("Código")] || "").trim())
    .map((f) => claveDe(f[indiceVenta("Clave Shalom / Notas")]))
    .filter(Boolean);
}

async function leerFilas(env) {
  return getValues(env, `${hojaVentas(env)}!${RANGO_DATOS_VENTA}`);
}

async function crear(env, p) {
  const dni = soloDigitos(p.dni).slice(0, 12);
  const celular = soloDigitos(p.celular).slice(-9);
  if (!dni && !celular) return json({ error: "Falta DNI o celular." }, 400);
  const envio = ENVIOS.includes(p.envio) ? p.envio : "Shalom";

  const filas = await leerFilas(env);
  const existente = dni ? buscarFila(filas, { dni }) : null;
  if (existente) {
    const codigo = existente.valores[indiceVenta("Código")];
    const claveExistente = claveDe(existente.valores[indiceVenta("Clave Shalom / Notas")]);
    return json({ codigo, link: `${SITIO}/${codigo}`, clave: claveExistente, nuevo: false });
  }

  const usados = new Set(filas.map((f) => String(f[indiceVenta("Código")] || "").toUpperCase()));
  let codigo = nuevoCodigo();
  while (usados.has(codigo)) codigo = nuevoCodigo();

  // Primera fila vacía de verdad (columna Fecha y Código vacías).
  let fila = filas.length + 2;
  for (let i = 0; i < filas.length; i++) {
    if (!String(filas[i][0] || "").trim() && !String(filas[i][indiceVenta("Código")] || "").trim()) { fila = i + 2; break; }
  }
  const hoja = hojaVentas(env);
  const fecha = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const contacto = [dni, celular].filter(Boolean).join(" / ");
  const claveShalom = String(p.clave || "").trim() || (envio === "Shalom" ? elegirClaveShalom(clavesShalom(env), clavesAbiertas(filas)) : "");
  const clave = [claveShalom, p.notas].filter((x) => x && String(x).trim()).join(" / ");
  // A–F y J–K por separado: G, H e I son ARRAYFORMULA de la fila 2 y escribir
  // encima (aunque sea vacío) rompe la columna entera.
  await updateValues(env, `${hoja}!A${fila}:F${fila}`, [[fecha, contacto, envio, p.adelanto ?? "", p.saldo ?? "", clave]]);
  await updateValues(env, `${hoja}!${col("Estado")}${fila}:${col("Código")}${fila}`, [["Pendiente", codigo]]);
  olvidarCache();
  return json({ codigo, link: `${SITIO}/${codigo}`, clave: claveShalom, nuevo: true });
}

async function actualizar(env, p, conImagen) {
  const filas = await leerFilas(env);
  const hallada = buscarFila(filas, { codigo: p.codigo, dni: p.dni });
  if (!hallada) return json({ error: "No encontré esa venta (ni por código ni por DNI)." }, 404);
  const { fila, valores } = hallada;
  const codigo = String(valores[indiceVenta("Código")] || "").trim().toUpperCase();
  if (!esCodigo(codigo)) return json({ error: "Esa fila no tiene código válido." }, 422);
  const hoja = hojaVentas(env);

  if (conImagen) {
    if (!env.CRM_MEDIA) return json({ error: "Falta el bucket R2." }, 503);
    const bytes = Uint8Array.from(atob(String(p.imagen_base64 || "")), (c) => c.charCodeAt(0));
    if (!bytes.length || bytes.length > MAX_IMAGEN) return json({ error: "Imagen vacía o demasiado grande." }, 400);
    await env.CRM_MEDIA.put(`boletas/${codigo}`, bytes, { httpMetadata: { contentType: /^image\/(jpeg|png|webp)$/.test(p.mime) ? p.mime : "image/jpeg" } });
    await updateValues(env, `${hoja}!${col("Drive ID")}${fila}`, [[`r2:boletas/${codigo}`]]);
  }

  const estado = p.estado || (conImagen ? "En camino" : null);
  if (estado) {
    if (!ESTADOS_ENVIO.includes(estado)) return json({ error: "Estado inválido." }, 400);
    const actual = String(valores[indiceVenta("Estado")] || "").trim();
    // Nunca hacia atrás: una boleta vieja no devuelve a "En camino" algo ya pagado.
    if (ESTADOS_ENVIO.indexOf(estado) > ESTADOS_ENVIO.indexOf(actual) || !actual) {
      await updateValues(env, `${hoja}!${col("Estado")}${fila}`, [[estado]]);
      if (estado === "En destino") {
        const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
        await updateValues(env, `${hoja}!${col("En destino desde")}${fila}`, [[hoy]]);
      }
    }
  }
  // Clave adelante (la página solo publica eso) y orden/código de Shalom en
  // las notas, que nunca salen a la página.
  const original = String(valores[indiceVenta("Clave Shalom / Notas")] || "");
  let celda = p.clave ? conClave(original, p.clave) : original;
  const extra = [p.orden && `Orden ${p.orden}`, p.cod_shalom && `Cód ${p.cod_shalom}`].filter(Boolean).join(" · ");
  if (extra && !celda.includes(extra)) celda = celda.includes("/") ? `${celda} · ${extra}` : `${celda.trim() || "-"} / ${extra}`;
  if (celda !== original) await updateValues(env, `${hoja}!${col("Clave Shalom / Notas")}${fila}`, [[celda]]);
  olvidarCache();
  return json({ ok: true, codigo, link: `${SITIO}/${codigo}` });
}

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await dentroDelLimiteAsesor(env, ip))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  const p = await request.json().catch(() => null);
  try {
    if (p?.accion === "crear") return await crear(env, p);
    if (p?.accion === "boleta") return await actualizar(env, p, true);
    if (p?.accion === "estado") return await actualizar(env, p, false);
  } catch (err) {
    console.error("Asesor ventas:", err.message);
    return json({ error: err.message }, 502);
  }
  return json({ error: "Acción inválida." }, 400);
}

export { COLUMNAS_VENTA };

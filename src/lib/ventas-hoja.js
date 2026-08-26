/**
 * Lectura de la pestaña "Ventas" desde el Worker.
 *
 * Separado de `ventas.js` a propósito: aquel es solo el esquema (lo importa
 * `npm run check`, que corre sin red ni credenciales) y este es el que sale a
 * Google. Así los chequeos siguen funcionando sin una service account.
 *
 * El Worker solo LEE esta pestaña. Quien escribe es el vendedor, desde el
 * Sheets o desde el panel móvil de Apps Script. Si mañana el Worker escribiera
 * aquí, habría dos dueños del mismo dato y ganaría el último que guarde.
 */
import { getValues } from "./google-sheets.js";
import {
  COLUMNAS_VENTA,
  RANGO_DATOS_VENTA,
  esCodigo,
  indiceVenta
} from "./ventas.js";

/** Segundos que una lectura vale antes de volver a preguntarle a Google. */
const VIGENCIA_MS = 20_000;

/**
 * Memoria del isolate. Sheets cobra por llamada y el vendedor cambia estados
 * de a uno; releer la pestaña entera en cada visita sería tirar cuota.
 * El precio es que un cambio recién hecho puede tardar hasta 20 s en verse.
 */
let cache = { at: 0, filas: null };

export function hojaVentas(env) {
  return env.GOOGLE_VENTAS_NAME || "Ventas";
}

async function filasDeVentas(env) {
  const ahora = Date.now();
  if (cache.filas && ahora - cache.at < VIGENCIA_MS) return cache.filas;

  const filas = await getValues(env, `${hojaVentas(env)}!${RANGO_DATOS_VENTA}`);
  cache = { at: ahora, filas };
  return filas;
}

/**
 * Busca una venta por su código y la devuelve como objeto con los nombres de
 * columna como claves. `null` si no existe.
 *
 * La comparación va en mayúsculas y sin espacios porque el código viaja por
 * WhatsApp: el cliente lo pega con un espacio delante o el teclado del celular
 * se lo pone en minúsculas, y eso no debería ser un 404.
 */
export async function buscarVenta(env, codigo) {
  if (!esCodigo(codigo)) return null;

  const buscado = codigo.trim().toUpperCase();
  const iCodigo = indiceVenta("Código");
  const filas = await filasDeVentas(env);

  const fila = filas.find(
    (f) => String(f[iCodigo] ?? "").trim().toUpperCase() === buscado
  );
  if (!fila) return null;

  const venta = {};
  COLUMNAS_VENTA.forEach((nombre, i) => {
    venta[nombre] = String(fila[i] ?? "").trim();
  });
  return venta;
}

/** Vacía la memoria del isolate. Solo lo usan las pruebas. */
export function olvidarCache() {
  cache = { at: 0, filas: null };
}

/**
 * Prepara la hoja de pedidos: escribe la fila de encabezados en el orden que
 * espera el backend. Idempotente — puedes correrlo las veces que quieras.
 *
 *   node scripts/setup-sheet.mjs            # lee .dev.vars
 *   GOOGLE_SHEET_ID=... node scripts/setup-sheet.mjs
 *
 * En Node hace falta que fetch respete el proxy y la CA del entorno:
 *   NODE_USE_ENV_PROXY=1 node scripts/setup-sheet.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { updateValues, getValues } from "../src/lib/google-sheets.js";
import { COLUMNAS, RANGO_ENCABEZADOS } from "../src/lib/hoja.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// El esquema vive en src/lib/hoja.js: es la misma fuente que usa el backend.
export const HEADERS = COLUMNAS;

/** Lee .dev.vars (KEY="valor") sin dependencias. */
function loadDevVars() {
  const file = join(root, ".dev.vars");
  if (!existsSync(file)) return {};
  const vars = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    vars[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return vars;
}

const env = { ...loadDevVars(), ...process.env };
const sheetName = env.GOOGLE_SHEET_NAME || "Pedidos";

for (const key of ["GOOGLE_SHEET_ID", "GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY"]) {
  if (!env[key]) {
    console.error(`Falta ${key}. Complétalo en .dev.vars o pásalo como variable de entorno.`);
    process.exit(1);
  }
}

const [existente = []] = await getValues(env, `${sheetName}!${RANGO_ENCABEZADOS}`);
if (existente.length && existente.join("|") === HEADERS.join("|")) {
  console.log("Los encabezados ya estaban correctos. Nada que hacer.");
  process.exit(0);
}
if (existente.length) {
  console.log("Encabezados actuales distintos, se van a sobrescribir:");
  console.log("  " + existente.join(" | "));
}

await updateValues(env, `${sheetName}!${RANGO_ENCABEZADOS}`, [HEADERS]);
console.log(`Encabezados escritos en "${sheetName}":`);
console.log("  " + HEADERS.join(" | "));
console.log("\nRecuerda compartir la hoja con " + env.GOOGLE_CLIENT_EMAIL + " como Editor.");

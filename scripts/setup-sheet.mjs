/**
 * Deja la hoja lista como CRM. Idempotente.
 *
 *   npm run setup:sheet
 *
 * Necesita las credenciales en .dev.vars. Si no las tienes en la máquina,
 * usa el endpoint del Worker, que ya lleva la clave como secret:
 *
 *   curl -X POST "https://TU-DOMINIO/api/setup?token=TU_DIAG_TOKEN"
 *
 * En Node hace falta que fetch respete el proxy y la CA del entorno:
 *   NODE_USE_ENV_PROXY=1 node scripts/setup-sheet.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { prepararHoja } from "../src/lib/crm-setup.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

for (const key of ["GOOGLE_SHEET_ID", "GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY"]) {
  if (!env[key]) {
    console.error(`Falta ${key}. Complétalo en .dev.vars o pásalo como variable de entorno.`);
    console.error("O prepara la hoja desde el Worker: POST /api/setup?token=TU_DIAG_TOKEN");
    process.exit(1);
  }
}

try {
  for (const linea of await prepararHoja(env)) console.log(linea);
  console.log(`\nRecuerda compartir la hoja con ${env.GOOGLE_CLIENT_EMAIL} como Editor.`);
} catch (err) {
  console.error("\nNo se pudo preparar la hoja:", err.message);
  process.exit(1);
}

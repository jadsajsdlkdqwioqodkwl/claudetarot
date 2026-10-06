/**
 * Convierte las filas pendientes de la pestaña "Prompts" (las escribe el
 * Project de Claude) en lote.json listo para render.mjs.
 *
 *   node scripts/creativos/desde-hoja.mjs <prompts.json> creativos/lotes/L001
 *
 * <prompts.json> es lo que devuelve get_values de Prompts!A1:L (con la fila
 * de encabezados). Solo toma las filas con Estado vacío o "pendiente" y del
 * mismo Lote que la primera pendiente (o sin lote). Imprime los números de
 * fila tomados para marcarlas "hecho" después.
 *
 * Columnas: Lote | ID | Ángulo | Consciencia | Producto | Titular |
 *           Copy | Refs | Prompt JSON | Estado | Nota | Avatar
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error("Uso: desde-hoja.mjs <prompts.json> creativos/lotes/Lnnn");
  process.exit(1);
}

let datos = JSON.parse(readFileSync(entrada, "utf8"));
if (!Array.isArray(datos)) datos = datos.values;
const [, ...filas] = datos;
const refsValidas = Object.keys(JSON.parse(readFileSync(join(root, "creativos/refs/refs.json"), "utf8")));
const dir = resolve(root, salida);
const loteId = basename(dir);

// Lotes de la hoja que ya tienen carpeta en creativos/lotes/ (aunque la hoja
// aún no diga "hecho"): no se vuelven a crear.
const lotesDir = join(root, "creativos/lotes");
const yaHechos = new Set(
  (existsSync(lotesDir) ? readdirSync(lotesDir) : [])
    .map((l) => join(lotesDir, l, "lote.json"))
    .filter(existsSync)
    .map((f) => JSON.parse(readFileSync(f, "utf8")).lote_hoja)
    .filter(Boolean),
);

const pendientes = filas
  .map((f, i) => ({ f, fila: i + 2 }))
  .filter(({ f }) => f[1] && f[8] && (!f[9] || /pendiente/i.test(f[9])) && !yaHechos.has(f[0] || ""));
const loteHoja = pendientes[0]?.f[0] || "";
const tomadas = pendientes.filter(({ f }) => (f[0] || "") === loteHoja);
if (!tomadas.length) {
  console.error("No hay filas pendientes en Prompts.");
  process.exit(1);
}

const avisos = [];
const conceptos = tomadas.map(({ f, fila }) => {
  const [, id, angulo, consciencia, producto, titular, copy, refsTxt, promptTxt, , nota, avatar] = f;
  let prompt;
  try {
    prompt = JSON.parse(promptTxt);
  } catch {
    prompt = promptTxt;
    avisos.push(`fila ${fila} (${id}): el prompt no es JSON válido, va como texto`);
  }
  const refs = String(refsTxt || "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [foto, ...rol] = s.split(":");
      return { foto: foto.trim(), rol: rol.join(":").trim() || "úsala como referencia del producto real" };
    })
    .filter((r) => {
      if (refsValidas.includes(r.foto)) return true;
      avisos.push(`fila ${fila} (${id}): foto "${r.foto}" no existe, se quitó`);
      return false;
    });
  return {
    id: String(id).trim(),
    angulo, consciencia, producto, titular, copy, refs, prompt,
    avatar: String(avatar || "").trim().toUpperCase(),
    formato: String(nota || "").replace(/^formato:\s*/i, "").trim(),
    fila_hoja: fila,
  };
});

// Reglas del feedback que se pueden chequear sin mirar la imagen
// (creativos/reglas_aprendidas.md). Son avisos: Claude Code corrige el
// prompt en lote.json antes de renderizar.
const usos = {};
for (const c of conceptos) for (const r of c.refs) usos[r.foto] = (usos[r.foto] || 0) + 1;
for (const [foto, n] of Object.entries(usos)) {
  if (foto === "kit_etiquetado") avisos.push(`"kit_etiquetado" no se usa: Gemini pega la foto con sus etiquetas (L002-C04, L003-C08)`);
  const max = foto === "kit_completo" ? 1 : 2;
  if (n > max) avisos.push(`"${foto}" se usa ${n} veces en el lote (máx. ${max})`);
}
// Diversidad de avatares (creativos/avatares.md): 5+ distintos, ninguno más de 3.
const porAvatar = {};
for (const c of conceptos) {
  if (!c.avatar) avisos.push(`${c.id}: sin avatar (Prompts col. L)`);
  else porAvatar[c.avatar] = (porAvatar[c.avatar] || 0) + 1;
}
for (const [a, n] of Object.entries(porAvatar)) if (n > 3) avisos.push(`avatar ${a} se usa ${n} veces en el lote (máx. 3)`);
if (conceptos.length >= 8 && Object.keys(porAvatar).length < 5) avisos.push(`solo ${Object.keys(porAvatar).length} avatares distintos en el lote (mín. 5)`);
const PROHIBIDO = [/[«»]/, /whats\s*app/i, /ver kit/i, /\s\+\s/, /\busa\b[^.]{1,40},\s*no\b/i, /\bhoy,\s*no\b/i, /\boriginal\b/i];
for (const c of conceptos) {
  const textos = JSON.stringify(typeof c.prompt === "string" ? c.prompt : c.prompt.textos ?? c.prompt);
  for (const re of PROHIBIDO) if (re.test(textos)) avisos.push(`${c.id}: texto con ${re} (ver reglas_aprendidas.md)`);
}

if (existsSync(join(dir, "lote.json"))) {
  console.error(`${salida}/lote.json ya existe; usa otro número de lote.`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
const lote = { lote: loteId, lote_hoja: loteHoja, creado: new Date().toISOString().slice(0, 10), aspecto: "4:5", conceptos };
writeFileSync(join(dir, "lote.json"), JSON.stringify(lote, null, 2) + "\n");

console.log(JSON.stringify({ lote: loteId, conceptos: conceptos.length, filas: tomadas.map((t) => t.fila), avisos }, null, 1));

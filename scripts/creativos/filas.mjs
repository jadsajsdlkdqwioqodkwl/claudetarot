/**
 * Filas para la pestaña "Creativos" de la hoja, en JSON (las escribe Claude
 * con el conector de Google Sheets). Correr DESPUÉS de hacer push de las
 * imágenes: la fórmula =IMAGE() apunta al commit actual en GitHub.
 *
 *   node scripts/creativos/filas.mjs creativos/lotes/L001
 *   node scripts/creativos/filas.mjs creativos/lotes/L001 --angulos   (filas para la pestaña Ángulos)
 *
 * Columnas: Lote | ID | Imagen | Nota (1-5) | Comentario | Ángulo |
 *           Consciencia | Producto | Titular | Copy | Refs | Archivo | Avatar
 * (--angulos: … | Comentario | Estado | Avatar)
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const dir = resolve(root, args.find((a) => !a.startsWith("--")));
const calidad = "flash";

const lote = JSON.parse(readFileSync(join(dir, "lote.json"), "utf8"));
const render = existsSync(join(dir, "render.json")) ? JSON.parse(readFileSync(join(dir, "render.json"), "utf8")) : {};
const sha = execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
const remoto = execSync("git remote get-url origin", { cwd: root }).toString().trim();
const repo = remoto.match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1] || "jadsajsdlkdqwioqodkwl/claudetarot";
const base = `https://raw.githubusercontent.com/${repo}/${sha}/${relative(root, dir)}`;

const loteNombre = lote.lote_hoja ? `${lote.lote} ${lote.lote_hoja}` : lote.lote;
if (args.includes("--angulos")) {
  const filas = lote.conceptos
    .filter((c) => render[`${c.id}.flash`] || render[`${c.id}.pro`])
    .map((c) => [loteNombre, c.id, c.formato || "", c.angulo || "", c.consciencia || "", c.producto || "", c.titular || "", (c.refs || []).map((x) => x.foto).join(", "), "", "", "", c.avatar || ""]);
  console.log(JSON.stringify(filas));
  process.exit(0);
}

const filas = [];
for (const c of lote.conceptos) {
  const r = render[`${c.id}.${calidad}`];
  if (!r) continue;
  filas.push([
    loteNombre,
    c.id,
    r.archivo ? `=IMAGE("${base}/${r.final || r.archivo}")` : `ERROR: ${r.error}`,
    "",
    "",
    c.angulo || "",
    c.consciencia || "",
    c.producto || "",
    c.titular || "",
    c.copy || "",
    (c.refs || []).map((x) => x.foto).join(", "),
    r.archivo ? `${relative(root, dir)}/${r.final || r.archivo}` : "",
    c.avatar || "",
  ]);
}
console.log(JSON.stringify(filas.sort((a, b) => a[1].localeCompare(b[1]))));

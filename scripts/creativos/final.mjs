/**
 * Versión final para Meta: 1080×1350 PNG (4:5), recortada al centro si
 * Gemini no devolvió 4:5 exacto. La original 2K queda en img/ y la final en
 * final/; esa es la que va a la hoja y la que se sube a Meta.
 *
 *   node scripts/creativos/final.mjs creativos/lotes/L001     (rehace todas)
 *
 * Usa ImageMagick (`convert`), que viene instalado en el entorno.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

export const ANCHO = 1080;
export const ALTO = 1350;

/** img/C01.flash.jpg → final/C01.flash.png (rutas relativas a la carpeta del lote). */
export function hacerFinal(dir, archivo) {
  const final = `final/${basename(archivo, extname(archivo))}.png`;
  mkdirSync(join(dir, "final"), { recursive: true });
  execFileSync("convert", [
    join(dir, archivo),
    "-resize", `${ANCHO}x${ALTO}^`,
    "-gravity", "center",
    "-extent", `${ANCHO}x${ALTO}`,
    "-strip",
    `PNG24:${join(dir, final)}`,
  ]);
  return final;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const dir = resolve(root, process.argv[2] || "");
  const renderFile = join(dir, "render.json");
  if (!existsSync(renderFile)) {
    console.error("Uso: final.mjs creativos/lotes/Lnnn (necesita render.json)");
    process.exit(1);
  }
  const render = JSON.parse(readFileSync(renderFile, "utf8"));
  let n = 0;
  for (const r of Object.values(render)) {
    if (!r.archivo) continue;
    r.final = hacerFinal(dir, r.archivo);
    n++;
  }
  writeFileSync(renderFile, JSON.stringify(render, null, 2) + "\n");
  console.log(`${n} finales ${ANCHO}x${ALTO} PNG en ${process.argv[2]}/final`);
}

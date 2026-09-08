/**
 * Arma un único HTML de public/temario-diplomado.html, con las fotos de
 * public/img/ embebidas como data URI, para pegar tal cual en un bloque de
 * HTML personalizado de GoHighLevel: `npm run build:ghl`
 *
 * Por qué hace falta esto y no basta con copiar el archivo: GHL no sirve los
 * `public/img/*.jpg` de este repo, así que las rutas relativas romperían en
 * cuanto se pegue el HTML en otro dominio. La única forma de que las fotos
 * viajen con la página es meterlas adentro del propio HTML.
 *
 * También reescribe API_BASE: en este dominio el formulario llama a la URL
 * relativa `/api/temario-lead` (mismo Worker), pero pegado en GHL la página
 * vive en otro origen, así que tiene que apuntar a la URL absoluta del
 * Worker ya desplegado. Ese Worker ya responde con CORS abierto para esto
 * (ver src/api/lead-diplomado.js).
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Cambia esto por la URL real del Worker desplegado antes de generar el
// archivo para producción — o edita el resultado a mano, es una sola línea.
const API_BASE_PLACEHOLDER = "https://REEMPLAZA-CON-TU-DOMINIO.workers.dev";

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };

let html = readFileSync(join(root, "public/temario-diplomado.html"), "utf8");

let totalImgBytes = 0;
html = html.replace(/(?:src|href)="img\/([a-zA-Z0-9_.-]+)"/g, (match, archivo) => {
  const ruta = join(root, "public/img", archivo);
  const ext = archivo.slice(archivo.lastIndexOf("."));
  const mime = MIME[ext];
  if (!mime) throw new Error(`Tipo de imagen sin mapear: ${archivo}`);
  const bytes = readFileSync(ruta);
  totalImgBytes += bytes.length;
  const base64 = bytes.toString("base64");
  const atributo = match.startsWith("href") ? "href" : "src";
  return `${atributo}="data:${mime};base64,${base64}"`;
});

html = html.replace(
  'var API_BASE = "";',
  `var API_BASE = "${API_BASE_PLACEHOLDER}"; // TODO: reemplaza por la URL real del Worker desplegado`
);

const distDir = join(root, "dist");
mkdirSync(distDir, { recursive: true });
const destino = join(distDir, "temario-diplomado-ghl.html");
writeFileSync(destino, html);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`✓ ${destino}`);
console.log(`  fotos embebidas: ${kb(totalImgBytes)} crudas -> archivo final ${kb(statSync(destino).size)}`);
console.log(`  API_BASE quedó en "${API_BASE_PLACEHOLDER}" — reemplázalo por la URL real antes de pegarlo en GHL.`);

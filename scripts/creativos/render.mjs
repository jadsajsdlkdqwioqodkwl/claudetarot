/**
 * Renderiza un lote de anuncios estáticos con Nano Banana (API de Gemini).
 *
 *   npm run creativos:render -- creativos/lotes/L001            (Flash, todos)
 *   npm run creativos:render -- creativos/lotes/L001 --pro      (Pro, los marcados en pro.json o --solo)
 *   npm run creativos:render -- creativos/lotes/L001 --solo C03,C07
 *
 * Lee <lote>/lote.json, adjunta las fotos de creativos/refs/ que declara cada
 * concepto y guarda <lote>/img/<ID>.<flash|pro>.<ext>. Anota el resultado en
 * <lote>/render.json. Necesita GEMINI_API_KEY (variable del entorno).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REFS_DIR = join(root, "creativos/refs");

const MODELOS = {
  flash: { id: process.env.MODELO_FLASH || "gemini-3.1-flash-image-preview", size: "1K", usd: 0.067 },
  pro: { id: process.env.MODELO_PRO || "gemini-3-pro-image-preview", size: "2K", usd: 0.134 },
};
const PARALELO = 4;

const args = process.argv.slice(2);
const loteDir = args.find((a) => !a.startsWith("--"));
const calidad = args.includes("--pro") ? "pro" : "flash";
const soloArg = args[args.indexOf("--solo") + 1];
const solo = args.includes("--solo") && soloArg ? new Set(soloArg.split(",").map((s) => s.trim())) : null;

if (!loteDir) {
  console.error("Uso: render.mjs creativos/lotes/L001 [--pro] [--solo C01,C02]");
  process.exit(1);
}
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("Falta GEMINI_API_KEY. Agrégala como variable del entorno de Claude Code (Editar entorno).");
  process.exit(1);
}

const dir = resolve(root, loteDir);
const lote = JSON.parse(readFileSync(join(dir, "lote.json"), "utf8"));
const renderFile = join(dir, "render.json");
const render = existsSync(renderFile) ? JSON.parse(readFileSync(renderFile, "utf8")) : {};
mkdirSync(join(dir, "img"), { recursive: true });

// En Pro, sin --solo, se renderizan los que pro.json marca (los elige Claude
// desde la columna "¿A Pro?" de la hoja).
let elegidos = lote.conceptos;
if (solo) elegidos = elegidos.filter((c) => solo.has(c.id));
else if (calidad === "pro") {
  const proFile = join(dir, "pro.json");
  const ids = existsSync(proFile) ? new Set(JSON.parse(readFileSync(proFile, "utf8"))) : new Set();
  elegidos = elegidos.filter((c) => ids.has(c.id));
}
if (!elegidos.length) {
  console.error("No hay conceptos para renderizar.");
  process.exit(1);
}

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function parteFoto(nombre) {
  const file = ["", ".jpg", ".png", ".webp", ".jpeg"].map((e) => join(REFS_DIR, nombre + e)).find(existsSync);
  if (!file) throw new Error(`No existe la foto de referencia "${nombre}" en creativos/refs/`);
  return { inlineData: { mimeType: MIME[extname(file).toLowerCase()] || "image/jpeg", data: readFileSync(file).toString("base64") } };
}

/** Texto del prompt + cada foto precedida de su rol, en ese orden. */
function partes(c) {
  const prompt = typeof c.prompt === "string" ? c.prompt : JSON.stringify(c.prompt, null, 2);
  const refs = c.refs || [];
  const out = [{ text: prompt }];
  refs.forEach((r, i) => {
    out.push({ text: `Imagen de referencia ${i + 1} (${r.foto}): ${r.rol}` });
    out.push(parteFoto(r.foto));
  });
  if (!refs.length) out.push({ text: "Sin imágenes de referencia: no muestres el producto salvo que el prompt lo pida." });
  return out;
}

async function generar(c) {
  const m = MODELOS[calidad];
  const body = {
    contents: [{ role: "user", parts: partes(c) }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: c.aspecto || lote.aspecto || "4:5", imageSize: m.size },
    },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m.id}:generateContent`;
  for (let intento = 1; ; intento++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    if ((res.status === 429 || res.status >= 500) && intento < 4) {
      await new Promise((r) => setTimeout(r, 5000 * intento));
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${res.status} ${json.error?.message || res.statusText}`);
    const cand = json.candidates?.[0];
    const img = cand?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!img) {
      const texto = cand?.content?.parts?.map((p) => p.text).filter(Boolean).join(" ");
      throw new Error(`Sin imagen (${cand?.finishReason || json.promptFeedback?.blockReason || "?"}) ${texto || ""}`.trim());
    }
    const ext = img.mimeType === "image/jpeg" ? "jpg" : img.mimeType === "image/webp" ? "webp" : "png";
    const archivo = `img/${c.id}.${calidad}.${ext}`;
    writeFileSync(join(dir, archivo), Buffer.from(img.data, "base64"));
    return { archivo, modelo: m.id };
  }
}

let ok = 0;
const cola = [...elegidos];
await Promise.all(
  Array.from({ length: Math.min(PARALELO, cola.length) }, async () => {
    for (let c; (c = cola.shift()); ) {
      const k = `${c.id}.${calidad}`;
      try {
        render[k] = { ...(await generar(c)), fecha: new Date().toISOString() };
        ok++;
        console.log(`✓ ${c.id} → ${render[k].archivo}`);
      } catch (err) {
        render[k] = { error: err.message, fecha: new Date().toISOString() };
        console.log(`✗ ${c.id}: ${err.message}`);
      }
    }
  }),
);

writeFileSync(renderFile, JSON.stringify(render, null, 2) + "\n");
console.log(`\n${ok}/${elegidos.length} imágenes con ${MODELOS[calidad].id} · ~US$${(ok * MODELOS[calidad].usd).toFixed(2)}`);
if (ok < elegidos.length) process.exitCode = 2;

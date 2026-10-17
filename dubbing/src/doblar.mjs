// Dobla a español neutro todo lo que haya en entrada/ y lo deja en salida/.
// Uso: ELEVENLABS_API_KEY=... node src/doblar.mjs [--idioma-origen en] [--hablantes 0] [--sin-fondo]
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRADA = path.join(RAIZ, "entrada");
const SALIDA = path.join(RAIZ, "salida");
const EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mp3", ".wav", ".m4a", ".mp4"]);
const IDIOMA_DESTINO = "es";
// Acento que se le pide a ElevenLabs para elegir voces y dialecto de la traducción (experimental).
const ACENTO = process.env.ACENTO_DESTINO ?? "neutral Latin American Spanish";

function cargarEnv() {
  const f = path.join(RAIZ, ".env");
  if (!existsSync(f)) return;
  for (const l of readFileSync(f, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function args() {
  const a = process.argv.slice(2);
  const val = (n, d) => (a.includes(n) ? a[a.indexOf(n) + 1] : d);
  return {
    origen: val("--idioma-origen", "auto"),
    hablantes: Number(val("--hablantes", 0)), // 0 = detectar solo
    sinFondo: a.includes("--sin-fondo"),
  };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function archivos(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await archivos(p)));
    else if (EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

function palabrasProhibidas(texto) {
  const { prohibidas } = JSON.parse(readFileSync(path.join(RAIZ, "glosario.json"), "utf8"));
  const hallados = [];
  for (const [mala, buena] of Object.entries(prohibidas)) {
    const re = new RegExp(`(^|[^\\p{L}])${mala}(?![\\p{L}])`, "giu");
    const n = (texto.match(re) || []).length;
    if (n) hallados.push({ palabra: mala, veces: n, cambiar_por: buena });
  }
  return hallados;
}

async function doblar(cliente, ruta, opc) {
  const rel = path.relative(ENTRADA, ruta);
  const base = rel.replace(path.extname(rel), "");
  const destino = path.join(SALIDA, `${base}.es${path.extname(ruta)}`);
  if (existsSync(destino)) return console.log(`= ya doblado, salto: ${rel}`);
  await mkdir(path.dirname(destino), { recursive: true });

  const pedido = {
    file: createReadStream(ruta),
    name: base,
    sourceLang: opc.origen,
    targetLang: IDIOMA_DESTINO,
    numSpeakers: opc.hablantes,
    watermark: false,
    dropBackgroundAudio: opc.sinFondo,
    disableVoiceCloning: false, // clonar la voz original = máxima similitud
  };
  console.log(`> subiendo ${rel}`);
  let job;
  try {
    job = await cliente.dubbing.create({ ...pedido, targetAccent: ACENTO });
  } catch (e) {
    if (!/accent/i.test(String(e?.message ?? e))) throw e;
    console.log("  (el acento no fue aceptado, sigo sin él)");
    job = await cliente.dubbing.create({ ...pedido, file: createReadStream(ruta) });
  }

  for (;;) {
    await dormir(10_000);
    const m = await cliente.dubbing.get(job.dubbingId);
    if (m.status === "dubbed") break;
    if (m.status === "failed") throw new Error(`falló ${rel}: ${m.error ?? "sin detalle"}`);
    console.log(`  ${rel}: ${m.status}...`);
  }

  const audio = await cliente.dubbing.audio.get(job.dubbingId, IDIOMA_DESTINO);
  await pipeline(Readable.fromWeb(audio), createWriteStream(destino));

  let texto = "";
  try {
    const t = await cliente.dubbing.transcript.getTranscriptForDub(job.dubbingId, IDIOMA_DESTINO, {
      formatType: "srt",
    });
    texto = typeof t === "string" ? t : JSON.stringify(t);
    await writeFile(destino.replace(/\.[^.]+$/, ".srt"), texto);
  } catch (e) {
    console.log(`  (sin transcripción: ${e?.message ?? e})`);
  }
  const hallados = palabrasProhibidas(texto);
  await writeFile(
    destino.replace(/\.[^.]+$/, ".reporte.json"),
    JSON.stringify({ origen: rel, dubbingId: job.dubbingId, palabras_a_revisar: hallados }, null, 2),
  );
  console.log(`+ listo: ${path.relative(RAIZ, destino)}`);
  if (hallados.length) console.log("  REVISAR palabras:", hallados.map((h) => `${h.palabra} (x${h.veces})`).join(", "));
}

cargarEnv();
if (!process.env.ELEVENLABS_API_KEY) {
  console.error("Falta ELEVENLABS_API_KEY (ponla en dubbing/.env).");
  process.exit(1);
}
const cliente = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const opc = args();
const lista = (await archivos(ENTRADA)).sort();
if (!lista.length) {
  console.log("No hay archivos en entrada/. Sube tus creativos ahí (puedes usar subcarpetas).");
  process.exit(0);
}
for (const f of lista) {
  try {
    await doblar(cliente, f, opc);
  } catch (e) {
    console.error(`x error con ${path.relative(ENTRADA, f)}: ${e?.message ?? e}`);
  }
}

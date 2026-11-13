/**
 * Nota de voz (2026-11-13): un audio Ogg/Opus sale con `voice: true` (doc de Meta «Audio messages»), una foto o un audio
 * sin la marca no; la subida reconoce «audio/ogg; codecs=opus» como audio; el CRM tiene permiso de micrófono y el resto
 * del sitio no. `node scripts/test-nota-de-voz.mjs` (también la corre `npm run check`).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { enviarMedia } = await import(join(root, "src/lib/whatsapp.js"));
let fallas = 0;
const check = (nombre, ok, detalle = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`); };

const cuerpos = [];
globalThis.fetch = async (_url, opts) => { cuerpos.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ messages: [{ id: "wamid.x" }] }), { status: 200 }); };
const env = { WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1", GRAPH_VERSION: "v21.0" };

await enviarMedia(env, "51900000001", "audio", "MEDIA1", null, null, null, { voice: true });
check("audio con voice: true sale como nota de voz", cuerpos[0]?.audio?.voice === true && cuerpos[0]?.audio?.id === "MEDIA1", JSON.stringify(cuerpos[0]));
await enviarMedia(env, "51900000001", "audio", "MEDIA2", null, null, null);
check("audio sin la marca no lleva voice", cuerpos[1]?.audio && !("voice" in cuerpos[1].audio));
await enviarMedia(env, "51900000001", "image", "MEDIA3", "hola", null, null, { voice: true });
check("una foto nunca lleva voice", cuerpos[2]?.image && !("voice" in cuerpos[2].image) && cuerpos[2].image.caption === "hola");

const send = readFileSync(join(root, "src/lib/crm-send.js"), "utf8");
check("mandarMediaGuardada marca voice solo para audio/ogg", /voice:\s*t === "audio" && \/\^audio\\\/ogg\//.test(send));
const subida = readFileSync(join(root, "src/api/crm/upload-media.js"), "utf8");
check("la subida normaliza audio/ogg; codecs=opus y lo trata como audio", subida.includes('mime.startsWith("audio/ogg")') && subida.includes('if (mime === "audio/ogg") return "audio";') && subida.includes('"audio/ogg": "ogg"'));
const mensajes = readFileSync(join(root, "src/api/crm/messages.js"), "utf8");
check("POST /api/crm/messages acepta media_type audio", /TIPOS_MEDIA = new Set\(\[[^\]]*"audio"/.test(mensajes));

const headers = readFileSync(join(root, "public/_headers"), "utf8");
const bloqueCrm = headers.split(/\n(?=\S)/).find((b) => b.startsWith("/crm/*")) || "";
check("el CRM quita el Permissions-Policy general y permite el micrófono", bloqueCrm.includes("! Permissions-Policy") && /microphone=\(self\)/.test(bloqueCrm));
const general = headers.split(/\n(?=\S)/).find((b) => b.startsWith("/*")) || "";
check("el resto del sitio sigue sin micrófono", /microphone=\(\)/.test(general));
for (const f of ["recorder.min.js", "encoderWorker.min.js", "LICENSE.md"]) {
  let ok = true; try { readFileSync(join(root, "public/crm/vendor/opus-recorder", f)); } catch { ok = false; }
  check(`opus-recorder: ${f} está en public/crm/vendor`, ok);
}

console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : "\nTodo en orden.");
process.exit(fallas ? 1 : 0);

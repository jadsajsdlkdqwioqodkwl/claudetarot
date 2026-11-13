/**
 * Voz de la tienda (ElevenLabs, dueño 2026-11-13): sin clave o sin voz no está disponible; texto a voz y cambiar voz piden
 * `opus_48000_64` con la clave en `xi-api-key`; si lo que vuelve no es Ogg («OggS») se rechaza (no saldría como nota de voz).
 * `node scripts/test-voz-tienda.mjs` (también la corre `npm run check`).
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { vozDisponible, textoAVoz, cambiarVoz } = await import(join(root, "src/lib/elevenlabs.js"));
let fallas = 0;
const check = (nombre, ok, detalle = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`); };

check("sin clave no está disponible", !vozDisponible({ ELEVENLABS_VOICE_ID: "v" }) && !vozDisponible({ ELEVENLABS_API_KEY: "k" }));
const env = { ELEVENLABS_API_KEY: "clave", ELEVENLABS_VOICE_ID: "voz123" };
check("con clave y voz está disponible", vozDisponible(env));

const llamadas = [];
let respuesta = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3]);
globalThis.fetch = async (url, init) => { llamadas.push({ url, init }); return new Response(respuesta, { status: 200 }); };
const tts = await textoAVoz(env, "Hola estimada");
check("texto a voz: endpoint, formato Opus y clave", /text-to-speech\/voz123\?output_format=opus_48000_64$/.test(llamadas[0].url) && llamadas[0].init.headers["xi-api-key"] === "clave", llamadas[0].url);
check("texto a voz devuelve el Ogg", tts[0] === 0x4f && tts.length === 7);
await cambiarVoz(env, new Blob([new Uint8Array([1, 2])], { type: "audio/ogg" }));
check("cambiar voz: endpoint de voz a voz con el audio", /speech-to-speech\/voz123\?output_format=opus_48000_64$/.test(llamadas[1].url) && llamadas[1].init.body instanceof FormData && llamadas[1].init.body.get("audio"));
respuesta = new Uint8Array([0x49, 0x44, 0x33, 0x04]); // un MP3 («ID3»)
let error = "";
try { await textoAVoz(env, "hola"); } catch (err) { error = err.message; }
check("si no vuelve Ogg/Opus se rechaza", /Ogg\/Opus/.test(error), error);
let vacio = "";
try { await textoAVoz(env, "  "); } catch (err) { vacio = err.message; }
check("texto vacío se rechaza", /texto/.test(vacio));

console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : "\nTodo en orden.");
process.exit(fallas ? 1 : 0);

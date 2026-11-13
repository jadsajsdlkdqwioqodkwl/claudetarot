/**
 * Voz de la tienda con ElevenLabs (dueño, 2026-11-13): «texto a voz» (la asesora escribe y sale como audio) y «cambiar voz»
 * (la asesora graba y su voz se cambia por la voz elegida). El resultado se pide en Ogg/Opus (`opus_48000_64`), el formato
 * que WhatsApp muestra como NOTA DE VOZ (ver enviarMedia en whatsapp.js): sale por el mismo camino que una nota grabada.
 *
 * Configuración (nada en el repo): secreto `ELEVENLABS_API_KEY` en el Worker; `ELEVENLABS_VOICE_ID` (la voz elegida o clonada)
 * y, opcionales, `ELEVENLABS_MODELO_TTS` (por defecto eleven_multilingual_v2) y `ELEVENLABS_MODELO_STS`
 * (eleven_multilingual_sts_v2) en wrangler.jsonc. Sin clave o sin voz, `vozDisponible` es false y el CRM no muestra las opciones.
 * No es la API de Claude (esa sigue prohibida).
 */
const BASE = "https://api.elevenlabs.io/v1";
const FORMATO = "opus_48000_64";

export const vozDisponible = (env) => Boolean(env?.ELEVENLABS_API_KEY && env?.ELEVENLABS_VOICE_ID);

/** Revisa que lo que volvió sea Ogg (cabecera «OggS»): si no, WhatsApp no lo mostraría como nota de voz. */
function comoOgg(bytes) {
  const b = new Uint8Array(bytes);
  if (b.length < 4 || b[0] !== 0x4f || b[1] !== 0x67 || b[2] !== 0x67 || b[3] !== 0x53) {
    throw new Error("ElevenLabs no devolvió audio Ogg/Opus: no se puede mandar como nota de voz.");
  }
  return b;
}

async function pedir(env, ruta, init) {
  const res = await fetch(`${BASE}${ruta}${ruta.includes("?") ? "&" : "?"}output_format=${FORMATO}`, {
    ...init, headers: { "xi-api-key": env.ELEVENLABS_API_KEY, Accept: "audio/ogg", ...(init.headers || {}) }
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let detalle = t.slice(0, 300);
    try { detalle = JSON.parse(t)?.detail?.message || JSON.parse(t)?.detail || detalle; } catch { /* texto plano */ }
    throw new Error(`ElevenLabs respondió ${res.status}: ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}`);
  }
  return comoOgg(await res.arrayBuffer());
}

/** Texto → nota de voz (Ogg/Opus) con la voz de la tienda. Hasta 1000 caracteres (una nota corta). */
export async function textoAVoz(env, texto) {
  if (!vozDisponible(env)) throw new Error("Falta configurar ElevenLabs (clave y voz).");
  const t = String(texto || "").trim().slice(0, 1000);
  if (!t) throw new Error("Escribe el texto del audio.");
  return pedir(env, `/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: t, model_id: env.ELEVENLABS_MODELO_TTS || "eleven_multilingual_v2" })
  });
}

/** Audio grabado (Blob) → el mismo audio con la voz de la tienda (Ogg/Opus). */
export async function cambiarVoz(env, audio) {
  if (!vozDisponible(env)) throw new Error("Falta configurar ElevenLabs (clave y voz).");
  const form = new FormData();
  form.append("audio", audio, "nota.ogg");
  form.append("model_id", env.ELEVENLABS_MODELO_STS || "eleven_multilingual_sts_v2");
  form.append("remove_background_noise", "true");
  return pedir(env, `/speech-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}`, { method: "POST", body: form });
}

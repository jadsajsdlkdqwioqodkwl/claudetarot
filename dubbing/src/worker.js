// Panel de doblaje: sirve la página (public/) y reenvía a ElevenLabs con la clave guardada como secreto.
// Sin estado: el navegador guarda los ids de cada trabajo. Todo /api exige la clave del panel (APP_PASSWORD).
const EL = "https://api.elevenlabs.io/v1";

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

function igual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function el(env, path, init = {}) {
  const res = await fetch(EL + path, { ...init, headers: { ...(init.headers || {}), "xi-api-key": env.ELEVENLABS_API_KEY } });
  return res;
}

async function errorDe(res) {
  const t = await res.text();
  let msg = t;
  try {
    const j = JSON.parse(t);
    msg = j?.detail?.message || (typeof j?.detail === "string" ? j.detail : JSON.stringify(j?.detail ?? j));
  } catch {}
  return json({ error: msg.slice(0, 500) }, res.status >= 400 ? res.status : 502);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!igual(request.headers.get("x-clave"), env.APP_PASSWORD)) return json({ error: "Clave incorrecta" }, 401);
    const ruta = url.pathname.slice(5);

    if (ruta === "ping") return json({ ok: true });

    // ---- iniciar un doblaje ----
    if (ruta === "iniciar" && request.method === "POST") {
      const f = await request.formData();
      const archivo = f.get("file");
      const origen = f.get("origen") || "auto";
      const modelo = f.get("modelo");
      if (modelo === "v2") {
        const fd = new FormData();
        fd.set("file", archivo, archivo.name);
        fd.set("reference", String(f.get("nombre") || archivo.name));
        fd.set("model_id", "dubbing_v2");
        if (origen !== "auto") fd.set("source_language", origen);
        const res = await el(env, "/dubbing/project", { method: "POST", body: fd });
        if (!res.ok) return errorDe(res);
        const j = await res.json();
        return json({ id: j.project_id });
      }
      const fd = new FormData();
      fd.set("file", archivo, archivo.name);
      fd.set("name", String(f.get("nombre") || archivo.name));
      fd.set("target_lang", "es");
      fd.set("source_lang", origen);
      fd.set("num_speakers", "0");
      fd.set("watermark", f.get("conMarca") === "1" ? "true" : "false");
      fd.set("disable_voice_cloning", "false");
      const res = await el(env, "/dubbing", { method: "POST", body: fd });
      if (!res.ok) return errorDe(res);
      const j = await res.json();
      return json({ id: j.dubbing_id });
    }

    // ---- v1: estado, video doblado, guion ----
    if (ruta === "v1/estado") {
      const res = await el(env, `/dubbing/${encodeURIComponent(url.searchParams.get("id"))}`);
      if (!res.ok) return errorDe(res);
      const j = await res.json();
      return json({ estado: j.status === "dubbed" ? "listo" : j.status === "failed" ? "fallo" : "procesando", error: j.error });
    }
    if (ruta === "v1/archivo") {
      const res = await el(env, `/dubbing/${encodeURIComponent(url.searchParams.get("id"))}/audio/es`);
      if (!res.ok) return errorDe(res);
      return new Response(res.body, { headers: { "content-type": res.headers.get("content-type") || "video/mp4" } });
    }
    if (ruta === "v1/guion") {
      const res = await el(env, `/dubbing/${encodeURIComponent(url.searchParams.get("id"))}/transcript/es?format_type=srt`);
      if (!res.ok) return errorDe(res);
      const t = await res.text();
      let srt = t;
      try { const j = JSON.parse(t); srt = typeof j === "string" ? j : j.srt || t; } catch {}
      return json({ texto: srt });
    }

    // ---- v2: proyecto, idioma con similitud, audio ----
    if (ruta === "v2/estado") {
      const id = url.searchParams.get("id");
      const [pid, lid] = id.split(":");
      if (!lid) {
        const res = await el(env, `/dubbing/project/${encodeURIComponent(pid)}`);
        if (!res.ok) return errorDe(res);
        const j = await res.json();
        return json({ estado: j.status === "ready" ? "preparado" : j.status === "failed" ? "fallo" : "procesando" });
      }
      const res = await el(env, `/dubbing/project/${encodeURIComponent(pid)}/language/${encodeURIComponent(lid)}`);
      if (!res.ok) return errorDe(res);
      const j = await res.json();
      return json({ estado: j.status === "completed" ? "listo" : j.status === "failed" ? "fallo" : "procesando" });
    }
    if (ruta === "v2/idioma" && request.method === "POST") {
      const { id, similitud, dialecto } = await request.json();
      const res = await el(env, `/dubbing/project/${encodeURIComponent(id)}/language`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_language: dialecto || "es", voice_settings: { cloning_strength: Number(similitud) } }),
      });
      if (!res.ok) return errorDe(res);
      const j = await res.json();
      return json({ id: `${id}:${j.language_id}` });
    }
    if (ruta === "v2/archivo") {
      const [pid, lid] = url.searchParams.get("id").split(":");
      const info = await el(env, `/dubbing/project/${encodeURIComponent(pid)}/language/${encodeURIComponent(lid)}`);
      if (!info.ok) return errorDe(info);
      const j = await info.json();
      const origen = j.outputs?.lossless_audio;
      if (!origen) return json({ error: "Aún no hay audio" }, 409);
      const res = await fetch(origen);
      return new Response(res.body, { headers: { "content-type": res.headers.get("content-type") || "audio/wav" } });
    }

    return json({ error: "No existe" }, 404);
  },
};

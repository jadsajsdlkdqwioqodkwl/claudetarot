/**
 * Respuesta automática a comentarios de Facebook e Instagram (dueño, 2026-11-11).
 *
 * Alguien comenta un post o anuncio con una palabra clave («precio», «info», «cuánto»…) →
 *   1. se le responde el comentario en público («¡Hola! ✨ Te envíe los detalles 📩📩»);
 *   2. se le manda UN mensaje privado (private reply) con la info del kit, la web y el WhatsApp.
 * Meta solo deja mandar un mensaje privado por comentario (dentro de 7 días) hasta que la persona responda.
 * Si después escribe por DM, se le manda la foto del kit una sola vez (ya está dentro de su ventana de 24 h).
 * Todo es gratis: Messenger e Instagram no cobran por mensaje (solo WhatsApp cobra plantillas).
 *
 * Configuración (Herramientas → Comentarios de Facebook e Instagram; `crm_settings` clave `redes_auto`, JSON):
 *   { activo, palabras: [...], comentario, dm, imagen_url, facebook, instagram }
 * Secreto: META_PAGE_TOKEN (token de la página con pages_messaging, pages_manage_engagement,
 * pages_read_engagement, instagram_manage_comments, instagram_manage_messages). Sin él no hace nada.
 */
import { obtenerAjuste, guardarAjuste } from "./crm-db.js";

const GRAPH = "https://graph.facebook.com/v23.0";
export const CLAVE_AJUSTE = "redes_auto";

export const POR_DEFECTO = {
  activo: true,
  facebook: true,
  instagram: true,
  palabras: [
    "precio", "precios", "costo", "cuesta", "cuanto", "valor", "info", "informacion", "informes", "detalle", "detalles",
    "interesa", "interesada", "interesado", "quiero", "lo quiero", "comprar", "compro", "pedido", "pedir", "envio", "envios",
    "delivery", "provincia", "lima", "disponible", "dm", "md", "inbox", "privado", "como lo consigo", "donde compro",
    "como compro", "me interesa", "mas info", "+info", "yo quiero", "pasame", "pasa info", "manda info", "cuanto cuesta"
  ],
  comentario: "¡Hola! ✨ Te envíe los detalles 📩📩",
  dm: "¡Hola! Gracias por escribirnos ✨ ✨ \n\nEl Kit Tarot de aprendizaje le incluye todo lo necesario: Tarot Rider-Waite con significados, Manual, Mantel de lectura y collar tarot para protección a S/95 con envío gratis a todo Lima y provincia ☺✨ OFERTA ESPECIAL solo por esta semana con bonos adicionales (Clases grabadas de Tarot y material original imprimible)\n\nPuedes hacer tu pedido directamente en nuestra web:\n👉 https://kit-tarot-para-principiantes.tarotperu.store/\n\nO escríbenos a nuestro Whatsapp dado que no se brindará respuestas por este medio: +51 927 066 862 \n\nhttps://wa.me/51927066862?text=hola%20vengo%20de%20sus%20redes%2C%20me%20interesa%20m%C3%A1s%20informaci%C3%B3n",
  imagen_url: "https://kit-tarot-para-principiantes.tarotperu.store/redes/kit-tarot.jpg"
};

/** Minúsculas, sin tildes y sin signos: «¿Cuánto?» → «cuanto». */
export const plano = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9+ñ\s]/g, " ").replace(/\s+/g, " ").trim();

/** La palabra clave que aparece en el comentario (palabra o frase entera), o null. */
export function palabraClave(texto, palabras) {
  const t = ` ${plano(texto)} `;
  if (t.trim().length < 2) return null;
  for (const p of palabras || []) {
    const q = plano(p);
    if (q && t.includes(` ${q} `)) return p;
  }
  return null;
}

export async function leerConfig(db) {
  let guardada = {};
  try { guardada = JSON.parse((await obtenerAjuste(db, CLAVE_AJUSTE)) || "{}") || {}; } catch { guardada = {}; }
  return { ...POR_DEFECTO, ...guardada };
}

export async function guardarConfig(db, cambios) {
  const actual = await leerConfig(db);
  const nueva = { ...actual };
  for (const k of ["activo", "facebook", "instagram"]) if (cambios[k] !== undefined) nueva[k] = Boolean(cambios[k]);
  if (Array.isArray(cambios.palabras)) nueva.palabras = [...new Set(cambios.palabras.map((p) => String(p).trim()).filter(Boolean))].slice(0, 200);
  for (const [k, n] of [["comentario", 1000], ["dm", 2000], ["imagen_url", 500]]) {
    if (cambios[k] !== undefined) nueva[k] = String(cambios[k]).slice(0, n);
  }
  if (!nueva.comentario.trim() || !nueva.dm.trim()) throw new Error("El texto del comentario y el del mensaje privado no pueden quedar vacíos.");
  if (nueva.imagen_url && !/^https:\/\//.test(nueva.imagen_url)) throw new Error("La imagen tiene que ser un link https.");
  await guardarAjuste(db, CLAVE_AJUSTE, JSON.stringify(nueva));
  return nueva;
}

/**
 * El token de la página, la clave secreta de la app y el token de verificación del webhook pueden venir del Worker
 * (META_PAGE_TOKEN, META_APP_SECRET, META_VERIFY_TOKEN) o del panel de Herramientas (crm_settings, solo admin, nunca se
 * devuelven al navegador): así el dueño no entra a Cloudflare ni pega claves en un chat.
 */
export async function envRedes(env) {
  if (!env.CRM_DB) return env;
  const [token, secreto, verify] = await Promise.all(["redes_token", "redes_app_secret", "redes_verify_token"].map((k) => obtenerAjuste(env.CRM_DB, k).catch(() => null)));
  return { ...env, META_PAGE_TOKEN: env.META_PAGE_TOKEN || token || undefined, META_APP_SECRET: env.META_APP_SECRET || secreto || undefined, META_VERIFY_TOKEN: env.META_VERIFY_TOKEN || verify || undefined };
}

/** Suscribe la página a la app (comentarios y mensajes): POST /{page-id}/subscribed_apps. */
export async function suscribirPagina(env) {
  const cuentas = await cuentasPropias(env);
  const res = await fetch(`${GRAPH}/${cuentas.page_id}/subscribed_apps?subscribed_fields=feed,messages`, { method: "POST", headers: { Authorization: `Bearer ${env.META_PAGE_TOKEN}` } });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.error) throw new Error(d.error?.message || `HTTP ${res.status}`);
  return { ...cuentas, suscrita: Boolean(d.success) };
}

async function graph(env, ruta, cuerpo) {
  const res = await fetch(`${GRAPH}/${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.META_PAGE_TOKEN}` },
    body: JSON.stringify(cuerpo)
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok || datos.error) throw new Error(datos.error?.message || `HTTP ${res.status}`);
  return datos;
}

/** Id de la página y de su cuenta de Instagram (para no responderse a sí misma). Se cachea en crm_settings. */
export async function cuentasPropias(env) {
  const guardado = await obtenerAjuste(env.CRM_DB, "redes_cuentas").catch(() => null);
  if (guardado) { try { return JSON.parse(guardado); } catch { /* se vuelve a pedir */ } }
  const res = await fetch(`${GRAPH}/me?fields=id,name,instagram_business_account`, { headers: { Authorization: `Bearer ${env.META_PAGE_TOKEN}` } });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.id) throw new Error(d.error?.message || "No pude leer la página del token.");
  const cuentas = { page_id: d.id, page_name: d.name || "", ig_id: d.instagram_business_account?.id || null };
  await guardarAjuste(env.CRM_DB, "redes_cuentas", JSON.stringify(cuentas));
  return cuentas;
}

/**
 * Saca de un webhook de Meta (object "page" o "instagram") los comentarios nuevos y los mensajes directos.
 * Comentarios: [{ plataforma, comment_id, post_id, autor_id, autor, texto }]. Mensajes: [{ plataforma, autor_id, texto }].
 */
export function leerWebhook(cuerpo) {
  const comentarios = [];
  const mensajes = [];
  const plataforma = cuerpo?.object === "instagram" ? "instagram" : cuerpo?.object === "page" ? "facebook" : null;
  if (!plataforma) return { comentarios, mensajes };
  for (const entry of cuerpo.entry || []) {
    for (const c of entry.changes || []) {
      const v = c.value || {};
      if (plataforma === "facebook" && c.field === "feed" && v.item === "comment" && v.verb === "add" && v.comment_id) {
        comentarios.push({ plataforma, comment_id: String(v.comment_id), post_id: v.post_id || null, autor_id: v.from?.id || null, autor: v.from?.name || "", texto: v.message || "" });
      }
      if (plataforma === "instagram" && c.field === "comments" && v.id) {
        comentarios.push({ plataforma, comment_id: String(v.id), post_id: v.media?.id || null, autor_id: v.from?.id || null, autor: v.from?.username ? `@${v.from.username}` : "", texto: v.text || "" });
      }
    }
    for (const m of entry.messaging || []) {
      if (m.message && !m.message.is_echo && m.sender?.id) mensajes.push({ plataforma, autor_id: String(m.sender.id), texto: m.message.text || "" });
    }
  }
  return { comentarios, mensajes };
}

/** Responde un comentario (público + mensaje privado). Devuelve lo que pasó; nunca lanza. */
export async function atenderComentario(env, c, config, cuentas) {
  const db = env.CRM_DB;
  if (!config.activo || config[c.plataforma] === false) return { omitido: "apagado" };
  // Nunca a sí misma (la respuesta pública de la página también llega como comentario nuevo).
  if (c.autor_id && [cuentas.page_id, cuentas.ig_id].includes(String(c.autor_id))) return { omitido: "es la propia cuenta" };
  const palabra = palabraClave(c.texto, config.palabras);
  // Se registra siempre (con o sin palabra): el UNIQUE evita responder dos veces si Meta reintenta el webhook.
  const ins = await db.prepare(
    "INSERT OR IGNORE INTO redes_comentarios (plataforma, comment_id, post_id, autor_id, autor, texto, palabra) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(c.plataforma, c.comment_id, c.post_id, c.autor_id, String(c.autor || "").slice(0, 120), String(c.texto || "").slice(0, 1000), palabra).run();
  if (!ins.meta?.changes) return { omitido: "ya visto" };
  if (!palabra) return { omitido: "sin palabra clave" };

  const errores = [];
  let respondido = 0;
  let dm = 0;
  try {
    // Facebook: POST /{comment-id}/comments · Instagram: POST /{ig-comment-id}/replies
    await graph(env, `${c.comment_id}/${c.plataforma === "instagram" ? "replies" : "comments"}`, { message: config.comentario });
    respondido = 1;
  } catch (err) { errores.push(`comentario: ${err.message}`); }
  try {
    // Private reply: un solo mensaje por comentario, por la página (sirve para Messenger e Instagram).
    await graph(env, `${cuentas.page_id}/messages`, { recipient: { comment_id: c.comment_id }, message: { text: config.dm } });
    dm = 1;
  } catch (err) { errores.push(`mensaje privado: ${err.message}`); }
  await db.prepare("UPDATE redes_comentarios SET respondido = ?, dm_enviado = ?, error = ? WHERE plataforma = ? AND comment_id = ?")
    .bind(respondido, dm, errores.join(" · ") || null, c.plataforma, c.comment_id).run();
  return { palabra, respondido, dm, errores };
}

/** La persona escribió por DM después del mensaje privado: se le manda la foto del kit una sola vez. */
export async function atenderMensaje(env, m, config, cuentas) {
  const db = env.CRM_DB;
  if (!config.activo || !config.imagen_url || config[m.plataforma] === false) return { omitido: "apagado" };
  if ([cuentas.page_id, cuentas.ig_id].includes(m.autor_id)) return { omitido: "es la propia cuenta" };
  const fila = await db.prepare(
    "SELECT id FROM redes_comentarios WHERE plataforma = ? AND autor_id = ? AND dm_enviado = 1 AND imagen_enviada = 0 ORDER BY id DESC LIMIT 1"
  ).bind(m.plataforma, m.autor_id).first();
  if (!fila) return { omitido: "no viene de un comentario" };
  // Se marca antes de mandar: si Meta reintenta el webhook, no sale dos veces.
  const marca = await db.prepare("UPDATE redes_comentarios SET imagen_enviada = 1 WHERE id = ? AND imagen_enviada = 0").bind(fila.id).run();
  if (!marca.meta?.changes) return { omitido: "ya enviada" };
  try {
    await graph(env, `${cuentas.page_id}/messages`, {
      recipient: { id: m.autor_id }, messaging_type: "RESPONSE",
      message: { attachment: { type: "image", payload: { url: config.imagen_url, is_reusable: true } } }
    });
    return { imagen: true };
  } catch (err) {
    await db.prepare("UPDATE redes_comentarios SET error = COALESCE(error || ' · ', '') || ? WHERE id = ?").bind(`imagen: ${err.message}`, fila.id).run();
    return { error: err.message };
  }
}

/** Todo lo que trae un webhook de Meta (page / instagram). */
export async function procesarWebhookRedes(envBase, cuerpo) {
  if (!envBase.CRM_DB) return { omitido: "falta la base" };
  const env = await envRedes(envBase);
  if (!env.META_PAGE_TOKEN) return { omitido: "falta el token de la página" };
  const { comentarios, mensajes } = leerWebhook(cuerpo);
  if (!comentarios.length && !mensajes.length) return { nada: true };
  const config = await leerConfig(env.CRM_DB);
  const cuentas = await cuentasPropias(env);
  const res = [];
  for (const c of comentarios) res.push(await atenderComentario(env, c, config, cuentas).catch((err) => ({ error: err.message })));
  for (const m of mensajes) res.push(await atenderMensaje(env, m, config, cuentas).catch((err) => ({ error: err.message })));
  return { res };
}

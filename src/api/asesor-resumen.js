/**
 * Endpoints de las Routines para el aprendizaje y el resumen semanal. Todo con
 * la cabecera x-asesor-clave.
 *
 * POST /api/asesor/analisis
 *      { origen, fecha: "yyyy-mm-dd", chats: [{ whatsapp, intencion, resultado,
 *        motivo, objecion, calidad, agente, upsell, nota }] }
 *      Lo que la Routine concluye de cada chat (una fila por chat y día; si ya
 *      estaba, se reemplaza). Alimenta el coaching y el resumen.
 *
 * GET  /api/asesor/resumen?dias=7
 *      { asunto, html, texto, datos } — el resumen semanal. Lo arma el Worker
 *      con datos de D1, sin IA: no gasta tokens. Lo único escrito por IA que
 *      trae es el último informe del director CRO, que ya estaba escrito.
 *
 * Dónde se ve (enviarResumenSiToca, cron de 10 min): los lunes queda como
 * página en CRM → Reportes; las pruebas con ganadora entran a ✨ Sugerencias.
 * Opcional, por correo (resumenSemanal en ASESOR.gs).
 */

import { autorizadoAsesor, dentroDelLimiteAsesor, pruebasDeMensajes } from "./asesor.js";
import { MIN_USOS } from "../lib/crm-variantes.js";
import { escaparHtml } from "../lib/telegram.js";
import { notificarRecomendaciones } from "../lib/crm-avisos.js";

const SITIO = "https://kit-tarot-para-principiantes.tarotperu.store";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function puerta(request, env) {
  if (!(await dentroDelLimiteAsesor(env, request.headers.get("CF-Connecting-IP")))) return json({ error: "Demasiados intentos." }, 429);
  if (!(await autorizadoAsesor(request, env))) return json({ error: "No autorizado." }, 401);
  if (!env.CRM_DB) return json({ error: "Falta la base del CRM." }, 503);
  return null;
}

const corto = (v, n) => (v === undefined || v === null ? null : String(v).trim().slice(0, n) || null);
const INTENCIONES = new Set(["alta", "media", "baja", "ninguna"]);
const RESULTADOS = new Set(["ganado", "perdido", "abierto"]);

export async function onRequestPostAnalisis({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const p = await request.json().catch(() => null);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(p?.fecha || "") ? p.fecha : new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const origen = corto(p?.origen, 60) || "asesor";
  const res = { guardados: 0, sin_chat: [] };
  for (const c of (Array.isArray(p?.chats) ? p.chats : []).slice(0, 200)) {
    const wa = String(c?.whatsapp || "").replace(/\D/g, "");
    const conv = wa.length >= 9 && await env.CRM_DB.prepare(
      `SELECT conv.id, conv.assigned_agent FROM conversations conv JOIN contacts ct ON ct.id = conv.contact_id
       WHERE ct.wa_id LIKE ? ORDER BY conv.last_message_at DESC LIMIT 1`
    ).bind(`%${wa.slice(-9)}`).first();
    if (!conv) {
      res.sin_chat.push(wa);
      continue;
    }
    const intencion = INTENCIONES.has(c.intencion) ? c.intencion : null;
    const resultado = RESULTADOS.has(c.resultado) ? c.resultado : null;
    const calidad = Number(c.calidad) >= 1 && Number(c.calidad) <= 5 ? Math.round(Number(c.calidad)) : null;
    await env.CRM_DB.prepare(
      `INSERT INTO chat_analisis (conversation_id, fecha, intencion, resultado, motivo, objecion, calidad, agente, upsell, nota, origen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(conversation_id, fecha) DO UPDATE SET intencion = excluded.intencion, resultado = excluded.resultado,
         motivo = excluded.motivo, objecion = excluded.objecion, calidad = excluded.calidad, agente = excluded.agente,
         upsell = excluded.upsell, nota = excluded.nota, origen = excluded.origen, created_at = datetime('now')`
    ).bind(conv.id, fecha, intencion, resultado, corto(c.motivo, 300), corto(c.objecion, 80), calidad,
      corto(c.agente, 80) || conv.assigned_agent || null, corto(c.upsell, 200), corto(c.nota, 400), origen).run();
    res.guardados++;
  }
  return json(res);
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

/** Todo lo que va en el resumen, en números. */
export async function datosResumen(env, dias) {
  const rango = `-${dias} days`;
  const previo = `-${dias * 2} days`;
  const db = env.CRM_DB;
  const [embudo, embudoPrevio, pruebas, cerradas, vendedoras, objeciones, perdidas, notas, sugerencias, informe, nombres] = await Promise.all([
    db.prepare(
      `SELECT SUM(etapa >= 1) AS e1, SUM(etapa >= 2) AS e2, SUM(etapa >= 3) AS e3, SUM(etapa >= 4) AS e4, SUM(etapa >= 5) AS e5
       FROM conversations WHERE created_at >= datetime('now', ?)`
    ).bind(rango).first(),
    db.prepare(
      `SELECT SUM(etapa >= 1) AS e1, SUM(etapa >= 5) AS e5 FROM conversations
       WHERE created_at >= datetime('now', ?) AND created_at < datetime('now', ?)`
    ).bind(previo, rango).first(),
    pruebasDeMensajes(env),
    db.prepare(
      `SELECT tipo, ref_id, estado, texto, cerrada_por, cerrada_at FROM variantes
       WHERE estado IN ('ganadora', 'retirada') AND cerrada_at >= datetime('now', ?) ORDER BY cerrada_at DESC LIMIT 20`
    ).bind(rango).all(),
    db.prepare(
      `SELECT COALESCE(conv.assigned_agent, '(sin asignar)') AS agente, COUNT(*) AS chats,
         SUM(conv.etapa >= 2) AS conversaron, SUM(conv.etapa >= 5) AS cerraron,
         (SELECT ROUND(AVG(a.calidad), 1) FROM chat_analisis a WHERE a.agente = conv.assigned_agent AND a.fecha >= date('now', ?)) AS calidad
       FROM conversations conv WHERE conv.created_at >= datetime('now', ?) AND conv.etapa >= 1
       GROUP BY 1 ORDER BY chats DESC`
    ).bind(rango, rango).all(),
    db.prepare(
      `SELECT objecion, COUNT(*) AS n, SUM(resultado = 'perdido') AS perdidos FROM chat_analisis
       WHERE fecha >= date('now', ?) AND objecion IS NOT NULL GROUP BY objecion ORDER BY n DESC LIMIT 8`
    ).bind(rango).all(),
    db.prepare(
      `SELECT motivo, COUNT(*) AS n FROM chat_analisis
       WHERE fecha >= date('now', ?) AND resultado = 'perdido' AND motivo IS NOT NULL GROUP BY motivo ORDER BY n DESC LIMIT 6`
    ).bind(rango).all(),
    db.prepare(
      `SELECT agente, nota FROM chat_analisis WHERE fecha >= date('now', ?) AND nota IS NOT NULL AND agente IS NOT NULL
       ORDER BY created_at DESC LIMIT 40`
    ).bind(rango).all(),
    db.prepare(
      `SELECT tipo, estado, COUNT(*) AS n FROM asesor_sugerencias WHERE created_at >= datetime('now', ?) GROUP BY tipo, estado`
    ).bind(rango).all(),
    db.prepare("SELECT origen, texto, created_at FROM asesor_informes ORDER BY id DESC LIMIT 1").first(),
    Promise.all([
      db.prepare("SELECT id, title, body, grupo FROM quick_replies").all(),
      db.prepare("SELECT id, title, body FROM welcome_steps").all()
    ])
  ]);
  const titulo = {};
  const grupoDe = {};
  for (const r of nombres[0].results) {
    titulo[`rapida:${r.id}`] = { titulo: r.title, texto: r.body };
    grupoDe[r.id] = r.grupo;
  }
  for (const r of nombres[1].results) titulo[`bienvenida:${r.id}`] = { titulo: `Bienvenida · ${r.title}`, texto: r.body };

  // Coaching: hasta 2 notas por vendedora, las más recientes.
  const coaching = {};
  for (const n of notas.results) {
    const l = (coaching[n.agente] ||= []);
    if (l.length < 2) l.push(n.nota);
  }

  const enCurso = [];
  for (const tipo of ["rapida", "bienvenida"]) {
    for (const [ref, versiones] of Object.entries(pruebas.en_curso[tipo] || {})) {
      const info = titulo[`${tipo}:${ref}`] || { titulo: `#${ref}`, texto: "" };
      const lista = versiones.map((v, i) => ({
        nombre: v.id === 0 ? "1 · original" : `${i + 1}${v.unico ? " · un solo mensaje" : ""}`,
        texto: v.texto || info.texto || "",
        usos: v.usos, respondieron: pct(v.respondieron, v.usos), avanzaron: pct(v.avanzaron, v.usos),
        cerraron: pct(v.cerraron, v.usos), editadas: v.editadas, peso: v.peso, motivo: v.motivo || null
      }));
      const lider = lista.reduce((a, b) => (b.peso > a.peso ? b : a), lista[0]);
      const listo = lista.every((v) => v.usos >= MIN_USOS) && lider.peso >= 0.85;
      enCurso.push({ tipo, ref_id: Number(ref), titulo: info.titulo, versiones: lista, lider: lider.nombre, listo });
    }
  }
  // Ediciones: qué respuestas cambian más las vendedoras y cómo.
  const edPorRef = {};
  for (const e of pruebas.ediciones || []) {
    const k = `${e.tipo}:${e.ref_id}`;
    const l = (edPorRef[k] ||= { titulo: titulo[k]?.titulo || `#${e.ref_id}`, ejemplos: [] });
    if (l.ejemplos.length < 2) l.ejemplos.push({ agente: e.agente, texto: e.texto_enviado, avanzo: e.avanzo });
  }

  const usoRapidas = pruebas.uso_por_mensaje
    .filter((u) => u.tipo === "rapida" && u.usos >= 5)
    .slice(0, 12)
    .map((u) => ({ titulo: titulo[`rapida:${u.ref_id}`]?.titulo || `#${u.ref_id}`, grupo: grupoDe[u.ref_id] || null, usos: u.usos, avanzaron: pct(u.avanzaron, u.usos), cerraron: pct(u.cerraron, u.usos), editadas: pct(u.editadas, u.usos) }));

  return {
    dias,
    embudo: embudo || {},
    embudo_previo: embudoPrevio || {},
    pruebas_en_curso: enCurso,
    pruebas_cerradas: cerradas.results.map((c) => ({ ...c, titulo: titulo[`${c.tipo}:${c.ref_id}`]?.titulo || `#${c.ref_id}` })),
    rapidas_mas_usadas: usoRapidas,
    vendedoras: vendedoras.results.map((v) => ({ ...v, cierre: pct(v.cerraron, v.chats), coaching: coaching[v.agente] || [] })),
    objeciones: objeciones.results,
    motivos_perdida: perdidas.results,
    sugerencias: sugerencias.results,
    frases: pruebas.frases,
    ediciones: Object.values(edPorRef),
    informe
  };
}

const ESTILO = {
  h2: "font:600 16px system-ui,sans-serif;margin:24px 0 8px;color:#1f2937",
  p: "font:14px/1.5 system-ui,sans-serif;color:#374151;margin:4px 0",
  tabla: "border-collapse:collapse;font:13px system-ui,sans-serif;width:100%;max-width:640px",
  th: "text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb;color:#6b7280;font-weight:600",
  td: "padding:6px 8px;border-bottom:1px solid #f3f4f6;vertical-align:top;color:#111827"
};

function tabla(cabeceras, filas) {
  if (!filas.length) return `<p style="${ESTILO.p}">Sin datos todavía.</p>`;
  return `<table style="${ESTILO.tabla}"><tr>${cabeceras.map((c) => `<th style="${ESTILO.th}">${escaparHtml(c)}</th>`).join("")}</tr>` +
    filas.map((f) => `<tr>${f.map((c) => `<td style="${ESTILO.td}">${c}</td>`).join("")}</tr>`).join("") + "</table>";
}

/** HTML para el correo y texto plano de respaldo. */
export function armarResumen(d, urlCrm) {
  const e = d.embudo;
  const cierre = pct(e.e5 || 0, e.e1 || 0);
  const cierrePrevio = pct(d.embudo_previo.e5 || 0, d.embudo_previo.e1 || 0);
  const flecha = cierre > cierrePrevio ? "▲" : cierre < cierrePrevio ? "▼" : "=";
  const listas = d.pruebas_en_curso.filter((p) => p.listo);
  const asunto = `Tarot · semana: ${e.e1 || 0} chats, ${cierre}% cerró (${flecha} ${cierrePrevio}%)` +
    (listas.length ? ` · ${listas.length} prueba(s) lista(s) para decidir` : "");

  const h = [];
  const t = [];
  h.push(`<div style="max-width:680px">`);
  h.push(`<h2 style="${ESTILO.h2}">Embudo de los últimos ${d.dias} días</h2>`);
  h.push(tabla(["Escribió", "Conversó", "Dijo destino", "Le pidieron cierre", "Cerró"],
    [[e.e1 || 0, e.e2 || 0, e.e3 || 0, e.e4 || 0, `<b>${e.e5 || 0}</b> (${cierre}%)`]]));
  h.push(`<p style="${ESTILO.p}">Semana anterior: ${d.embudo_previo.e1 || 0} chats, ${cierrePrevio}% cerró.</p>`);
  t.push(`EMBUDO ${d.dias} días: escribió ${e.e1 || 0} · conversó ${e.e2 || 0} · destino ${e.e3 || 0} · pidieron cierre ${e.e4 || 0} · cerró ${e.e5 || 0} (${cierre}%, antes ${cierrePrevio}%)`);

  h.push(`<h2 style="${ESTILO.h2}">🧪 Pruebas de mensajes en curso</h2>`);
  if (!d.pruebas_en_curso.length) h.push(`<p style="${ESTILO.p}">No hay pruebas en curso. El director CRO las propone en ✨ Sugerencias.</p>`);
  for (const p of d.pruebas_en_curso) {
    h.push(`<p style="${ESTILO.p}"><b>${escaparHtml(p.titulo)}</b> — ${p.listo ? `✅ <b>lista para decidir: gana la versión ${escaparHtml(p.lider)}</b>` : `va adelante la versión ${escaparHtml(p.lider)} (faltan datos)`}</p>`);
    h.push(tabla(["Versión", "Texto", "Usos", "Respondió 24 h", "Avanzó", "Cerró"],
      p.versiones.map((v) => [escaparHtml(v.nombre), escaparHtml(v.texto.slice(0, 160)) + (v.motivo ? `<br><i style="color:#6b7280">${escaparHtml(v.motivo)}</i>` : ""), v.usos, `${v.respondieron}%`, `<b>${v.avanzaron}%</b>`, `${v.cerraron}%`])));
    t.push(`PRUEBA ${p.titulo}: ${p.versiones.map((v) => `${v.nombre} ${v.usos} usos, ${v.avanzaron}% avanzó`).join(" | ")}${p.listo ? ` → gana ${p.lider}` : ""}`);
  }
  if (d.pruebas_cerradas.length) {
    h.push(`<p style="${ESTILO.p}">Cerradas esta semana: ${d.pruebas_cerradas.filter((c) => c.estado === "ganadora").map((c) => `${escaparHtml(c.titulo)} (ganó una versión nueva, eligió ${escaparHtml(c.cerrada_por || "")})`).join(" · ") || "ninguna cambió el texto"}.</p>`);
  }
  if (listas.length) h.push(`<p style="${ESTILO.p}">Para decidir: CRM → ⚡ Respuestas rápidas → editar la respuesta → <b>Quedarse con esta</b>.${urlCrm ? ` <a href="${urlCrm}">Abrir el CRM</a>` : ""}</p>`);

  h.push(`<h2 style="${ESTILO.h2}">Respuestas rápidas más usadas</h2>`);
  h.push(tabla(["Grupo", "Respuesta", "Usos", "Avanzó después", "Cerró", "La editaron"],
    d.rapidas_mas_usadas.map((r) => [escaparHtml(r.grupo || "—"), escaparHtml(r.titulo), r.usos, `${r.avanzaron}%`, `${r.cerraron}%`, `${r.editadas}%`])));

  const f = d.frases;
  if (f?.mejores?.length) {
    h.push(`<h2 style="${ESTILO.h2}">Palabras que acompañan las ventas</h2>`);
    h.push(`<p style="${ESTILO.p}">Frases que escribió el equipo antes de pedir el cierre (30 días). Promedio: <b>${f.promedio}%</b> cerró en ${f.chats} chats. Es correlación, no causa: sirve para decidir qué probar.</p>`);
    h.push(tabla(["Frase", "Chats", "Cerró"], f.mejores.slice(0, 8).map((x) => [`▲ ${escaparHtml(x.frase)}`, x.chats, `<b>${x.cierre}%</b>`])));
    h.push(tabla(["Frase", "Chats", "Cerró"], (f.peores || []).slice(0, 6).map((x) => [`▼ ${escaparHtml(x.frase)}`, x.chats, `${x.cierre}%`])));
    t.push(`FRASES (promedio ${f.promedio}%): ` + f.mejores.slice(0, 5).map((x) => `"${x.frase}" ${x.cierre}%`).join(" · "));
  }
  if (d.ediciones?.length) {
    h.push(`<h2 style="${ESTILO.h2}">Cómo editan las vendedoras las respuestas</h2>`);
    h.push(tabla(["Respuesta", "Lo que mandaron de verdad"], d.ediciones.slice(0, 8).map((e) => [escaparHtml(e.titulo),
      e.ejemplos.map((x) => `${x.avanzo ? "✅" : "·"} ${escaparHtml(x.agente || "")}: ${escaparHtml(String(x.texto).slice(0, 200))}`).join("<br>")])));
  }

  h.push(`<h2 style="${ESTILO.h2}">Equipo</h2>`);
  h.push(tabla(["Vendedora", "Chats", "Cerró", "Calidad (1–5)", "Coaching"],
    d.vendedoras.map((v) => [escaparHtml(v.agente), v.chats, `${v.cerraron} (${v.cierre}%)`, v.calidad ?? "—", v.coaching.map((c) => `• ${escaparHtml(c)}`).join("<br>") || "—"])));
  t.push(...d.vendedoras.map((v) => `EQUIPO ${v.agente}: ${v.chats} chats, ${v.cierre}% cerró${v.calidad ? `, calidad ${v.calidad}` : ""}`));

  h.push(`<h2 style="${ESTILO.h2}">Objeciones y motivos de pérdida</h2>`);
  h.push(tabla(["Objeción", "Veces", "Se perdieron"], d.objeciones.map((o) => [escaparHtml(o.objecion), o.n, o.perdidos])));
  if (d.motivos_perdida.length) h.push(`<p style="${ESTILO.p}">Por qué se perdieron: ${d.motivos_perdida.map((m) => `${escaparHtml(m.motivo)} (${m.n})`).join(" · ")}</p>`);

  const sug = {};
  for (const s of d.sugerencias) sug[s.estado] = (sug[s.estado] || 0) + s.n;
  h.push(`<h2 style="${ESTILO.h2}">✨ Sugerencias</h2><p style="${ESTILO.p}">Aprobadas ${sug.aprobada || 0} · descartadas ${sug.descartada || 0} · pendientes ${sug.pendiente || 0}.</p>`);
  t.push(`SUGERENCIAS aprobadas ${sug.aprobada || 0}, descartadas ${sug.descartada || 0}, pendientes ${sug.pendiente || 0}`);

  if (d.informe) {
    h.push(`<h2 style="${ESTILO.h2}">Último informe del director CRO (${escaparHtml(d.informe.created_at.slice(0, 10))})</h2>`);
    h.push(`<pre style="white-space:pre-wrap;font:13px/1.5 system-ui,sans-serif;color:#374151;background:#f9fafb;padding:12px;border-radius:8px">${escaparHtml(d.informe.texto.slice(0, 6000))}</pre>`);
    t.push("", "INFORME DEL DIRECTOR CRO", d.informe.texto.slice(0, 6000));
  }
  h.push(`<p style="${ESTILO.p};color:#9ca3af;margin-top:24px">Armado por el Worker con los datos del CRM, sin IA (0 tokens).</p></div>`);
  return { asunto, html: h.join("\n"), texto: t.join("\n") };
}

export async function onRequestGetResumen({ request, env }) {
  const cortar = await puerta(request, env);
  if (cortar) return cortar;
  const dias = Math.min(Math.max(Number(new URL(request.url).searchParams.get("dias")) || 7, 1), 31);
  const datos = await datosResumen(env, dias);
  return json({ ...armarResumen(datos, `${new URL(request.url).origin}/crm/`), datos });
}

const LIMA_MS = 5 * 3600 * 1000;

async function ajuste(db, key) {
  return (await db.prepare("SELECT value FROM crm_settings WHERE key = ?").bind(key).first())?.value ?? null;
}
function guardar(db, key, value) {
  return db.prepare("INSERT INTO crm_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value).run();
}

/** Guarda el resumen como página (CRM → Reportes) y devuelve su link. */
export async function publicarResumen(env, r, fecha) {
  const id = `resumen-${fecha}-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}.html`;
  const pagina = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex"><title>${escaparHtml(r.asunto)}</title></head>` +
    `<body style="margin:0;padding:16px;background:#fff">${r.html}</body></html>`;
  await env.CRM_MEDIA.put(`reportes/${id}`, pagina, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
    customMetadata: { titulo: `Resumen semanal ${fecha}` }
  });
  return `${SITIO}/r/${id}`;
}

/**
 * Cron de 10 min, sin IA y sin mensajes sueltos por Telegram:
 *   · lunes desde las 9:00 (Lima): el resumen semanal queda como página en
 *     CRM → Reportes (no avisa);
 *   · cada día desde las 9:00: cada prueba de mensajes que ya tiene ganadora
 *     entra a ✨ Sugerencias (solo admin) para decidir con un toque, y sale el
 *     único aviso "hay recomendaciones nuevas" (crm-avisos.js).
 */
export async function enviarResumenSiToca(env) {
  if (!env.CRM_DB) return false;
  const lima = new Date(Date.now() - LIMA_MS);
  if (lima.getUTCHours() < 9) return false;
  const hoy = lima.toISOString().slice(0, 10);
  const db = env.CRM_DB;

  // Devuelve true si hizo algo pesado (el cron de 15 min no hace más en esa pasada).
  const [semanal, revisadas] = await Promise.all([ajuste(db, "resumen_semanal_enviado"), ajuste(db, "pruebas_revisadas")]);
  if (lima.getUTCDay() === 1 && env.CRM_MEDIA && semanal !== hoy) {
    const d = await datosResumen(env, 7);
    await publicarResumen(env, armarResumen(d, `${SITIO}/crm/`), hoy);
    await guardar(db, "resumen_semanal_enviado", hoy);
    return true;
  }

  if (revisadas === hoy) return false;
  const pruebas = await pruebasDeMensajes(env);
  let avisadas = {};
  try { avisadas = JSON.parse((await ajuste(db, "pruebas_avisadas")) || "{}"); } catch { avisadas = {}; }
  const titulos = {};
  const [rs, ws] = await Promise.all([
    db.prepare("SELECT id, title FROM quick_replies").all(),
    db.prepare("SELECT id, title FROM welcome_steps").all()
  ]);
  for (const r of rs.results) titulos[`rapida:${r.id}`] = r.title;
  for (const w of ws.results) titulos[`bienvenida:${w.id}`] = `Bienvenida · ${w.title}`;
  let nuevas = 0;
  for (const tipo of ["rapida", "bienvenida"]) {
    for (const [ref, vs] of Object.entries(pruebas.en_curso[tipo] || {})) {
      const lider = vs.reduce((a, b) => (b.peso > a.peso ? b : a), vs[0]);
      const listo = vs.every((v) => v.usos >= MIN_USOS) && lider.peso >= 0.85;
      const clave = `${tipo}:${ref}:${lider.id}`;
      if (!listo || avisadas[clave]) continue;
      const i = vs.indexOf(lider);
      const detalle = vs.map((v, k) => `Versión ${k + 1}: ${pct(v.avanzaron, v.usos)}% avanzó, ${pct(v.cerraron, v.usos)}% cerró (${v.usos} usos)`).join("\n");
      // tipo 'prueba_lista': `titulo` guarda el id de la versión ganadora (0 = la original).
      await db.prepare(
        `INSERT INTO asesor_sugerencias (tipo, ref_tipo, ref_id, titulo, texto, texto_original, motivo, origen)
         VALUES ('prueba_lista', ?, ?, ?, ?, ?, ?, 'pruebas de mensajes')`
      ).bind(tipo, Number(ref), String(lider.id), lider.texto || "", lider.texto || "",
        `${titulos[`${tipo}:${ref}`] || `#${ref}`}: gana la versión ${i + 1}.\n${detalle}`).run();
      avisadas[clave] = hoy;
      nuevas++;
    }
  }
  await guardar(db, "pruebas_avisadas", JSON.stringify(avisadas));
  await guardar(db, "pruebas_revisadas", hoy);
  if (nuevas) await notificarRecomendaciones(env);
  return true;
}

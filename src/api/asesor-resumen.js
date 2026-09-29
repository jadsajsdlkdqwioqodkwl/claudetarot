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
 *      { asunto, html, texto, datos } — el resumen semanal que manda por correo
 *      el Apps Script (resumenSemanal en ASESOR.gs). Lo arma el Worker con
 *      datos de D1, sin IA: no gasta tokens. Lo único escrito por IA que trae
 *      es el último informe del director CRO, que ya estaba escrito.
 */

import { autorizadoAsesor, dentroDelLimiteAsesor, pruebasDeMensajes } from "./asesor.js";
import { MIN_USOS } from "../lib/crm-variantes.js";
import { escaparHtml } from "../lib/telegram.js";

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
      db.prepare("SELECT id, title, body FROM quick_replies").all(),
      db.prepare("SELECT id, title, body FROM welcome_steps").all()
    ])
  ]);
  const titulo = {};
  for (const r of nombres[0].results) titulo[`rapida:${r.id}`] = { titulo: r.title, texto: r.body };
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
        nombre: v.id === 0 ? "Original" : `Versión ${String.fromCharCode(65 + i)}`,
        texto: v.texto || info.texto || "",
        usos: v.usos, respondieron: pct(v.respondieron, v.usos), avanzaron: pct(v.avanzaron, v.usos),
        cerraron: pct(v.cerraron, v.usos), editadas: v.editadas, peso: v.peso, motivo: v.motivo || null
      }));
      const lider = lista.reduce((a, b) => (b.peso > a.peso ? b : a), lista[0]);
      const listo = lista.every((v) => v.usos >= MIN_USOS) && lider.peso >= 0.85;
      enCurso.push({ tipo, ref_id: Number(ref), titulo: info.titulo, versiones: lista, lider: lider.nombre, listo });
    }
  }
  const usoRapidas = pruebas.uso_por_mensaje
    .filter((u) => u.tipo === "rapida" && u.usos >= 5)
    .slice(0, 8)
    .map((u) => ({ titulo: titulo[`rapida:${u.ref_id}`]?.titulo || `#${u.ref_id}`, usos: u.usos, avanzaron: pct(u.avanzaron, u.usos), editadas: pct(u.editadas, u.usos) }));

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
    h.push(`<p style="${ESTILO.p}"><b>${escaparHtml(p.titulo)}</b> — ${p.listo ? `✅ <b>lista para decidir: gana ${escaparHtml(p.lider)}</b>` : `va adelante ${escaparHtml(p.lider)} (faltan datos)`}</p>`);
    h.push(tabla(["Versión", "Texto", "Usos", "Respondió 24 h", "Avanzó", "Cerró"],
      p.versiones.map((v) => [escaparHtml(v.nombre), escaparHtml(v.texto.slice(0, 160)) + (v.motivo ? `<br><i style="color:#6b7280">${escaparHtml(v.motivo)}</i>` : ""), v.usos, `${v.respondieron}%`, `<b>${v.avanzaron}%</b>`, `${v.cerraron}%`])));
    t.push(`PRUEBA ${p.titulo}: ${p.versiones.map((v) => `${v.nombre} ${v.usos} usos, ${v.avanzaron}% avanzó`).join(" | ")}${p.listo ? ` → gana ${p.lider}` : ""}`);
  }
  if (d.pruebas_cerradas.length) {
    h.push(`<p style="${ESTILO.p}">Cerradas esta semana: ${d.pruebas_cerradas.filter((c) => c.estado === "ganadora").map((c) => `${escaparHtml(c.titulo)} (ganó una versión nueva, eligió ${escaparHtml(c.cerrada_por || "")})`).join(" · ") || "ninguna cambió el texto"}.</p>`);
  }
  if (listas.length) h.push(`<p style="${ESTILO.p}">Para decidir: CRM → ⚡ Respuestas rápidas → editar la respuesta → <b>Quedarse con esta</b>.${urlCrm ? ` <a href="${urlCrm}">Abrir el CRM</a>` : ""}</p>`);

  h.push(`<h2 style="${ESTILO.h2}">Respuestas rápidas más usadas</h2>`);
  h.push(tabla(["Respuesta", "Usos", "Avanzó después", "La editaron"],
    d.rapidas_mas_usadas.map((r) => [escaparHtml(r.titulo), r.usos, `${r.avanzaron}%`, `${r.editadas}%`])));

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

/**
 * Qué palabras convierten: cada mensaje que escribe una persona del equipo
 * (no los automáticos) se parte en frases de 2 y 3 palabras, y se anota en
 * qué chat y en qué etapa del embudo estaba (tabla `frases_uso`). Después,
 * con SQL, se ve en qué porcentaje de los chats donde apareció cada frase se
 * terminó cerrando la venta, comparado con el promedio.
 *
 * Solo cuentan las frases dichas ANTES de pedir el cierre (etapa ≤ 3): si no,
 * "queda agendado" saldría como la frase que más vende, cuando es la que se
 * dice después de vender. Es correlación, no causa: sirve para elegir qué
 * probar, no para darlo por hecho.
 *
 * Todo sin IA, en el cron de 5 min, de a poco (VENTANA ids por pasada). La
 * etapa de cada mensaje se calcula con lo que había ANTES de él en el chat
 * (calcularEtapa), así también sirve para los mensajes viejos.
 */

import { calcularEtapa, RE_AUTO, RE_CERRO } from "./crm-embudo.js";

const VENTANA = 150;
const MAX_POR_MENSAJE = 24;
const DIAS_GUARDAR = 60;

// Palabras que solas no dicen nada: una frase no puede empezar ni terminar con ellas.
const VACIAS = new Set(("a al ante con de del e el en es la las le les lo los me mi mis o para por que se su sus te tu tus un una uno unos unas y ya " +
  "hola buenas buenos dias tardes noches estimad estimado estimada ok").split(" "));

export function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/s\/\s?(\d)/g, "s/$1")
    .replace(/[^a-z0-9ñ/@ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Las frases de 2 y 3 palabras de un mensaje, sin repetir. */
export function frasesDe(texto) {
  const p = normalizar(texto).split(" ").filter(Boolean);
  const salida = new Set();
  for (const n of [2, 3]) {
    for (let i = 0; i + n <= p.length; i++) {
      const trozo = p.slice(i, i + n);
      if (VACIAS.has(trozo[0]) || VACIAS.has(trozo[n - 1])) continue;
      if (trozo.some((w) => w.length > 20)) continue;
      salida.add(trozo.join(" "));
      if (salida.size >= MAX_POR_MENSAJE) return [...salida];
    }
  }
  return [...salida];
}

/** Procesa los mensajes nuevos del equipo desde la última pasada. */
export async function procesarFrases(env) {
  const db = env.CRM_DB;
  if (!db) return;
  const fila = await db.prepare("SELECT value FROM crm_settings WHERE key = 'frases_ultimo_id'").first();
  const tope = await db.prepare("SELECT MAX(id) AS m FROM messages").first();
  const maxId = tope?.m || 0;
  let desde = Number(fila?.value);
  if (!Number.isFinite(desde)) desde = Math.max(0, maxId - 20000); // primera vez: lo que haya de las últimas semanas
  if (desde >= maxId) return;
  const hasta = Math.min(desde + VENTANA, maxId);

  // Los chats que tuvieron mensajes en esta ventana, con su historia hasta el final de la ventana.
  const { results: convs } = await db.prepare(
    "SELECT DISTINCT conversation_id FROM messages WHERE id > ? AND id <= ? AND direction = 'out' AND type = 'text'"
  ).bind(desde, hasta).all();
  const inserts = [];
  for (const { conversation_id } of convs) {
    const { results: hist } = await db.prepare(
      `SELECT id, direction, type, body, sent_by, created_at FROM messages
       WHERE conversation_id = ? AND id <= ? ORDER BY id DESC LIMIT 300`
    ).bind(conversation_id, hasta).all();
    hist.reverse();
    hist.forEach((m, i) => {
      if (m.id <= desde || m.direction !== "out" || m.type !== "text" || !m.body || RE_AUTO.test(m.sent_by || "")) return;
      // "Queda agendado", "su clave es…": se dicen DESPUÉS de vender, no ayudan a vender.
      if (RE_CERRO.test(m.body)) return;
      const etapa = calcularEtapa(hist.slice(0, i));
      for (const f of frasesDe(m.body)) {
        inserts.push(
          db.prepare("INSERT OR IGNORE INTO frases_uso (frase, conversation_id, etapa_antes, created_at) VALUES (?, ?, ?, ?)")
            .bind(f, conversation_id, etapa, m.created_at)
        );
      }
    });
  }
  for (let i = 0; i < inserts.length; i += 400) await db.batch(inserts.slice(i, i + 400));
  const cambios = [
    db.prepare("INSERT INTO crm_settings (key, value) VALUES ('frases_ultimo_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(String(hasta))
  ];
  // Limpieza una vez al día.
  const hoy = new Date().toISOString().slice(0, 10);
  const limpio = await db.prepare("SELECT value FROM crm_settings WHERE key = 'frases_limpieza'").first();
  if (limpio?.value !== hoy) {
    cambios.push(
      db.prepare("DELETE FROM frases_uso WHERE created_at < datetime('now', ?)").bind(`-${DIAS_GUARDAR} days`),
      db.prepare("INSERT INTO crm_settings (key, value) VALUES ('frases_limpieza', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(hoy)
    );
  }
  await db.batch(cambios);
}

/**
 * Las frases que más (y menos) acompañan a una venta, en los últimos `dias`.
 * Devuelve { promedio, chats, mejores: [{ frase, chats, cerraron, cierre }], peores }.
 */
export async function frasesQueConvierten(db, dias = 30, minimoChats = 12) {
  const rango = `-${dias} days`;
  const base = await db.prepare(
    `SELECT COUNT(*) AS chats, SUM(etapa >= 5) AS cerraron FROM conversations
     WHERE id IN (SELECT DISTINCT conversation_id FROM frases_uso WHERE created_at >= datetime('now', ?) AND etapa_antes <= 3)`
  ).bind(rango).first();
  const consulta = (orden) => db.prepare(
    `SELECT f.frase, COUNT(*) AS chats, SUM(conv.etapa >= 5) AS cerraron
     FROM frases_uso f JOIN conversations conv ON conv.id = f.conversation_id
     WHERE f.created_at >= datetime('now', ?) AND f.etapa_antes <= 3
     GROUP BY f.frase HAVING COUNT(*) >= ?
     ORDER BY 1.0 * SUM(conv.etapa >= 5) / COUNT(*) ${orden}, COUNT(*) DESC LIMIT 40`
  ).bind(rango, minimoChats).all();
  const [mejores, peores] = await Promise.all([consulta("DESC"), consulta("ASC")]);
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const conCierre = (r) => ({ ...r, cierre: pct(r.cerraron, r.chats) });
  const promedio = pct(base?.cerraron || 0, base?.chats || 0);
  // "fijo no", "fijo no hay", "no hay rebaja" son la misma frase: queda una.
  const sinRepetir = (lista) => {
    const quedan = [];
    for (const r of lista) {
      // Comparten palabras y aparecen en los mismos chats: son trozos del mismo mensaje.
      const pisa = quedan.find((q) => q.frase.split(" ").some((w) => r.frase.split(" ").includes(w)) &&
        Math.abs(q.chats - r.chats) <= 1 && Math.abs(q.cerraron - r.cerraron) <= 1);
      if (!pisa) quedan.push(r);
    }
    return quedan;
  };
  return {
    chats: base?.chats || 0,
    promedio,
    mejores: sinRepetir(mejores.results.map(conCierre).filter((r) => r.cierre > promedio)),
    peores: sinRepetir(peores.results.map(conCierre).filter((r) => r.cierre < promedio))
  };
}

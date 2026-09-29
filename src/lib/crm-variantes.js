/**
 * Pruebas de mensajes: otras versiones del texto de una respuesta rápida o de
 * un paso de la bienvenida (tabla `variantes`). La original es la versión 0.
 *
 * Quién decide qué versión sale: el Worker, con muestreo de Thompson sobre
 * "¿el chat avanzó de etapa después de este mensaje?" (conversations.etapa,
 * ver crm-embudo.js). Mientras alguna versión tenga menos de MIN_USOS usos,
 * todas salen parejo; después, la que va ganando sale más, pero las otras
 * siguen saliendo (nunca menos de PISO) para no cerrar la prueba antes de
 * tiempo. Quien cierra la prueba es el admin ("Quedarse con esta").
 *
 * La IA no manda nada: propone versiones en ✨ Sugerencias y lee los números.
 */

export const MIN_USOS = 20;
const PISO = 0.1;
const DIAS = 45;
const MUESTRAS = 400;

/** Gamma(k, 1) para k ≥ 1 (Marsaglia–Tsang). */
function gamma(k) {
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do {
      // Normal estándar por Box–Muller.
      x = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = 1 - Math.random();
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

const beta = (a, b) => {
  const x = gamma(a);
  return x / (x + gamma(b));
};

/**
 * Peso de cada versión (suman 1): la probabilidad de que sea la mejor según lo
 * medido, con piso. `brazos`: [{ usos, avanzaron }].
 */
export function pesos(brazos) {
  const n = brazos.length;
  if (n <= 1) return brazos.map(() => 1);
  if (brazos.some((b) => b.usos < MIN_USOS)) return brazos.map(() => 1 / n);
  const gana = new Array(n).fill(0);
  for (let s = 0; s < MUESTRAS; s++) {
    let mejor = 0, max = -1;
    brazos.forEach((b, i) => {
      const x = beta(1 + b.avanzaron, 1 + Math.max(b.usos - b.avanzaron, 0));
      if (x > max) { max = x; mejor = i; }
    });
    gana[mejor]++;
  }
  const piso = Math.min(PISO, 1 / n);
  const crudo = gana.map((g) => g / MUESTRAS);
  const resto = 1 - piso * n;
  return crudo.map((p) => piso + resto * p);
}

/** Elige un índice según los pesos. */
export function sortear(ps) {
  let r = Math.random();
  for (let i = 0; i < ps.length; i++) {
    r -= ps[i];
    if (r <= 0) return i;
  }
  return ps.length - 1;
}

/**
 * Números de cada versión (la original como id 0) de una respuesta rápida o
 * paso de bienvenida, en los últimos DIAS días.
 *   usos        cuántas veces salió
 *   respondieron el cliente escribió dentro de las 24 h siguientes
 *   avanzaron   el chat subió de etapa después (lo que decide el reparto)
 *   cerraron    el chat llegó a la etapa 5 después
 *   editadas    la vendedora cambió el texto antes de mandarlo
 */
export async function estadisticas(db, tipo, refIds) {
  if (!refIds.length) return [];
  const marcas = refIds.map(() => "?").join(",");
  const { results } = await db.prepare(
    `SELECT u.ref_id, u.variante_id, COUNT(*) AS usos,
       SUM(EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = u.conversation_id AND m.direction = 'in'
                   AND m.created_at > u.created_at AND m.created_at <= datetime(u.created_at, '+24 hours'))) AS respondieron,
       SUM(conv.etapa > u.etapa_antes AND conv.etapa_at > u.created_at) AS avanzaron,
       SUM(conv.etapa >= 5 AND u.etapa_antes < 5 AND conv.etapa_at > u.created_at) AS cerraron,
       SUM(u.editada) AS editadas
     FROM variante_usos u JOIN conversations conv ON conv.id = u.conversation_id
     WHERE u.tipo = ? AND u.ref_id IN (${marcas}) AND u.created_at >= datetime('now', ?)
       -- Solo las que eligió el CRM: si la vendedora escoge a mano (botones 1·2·3),
       -- escoge según el cliente y la comparación deja de ser pareja.
       AND u.a_mano = 0
       -- La original (0) cuenta desde el último cambio de su texto: lo de antes era otro mensaje.
       AND (u.variante_id != 0 OR u.created_at >= COALESCE((SELECT MAX(x.created_at) FROM variantes x
            WHERE x.tipo = u.tipo AND x.ref_id = u.ref_id AND x.estado = 'anterior'), '1970-01-01'))
     GROUP BY u.ref_id, u.variante_id`
  ).bind(tipo, ...refIds, `-${DIAS} days`).all();
  return results;
}

/**
 * Las versiones en prueba de varias respuestas rápidas / pasos, cada una con
 * sus números y su peso. Devuelve { [ref_id]: [{ id, texto|null, usos, …, peso }] }
 * solo para los que tienen al menos una versión activa (id 0 = la original,
 * texto null = usar el de siempre).
 */
export async function versionesEnPrueba(db, tipo, refIds = null) {
  const { results: activas } = await db.prepare(
    `SELECT id, ref_id, texto, origen, motivo, unico, media_key, media_type, media_mime, created_at
     FROM variantes WHERE tipo = ? AND estado = 'activa' ORDER BY id`
  ).bind(tipo).all();
  const porRef = {};
  for (const v of activas) {
    if (refIds && !refIds.includes(v.ref_id)) continue;
    (porRef[v.ref_id] ||= [{ id: 0, texto: null }]).push(v);
  }
  const ids = Object.keys(porRef).map(Number);
  const numeros = await estadisticas(db, tipo, ids);
  for (const ref of ids) {
    const brazos = porRef[ref].map((v) => {
      const n = numeros.find((x) => x.ref_id === ref && x.variante_id === v.id) || {};
      return { ...v, usos: n.usos || 0, respondieron: n.respondieron || 0, avanzaron: n.avanzaron || 0, cerraron: n.cerraron || 0, editadas: n.editadas || 0 };
    });
    const ps = pesos(brazos);
    porRef[ref] = brazos.map((b, i) => ({ ...b, peso: Math.round(ps[i] * 1000) / 1000 }));
  }
  return porRef;
}

/** El texto de la original cambió (a mano o al cerrar una prueba): se guarda el viejo y su cuenta vuelve a 0. */
export function guardarAnterior(db, tipo, refId, textoViejo, quien) {
  return db.prepare("INSERT INTO variantes (tipo, ref_id, texto, estado, origen, cerrada_at, cerrada_por) VALUES (?, ?, ?, 'anterior', 'texto anterior', datetime('now'), ?)")
    .bind(tipo, refId, textoViejo || "", quien || null);
}

/** Deja constancia de que salió una versión en un chat. Nunca rompe el envío. */
export async function registrarUso(db, { tipo, refId, varianteId = 0, conversationId, etapaAntes = null, agente = null, editada = false, aMano = false, textoEnviado = null }) {
  try {
    let etapa = etapaAntes;
    if (etapa === null) {
      const c = await db.prepare("SELECT etapa FROM conversations WHERE id = ?").bind(conversationId).first();
      etapa = c?.etapa || 0;
    }
    await db.prepare(
      "INSERT INTO variante_usos (tipo, ref_id, variante_id, conversation_id, etapa_antes, agente, editada, a_mano, texto_enviado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(tipo, refId, varianteId || 0, conversationId, etapa, agente, editada ? 1 : 0, aMano ? 1 : 0, editada && textoEnviado ? String(textoEnviado).slice(0, 2000) : null).run();
  } catch (err) {
    console.error("Uso de versión:", err.message);
  }
}

/**
 * El admin cierra una prueba: la versión elegida pasa a ser el texto de la
 * respuesta rápida / paso (0 = quedarse con la original) y las demás se
 * retiran. El texto anterior queda guardado como 'anterior' para el historial.
 */
export async function cerrarPrueba(db, tipo, refId, ganadoraId, quien) {
  const tabla = tipo === "rapida" ? "quick_replies" : "welcome_steps";
  const actual = await db.prepare(`SELECT body FROM ${tabla} WHERE id = ?`).bind(refId).first();
  if (!actual) throw new Error("No existe.");
  const cambios = [];
  if (ganadoraId) {
    const v = await db.prepare("SELECT texto FROM variantes WHERE id = ? AND tipo = ? AND ref_id = ? AND estado = 'activa'").bind(ganadoraId, tipo, refId).first();
    if (!v) throw new Error("Esa versión ya no está en prueba.");
    cambios.push(
      guardarAnterior(db, tipo, refId, actual.body, quien),
      db.prepare(`UPDATE ${tabla} SET body = ? WHERE id = ?`).bind(v.texto, refId),
      db.prepare("UPDATE variantes SET estado = 'ganadora', cerrada_at = datetime('now'), cerrada_por = ? WHERE id = ?").bind(quien, ganadoraId)
    );
  }
  cambios.push(
    db.prepare("UPDATE variantes SET estado = 'retirada', cerrada_at = datetime('now'), cerrada_por = ? WHERE tipo = ? AND ref_id = ? AND estado = 'activa'")
      .bind(quien, tipo, refId)
  );
  await db.batch(cambios);
}

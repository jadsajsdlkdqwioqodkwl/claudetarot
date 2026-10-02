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

/**
 * SQL: el texto que sale por defecto de una respuesta rápida (alias `q`) o
 * paso de bienvenida — el de la versión ⭐ predeterminada si hay orden fijo
 * con otra versión primero; si no, su body. Para todo lo que muestra o manda
 * "el texto de la respuesta" (seguimientos programados, listas, director).
 */
export const textoPorDefectoSql = (tipo, alias = "q") =>
  `COALESCE((SELECT vd.texto FROM variantes vd WHERE vd.tipo = '${tipo === "bienvenida" ? "bienvenida" : "rapida"}' AND vd.ref_id = ${alias}.id
     AND vd.estado = 'activa' AND vd.unico = 0 AND vd.id = json_extract(${alias}.orden_versiones, '$[0]')), ${alias}.body)`;
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
    `SELECT id, ref_id, texto, origen, motivo, unico, media_key, media_type, media_mime, catalogo, catalogo_nombre, created_at
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
  if (ids.length) {
    const ordenes = await ordenesFijos(db, tipo, ids);
    for (const ref of ids) if (ordenes[ref]) porRef[ref] = ordenar(porRef[ref], ordenes[ref]);
  }
  return porRef;
}

const TABLA = (tipo) => (tipo === "rapida" ? "quick_replies" : "welcome_steps");

/** Lee orden_versiones: { [ref_id]: [ids] } solo de las que tienen orden fijo. */
async function ordenesFijos(db, tipo, refIds) {
  const marcas = refIds.map(() => "?").join(",");
  const { results } = await db.prepare(
    `SELECT id, orden_versiones FROM ${TABLA(tipo)} WHERE id IN (${marcas}) AND orden_versiones IS NOT NULL`
  ).bind(...refIds).all().catch(() => ({ results: [] }));
  const out = {};
  for (const r of results) {
    try {
      const o = JSON.parse(r.orden_versiones);
      if (Array.isArray(o) && o.length) out[r.id] = o.map(Number);
    } catch { /* orden roto: sin orden fijo */ }
  }
  return out;
}

/**
 * Pone las versiones en el orden que eligió el admin. La primera queda
 * `predeterminada` (sale al tocar el mensaje, sin sorteo). Las que no están
 * en el orden (agregadas después) van al final.
 */
function ordenar(versiones, orden) {
  const pos = (v) => { const i = orden.indexOf(v.id); return i < 0 ? orden.length + v.id : i; };
  return [...versiones].sort((a, b) => pos(a) - pos(b)).map((v, i) => ({ ...v, predeterminada: i === 0 }));
}

/** La predeterminada si hay orden fijo; si no, la que sale sorteada. */
export function elegirVersion(versiones) {
  return versiones.find((v) => v.predeterminada) || versiones[sortear(versiones.map((v) => v.peso))];
}

/**
 * Fija el orden de las versiones de una respuesta rápida o paso de la
 * bienvenida sin cerrar la prueba (`orden`: ids, 0 = original; la primera es
 * la predeterminada). `orden` null = volver al sorteo.
 */
export async function guardarOrden(db, tipo, refId, orden) {
  if (orden === null) {
    await db.prepare(`UPDATE ${TABLA(tipo)} SET orden_versiones = NULL WHERE id = ?`).bind(refId).run();
    return;
  }
  const { results } = await db.prepare("SELECT id FROM variantes WHERE tipo = ? AND ref_id = ? AND estado = 'activa'").bind(tipo, refId).all();
  const validos = new Set([0, ...results.map((r) => r.id)]);
  const limpio = [...new Set(orden.map(Number))].filter((id) => validos.has(id));
  for (const id of validos) if (!limpio.includes(id)) limpio.push(id);
  await db.prepare(`UPDATE ${TABLA(tipo)} SET orden_versiones = ? WHERE id = ?`).bind(JSON.stringify(limpio), refId).run();
}

/** Una versión editada entra con otro id: toma el lugar de la vieja en el orden fijo. */
export async function reemplazarEnOrden(db, tipo, refId, viejoId, nuevoId) {
  const r = await db.prepare(`SELECT orden_versiones FROM ${TABLA(tipo)} WHERE id = ?`).bind(refId).first().catch(() => null);
  if (!r?.orden_versiones) return;
  let o;
  try { o = JSON.parse(r.orden_versiones); } catch { return; }
  if (!Array.isArray(o)) return;
  await db.prepare(`UPDATE ${TABLA(tipo)} SET orden_versiones = ? WHERE id = ?`)
    .bind(JSON.stringify(o.map((id) => (Number(id) === viejoId ? nuevoId : Number(id)))), refId).run();
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
 * respuesta rápida / paso (y, en una respuesta rápida, con qué sale: fotos o catálogo) (0 = quedarse con la original) y las demás se
 * retiran. El texto anterior queda guardado como 'anterior' para el historial.
 */
export async function cerrarPrueba(db, tipo, refId, ganadoraId, quien) {
  const tabla = tipo === "rapida" ? "quick_replies" : "welcome_steps";
  const actual = await db.prepare(`SELECT body FROM ${tabla} WHERE id = ?`).bind(refId).first();
  if (!actual) throw new Error("No existe.");
  const cambios = [];
  if (ganadoraId) {
    const v = await db.prepare("SELECT texto, catalogo, catalogo_nombre FROM variantes WHERE id = ? AND tipo = ? AND ref_id = ? AND estado = 'activa'").bind(ganadoraId, tipo, refId).first();
    if (!v) throw new Error("Esa versión ya no está en prueba.");
    cambios.push(
      guardarAnterior(db, tipo, refId, actual.body, quien),
      db.prepare(`UPDATE ${tabla} SET body = ? WHERE id = ?`).bind(v.texto, refId),
      // Respuesta rápida: si la ganadora salía con otra cosa (fotos o catálogo), la respuesta queda así.
      ...(tipo === "rapida" && v.catalogo
        ? [db.prepare("UPDATE quick_replies SET catalogo = ?, catalogo_nombre = ? WHERE id = ?")
            .bind(v.catalogo === "-" ? null : v.catalogo, v.catalogo === "-" ? null : v.catalogo_nombre, refId)]
        : []),
      db.prepare("UPDATE variantes SET estado = 'ganadora', cerrada_at = datetime('now'), cerrada_por = ? WHERE id = ?").bind(quien, ganadoraId)
    );
  }
  cambios.push(
    db.prepare("UPDATE variantes SET estado = 'retirada', cerrada_at = datetime('now'), cerrada_por = ? WHERE tipo = ? AND ref_id = ? AND estado = 'activa'")
      .bind(quien, tipo, refId)
  );
  // Sin prueba, no hay orden de versiones que guardar.
  cambios.push(db.prepare(`UPDATE ${tabla} SET orden_versiones = NULL WHERE id = ?`).bind(refId));
  await db.batch(cambios);
}

/**
 * Plan de toques (docs/plan-seguimientos.md): plantillas que salen solas a
 * los días 2, 7, 14 y 30 a quien no compró, y a los días 7, 14 y 30 a quien
 * ya compró. Sin IA: textos fijos aprobados por Meta (categoría Marketing,
 * Spanish PER), con {{1}} = primer nombre y dos botones de respuesta rápida.
 * Tocar un botón abre la ventana de 24 h y el chat sube en el CRM para que
 * una vendedora lo siga a mano.
 *
 * Reglas (las de docs/negocio.md y el plan):
 *  - Se prende con TOQUES en wrangler.jsonc (lista de ids; vacío = apagado).
 *    Cada plantilla se crea sola en Meta si no existe; mientras no esté
 *    aprobada, ese toque espera.
 *  - Una vez por chat cada toque. 14 exige que haya salido 7, y 30 exige 14.
 *  - Los días se cuentan desde el último mensaje del cliente (no compró) o
 *    desde la compra (cliente). Si respondió, el reloj vuelve a 0.
 *  - No sale si: compró (toques de lead), alguien del equipo le escribió en
 *    las últimas 20 h, tiene un seguimiento programado pendiente, pidió que
 *    no le escriban ("Cerrar consulta", "no me interesa"…), o está fuera de
 *    HORARIO_ENVIO.
 *  - Grupo de control: 1 de cada 5 chats (id % 5 = 0) no recibe nada y queda
 *    anotado como 'control', para medir si los toques venden de verdad
 *    (GET /api/asesor/toques).
 *  - Tope diario TOQUES_MAX_DIA (40 por defecto): son plantillas pagadas.
 */

import { enviarTemplate } from "./whatsapp.js";
import { mandarConEscribiendo } from "./crm-send.js";
import { registrarMensajeSaliente } from "./crm-db.js";
import { plantillaAprobada, primerNombre } from "./plantillas.js";
import { enSilencio } from "./horario.js";

export const ORIGEN_TOQUE = "Toque automático";
const POR_PASADA = 4; // ~9 consultas a D1 por envío: entra en el tope de 50 por ejecución
const IDIOMA = "es_PE";

const botones = (a, b) => ({ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: a }, { type: "QUICK_REPLY", text: b }] });
const cuerpo = (text) => ({ type: "BODY", text, example: { body_text: [["María"]] } });

/**
 * dias: cuándo sale. etapaMin: etapa del embudo mínima (2 conversó, 3 dijo
 * destino, 4 le pidieron cierre). requiere: el toque anterior de la cadena.
 * Los textos siguen la skill voz-tarot-store (de usted, una sola pregunta).
 */
export const TOQUES = {
  d2: {
    tipo: "lead", dias: 2, etapaMin: 2, soloRecientes: true,
    componentes: [
      cuerpo("Hola {{1}} ☺️ le cuento que cada carta del kit trae su significado impreso, así puede hacer su primera lectura desde el primer día ✨ ¿Le separo el suyo?"),
      botones("Sí, sepárelo", "Tengo una duda")
    ]
  },
  d7: {
    tipo: "lead", dias: 7, etapaMin: 3,
    componentes: [
      cuerpo("Hola {{1}} ☺️ esta semana salieron kits a todo el Perú con envío gratis, y en Lima se paga recién al recibir 🫶 ¿Le gustaría que le separe uno?"),
      botones("Sí, quiero el mío", "Tengo una duda")
    ]
  },
  d14: {
    tipo: "lead", dias: 14, etapaMin: 3, requiere: "d7",
    componentes: [
      cuerpo("Hola {{1}} ☺️ para que se anime le podemos dejar su kit de tarot en S/79 con envío gratis ✨ ¿Se lo separo?"),
      botones("Sí, lo quiero", "Ahora no")
    ]
  },
  d30: {
    tipo: "lead", dias: 30, etapaMin: 3, requiere: "d14",
    componentes: [
      cuerpo("Hola {{1}} ☺️ no quiero incomodarle, ¿le sigue interesando el kit de tarot o cierro su consulta?"),
      botones("Aún me interesa", "Cerrar consulta")
    ]
  },
  post7: {
    tipo: "cliente", dias: 7,
    componentes: [
      cuerpo("Hola {{1}} ☺️ ¿qué tal le va con su kit? Si gusta le mando una tirada sencilla para practicar esta semana ✨"),
      botones("Sí, mándemela", "Todo bien, gracias")
    ]
  },
  post14: {
    tipo: "cliente", dias: 14, requiere: "post7",
    componentes: [
      cuerpo("Hola {{1}} ☺️ a varias clientas les gustó sumar el mazo The Classic Tarot para practicar con otro diseño, está en S/69 ✨ ¿Le cuento más?"),
      botones("Sí, cuénteme", "Ahora no")
    ]
  },
  post30: {
    tipo: "cliente", dias: 30, requiere: "post14",
    componentes: [
      cuerpo("Hola {{1}} ☺️ gracias por confiar en nosotros. Si alguna amiga quiere aprender tarot, puede escribirnos de su parte y la atendemos con cariño ✨"),
      botones("Claro, le paso", "Gracias")
    ]
  }
};

const nombrePlantilla = (id) => `toque_${id}`;

// Pidió que no le escriban (incluye el botón "Cerrar consulta" del toque de 30 días).
const NO_ESCRIBIR = ["cerrar consulta", "no me interesa", "no estoy interesad", "no me escrib", "no me mand", "no me moleste", "no gracias", "ya no quiero"];
const SQL_NO_ESCRIBIR = NO_ESCRIBIR.map(() => "lower(i.body) LIKE ?").join(" OR ");

/** Chats a los que hoy les toca `id` (como mucho `limite`). */
async function candidatos(db, id, def, limite) {
  const desde = def.tipo === "lead" ? "conv.last_inbound_at" : "compra.t";
  const ventana = def.tipo === "lead" && def.dias === 2
    ? ["-66 hours", "-40 hours"] // día 2: entre 40 y 66 h de silencio
    : [`-${def.dias + 2} days`, `-${def.dias} days`];
  const filtros = [
    `${desde} IS NOT NULL`,
    `datetime(${desde}) >= datetime('now', ?)`,
    `datetime(${desde}) < datetime('now', ?)`,
    "NOT EXISTS (SELECT 1 FROM toques t WHERE t.conversation_id = conv.id AND t.toque = ?)",
    `NOT EXISTS (SELECT 1 FROM messages o WHERE o.conversation_id = conv.id AND o.direction = 'out' AND o.created_at >= datetime('now', '-20 hours'))`,
    `NOT EXISTS (SELECT 1 FROM scheduled_messages s WHERE s.conversation_id = conv.id AND s.status IN ('pendiente', 'enviando'))`,
    `NOT EXISTS (SELECT 1 FROM messages i WHERE i.conversation_id = conv.id AND i.direction = 'in' AND (${SQL_NO_ESCRIBIR}))`
  ];
  const params = [...ventana, id, ...NO_ESCRIBIR.map((t) => `%${t}%`)];
  if (def.tipo === "lead") {
    filtros.push("conv.etapa >= ?", "conv.etapa < 5", "instr(' ' || COALESCE(conv.meta_tags, '') || ' ', ' purchase ') = 0");
    params.push(def.etapaMin);
    // Día 2: solo leads nuevos (dentro de las 72 h gratis del anuncio).
    if (def.soloRecientes) filtros.push("conv.created_at >= datetime('now', '-70 hours')");
  }
  if (def.requiere) {
    filtros.push("EXISTS (SELECT 1 FROM toques t WHERE t.conversation_id = conv.id AND t.toque = ? AND t.estado IN ('enviada', 'control'))");
    params.push(def.requiere);
  }
  params.push(limite);
  const { results } = await db.prepare(
    `SELECT conv.id, c.wa_id, COALESCE(c.name, c.profile_name) AS nombre
     FROM conversations conv
     JOIN contacts c ON c.id = conv.contact_id
     LEFT JOIN (
       SELECT x.id AS conversation_id,
              COALESCE((SELECT MIN(e.created_at) FROM capi_events e WHERE e.conversation_id = x.id AND e.event_name = 'Purchase' AND e.status = 'enviado'),
                       CASE WHEN x.etapa >= 5 THEN x.etapa_at END) AS t
       FROM conversations x
       WHERE x.etapa >= 5 OR instr(' ' || COALESCE(x.meta_tags, '') || ' ', ' purchase ') > 0
     ) compra ON compra.conversation_id = conv.id
     WHERE ${filtros.join(" AND ")}
     ORDER BY conv.id
     LIMIT ?`
  ).bind(...params).all();
  return results;
}

/** Cron (cada 5 min, su propia ejecución): manda los toques que vencieron. */
export async function procesarToques(env) {
  const db = env.CRM_DB;
  const activos = String(env.TOQUES || "").split(",").map((s) => s.trim()).filter((id) => TOQUES[id]);
  if (!db || !activos.length || !env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return;
  if (enSilencio(Date.now(), env.HORARIO_ENVIO)) return;

  await db.prepare("UPDATE toques SET estado = 'fallida', error = 'se cortó la pasada' WHERE estado = 'enviando' AND created_at < datetime('now', '-15 minutes')").run();
  const hoy = await db.prepare("SELECT COUNT(*) AS n FROM toques WHERE estado = 'enviada' AND created_at >= datetime('now', '-24 hours')").first();
  let cupo = Math.min(POR_PASADA, Math.max((Number(env.TOQUES_MAX_DIA) || 40) - (hoy?.n || 0), 0));

  for (const id of activos) {
    if (cupo <= 0) break;
    const def = TOQUES[id];
    const lista = await candidatos(db, id, def, cupo + 2);
    if (!lista.length) continue;
    const nombre = nombrePlantilla(id);
    const aprobada = await plantillaAprobada(env, nombre, { categoria: "MARKETING", idioma: IDIOMA, componentes: def.componentes })
      .catch((err) => (console.error(`Plantilla ${nombre}:`, err.message), null));

    for (const c of lista) {
      if (cupo <= 0) break;
      if (c.id % 5 === 0) {
        // Grupo de control: no se le manda, solo se anota (el día en que le habría tocado).
        await db.prepare("INSERT OR IGNORE INTO toques (conversation_id, toque, estado) VALUES (?, ?, 'control')").bind(c.id, id).run();
        continue;
      }
      if (!aprobada) break; // en revisión: se reintenta en la próxima pasada
      const r = await db.prepare("INSERT OR IGNORE INTO toques (conversation_id, toque, estado) VALUES (?, ?, 'enviando')").bind(c.id, id).run();
      if (!r.meta?.changes) continue;
      cupo--;
      try {
        const params = aprobada.conNombre ? [primerNombre(c.nombre)] : [];
        const waMessageId = await mandarConEscribiendo(env, c.id, () => enviarTemplate(env, c.wa_id, nombre, aprobada.idioma, params));
        const texto = def.componentes[0].text.replace("{{1}}", params[0] || "");
        await registrarMensajeSaliente(db, c.id, { waMessageId, type: "template", body: `Plantilla: ${nombre} · ${texto}`, sentBy: ORIGEN_TOQUE }, { subirEnBandeja: false });
        await db.prepare("UPDATE toques SET estado = 'enviada' WHERE conversation_id = ? AND toque = ?").bind(c.id, id).run();
      } catch (err) {
        console.error(`Toque ${id}:`, err.message);
        await db.prepare("UPDATE toques SET estado = 'fallida', error = ? WHERE conversation_id = ? AND toque = ?")
          .bind(String(err.message).slice(0, 300), c.id, id).run().catch(() => {});
      }
    }
  }
}

/** Para el informe: por toque, enviados vs. control, cuántos respondieron en 24 h y cuántos compraron en 7 días. */
export async function estadisticasToques(db, dias = 30) {
  const { results } = await db.prepare(
    `SELECT t.toque, t.estado, COUNT(*) AS n,
            SUM(EXISTS (SELECT 1 FROM messages i WHERE i.conversation_id = t.conversation_id AND i.direction = 'in'
                        AND i.created_at > t.created_at AND i.created_at < datetime(t.created_at, '+1 day'))) AS respondieron,
            SUM(EXISTS (SELECT 1 FROM capi_events e WHERE e.conversation_id = t.conversation_id AND e.event_name = 'Purchase'
                        AND e.status = 'enviado' AND e.created_at > t.created_at AND e.created_at < datetime(t.created_at, '+7 days'))
                OR EXISTS (SELECT 1 FROM conversations x WHERE x.id = t.conversation_id AND x.etapa >= 5
                        AND x.etapa_at > t.created_at AND x.etapa_at < datetime(t.created_at, '+7 days'))) AS compraron
     FROM toques t
     WHERE t.created_at >= datetime('now', ?) AND t.estado IN ('enviada', 'control')
     GROUP BY t.toque, t.estado
     ORDER BY t.toque, t.estado`
  ).bind(`-${dias} days`).all();
  return results;
}

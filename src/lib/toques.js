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
 *  - Ventana gratis del anuncio (FEP): desde el 28/09/2026 Meta no cobra
 *    NINGÚN mensaje (plantillas de marketing incluidas) durante 7 días desde
 *    que respondimos al primer mensaje del anuncio (antes eran 72 h). Como la
 *    bienvenida responde al minuto, se cuenta desde conv.created_at con 8 h de
 *    margen (FEP_HORAS). Los toques `gratis` solo salen dentro de esa ventana
 *    y a chats que vinieron de un anuncio (ctwa_clid); los demás se pagan.
 *    Dos cadenas de leads:
 *      · frío (etapa 1: solo el saludo del anuncio, nunca respondió): frio2 y
 *        frio6, siempre gratis, nunca se le paga una plantilla;
 *      · interesado (etapa 2+): d2 gratis, d7 (gratis si aún está en la
 *        ventana: sale desde las 132 h de silencio), d14 y d30 pagados.
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
 *  - Tope diario TOQUES_MAX_DIA (40 por defecto) solo para los toques pagados;
 *    los `gratis` no lo gastan.
 */

import { enviarTemplate } from "./whatsapp.js";
import { mandarConEscribiendo } from "./crm-send.js";
import { registrarMensajeSaliente } from "./crm-db.js";
import { plantillaAprobada, primerNombre } from "./plantillas.js";
import { enSilencio } from "./horario.js";
import { destinosDeChats } from "./crm-destino.js";

export const ORIGEN_TOQUE = "Toque automático";
const POR_PASADA = 4; // ~9 consultas a D1 por envío: entra en el tope de 50 por ejecución
const IDIOMA = "es_PE";
export const FEP_HORAS = 160; // 7 días gratis del anuncio menos 8 h de margen
const EN_FEP = `c.ctwa_clid IS NOT NULL AND conv.created_at >= datetime('now', '-${FEP_HORAS} hours')`;

const botones = (a, b) => ({ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: a }, { type: "QUICK_REPLY", text: b }] });
const cuerpo = (text) => ({ type: "BODY", text, example: { body_text: [["María"]] } });

/**
 * La escalera de ofertas (docs/plan-seguimientos.md, aprobada por el dueño el
 * 02/10): cada toque sube un escalón y REEMPLAZA la oferta anterior, no se
 * suman. Día 2 sin oferta (solo valor), día 7 regalo (collar extra), día 14
 * precio (S/79) o 2 kits para regalar, día 30 compromiso mínimo (separar con
 * S/10). A clientes: valor, mazo a precio de clienta, referidos y el Gold.
 *
 * dias: cuándo sale (días de silencio; `horas` [desde, hasta] lo afina).
 * etapaMin / etapaMax: etapa del embudo (1 solo saludó, 2 conversó, 3 dijo
 * destino). requiere: el toque anterior de la cadena. gratis: solo dentro de
 * la ventana gratis del anuncio. enFep: para un toque pagado, horas de
 * silencio desde las que sale antes si el chat sigue en la ventana gratis.
 * Con `por_destino` hay una plantilla por destino del chat (lima / provincia /
 * general si no se sabe), así cada uno lee lo que le aplica. Textos con la
 * skill voz-tarot-store.
 */
export const TOQUES = {
  // Cadena fría (gratis): solo mandó el saludo del anuncio y no contestó la bienvenida.
  frio2: {
    tipo: "lead", dias: 2, horas: [40, 66], etapaMin: 1, etapaMax: 1, gratis: true,
    general: [
      cuerpo("Hola {{1}} ☺️ vi que preguntó por el kit de tarot y no alcanzamos a conversar. Le cuento que el envío es gratis a todo el Perú y en Lima paga recién al recibir ✨ ¿Sería para Lima o para provincia?"),
      botones("Lima", "Provincia")
    ]
  },
  frio6: {
    tipo: "lead", dias: 6, horas: [132, FEP_HORAS], etapaMin: 1, etapaMax: 1, gratis: true,
    general: [
      cuerpo("Hola {{1}} ☺️ si separa su kit de tarot esta semana le regalamos un collar amuleto extra 🫶 Trae las 78 cartas con su significado impreso, manual y tapete, con envío gratis a todo el Perú ✨ ¿Le cuento cómo le llega?"),
      botones("Sí, cuénteme", "Ahora no")
    ]
  },
  // Cadena de interesados (etapa 2+): d2 gratis; d7 gratis si aún está en la ventana; d14 y d30 pagados.
  d2: {
    tipo: "lead", dias: 2, horas: [40, 66], etapaMin: 2, gratis: true,
    general: [
      cuerpo("Hola {{1}} ☺️ le cuento que cada carta del kit trae su significado impreso, así puede hacer su primera lectura desde el primer día ✨ ¿Le separo el suyo?"),
      botones("Sí, sepárelo", "Tengo una duda")
    ]
  },
  d7: {
    tipo: "lead", dias: 7, etapaMin: 2, por_destino: true, enFep: 132,
    lima: [
      cuerpo("Hola {{1}} ☺️ si agenda su kit esta semana le regalamos un collar amuleto extra, y lo paga recién cuando el motorizado se lo entrega 🫶 ¿Se lo agendo?"),
      botones("Sí, agéndelo", "Tengo una duda")
    ],
    provincia: [
      cuerpo("Hola {{1}} ☺️ si separa su kit esta semana le regalamos un collar amuleto extra 🫶 Con S/20 de adelanto se lo enviamos a su agencia y el resto lo paga al recoger. ¿Se lo separo?"),
      botones("Sí, sepárelo", "Me da desconfianza")
    ],
    general: [
      cuerpo("Hola {{1}} ☺️ si separa su kit esta semana le regalamos un collar amuleto extra, con envío gratis a todo el Perú 🫶 ¿Sería para Lima o para provincia?"),
      botones("Lima", "Provincia")
    ]
  },
  d14: {
    tipo: "lead", dias: 14, etapaMin: 2, requiere: "d7",
    general: [
      cuerpo("Hola {{1}} ☺️ por estos 2 días le dejamos su kit en S/79, o 2 kits en S/149 si quiere regalarle uno a alguien especial ✨ ¿Cuál le separo?"),
      botones("1 kit a S/79", "2 kits a S/149")
    ]
  },
  d30: {
    tipo: "lead", dias: 30, etapaMin: 2, requiere: "d14",
    general: [
      cuerpo("Hola {{1}} ☺️ no quiero incomodarle. Si aún le interesa, puede separar su kit con solo S/10 y lo recibe cuando usted quiera ✨ ¿Se lo dejo separado?"),
      botones("Sí, separarlo", "Cerrar consulta")
    ]
  },
  post7: {
    tipo: "cliente", dias: 7,
    general: [
      cuerpo("Hola {{1}} ☺️ ¿qué tal le va con su kit? Si gusta le mando una tirada sencilla de 3 cartas para practicar esta semana ✨"),
      botones("Sí, mándemela", "Todo bien, gracias")
    ]
  },
  post14: {
    tipo: "cliente", dias: 14, requiere: "post7",
    general: [
      cuerpo("Hola {{1}} ☺️ como ya es cliente le dejamos el mazo The Classic Tarot en S/49 en vez de S/69, para practicar con otro diseño ✨ ¿Se lo envío?"),
      botones("Sí, lo quiero", "Ahora no")
    ]
  },
  post30: {
    tipo: "cliente", dias: 30, requiere: "post14",
    general: [
      cuerpo("Hola {{1}} ☺️ si alguna amiga quiere aprender tarot y nos escribe de su parte, a las dos les regalamos un collar amuleto ✨ Solo reenvíele este mensaje 🫶"),
      botones("Genial, lo comparto", "Gracias")
    ]
  },
  post60: {
    tipo: "cliente", dias: 60, requiere: "post30",
    general: [
      cuerpo("Hola {{1}} ☺️ si ya domina sus cartas, el siguiente paso es el mazo Gold con bordes dorados, está en S/139 ✨ ¿Le mando fotos?"),
      botones("Sí, mándemelas", "Ahora no")
    ]
  }
};

const nombrePlantilla = (id, variante) => (variante === "general" ? `toque_${id}` : `toque_${id}_${variante}`);

// Pidió que no le escriban (incluye el botón "Cerrar consulta" del toque de 30 días).
const NO_ESCRIBIR = ["cerrar consulta", "no me interesa", "no estoy interesad", "no me escrib", "no me mand", "no me moleste", "no gracias", "ya no quiero"];
// Botones de "no" de los toques, solo si el mensaje es exactamente eso ("ahora no estoy en casa" no cuenta).
const SQL_NO_ESCRIBIR = NO_ESCRIBIR.map(() => "lower(i.body) LIKE ?").join(" OR ") + " OR lower(trim(i.body)) = 'ahora no'";

/** Chats a los que hoy les toca `id` (como mucho `limite`). */
export async function candidatos(db, id, def, limite) {
  const desde = def.tipo === "lead" ? "conv.last_inbound_at" : "compra.t";
  const [hDesde, hHasta] = def.horas || [def.dias * 24, (def.dias + 2) * 24];
  // Silencio dentro de la ventana del toque; un toque pagado con `enFep`
  // sale antes (desde esas horas de silencio) si el chat sigue en los 7 días gratis.
  let silencio = `(datetime(${desde}) >= datetime('now', ?) AND datetime(${desde}) < datetime('now', ?))`;
  const params = [`-${hHasta} hours`, `-${hDesde} hours`];
  if (def.enFep) {
    silencio = `(${silencio} OR (${EN_FEP} AND datetime(${desde}) < datetime('now', ?)))`;
    params.push(`-${def.enFep} hours`);
  }
  const filtros = [
    `${desde} IS NOT NULL`,
    silencio,
    "NOT EXISTS (SELECT 1 FROM toques t WHERE t.conversation_id = conv.id AND t.toque = ?)",
    `NOT EXISTS (SELECT 1 FROM messages o WHERE o.conversation_id = conv.id AND o.direction = 'out' AND o.created_at >= datetime('now', '-20 hours'))`,
    `NOT EXISTS (SELECT 1 FROM scheduled_messages s WHERE s.conversation_id = conv.id AND s.status IN ('pendiente', 'enviando'))`,
    `NOT EXISTS (SELECT 1 FROM messages i WHERE i.conversation_id = conv.id AND i.direction = 'in' AND (${SQL_NO_ESCRIBIR}))`
  ];
  params.push(id, ...NO_ESCRIBIR.map((t) => `%${t}%`));
  if (def.tipo === "lead") {
    filtros.push("conv.etapa >= ?", "conv.etapa < 5", "instr(' ' || COALESCE(conv.meta_tags, '') || ' ', ' purchase ') = 0");
    params.push(def.etapaMin);
    if (def.etapaMax) {
      filtros.push("conv.etapa <= ?");
      params.push(def.etapaMax);
    }
  }
  if (def.gratis) filtros.push(EN_FEP); // solo mientras Meta no cobra
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
  // El tope diario es para lo pagado; los toques gratis solo respetan el tope por pasada.
  const pagados = Object.keys(TOQUES).filter((t) => !TOQUES[t].gratis);
  const hoy = await db.prepare(
    `SELECT COUNT(*) AS n FROM toques WHERE estado = 'enviada' AND created_at >= datetime('now', '-24 hours') AND toque IN (${pagados.map(() => "?").join(",")})`
  ).bind(...pagados).first();
  let cupoPagado = Math.max((Number(env.TOQUES_MAX_DIA) || 40) - (hoy?.n || 0), 0);
  let cupo = POR_PASADA;

  for (const id of activos) {
    if (cupo <= 0) break;
    const def = TOQUES[id];
    if (!def.gratis && cupoPagado <= 0) continue;
    const lista = await candidatos(db, id, def, Math.min(cupo, def.gratis ? cupo : cupoPagado) + 2);
    if (!lista.length) continue;
    const destinos = def.por_destino ? await destinosDeChats(db, lista.map((c) => c.id)).catch(() => ({})) : {};
    const aprobadas = {};
    const plantillaDe = async (variante) => {
      if (!(variante in aprobadas)) {
        const nombre = nombrePlantilla(id, variante);
        aprobadas[variante] = await plantillaAprobada(env, nombre, { categoria: "MARKETING", idioma: IDIOMA, componentes: def[variante] })
          .then((a) => a && { ...a, nombre })
          .catch((err) => (console.error(`Plantilla ${nombre}:`, err.message), null));
      }
      return aprobadas[variante];
    };

    for (const c of lista) {
      if (cupo <= 0 || (!def.gratis && cupoPagado <= 0)) break;
      if (c.id % 5 === 0) {
        // Grupo de control: no se le manda, solo se anota (el día en que le habría tocado).
        await db.prepare("INSERT OR IGNORE INTO toques (conversation_id, toque, estado) VALUES (?, ?, 'control')").bind(c.id, id).run();
        continue;
      }
      const variante = def.por_destino && def[destinos[c.id]] ? destinos[c.id] : "general";
      const aprobada = await plantillaDe(variante);
      if (!aprobada) continue; // en revisión: se reintenta en la próxima pasada
      const nombre = aprobada.nombre;
      const r = await db.prepare("INSERT OR IGNORE INTO toques (conversation_id, toque, estado) VALUES (?, ?, 'enviando')").bind(c.id, id).run();
      if (!r.meta?.changes) continue;
      cupo--;
      if (!def.gratis) cupoPagado--;
      try {
        const params = aprobada.conNombre ? [primerNombre(c.nombre)] : [];
        const waMessageId = await mandarConEscribiendo(env, c.id, () => enviarTemplate(env, c.wa_id, nombre, aprobada.idioma, params));
        const texto = def[variante][0].text.replace("{{1}}", params[0] || "");
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

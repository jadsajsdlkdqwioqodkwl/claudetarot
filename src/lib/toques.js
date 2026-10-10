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
 *    Las plantillas NO se crean solas en Meta: el admin las revisa y las
 *    manda desde el CRM (plantillas-propuestas.js). Mientras no esté
 *    aprobada, ese toque espera.
 *  - Cada marca tiene sus toques y sus textos: los de Tarot Store solo salen
 *    por el número principal; los de URO (ids u_…) solo por la línea URO.
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
import { listarLineas, envDeLinea } from "./lineas.js";
import { marcaDeLinea } from "./planes-plantilla.js";
import { enSilencio } from "./horario.js";
import { destinosDeChats } from "./crm-destino.js";

export const ORIGEN_TOQUE = "Toque automático";
const POR_PASADA = 4; // ~9 consultas a D1 por envío: entra en el tope de 50 por ejecución
export const IDIOMA = "es_PE";

const botones = (a, b) => ({ type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: a }, { type: "QUICK_REPLY", text: b }] });
const cuerpo = (text) => ({ type: "BODY", text, example: { body_text: [["María"]] } });

/**
 * La escalera de ofertas (docs/plan-seguimientos.md, aprobada por el dueño el
 * 02/10): cada toque sube un escalón y REEMPLAZA la oferta anterior, no se
 * suman. Día 2 sin oferta (solo valor), día 7 regalo (collar extra), día 14
 * precio (S/79) o 2 kits para regalar, día 30 compromiso mínimo (separar con
 * S/10). A clientes: valor, mazo a precio de clienta, referidos y el Gold.
 *
 * dias: cuándo sale. etapaMin: etapa del embudo mínima (2 conversó, 3 dijo
 * destino). requiere: el toque anterior de la cadena. Con `por_destino` hay
 * una plantilla por destino del chat (lima / provincia / general si no se
 * sabe), así cada uno lee lo que le aplica. Textos con la skill voz-tarot-store.
 */
export const TOQUES = {
  d2: {
    tipo: "lead", dias: 2, etapaMin: 2, soloRecientes: true,
    general: [
      cuerpo("Hola {{1}} ☺️ le cuento que cada carta del kit trae su significado impreso, así puede hacer su primera lectura desde el primer día ✨ ¿Le separo el suyo?"),
      botones("Sí, sepárelo", "Tengo una duda")
    ]
  },
  d7: {
    tipo: "lead", dias: 7, etapaMin: 2, por_destino: true,
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

/**
 * Toques de URO (ids u_…): sin collar ni descuentos, solo lo que dice
 * docs/uro/negocio.md (S/89 · S/139 · S/179, envío gratis). Sin síntomas en
 * el texto: es un tema íntimo y Meta revisa más los productos de salud.
 */
Object.assign(TOQUES, {
  u_d2: {
    marca: "uro", tipo: "lead", dias: 2, etapaMin: 2, soloRecientes: true,
    general: [
      cuerpo("Hola {{1}} 🌸 ¿pudo ver la información de URO? Cada frasco trae 60 cápsulas y alcanza para 1 mes. ¿Le separo el suyo?"),
      botones("Sí, sepárelo", "Tengo una duda")
    ]
  },
  u_d7: {
    marca: "uro", tipo: "lead", dias: 7, etapaMin: 2,
    general: [
      cuerpo("Hola {{1}} 🌸 le cuento que con 2 frascos de URO le sale S/139 y con 3 frascos S/179 (el tratamiento recomendado), con envío gratis a todo el Perú. ¿Cuál le separo?"),
      botones("2 frascos S/139", "3 frascos S/179")
    ]
  },
  u_d14: {
    marca: "uro", tipo: "lead", dias: 14, etapaMin: 2, requiere: "u_d7",
    general: [
      cuerpo("Hola {{1}} 🌸 solo quería saber si le quedó alguna duda sobre URO. Si prefiere, se la resolvemos por aquí sin compromiso."),
      botones("Tengo una duda", "Ahora no")
    ]
  },
  u_d30: {
    marca: "uro", tipo: "lead", dias: 30, etapaMin: 2, requiere: "u_d14",
    general: [
      cuerpo("Hola {{1}}, no quiero incomodarle 🌸 Si más adelante le interesa URO, solo responda este mensaje y lo vemos. ¿Le dejo su consulta abierta?"),
      botones("Sí, déjela abierta", "Cerrar consulta")
    ]
  },
  u_post7: {
    marca: "uro", tipo: "cliente", dias: 7,
    general: [
      cuerpo("Hola {{1}} 🌸 ¿cómo va con su pedido de URO? Si tiene alguna duda, escríbanos y le ayudamos por aquí."),
      botones("Todo bien, gracias", "Tengo una duda")
    ]
  },
  u_post25: {
    marca: "uro", tipo: "cliente", dias: 25, requiere: "u_post7",
    general: [
      cuerpo("Hola {{1}} 🌸 su primer frasco de URO está por terminar. Para completar los 3 meses recomendados, ¿le separamos el siguiente? Con 2 frascos le sale S/139."),
      botones("Sí, sepárelo", "Ahora no")
    ]
  }
});

export const marcaDeToque = (def) => def.marca || "tarot";

const nombrePlantilla = (id, variante) => (variante === "general" ? `toque_${id}` : `toque_${id}_${variante}`);

// Pidió que no le escriban (incluye el botón "Cerrar consulta" del toque de 30 días).
const NO_ESCRIBIR = ["cerrar consulta", "no me interesa", "no estoy interesad", "no me escrib", "no me mand", "no me moleste", "no gracias", "ya no quiero"];
const SQL_NO_ESCRIBIR = NO_ESCRIBIR.map(() => "lower(i.body) LIKE ?").join(" OR ");

/** Chats a los que hoy les toca `id` (como mucho `limite`). */
async function candidatos(db, id, def, limite, lineaId = null) {
  const desde = def.tipo === "lead" ? "conv.last_inbound_at" : "compra.t";
  const ventana = def.tipo === "lead" && def.dias === 2
    ? ["-66 hours", "-40 hours"] // día 2: entre 40 y 66 h de silencio
    : [`-${def.dias + 2} days`, `-${def.dias} days`];
  const filtros = [
    // Cada marca solo toca sus chats: Tarot Store = línea principal; URO = su línea.
    lineaId ? "conv.linea_id = ?" : "conv.linea_id IS NULL",
    `${desde} IS NOT NULL`,
    `datetime(${desde}) >= datetime('now', ?)`,
    `datetime(${desde}) < datetime('now', ?)`,
    "NOT EXISTS (SELECT 1 FROM toques t WHERE t.conversation_id = conv.id AND t.toque = ?)",
    `NOT EXISTS (SELECT 1 FROM messages o WHERE o.conversation_id = conv.id AND o.direction = 'out' AND o.created_at >= datetime('now', '-20 hours'))`,
    `NOT EXISTS (SELECT 1 FROM scheduled_messages s WHERE s.conversation_id = conv.id AND s.status IN ('pendiente', 'enviando', 'por_aprobar'))`,
    `NOT EXISTS (SELECT 1 FROM messages i WHERE i.conversation_id = conv.id AND i.direction = 'in' AND (${SQL_NO_ESCRIBIR}))`
  ];
  const params = [...(lineaId ? [lineaId] : []), ...ventana, id, ...NO_ESCRIBIR.map((t) => `%${t}%`)];
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

  // Cada marca con su número: { env, lineaId } (null si esa marca no tiene línea con WABA).
  const contextos = {};
  const contextoDe = async (marca) => {
    if (!(marca in contextos)) {
      const linea = marca === "tarot" ? null : (await listarLineas(db)).find((l) => l.activa !== 0 && marcaDeLinea(l) === marca);
      contextos[marca] = marca === "tarot" ? { env, lineaId: null } : linea?.waba_id ? { env: envDeLinea(env, linea), lineaId: linea.id } : null;
    }
    return contextos[marca];
  };

  for (const id of activos) {
    if (cupo <= 0) break;
    const def = TOQUES[id];
    const ctx = await contextoDe(marcaDeToque(def));
    if (!ctx) continue;
    const envM = ctx.env;
    const lista = await candidatos(db, id, def, cupo + 2, ctx.lineaId);
    if (!lista.length) continue;
    const destinos = def.por_destino ? await destinosDeChats(db, lista.map((c) => c.id)).catch(() => ({})) : {};
    const aprobadas = {};
    const plantillaDe = async (variante) => {
      if (!(variante in aprobadas)) {
        const nombre = nombrePlantilla(id, variante);
        aprobadas[variante] = await plantillaAprobada(envM, nombre)
          .then((a) => a && { ...a, nombre })
          .catch((err) => (console.error(`Plantilla ${nombre}:`, err.message), null));
      }
      return aprobadas[variante];
    };

    for (const c of lista) {
      if (cupo <= 0) break;
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
      try {
        const params = aprobada.conNombre ? [primerNombre(c.nombre)] : [];
        const waMessageId = await mandarConEscribiendo(envM, c.id, (e) => enviarTemplate(e, c.wa_id, nombre, aprobada.idioma, params));
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

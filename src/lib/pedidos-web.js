/**
 * Pedidos que llegan por el formulario de la página (/api/order).
 *
 * 1. Quedan en D1 (`pedidos_web`, migración 0042), terminen o no en venta,
 *    para el reporte diario (GET /api/asesor/pedidos-web → sección
 *    "🌐 Pedidos de la web" del PDF que arma scripts/asesor/enviar.py).
 * 2. A los 3 minutos, si el cliente no nos escribió primero, le sale la
 *    plantilla PLANTILLA_PEDIDO_WEB ("recibimos su pedido" + 2 botones) con
 *    su "escribiendo…" antes (mandarConEscribiendo). Lo hace el cron de cada
 *    minuto (procesarPedidosWeb). Si la plantilla no existe en Meta, la crea;
 *    mientras no esté aprobada, los pedidos esperan.
 *
 * Estados de plantilla_estado: pendiente → enviada | omitida (ya escribió) |
 * fallida | vencida (pasaron 12 h sin poder mandarla).
 */

import { enviarTemplate, listarTemplates, crearTemplate } from "./whatsapp.js";
import { mandarConEscribiendo } from "./crm-send.js";
import { obtenerOCrearContacto, obtenerOCrearConversacion, registrarMensajeSaliente, obtenerAjuste, guardarAjuste } from "./crm-db.js";
import { enSilencio } from "./horario.js";

export const ORIGEN_PEDIDO_WEB = "Pedido web (automático)";
export const MINUTOS_ESPERA_PEDIDO_WEB = 3;
const POR_PASADA = 5;

/** Texto de la plantilla. Si se cambia aquí, hay que borrarla en WhatsApp Manager para que se cree de nuevo. */
export const PLANTILLA_PEDIDO_WEB = {
  categoria: "UTILITY",
  idioma: "es",
  componentes: [
    { type: "BODY", text: "Hola ☺️ recibimos su pedido desde nuestra web. ¿Le confirmamos el envío por aquí? ✨" },
    {
      type: "BUTTONS",
      buttons: [
        { type: "QUICK_REPLY", text: "Sí, confirmo" },
        { type: "QUICK_REPLY", text: "Tengo una consulta" }
      ]
    }
  ]
};

export async function registrarPedidoWeb(env, order, fila) {
  if (!env.CRM_DB) return;
  try {
    await env.CRM_DB
      .prepare(
        `INSERT INTO pedidos_web (fila, nombre, wa_id, envio, destino, etiqueta, total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(fila || null, order.nombre, order.telefono, order.envio, order.destino, order.etiqueta, order.total)
      .run();
  } catch (err) {
    console.error("Pedido web (D1):", err.message);
  }
}

/** El order bump que se sumó después (/api/upsell), por el número de fila de Sheets. */
export async function anotarBumpPedidoWeb(env, fila, bump, total) {
  if (!env.CRM_DB || !fila) return;
  await env.CRM_DB
    .prepare("UPDATE pedidos_web SET bump = ?, total = ? WHERE id = (SELECT MAX(id) FROM pedidos_web WHERE fila = ?)")
    .bind(bump, total, fila)
    .run()
    .catch((err) => console.error("Pedido web (bump):", err.message));
}

/**
 * ¿La plantilla está aprobada? Si no existe, la manda a revisión. El estado
 * se guarda 10 min en ajustes para no consultar a Meta en cada pasada.
 */
async function plantillaLista(env, nombre) {
  const db = env.CRM_DB;
  const clave = `plantilla_estado:${nombre}`;
  const guardado = await obtenerAjuste(db, clave).catch(() => null);
  if (guardado) {
    const [estado, at] = String(guardado).split("|");
    if (estado === "APPROVED") return true;
    if (Date.now() - Number(at) < 10 * 60 * 1000) return false;
  }
  const existente = (await listarTemplates(env)).find((t) => t.name === nombre && t.language === PLANTILLA_PEDIDO_WEB.idioma);
  let estado = existente?.status;
  if (!existente) {
    const r = await crearTemplate(env, { nombre, ...PLANTILLA_PEDIDO_WEB });
    estado = r?.status || "PENDING";
  }
  await guardarAjuste(db, clave, `${estado}|${Date.now()}`);
  return estado === "APPROVED";
}

/** Cron de cada minuto: manda la plantilla a los pedidos web de hace 3+ min que no nos escribieron. */
export async function procesarPedidosWeb(env) {
  const db = env.CRM_DB;
  const nombre = env.PLANTILLA_PEDIDO_WEB;
  if (!db || !nombre || !env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return;

  await db
    .prepare("UPDATE pedidos_web SET plantilla_estado = 'vencida' WHERE plantilla_estado = 'pendiente' AND created_at < datetime('now', '-12 hours')")
    .run();
  const { results } = await db
    .prepare(
      `SELECT p.id, p.wa_id, p.nombre, p.created_at,
              (SELECT conv.last_inbound_at FROM contacts c JOIN conversations conv ON conv.contact_id = c.id
               WHERE c.wa_id = p.wa_id ORDER BY conv.last_message_at DESC LIMIT 1) AS last_inbound_at
       FROM pedidos_web p
       WHERE p.plantilla_estado = 'pendiente' AND p.created_at <= datetime('now', ?)
       ORDER BY p.created_at ASC LIMIT ?`
    )
    .bind(`-${MINUTOS_ESPERA_PEDIDO_WEB} minutes`, POR_PASADA)
    .all();
  if (!results.length) return;

  // Si nos escribió (desde 30 min antes del pedido: el botón de WhatsApp de /gracias), no se le manda nada.
  const yaEscribio = (p) => p.last_inbound_at && p.last_inbound_at >= sqlMenos(p.created_at, 30);
  const omitir = results.filter(yaEscribio);
  if (omitir.length) {
    await db.batch(omitir.map((p) => db.prepare("UPDATE pedidos_web SET plantilla_estado = 'omitida' WHERE id = ?").bind(p.id)));
  }
  const mandar = results.filter((p) => !yaEscribio(p));
  if (!mandar.length || enSilencio(Date.now(), env.HORARIO_ENVIO)) return;
  if (!(await plantillaLista(env, nombre).catch((err) => (console.error("Plantilla pedido web:", err.message), false)))) return;

  for (const p of mandar) {
    // Reserva (pendiente → enviando) para que dos pasadas no manden dos veces.
    const reservado = await db
      .prepare("UPDATE pedidos_web SET plantilla_estado = 'enviando' WHERE id = ? AND plantilla_estado = 'pendiente'")
      .bind(p.id)
      .run();
    if (!reservado.meta?.changes) continue;
    try {
      const contacto = await obtenerOCrearContacto(db, p.wa_id, null, null);
      if (!contacto.name && p.nombre) await db.prepare("UPDATE contacts SET name = ? WHERE id = ?").bind(p.nombre, contacto.id).run();
      const conv = await obtenerOCrearConversacion(db, contacto.id);
      const waMessageId = await mandarConEscribiendo(env, conv.id, () => enviarTemplate(env, p.wa_id, nombre, PLANTILLA_PEDIDO_WEB.idioma, []));
      await registrarMensajeSaliente(db, conv.id, {
        waMessageId,
        type: "template",
        body: `Plantilla: ${nombre} · ${PLANTILLA_PEDIDO_WEB.componentes[0].text}`,
        sentBy: ORIGEN_PEDIDO_WEB
      }, { subirEnBandeja: false });
      await db.prepare("UPDATE pedidos_web SET plantilla_estado = 'enviada', plantilla_at = datetime('now') WHERE id = ?").bind(p.id).run();
    } catch (err) {
      console.error("Pedido web (plantilla):", err.message);
      await db
        .prepare("UPDATE pedidos_web SET plantilla_estado = 'fallida', plantilla_error = ? WHERE id = ?")
        .bind(String(err.message).slice(0, 300), p.id)
        .run()
        .catch(() => {});
    }
  }
}

/** "YYYY-MM-DD HH:MM:SS" (UTC de D1) menos `min` minutos, en el mismo formato. */
function sqlMenos(sqlFecha, min) {
  const t = new Date(String(sqlFecha).replace(" ", "T") + "Z").getTime() - min * 60000;
  return new Date(t).toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Punto de entrada del Worker.
 *
 * Cloudflare sirve primero los archivos de `public/`; solo cuando la ruta no
 * corresponde a un archivo llega aquí. Por eso el router se ocupa únicamente
 * de la API y delega todo lo demás al binding ASSETS.
 *
 * Este archivo es lo que convierte el proyecto en un Worker "de verdad".
 * Sin él Cloudflare lo trata como sitio estático y no deja definir variables.
 */

import { onRequestPost as order } from "./api/order.js";
import { onRequestPost as upsell } from "./api/upsell.js";
import { onRequestGet as diag } from "./api/diag.js";
import { onRequestPost as setup } from "./api/setup.js";
import { onRequestGet as seguimiento } from "./api/seguimiento.js";
import { onRequestGet as voucher } from "./api/voucher.js";
import { onRequestGet as waWebhookGet, onRequestPost as waWebhookPost } from "./api/whatsapp-webhook.js";
import { onRequestPost as crmLogin } from "./api/crm/login.js";
import { onRequestPost as crmLogout } from "./api/crm/logout.js";
import { onRequestGet as crmSession } from "./api/crm/session.js";
import { onRequestGet as crmConversations } from "./api/crm/conversations.js";
import { onRequestGet as crmMessagesGet, onRequestPost as crmMessagesPost } from "./api/crm/messages.js";
import { onRequestPost as crmContactsPost, onRequestPatch as crmContactsPatch } from "./api/crm/contacts.js";
import { onRequestGet as crmLoginInfo } from "./api/crm/login-info.js";
import { onRequestPost as crmUploadMedia } from "./api/crm/upload-media.js";
import { onRequestGet as crmMedia } from "./api/crm/media.js";
import { onRequestPatch as crmAssignPatch } from "./api/crm/assign.js";
import { onRequestPost as crmChatEstadoPost } from "./api/crm/chat-estado.js";
import { onRequestGet as crmPlanesGet, onRequestPost as crmPlanesPost, onRequestPatch as crmPlanesPatch } from "./api/crm/planes.js";
import {
  onRequestGet as crmProductosGet,
  onRequestPost as crmProductosPost,
  onRequestPatch as crmProductosPatch,
  onRequestDelete as crmProductosDelete,
  onRequestPostLinea as crmLineasPost,
  onRequestPatchLinea as crmLineasPatch,
  onRequestGetLinea as crmLineasGet
} from "./api/crm/productos.js";
import {
  onRequestGet as crmQuickRepliesGet,
  onRequestPost as crmQuickRepliesPost,
  onRequestPatch as crmQuickRepliesPatch,
  onRequestDelete as crmQuickRepliesDelete
} from "./api/crm/quick-replies.js";
import { onRequestPost as crmLoginVerify } from "./api/crm/login-verify.js";
import {
  onRequestGet as crmAgentsGet,
  onRequestPost as crmAgentsPost,
  onRequestPatch as crmAgentsPatch
} from "./api/crm/agents.js";
import {
  onRequestGet as crmScheduledGet,
  onRequestPost as crmScheduledPost,
  onRequestPatch as crmScheduledPatch,
  onRequestDelete as crmScheduledDelete
} from "./api/crm/scheduled.js";
import { procesarSeguimientosVencidos } from "./lib/crm-cron.js";
import { procesarPedidosWeb } from "./lib/pedidos-web.js";
import { agendarCarritosAbandonados } from "./lib/crm-carrito.js";
import { exportarChatsASheets } from "./lib/crm-sheets-export.js";
import { onRequestGet as crmTemplatesGet, onRequestPost as crmTemplatesPost } from "./api/crm/templates.js";
import { onRequestGet as crmCatalogGet, onRequestPost as crmCatalogPost, onRequestGetProductos as crmCatalogProductosGet } from "./api/crm/catalog.js";
import { onRequestGet as crmSettingsGet, onRequestPatch as crmSettingsPatch } from "./api/crm/settings.js";
import { onRequestPost as crmTestWelcomePost } from "./api/crm/test-welcome.js";
import { onRequestPost as crmWelcomeSendPost } from "./api/crm/welcome-send.js";
import {
  onRequestGet as crmWelcomeSeqGet,
  onRequestPost as crmWelcomeSeqPost,
  onRequestDelete as crmWelcomeSeqDelete,
  onRequestPatch as crmWelcomeSeqPatch
} from "./api/crm/welcome-sequence.js";
import {
  onRequestGet as crmFollowupSeqGet,
  onRequestPost as crmFollowupSeqPost,
  onRequestDelete as crmFollowupSeqDelete,
  onRequestPatch as crmFollowupSeqPatch
} from "./api/crm/followup-sequences.js";
import { onRequestPost as crmFollowupApplyPost } from "./api/crm/followup-apply.js";
import {
  onRequestGet as crmTotpGet,
  onRequestPost as crmTotpPost,
  onRequestPatch as crmTotpPatch,
  onRequestDelete as crmTotpDelete
} from "./api/crm/totp-setup.js";
import { onRequestGet as crmBulkSendGet, onRequestPost as crmBulkSendPost } from "./api/crm/bulk-send.js";
import { onRequestGet as crmCapiSendGet, onRequestPost as crmCapiSendPost } from "./api/crm/capi-send.js";
import { onRequestPost as crmReactPost } from "./api/crm/react.js";
import {
  onRequestGet as crmStickersGet,
  onRequestPost as crmStickersPost,
  onRequestDelete as crmStickersDelete
} from "./api/crm/stickers.js";
import {
  onRequestGet as crmPushSubscribeGet,
  onRequestPost as crmPushSubscribePost,
  onRequestDelete as crmPushSubscribeDelete
} from "./api/crm/push-subscribe.js";
import { onRequestGet as crmNotifySettingsGet, onRequestPost as crmNotifySettingsPost } from "./api/crm/notify-settings.js";
import { onRequestPost as crmExportResetPost } from "./api/crm/export-reset.js";
import { onRequestPost as crmChangePasswordPost } from "./api/crm/change-password.js";
import { onRequestPost as crmForgotPasswordPost } from "./api/crm/forgot-password.js";
import { onRequestPost as crmResetPasswordPost } from "./api/crm/reset-password.js";
import { onRequestPost as asesorAvisosPost, onRequestPostSugerencias as asesorSugerenciasPost, onRequestGetContexto as asesorContextoGet } from "./api/asesor.js";
import { onRequestPost as asesorVentasPost } from "./api/asesor-ventas.js";
import { onRequestGetChats as asesorChatsGet, onRequestPostMemoria as asesorMemoriaPost, onRequestGetAnuncios as asesorAnunciosGet, onRequestGetPedidosWeb as asesorPedidosWebGet } from "./api/asesor-datos.js";
import { onRequestPostReporte as asesorReportePost, onRequestGetReportes as crmReportesGet, onRequestGetReportesAsesor as asesorReportesGet, reportePdf } from "./api/reportes.js";
import { onRequestGet as crmSugerenciasGet, onRequestPost as crmSugerenciasPost } from "./api/crm/sugerencias.js";
import { onRequestGet as crmShalomGet, onRequestPost as crmShalomPost } from "./api/crm/shalom.js";
import {
  onRequestGet as crmVariantesGet,
  onRequestPost as crmVariantesPost,
  onRequestPatch as crmVariantesPatch,
  onRequestDelete as crmVariantesDelete
} from "./api/crm/variantes.js";
import { onRequestGet as crmPropuestasGet, onRequestPost as crmPropuestasPost } from "./api/crm/plantillas-propuestas.js";
import { actualizarEtapas } from "./lib/crm-embudo.js";
import { onRequestPostAnalisis as asesorAnalisisPost, onRequestGetResumen as asesorResumenGet, enviarResumenSiToca } from "./api/asesor-resumen.js";
import { procesarFrases } from "./lib/crm-frases.js";
import { procesarToques } from "./lib/toques.js";
import { cancelarLinksAutomaticos } from "./lib/crm-links-envio.js";

const ROUTES = {
  "/api/order": { POST: order },
  "/api/upsell": { POST: upsell },
  "/api/diag": { GET: diag },
  "/api/setup": { POST: setup },
  "/api/seguimiento": { GET: seguimiento },

  "/api/whatsapp/webhook": { GET: waWebhookGet, POST: waWebhookPost },
  // El mismo webhook en otra URL, para la cuenta de WhatsApp de otra marca
  // (override_callback_uri): un destino nuevo no hereda la cola que Meta
  // frena tras rechazos viejos.
  "/api/whatsapp/webhook-uro": { GET: waWebhookGet, POST: waWebhookPost },
  "/api/asesor/avisos": { POST: asesorAvisosPost },
  "/api/asesor/sugerencias": { POST: asesorSugerenciasPost },
  "/api/asesor/contexto": { GET: asesorContextoGet },
  "/api/asesor/chats": { GET: asesorChatsGet },
  "/api/asesor/pedidos-web": { GET: asesorPedidosWebGet },
  "/api/asesor/memoria": { POST: asesorMemoriaPost },
  "/api/asesor/anuncios": { GET: asesorAnunciosGet },
  "/api/asesor/analisis": { POST: asesorAnalisisPost },
  "/api/asesor/resumen": { GET: asesorResumenGet },
  "/api/asesor/reporte": { POST: asesorReportePost },
  "/api/asesor/reportes": { GET: asesorReportesGet },
  "/api/crm/reportes": { GET: crmReportesGet },
  "/api/asesor/ventas": { POST: asesorVentasPost },
  "/api/crm/sugerencias": { GET: crmSugerenciasGet, POST: crmSugerenciasPost },
  "/api/crm/shalom": { GET: crmShalomGet, POST: crmShalomPost },
  "/api/crm/variantes": { GET: crmVariantesGet, POST: crmVariantesPost, PATCH: crmVariantesPatch, DELETE: crmVariantesDelete },

  "/api/crm/login": { POST: crmLogin },
  "/api/crm/login-info": { GET: crmLoginInfo },
  "/api/crm/logout": { POST: crmLogout },
  "/api/crm/session": { GET: crmSession },
  "/api/crm/conversations": { GET: crmConversations },
  "/api/crm/messages": { GET: crmMessagesGet, POST: crmMessagesPost },
  "/api/crm/contacts": { POST: crmContactsPost, PATCH: crmContactsPatch },
  "/api/crm/upload-media": { POST: crmUploadMedia },
  "/api/crm/media": { GET: crmMedia },
  "/api/crm/assign": { PATCH: crmAssignPatch },
  "/api/crm/chat-estado": { POST: crmChatEstadoPost },
  "/api/crm/plantillas-propuestas": { GET: crmPropuestasGet, POST: crmPropuestasPost },
  "/api/crm/planes": { GET: crmPlanesGet, POST: crmPlanesPost, PATCH: crmPlanesPatch },
  "/api/crm/productos": { GET: crmProductosGet, POST: crmProductosPost, PATCH: crmProductosPatch, DELETE: crmProductosDelete },
  "/api/crm/lineas": { GET: crmLineasGet, POST: crmLineasPost, PATCH: crmLineasPatch },
  "/api/crm/quick-replies": { GET: crmQuickRepliesGet, POST: crmQuickRepliesPost, PATCH: crmQuickRepliesPatch, DELETE: crmQuickRepliesDelete },
  "/api/crm/login-verify": { POST: crmLoginVerify },
  "/api/crm/agents": { GET: crmAgentsGet, POST: crmAgentsPost, PATCH: crmAgentsPatch },
  "/api/crm/scheduled": { GET: crmScheduledGet, POST: crmScheduledPost, PATCH: crmScheduledPatch, DELETE: crmScheduledDelete },
  "/api/crm/followup-sequences": { GET: crmFollowupSeqGet, POST: crmFollowupSeqPost, DELETE: crmFollowupSeqDelete, PATCH: crmFollowupSeqPatch },
  "/api/crm/followup-apply": { POST: crmFollowupApplyPost },
  "/api/crm/templates": { GET: crmTemplatesGet, POST: crmTemplatesPost },
  "/api/crm/catalog": { GET: crmCatalogGet, POST: crmCatalogPost },
  "/api/crm/catalog-products": { GET: crmCatalogProductosGet },
  "/api/crm/settings": { GET: crmSettingsGet, PATCH: crmSettingsPatch },
  "/api/crm/test-welcome": { POST: crmTestWelcomePost },
  "/api/crm/welcome-send": { POST: crmWelcomeSendPost },
  "/api/crm/welcome-sequence": { GET: crmWelcomeSeqGet, POST: crmWelcomeSeqPost, DELETE: crmWelcomeSeqDelete, PATCH: crmWelcomeSeqPatch },
  "/api/crm/totp-setup": { GET: crmTotpGet, POST: crmTotpPost, PATCH: crmTotpPatch, DELETE: crmTotpDelete },
  "/api/crm/bulk-send": { GET: crmBulkSendGet, POST: crmBulkSendPost },
  "/api/crm/capi-send": { GET: crmCapiSendGet, POST: crmCapiSendPost },
  "/api/crm/react": { POST: crmReactPost },
  "/api/crm/stickers": { GET: crmStickersGet, POST: crmStickersPost, DELETE: crmStickersDelete },
  "/api/crm/push-subscribe": { GET: crmPushSubscribeGet, POST: crmPushSubscribePost, DELETE: crmPushSubscribeDelete },
  "/api/crm/notify-settings": { GET: crmNotifySettingsGet, POST: crmNotifySettingsPost },
  "/api/crm/export-reset": { POST: crmExportResetPost },
  "/api/crm/change-password": { POST: crmChangePasswordPost },
  "/api/crm/forgot-password": { POST: crmForgotPasswordPost },
  "/api/crm/reset-password": { POST: crmResetPasswordPost }
};

/**
 * La página de seguimiento cuelga de la raíz: /TS-K3M582R, no /seguimiento/…
 * Es un link que se manda por WhatsApp y cuanto más corto, mejor. Nada más en
 * el sitio empieza por "TS-", así que no puede chocar con un archivo de public/.
 *
 * A propósito es más flojo que RE_CODIGO (lib/ventas.js), la forma real del
 * código: quien escriba mal una letra al copiar el link merece la página
 * diciéndole que ese envío no existe, no el 404 pelado de Cloudflare. Quien
 * valida de verdad es /api/seguimiento, y de ahí sale el mensaje.
 */
const RE_RUTA_SEGUIMIENTO = /^\/TS-[A-Za-z0-9-]{3,24}$/i;

const json = (data, status) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

/**
 * Sirve public/seguimiento.html bajo la URL con el código. La página lee el
 * código de su propia URL y le pide los datos a /api/seguimiento.
 *
 * Se sirve el mismo archivo para todos los códigos a propósito: así el HTML se
 * cachea una vez y solo viaja el JSON, que es lo que cambia. La cabecera
 * noindex va acá y no en _headers porque _headers casa rutas de archivos, y
 * esta ruta no existe como archivo.
 */
async function paginaDeSeguimiento(request, env) {
  const url = new URL("/seguimiento.html", request.url);
  const res = await env.ASSETS.fetch(new Request(url, { method: "GET" }));
  const headers = new Headers(res.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  return new Response(res.body, { status: res.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    // /v/TS-… es la foto del voucher: lleva el código en la ruta, así que no
    // puede resolverse por la tabla de arriba.
    if (pathname.startsWith("/v/")) {
      return request.method === "GET"
        ? voucher({ request, env, waitUntil: ctx.waitUntil.bind(ctx) })
        : json({ error: "Método no permitido." }, 405);
    }

    // /r/<id>.pdf: los reportes de ventas del asesor (link imposible de adivinar).
    if (pathname.startsWith("/r/")) {
      return request.method === "GET" ? reportePdf({ request, env }) : json({ error: "Método no permitido." }, 405);
    }

    if (RE_RUTA_SEGUIMIENTO.test(pathname)) {
      return paginaDeSeguimiento(request, env);
    }

    const metodos = ROUTES[pathname];
    if (!metodos) return env.ASSETS.fetch(request);

    const handler = metodos[request.method];
    if (!handler) {
      return json({ error: "Método no permitido." }, 405);
    }

    // Mismo contexto que recibían las Pages Functions, así los handlers
    // siguen siendo idénticos a como estaban en `functions/api/`.
    return handler({ request, env, waitUntil: ctx.waitUntil.bind(ctx) });
  },

  // Tres crons (ver wrangler.jsonc → triggers.crons), distinguidos por
  // event.cron: cada 5 min manda los seguimientos vencidos; cada 10 vuelca
  // los chats nuevos a Sheets; cada 15 hace lo
  // analítico (embudo, frases, resumen semanal).
  async scheduled(event, env, ctx) {
    if (event.cron === "*/10 * * * *") {
      ctx.waitUntil(exportarChatsASheets(env));
      return;
    }
    // Lo analítico y lo que lee la hoja Ventas va en su propia ejecución, con
    // su propio tope de 50 consultas a D1 (plan gratis): así nunca le quita
    // cupo al envío de seguimientos. Cada paso sigue aunque el anterior falle.
    if (event.cron === "*/15 * * * *") {
      // El link de seguimiento ya no sale solo (se manda a mano desde el chat):
      // por si quedó alguno programado de la versión automática.
      await cancelarLinksAutomaticos(env.CRM_DB).catch((err) => console.error("Links de envío:", err.message));
      // El resumen (una vez al día) gasta muchas consultas: esa pasada no
      // hace más; embudo y frases siguen en la de 15 min después.
      const hizoResumen = await enviarResumenSiToca(env).catch((err) => {
        console.error("Resumen semanal:", err.message);
        return false; // si falla, que no bloquee el embudo ni las frases
      });
      if (hizoResumen) return;
      await actualizarEtapas(env).catch((err) => console.error("Embudo:", err.message));
      await procesarFrases(env).catch((err) => console.error("Frases:", err.message));
      return;
    }
    // "* * * * *": cada minuto, el WhatsApp de "recibimos su pedido" a los
    // pedidos web de hace 3 min. Lo de antes del cron de 5 min (seguimientos,
    // carrito) sigue corriendo solo en los minutos múltiplos de 5.
    await procesarPedidosWeb(env).catch((err) => console.error("Pedidos web:", err.message));
    // Los toques (días 2/7/14/30 con plantilla) van en su propia pasada (minuto % 5 = 2) por el
    // tope de consultas a D1; si falta la migración 0043 solo se registra el error.
    if (new Date(event.scheduledTime).getUTCMinutes() % 5 === 2) {
      await procesarToques(env).catch((err) => console.error("Toques:", err.message));
      return;
    }
    if (new Date(event.scheduledTime).getUTCMinutes() % 5 !== 0) return;
    // Esperado directo (no waitUntil, que corta a los 30 s): con la pausa de
    // "escribiendo…" de 1 s por mensaje, un lote grande de seguimientos
    // vencidos a la vez puede tardar más que eso. El carrito abandonado solo
    // agenda filas; salen en esta misma pasada con los demás seguimientos.
    await agendarCarritosAbandonados(env).catch((err) => console.error("Carrito abandonado:", err.message));
    await procesarSeguimientosVencidos(env);
  }
};

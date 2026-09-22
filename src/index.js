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
import { onRequestPatch as crmFollowUp } from "./api/crm/follow-up.js";
import {
  onRequestGet as crmQuickRepliesGet,
  onRequestPost as crmQuickRepliesPost,
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
  onRequestDelete as crmScheduledDelete
} from "./api/crm/scheduled.js";
import { procesarSeguimientosVencidos } from "./lib/crm-cron.js";
import { exportarChatsASheets } from "./lib/crm-sheets-export.js";
import { onRequestGet as crmTemplatesGet, onRequestPost as crmTemplatesPost } from "./api/crm/templates.js";
import { onRequestGet as crmCatalogGet, onRequestPost as crmCatalogPost, onRequestGetProductos as crmCatalogProductosGet } from "./api/crm/catalog.js";
import { onRequestGet as crmSettingsGet, onRequestPatch as crmSettingsPatch } from "./api/crm/settings.js";
import { onRequestPost as crmTestWelcomePost } from "./api/crm/test-welcome.js";
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
import { onRequestPost as crmCapiSendPost } from "./api/crm/capi-send.js";
import { onRequestPost as crmExportResetPost } from "./api/crm/export-reset.js";
import { onRequestPost as crmChangePasswordPost } from "./api/crm/change-password.js";
import { onRequestPost as crmForgotPasswordPost } from "./api/crm/forgot-password.js";
import { onRequestPost as crmResetPasswordPost } from "./api/crm/reset-password.js";

const ROUTES = {
  "/api/order": { POST: order },
  "/api/upsell": { POST: upsell },
  "/api/diag": { GET: diag },
  "/api/setup": { POST: setup },
  "/api/seguimiento": { GET: seguimiento },

  "/api/whatsapp/webhook": { GET: waWebhookGet, POST: waWebhookPost },

  "/api/crm/login": { POST: crmLogin },
  "/api/crm/login-info": { GET: crmLoginInfo },
  "/api/crm/logout": { POST: crmLogout },
  "/api/crm/session": { GET: crmSession },
  "/api/crm/conversations": { GET: crmConversations },
  "/api/crm/messages": { GET: crmMessagesGet, POST: crmMessagesPost },
  "/api/crm/contacts": { POST: crmContactsPost, PATCH: crmContactsPatch },
  "/api/crm/upload-media": { POST: crmUploadMedia },
  "/api/crm/media": { GET: crmMedia },
  "/api/crm/follow-up": { PATCH: crmFollowUp },
  "/api/crm/quick-replies": { GET: crmQuickRepliesGet, POST: crmQuickRepliesPost, DELETE: crmQuickRepliesDelete },
  "/api/crm/login-verify": { POST: crmLoginVerify },
  "/api/crm/agents": { GET: crmAgentsGet, POST: crmAgentsPost, PATCH: crmAgentsPatch },
  "/api/crm/scheduled": { GET: crmScheduledGet, POST: crmScheduledPost, DELETE: crmScheduledDelete },
  "/api/crm/followup-sequences": { GET: crmFollowupSeqGet, POST: crmFollowupSeqPost, DELETE: crmFollowupSeqDelete, PATCH: crmFollowupSeqPatch },
  "/api/crm/followup-apply": { POST: crmFollowupApplyPost },
  "/api/crm/templates": { GET: crmTemplatesGet, POST: crmTemplatesPost },
  "/api/crm/catalog": { GET: crmCatalogGet, POST: crmCatalogPost },
  "/api/crm/catalog-products": { GET: crmCatalogProductosGet },
  "/api/crm/settings": { GET: crmSettingsGet, PATCH: crmSettingsPatch },
  "/api/crm/test-welcome": { POST: crmTestWelcomePost },
  "/api/crm/welcome-sequence": { GET: crmWelcomeSeqGet, POST: crmWelcomeSeqPost, DELETE: crmWelcomeSeqDelete, PATCH: crmWelcomeSeqPatch },
  "/api/crm/totp-setup": { GET: crmTotpGet, POST: crmTotpPost, PATCH: crmTotpPatch, DELETE: crmTotpDelete },
  "/api/crm/bulk-send": { GET: crmBulkSendGet, POST: crmBulkSendPost },
  "/api/crm/capi-send": { POST: crmCapiSendPost },
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

  // Dos crons (ver wrangler.jsonc → triggers.crons), distinguidos por
  // event.cron: el de cada minuto manda los seguimientos vencidos, el de
  // cada 10 min vuelca los chats nuevos a Sheets.
  async scheduled(event, env, ctx) {
    if (event.cron === "*/10 * * * *") {
      ctx.waitUntil(exportarChatsASheets(env));
      return;
    }
    ctx.waitUntil(procesarSeguimientosVencidos(env));
  }
};

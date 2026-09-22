/**
 * POST /api/crm/export-reset — reinicia el marcador de exportación a Sheets,
 * así el cron de cada 10 minutos vuelve a mandar TODO el historial desde el
 * mensaje más viejo. Solo admin.
 *
 * Ojo: no borra ni reemplaza lo que ya está en las pestañas — si el día ya
 * tiene filas exportadas, van a quedar duplicadas. Para un reinicio limpio,
 * borra a mano las pestañas viejas del Sheet antes de usar esto.
 */

import { conAdmin } from "../../lib/crm-auth.js";
import { reiniciarExportacion } from "../../lib/crm-sheets-export.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

async function post({ env }) {
  if (!env.GOOGLE_CRM_SHEET_ID) return json({ error: "Falta configurar GOOGLE_CRM_SHEET_ID." }, 503);
  await reiniciarExportacion(env);
  return json({ ok: true });
}

export const onRequestPost = conAdmin(post);

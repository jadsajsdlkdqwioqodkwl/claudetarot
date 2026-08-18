/**
 * Límite de leads por IP.
 *
 * Requiere un KV namespace enlazado como LEADS_KV en el proyecto de Pages.
 * Si el binding no existe, no se limita nada y se avisa por consola: así el
 * sitio nunca deja de recibir pedidos por un problema de configuración.
 */

export const MAX_LEADS_POR_IP = 5;
const VENTANA_SEGUNDOS = 24 * 60 * 60;

/**
 * @returns {Promise<{permitido: boolean, usados: number}>}
 */
export async function checkRateLimit(env, ip) {
  if (!env.LEADS_KV || !ip) {
    if (!env.LEADS_KV) console.warn("LEADS_KV no está enlazado: no hay límite por IP.");
    return { permitido: true, usados: 0 };
  }

  const clave = `lead:${ip}`;
  const usados = Number(await env.LEADS_KV.get(clave)) || 0;
  if (usados >= MAX_LEADS_POR_IP) return { permitido: false, usados };

  // La ventana arranca con el primer lead y no se renueva con cada intento.
  await env.LEADS_KV.put(clave, String(usados + 1), { expirationTtl: VENTANA_SEGUNDOS });
  return { permitido: true, usados: usados + 1 };
}

/**
 * Mensajes entrantes que no son texto ni media, según la referencia oficial del webhook «messages» de la
 * Cloud API (developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages,
 * páginas contacts, unsupported y system; leídas el 2026-11-03). Aquí se arma el `body` que se guarda en D1
 * y el texto legible que ven el asesor (preparar.py) y cualquier lista.
 *
 *  - contacts   → body = JSON {"contactos":[{nombre, telefonos:[{numero, wa_id, tipo}], emails:[], org, direcciones:[]}]}
 *  - unsupported → body = "<subtipo>|<código>|<título>" (p. ej. "poll_creation|131051|Message type unknown")
 *  - system     → body = el texto de Meta ("User X changed from … to …") + "|" + tipo (user_changed_number…)
 */

export const UNSUPPORTED_ES = {
  edit: "editó un mensaje", poll_creation: "una encuesta", poll_update: "un voto en una encuesta", gif: "un GIF",
  group_invite: "una invitación a un grupo", pin: "fijó un mensaje", keep_in_chat: "«conservar en el chat»",
  link_preview: "un enlace con vista previa", media_placeholder: "un archivo que WhatsApp no entregó", hsm: "una plantilla",
  list: "una lista", button: "un botón", interactive: "un mensaje interactivo", order: "un pedido", product: "un producto",
  location: "una ubicación", reaction: "una reacción", image: "una imagen", errors: "un mensaje con error",
  event: "un evento", call_log: "un registro de llamada", payment: "un pago"
};

const limpio = (s) => String(s ?? "").trim();

/** De `msg.contacts` del webhook a la forma guardada. Muchas propiedades pueden faltar (el cliente elige qué comparte). */
export function contactosDesdeWebhook(lista) {
  const contactos = (Array.isArray(lista) ? lista : []).map((c) => ({
    nombre: limpio(c.name?.formatted_name) || [c.name?.prefix, c.name?.first_name, c.name?.middle_name, c.name?.last_name, c.name?.suffix].map(limpio).filter(Boolean).join(" "),
    telefonos: (c.phones || []).map((p) => ({ numero: limpio(p.phone), wa_id: limpio(p.wa_id), tipo: limpio(p.type) })).filter((p) => p.numero || p.wa_id),
    emails: (c.emails || []).map((e) => limpio(e.email)).filter(Boolean),
    org: [c.org?.company, c.org?.title].map(limpio).filter(Boolean).join(" · "),
    direcciones: (c.addresses || []).map((a) => [a.street, a.city, a.state, a.country].map(limpio).filter(Boolean).join(", ")).filter(Boolean),
    urls: (c.urls || []).map((u) => limpio(u.url)).filter(Boolean),
    cumple: limpio(c.birthday)
  }));
  return JSON.stringify({ contactos });
}

/** El body guardado → lista de contactos (vacía si es un mensaje viejo sin detalle o un JSON roto). */
export function contactosDeBody(body) {
  try {
    const d = JSON.parse(body || "");
    return Array.isArray(d?.contactos) ? d.contactos : [];
  } catch {
    return [];
  }
}

/** Texto legible de un mensaje de contactos: "Contacto: Juan Pérez · +51 999 888 777 (CELL) · juan@x.com". */
export function contactosTexto(body) {
  const lista = contactosDeBody(body);
  if (!lista.length) return "Contacto compartido (el detalle no se guardó)";
  return lista.map((c) => ["Contacto: " + (c.nombre || "(sin nombre)"),
    ...(c.telefonos || []).map((t) => (t.numero || "+" + t.wa_id) + (t.wa_id ? " (WhatsApp)" : "") + (t.tipo ? ` ${t.tipo}` : "")),
    ...(c.emails || []), c.org, ...(c.direcciones || [])].filter(Boolean).join(" · ")).join(" | ");
}

export function unsupportedDesdeWebhook(msg) {
  const err = msg.errors?.[0] || {};
  return [limpio(msg.unsupported?.type), limpio(err.code), limpio(err.title || err.message)].join("|");
}

/** "poll_creation|131051|…" → { subtipo, codigo, titulo, texto legible }. */
export function unsupportedInfo(body) {
  const [subtipo = "", codigo = "", titulo = ""] = String(body || "").split("|");
  const que = UNSUPPORTED_ES[subtipo] || (subtipo ? `un mensaje de tipo «${subtipo}»` : "un mensaje de un tipo que la API no entrega");
  const texto = codigo === "131060"
    ? "Mensaje no disponible todavía: WhatsApp no lo entregó a la API (pasa con el primer mensaje de algunos clientes). Si no llega, pídele que lo vuelva a mandar."
    : `El cliente mandó ${que}. WhatsApp no lo entrega a la API: pídele que lo mande como texto, foto o audio.`;
  return { subtipo, codigo, titulo, texto };
}

export function systemDesdeWebhook(msg) {
  return [limpio(msg.system?.body), limpio(msg.system?.type), limpio(msg.system?.wa_id)].join("|");
}

/** Texto para el asesor y las listas, según el tipo. Devuelve null si el tipo no es especial. */
export function textoLegible(type, body) {
  if (type === "contacts") return contactosTexto(body);
  if (type === "unsupported") return "[" + unsupportedInfo(body).texto + "]";
  if (type === "system") return "[aviso de WhatsApp: " + (String(body || "").split("|")[0] || "cambio de número") + "]";
  if (type === "request_welcome") return "[el cliente abrió el chat desde el anuncio sin escribir]";
  return null;
}

/**
 * Prueba de los mensajes que no son texto ni media (contactos, no compatibles, sistema), con los payloads de la
 * referencia oficial del webhook de la Cloud API. `node scripts/test-mensajes-especiales.mjs` (la corre `npm run check`).
 */
import { contactosDesdeWebhook, contactosDeBody, contactosTexto, unsupportedDesdeWebhook, unsupportedInfo, systemDesdeWebhook, textoLegible } from "../src/lib/mensajes-especiales.js";

let fallas = 0;
const check = (nombre, ok, detalle = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`); };

// Ejemplo oficial de «contacts» (developers.facebook.com, webhooks/reference/messages/contacts).
const contacts = [{ name: { first_name: "Barbara", last_name: "Johnson", formatted_name: "Barbara J. Johnson" }, org: { company: "Social Tsunami" },
  phones: [{ phone: "+1 (415) 555-0829", wa_id: "14125550829", type: "MOBILE" }] }];
const body = contactosDesdeWebhook(contacts);
const lista = contactosDeBody(body);
check("se guarda el nombre, la empresa y el teléfono con su wa_id", lista[0]?.nombre === "Barbara J. Johnson" && lista[0].org === "Social Tsunami" && lista[0].telefonos[0].wa_id === "14125550829", body);
check("el texto legible para el asesor lleva nombre y número", /Contacto: Barbara J\. Johnson · \+1 \(415\) 555-0829 \(WhatsApp\) MOBILE · Social Tsunami/.test(contactosTexto(body)), contactosTexto(body));
check("un contacto sin formatted_name arma el nombre con las partes", contactosDeBody(contactosDesdeWebhook([{ name: { first_name: "Ana", last_name: "Paz" }, phones: [{ phone: "+51 999" }] }]))[0].nombre === "Ana Paz");
check("varios contactos en un mensaje", contactosDeBody(contactosDesdeWebhook([{ name: { formatted_name: "A" } }, { name: { formatted_name: "B" } }])).length === 2);
check("un body viejo (NULL) no revienta y dice que no se guardó", contactosDeBody(null).length === 0 && /no se guardó/.test(contactosTexto(null)));

// Ejemplo oficial de «unsupported».
const uns = { type: "unsupported", errors: [{ code: 131051, title: "Message type unknown", message: "Message type unknown" }], unsupported: { type: "edit" } };
const ub = unsupportedDesdeWebhook(uns);
check("unsupported guarda subtipo, código y título", ub === "edit|131051|Message type unknown", ub);
check("y se explica en español", /editó un mensaje/.test(unsupportedInfo(ub).texto), unsupportedInfo(ub).texto);
check("131060 se explica como «no disponible todavía»", /no disponible todavía/.test(unsupportedInfo("|131060|This message is currently unavailable.").texto));
check("encuesta", /una encuesta/.test(textoLegible("unsupported", "poll_creation|131051|x")));

// Ejemplo oficial de «system».
const sys = { type: "system", system: { body: "User Sheena Nelson changed from 16505551234 to 12195555358", wa_id: "12195555358", type: "user_changed_number" } };
check("system guarda el texto y el tipo", systemDesdeWebhook(sys).startsWith("User Sheena Nelson changed from 16505551234 to 12195555358|user_changed_number"));
check("texto legible de sistema", /cambio|changed/.test(textoLegible("system", systemDesdeWebhook(sys))));
check("los tipos normales no cambian", textoLegible("text", "hola") === null && textoLegible("image", "") === null);

console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : "\nTodo en orden.");
process.exit(fallas ? 1 : 0);

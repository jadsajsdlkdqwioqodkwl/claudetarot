/**
 * «Reportar venta» de un cliente con nombre de usuario de WhatsApp (sin número; 2026-11-11, chat de Carmela Fonseca:
 * Meta rechazaba «insufficient customer information»). `node --no-warnings scripts/test-capi-sin-numero.mjs`.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { celularDeTexto, construirEventoCapi } = await import(join(root, "src/lib/meta-capi.js"));
let fallas = 0;
const check = (n, ok, d = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${n}${ok || !d ? "" : ` — ${d}`}`); };

check("«teléfono..924543668» → 51924543668", celularDeTexto("Urb.Los Alisos lll etapa MzC Lote2.. teléfono..924543668") === "51924543668");
check("«+51 924 543 668» → 51924543668", celularDeTexto("mi número +51 924 543 668") === "51924543668");
check("«987-654-321» → 51987654321", celularDeTexto("llámame al 987-654-321") === "51987654321");
check("un DNI de 8 dígitos no es celular", celularDeTexto("mi dni es 45891554") === null);
check("un número largo (orden, tarjeta) no es celular", celularDeTexto("orden 1027428221234") === null);
check("un fijo no es celular", celularDeTexto("tel 014567890") === null);

const base = { modo: "manual", valor: 89, eventName: "Purchase", firstName: "Carmela" };
// Camino de siempre: número normal → ph igual que antes, sin external_id.
const normal = await construirEventoCapi({ ...base, waId: "51969707331" });
check("cliente con número: igual que antes (ph, sin external_id)", normal.data[0].user_data.ph?.length === 1 && !normal.data[0].user_data.external_id);
// Sin número pero con celular en el chat: ph del celular + external_id.
const conCel = await construirEventoCapi({ ...base, waId: "PE.1160183130295149", telefono: "51924543668" });
check("sin número + celular del chat: lleva ph y external_id", conCel.data[0].user_data.ph?.length === 1 && conCel.data[0].user_data.external_id?.length === 1);
// Sin número y sin celular: no se arma un evento que Meta va a rechazar.
let e = null;
try { await construirEventoCapi({ ...base, waId: "PE.1160183130295149" }); } catch (err) { e = err; }
check("sin número ni celular: error claro (sinDatos), no se manda solo el nombre", e?.sinDatos === true);

console.log(fallas ? `\n${fallas} falla(s).` : "\nVenta de cliente sin número: todo en orden.");
process.exit(fallas ? 1 : 0);

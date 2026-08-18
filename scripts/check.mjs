/**
 * Chequeos del backend sin red ni credenciales: `npm run check`
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const check = (name, cond, detail = "") => {
  if (!cond) failures++;
  console.log(`${cond ? "OK " : "FALLA"} ${name}${cond || !detail ? "" : ` -- ${detail}`}`);
};

const { PRODUCTOS, BUMPS, toE164Peru, fechaLima, clean } = await import(join(root, "functions/_lib/pedido.js"));
const { validate } = await import(join(root, "functions/api/order.js"));
const { MAX_LEADS_POR_IP, checkRateLimit } = await import(join(root, "functions/_lib/rate-limit.js"));

/* Teléfonos */
check("celular de 9 dígitos a E.164", toE164Peru("987 654 321") === "51987654321");
check("celular con +51 se respeta", toE164Peru("+51 987654321") === "51987654321");
check("fijo de 7 dígitos se rechaza", toE164Peru("4451234") === null);

/* Fechas en hora de Lima, con formato que Sheets entiende como fecha */
const f = fechaLima(new Date("2026-08-18T02:35:00Z")); // 21:35 en Lima del día 17
check("fecha convertida a hora de Lima", f.fechaHora === "2026-08-17 21:35:00", f.fechaHora);
check("día sin hora para agrupar", f.dia === "2026-08-17", f.dia);

/* Precios */
check("1 kit cuesta 79", PRODUCTOS["1kit"].precio === 79);
check("2 kits cuestan 139", PRODUCTOS["2kit"].precio === 139);
check("solo existe el bump de velas", Object.keys(BUMPS).join() === "velas");

/* Validación */
const lima = { nombre: "María Fernández", telefono: "987654321", envio: "casa",
               direccion: "Av. Larco 1234, dpto. 502", producto: "2kit" };
const prov = { nombre: "Diego Salas", telefono: "912345678", envio: "agencia",
               agencia: "Shalom - Sede Centro", producto: "1kit" };

check("pedido de Lima válido", validate(lima).errors.length === 0);
check("pedido de provincia válido", validate(prov).errors.length === 0);
check("dirección y agencia comparten campo",
  validate(prov).order.destino === "Shalom - Sede Centro");
check("Lima sin dirección se rechaza", validate({ ...lima, direccion: "" }).errors.includes("direccion"));
check("provincia sin agencia se rechaza", validate({ ...prov, agencia: "" }).errors.includes("agencia"));
check("total de 2 kits = 139", validate(lima).order.total === 139);
check("producto desconocido cae a 1 kit", validate({ ...lima, producto: "99" }).order.total === 79);
check("el total del formulario se ignora", validate({ ...lima, total: 1, precio: 1 }).order.total === 139);
const sucio = "Ana" + String.fromCharCode(7) + "Luz";
check("se limpian caracteres de control", clean(sucio, 20) === "Ana Luz", clean(sucio, 20));

/* Límite por IP */
const kv = new Map();
const env = { LEADS_KV: { get: async (k) => kv.get(k), put: async (k, v) => kv.set(k, v) } };
let ultimo;
for (let i = 0; i < MAX_LEADS_POR_IP + 2; i++) ultimo = await checkRateLimit(env, "9.9.9.9");
check(`el lead numero ${MAX_LEADS_POR_IP + 1} desde la misma IP se bloquea`, ultimo.permitido === false);
check("otra IP no queda afectada", (await checkRateLimit(env, "8.8.8.8")).permitido === true);
check("sin KV enlazado no se bloquea a nadie", (await checkRateLimit({}, "9.9.9.9")).permitido === true);

console.log(failures === 0 ? "\nTodo en orden." : `\n${failures} chequeo(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);

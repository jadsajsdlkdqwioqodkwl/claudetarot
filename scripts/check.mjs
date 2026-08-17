/**
 * Chequeos rápidos sin dependencias: `npm run check`
 *  1. Todos los assets referenciados en el HTML existen.
 *  2. Los SVG son XML bien formado.
 *  3. La validación del backend acepta pedidos buenos y rechaza los malos.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
}

/* 1. Assets referenciados */
const html = readFileSync(join(root, "index.html"), "utf8");
const refs = [...html.matchAll(/(?:src|href)="((?!https?:|mailto:|#)[^"]+)"/g)].map((m) => m[1]);
const missing = refs.filter((ref) => !existsSync(join(root, ref)));
check(`assets referenciados existen (${refs.length} rutas)`, missing.length === 0, missing.join(", "));

/* 2. SVG bien formados */
const imgDir = join(root, "assets/img");
const svgs = readdirSync(imgDir).filter((f) => f.endsWith(".svg"));
const broken = svgs.filter((file) => {
  const svg = readFileSync(join(imgDir, file), "utf8");
  const opens = (svg.match(/<(?!\/|\?|!)[a-zA-Z][^>]*?(?<!\/)>/g) || []).length;
  const closes = (svg.match(/<\/[a-zA-Z]/g) || []).length;
  return !svg.trim().startsWith("<svg") || opens !== closes;
});
check(`SVG balanceados (${svgs.length} archivos)`, broken.length === 0, broken.join(", "));

/* 3. Validación del backend */
const { __test } = await import(join(root, "functions/api/order.js"));
const { toE164Peru, validate, makeOrderId } = __test;

check("celular 9 dígitos → E.164", toE164Peru("987 654 321") === "51987654321");
check("celular con +51 se respeta", toE164Peru("+51 987654321") === "51987654321");
check("fijo de 7 dígitos se rechaza", toE164Peru("4451234") === null);
check("código de pedido con formato TC-XXXXXX", /^TC-[A-Z2-9]{6}$/.test(makeOrderId()));

const bueno = {
  nombre: "María Fernández", telefono: "987654321", departamento: "Lima",
  distrito: "Miraflores", direccion: "Av. Larco 1234, dpto. 502", cantidad: "2"
};
const r1 = validate(bueno);
check("pedido válido pasa sin errores", r1.errors.length === 0, r1.errors.join(", "));
check("total de 2 mazos = 160", r1.order.total === 160, String(r1.order.total));

const malo = { nombre: "Ma", telefono: "123", departamento: "", distrito: "", direccion: "x" };
const r2 = validate(malo);
check(
  "pedido inválido reporta cada campo",
  ["nombre", "telefono", "departamento", "distrito", "direccion"].every((f) => r2.errors.includes(f)),
  r2.errors.join(", ")
);
check("cantidad fuera de rango cae a 1", validate({ ...bueno, cantidad: "99" }).order.cantidad === 1);
check("email inválido se detecta", validate({ ...bueno, email: "no-es-mail" }).errors.includes("email"));

console.log(failures === 0 ? "\nTodo en orden." : `\n${failures} chequeo(s) fallaron.`);
process.exit(failures === 0 ? 0 : 1);

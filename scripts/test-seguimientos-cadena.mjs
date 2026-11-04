/**
 * Prueba de la cadena de seguimiento (dueño, 2026-11-01): plan universal, tope de 23 h, «día N del
 * chat», una sola cadena por chat y corte solo por el cliente.
 * `node scripts/test-seguimientos-cadena.mjs` (también la corre `npm run check`). SQLite real con las migraciones del repo.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { programarSeguimientoDeRapida, programarPasosEnChat, cancelarSeguimientosPendientes, normalizarPasosSeguimiento, MAX_PASOS_SEGUIMIENTO } = await import(join(root, "src/lib/crm-db.js"));
let fallas = 0;
const check = (nombre, ok, detalle = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`); };

function baseNueva() {
  const sq = new DatabaseSync(":memory:");
  for (const f of readdirSync(join(root, "migrations")).sort()) { try { sq.exec(readFileSync(join(root, "migrations", f), "utf8")); } catch { /* migraciones que dependen de datos de producción */ } }
  try { sq.exec("ALTER TABLE scheduled_messages ADD COLUMN botones TEXT"); } catch { /* ya está */ }
  const mk = (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; },
    all: async () => ({ results: sq.prepare(sql).all(...a) }), first: async () => sq.prepare(sql).get(...a) ?? null, run: async () => sq.prepare(sql).run(...a) }; return st; };
  const db = { prepare: mk, batch: async (l) => { for (const s of l) await s.run(); } };
  sq.exec("INSERT INTO contacts (id, wa_id) VALUES (1, '51900000001')");
  return { sq, db };
}
const sqlFecha = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
const H = 3600 * 1000;
const chat = (sq, id, { hace, creadoHace }) => {
  sq.prepare("INSERT INTO conversations (id, contact_id, last_inbound_at, created_at) VALUES (?, 1, ?, ?)").run(id, sqlFecha(Date.now() - hace), sqlFecha(Date.now() - creadoHace));
};
const pendientes = (sq, id) => sq.prepare("SELECT body, template_name, send_at, status, created_by FROM scheduled_messages WHERE conversation_id = ? ORDER BY send_at").all(id);
const horasDesdeAhora = (iso) => (new Date(iso).getTime() - Date.now()) / H;

const universal = [
  { horas: 1, body: "Paso 1: recordatorio" },
  { horas: 20, body: "Paso 2: collar de regalo" },
  { horas: 72, plantilla: "rescate_lead_1", desde: "inicio" }
];

console.log("Cadena de seguimiento (plan universal, tope, día N, una sola cadena, corte por el cliente)");
{
  const { sq, db } = baseNueva();
  sq.prepare("INSERT INTO crm_settings (key, value) VALUES ('seguimiento_universal', ?)").run(JSON.stringify(universal));
  sq.prepare("INSERT INTO quick_replies (id, title, body, followup_universal) VALUES (901, 'Provincia Msj. 3', 'texto', 1)").run();
  sq.prepare("INSERT INTO quick_replies (id, title, body, followup_pasos) VALUES (902, 'Precio?', 'texto', ?)").run(JSON.stringify([{ horas: 2, body: "propio" }]));

  // 1. Chat de hace 2 días, el cliente escribió hace 10 min: salen los 2 textos y la plantilla del día 3.
  chat(sq, 10, { hace: 10 * 60000, creadoHace: 48 * H });
  check("la rápida con plan universal programa los pasos del plan", (await programarSeguimientoDeRapida(db, 10, 901)) === null);
  let p = pendientes(sq, 10);
  check("salen 3 pasos (2 textos + plantilla día 3)", p.length === 3, JSON.stringify(p.map((x) => x.body || x.template_name)));
  check("el paso 2 sale ~21 h después (entra en las 23 h)", p[1] && Math.abs(horasDesdeAhora(p[1].send_at) - 21) < 0.2, p[1] && String(horasDesdeAhora(p[1].send_at)));
  check("la plantilla del día 3 (72 h desde que empezó = +24 h) se corre a +26 h: mínimo de 5 h tras el paso 2 (dueño, 2026-11-04)", p[2]?.template_name === "rescate_lead_1" && Math.abs(horasDesdeAhora(p[2].send_at) - 26) < 0.2, p[2] && String(horasDesdeAhora(p[2].send_at)));
  check("el origen es el de la rápida (para la burbuja y la lista)", p.every((x) => x.created_by === "Seguimiento de respuesta rápida · Provincia Msj. 3"));

  // 2. Cliente que escribió hace 22 h: el paso 1 (+1 h) entra justo; el paso 2 ya no (ni adelantado), la plantilla sí.
  chat(sq, 11, { hace: 22 * H, creadoHace: 22 * H });
  await programarSeguimientoDeRapida(db, 11, 901);
  p = pendientes(sq, 11);
  check("con la ventana casi cerrada sale el paso 1 y se salta el 2 (no se intenta fuera de ventana)", p.filter((x) => !x.template_name).length === 1 && p[0].body === "Paso 1: recordatorio", JSON.stringify(p.map((x) => x.body || x.template_name)));
  check("la plantilla no tiene tope", p.some((x) => x.template_name === "rescate_lead_1"));

  // 3. Cliente que escribió hace 12 h: el paso 2 (12+1+20 = 33 h) se adelanta al tope (23 h) porque quedan más de 2 h con el paso 1.
  chat(sq, 12, { hace: 12 * H, creadoHace: 12 * H });
  await programarSeguimientoDeRapida(db, 12, 901);
  p = pendientes(sq, 12).filter((x) => !x.template_name);
  check("un texto que caería fuera de la ventana se adelanta al tope de 23 h", p.length === 2 && Math.abs(horasDesdeAhora(p[1].send_at) - 11) < 0.2, p[1] && String(horasDesdeAhora(p[1].send_at)));

  // 4. Chat de hace 5 días: el día 3 ya pasó → la plantilla se salta.
  chat(sq, 13, { hace: 10 * 60000, creadoHace: 5 * 24 * H });
  await programarSeguimientoDeRapida(db, 13, 901);
  check("una plantilla «día N del chat» cuyo día ya pasó se salta", !pendientes(sq, 13).some((x) => x.template_name));

  // 5. Una sola cadena: otra rápida (pasos propios) reemplaza a la del plan universal; la cadena vieja queda cancelada.
  await programarSeguimientoDeRapida(db, 10, 902);
  p = pendientes(sq, 10);
  check("la rápida nueva reemplaza a la cadena anterior (una sola cadena por chat)", p.filter((x) => x.status === "pendiente").length === 1 && p.filter((x) => x.status === "pendiente")[0].body === "propio" && p.filter((x) => x.status === "cancelado").length === 3);

  // 6. Solo el cliente corta: cancelarSeguimientosPendientes (webhook) cancela la cadena.
  await cancelarSeguimientosPendientes(db, 10);
  check("cuando el cliente escribe, la cadena se corta", pendientes(sq, 10).every((x) => x.status === "cancelado"));

  // 7. Reactivar sin rápida: el plan universal directo con otro origen.
  check("se puede programar el plan universal directo (reactivar desde la barra)", (await programarPasosEnChat(db, 10, universal, "Seguimiento de leads · Moi")) === null && pendientes(sq, 10).filter((x) => x.status === "pendiente").length === 3);

  // 8. Ya compró: no se programa.
  chat(sq, 14, { hace: 10 * 60000, creadoHace: H });
  sq.prepare("UPDATE conversations SET meta_tags = 'contact purchase' WHERE id = 14").run();
  check("a quien ya compró no se le programa la cadena", /compró/.test(await programarSeguimientoDeRapida(db, 14, 901) || "") && !pendientes(sq, 14).length);

  // 9. normalizar: tope de pasos y «desde inicio» solo en plantillas.
  const n = normalizarPasosSeguimiento([...Array(8)].map((_, i) => ({ horas: 1, body: `p${i}` })).concat([{ horas: 48, plantilla: "x_y", desde: "inicio" }, { horas: 2, body: "t", desde: "inicio" }]));
  check(`como mucho ${MAX_PASOS_SEGUIMIENTO} pasos por cadena`, n.length === MAX_PASOS_SEGUIMIENTO);
  const n2 = normalizarPasosSeguimiento([{ horas: 48, plantilla: "x_y", desde: "inicio" }, { horas: 2, body: "t", desde: "inicio" }]);
  check("«desde inicio» se guarda solo en plantillas", n2[0].desde === "inicio" && !n2[1].desde);
}

console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : "\nTodo en orden.");
process.exit(fallas ? 1 : 0);

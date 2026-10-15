/**
 * Prueba: el seguimiento de una respuesta rápida sale con el texto ACTUAL de la rápida.
 * `node scripts/test-seguimientos-rapida.mjs` (también la corre `npm run check`).
 *
 * Caso real (2026-10-15, chat URO · Lima): se mandó la rápida, después se editó el
 * paso de seguimiento, y a las 2 h salió el texto viejo (cada paso se copia a
 * scheduled_messages al mandar la rápida). Usa SQLite real con las migraciones del repo.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { programarSeguimientoDeRapida, sincronizarSeguimientosPendientes, cancelarSeguimientosDeLead } = await import(join(root, "src/lib/crm-db.js"));
let fallas = 0;
const check = (nombre, ok, detalle = "") => { if (!ok) fallas++; console.log(`${ok ? "✓" : "✗"} ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`); };

function baseNueva() {
  const sq = new DatabaseSync(":memory:");
  for (const f of readdirSync(join(root, "migrations")).sort()) { try { sq.exec(readFileSync(join(root, "migrations", f), "utf8")); } catch { /* migraciones que dependen de datos de producción */ } }
  try { sq.exec("ALTER TABLE scheduled_messages ADD COLUMN botones TEXT"); } catch { /* ya está (0050 se aplica a mano) */ }
  const mk = (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; },
    all: async () => ({ results: sq.prepare(sql).all(...a) }), first: async () => sq.prepare(sql).get(...a) ?? null, run: async () => sq.prepare(sql).run(...a) }; return st; };
  const db = { prepare: mk, batch: async (l) => { for (const s of l) await s.run(); } };
  return { sq, db };
}

// Lo que hace PATCH /api/crm/quick-replies: lee la fila, guarda y sincroniza.
async function editarRapida({ sq, db }, id, { title, pasos }) {
  const antes = sq.prepare("SELECT title, followup_body, followup_hours, followup_pasos FROM quick_replies WHERE id = ?").get(id);
  sq.prepare("UPDATE quick_replies SET title = COALESCE(?, title), followup_pasos = ? WHERE id = ?").run(title ?? null, JSON.stringify(pasos), id);
  return sincronizarSeguimientosPendientes(db, id, antes);
}
const pendientes = (sq, chat) => sq.prepare("SELECT body, status, created_by FROM scheduled_messages WHERE conversation_id = ? ORDER BY id").all(chat);
const nuevoEscenario = async (pasos) => {
  const e = baseNueva();
  e.sq.exec("INSERT INTO contacts (id, wa_id) VALUES (1,'51900000001'), (2,'51900000002')");
  e.sq.exec("INSERT INTO conversations (id, contact_id, last_inbound_at, etapa) VALUES (1,1,datetime('now'),3), (2,2,datetime('now'),3)");
  e.sq.prepare("INSERT INTO quick_replies (id, title, body, followup_pasos) VALUES (9003, 'URO · Lima msj. 3', 'Me indica su ubicación', ?)").run(JSON.stringify(pasos));
  return e;
};
const A1 = "Me indica por favor la ubicación y el teléfono de quien lo va a recibir para dejar su envío agendado";
const B1 = "B1: texto nuevo programado en la respuesta rápida";

{ // 1. El caso del chat: se manda la rápida (copia A1) y luego se edita el paso a B1.
  const e = await nuevoEscenario([{ horas: 2, body: A1 }, { horas: 20, body: "B2 viejo" }]);
  await programarSeguimientoDeRapida(e.db, 1, 9003);
  const cambios = await editarRapida(e, 9003, { pasos: [{ horas: 2, body: B1 }, { horas: 20, body: "B2 nuevo" }] });
  const filas = pendientes(e.sq, 1);
  check("editar la rápida cambia el texto de los seguimientos ya programados (B1 y B2)",
    cambios === 2 && filas[0].body === B1 && filas[1].body === "B2 nuevo" && filas.every((f) => f.status === "pendiente"), JSON.stringify(filas));
}
{ // 2. Lo editado a mano en ese chat («Reactivar seguimiento») se respeta; el otro chat sí cambia.
  const e = await nuevoEscenario([{ horas: 2, body: A1 }]);
  await programarSeguimientoDeRapida(e.db, 1, 9003);
  await programarSeguimientoDeRapida(e.db, 2, 9003, [{ horas: 2, body: "Texto que la vendedora escribió solo para este chat" }]);
  await editarRapida(e, 9003, { pasos: [{ horas: 2, body: B1 }] });
  check("el texto editado a mano para un chat no se pisa, el del otro chat sí se actualiza",
    pendientes(e.sq, 1)[0].body === B1 && pendientes(e.sq, 2)[0].body === "Texto que la vendedora escribió solo para este chat");
}
{ // 3. Un seguimiento ya enviado no se toca.
  const e = await nuevoEscenario([{ horas: 2, body: A1 }, { horas: 20, body: "B2 viejo" }]);
  await programarSeguimientoDeRapida(e.db, 1, 9003);
  e.sq.exec("UPDATE scheduled_messages SET status = 'enviado' WHERE id = (SELECT MIN(id) FROM scheduled_messages)");
  await editarRapida(e, 9003, { pasos: [{ horas: 2, body: B1 }, { horas: 20, body: "B2 nuevo" }] });
  const filas = pendientes(e.sq, 1);
  check("lo ya enviado queda como estaba y solo cambia lo pendiente", filas[0].status === "enviado" && filas[0].body === A1 && filas[1].body === "B2 nuevo");
}
{ // 4. Un paso apagado o quitado cancela su pendiente.
  const e = await nuevoEscenario([{ horas: 2, body: A1 }, { horas: 20, body: "B2 viejo" }]);
  await programarSeguimientoDeRapida(e.db, 1, 9003);
  await editarRapida(e, 9003, { pasos: [{ horas: 2, body: A1 }, { horas: 20, body: "B2 viejo", activo: false }] });
  const filas = pendientes(e.sq, 1);
  check("apagar un paso cancela su seguimiento pendiente y deja el otro", filas[0].status === "pendiente" && filas[1].status === "cancelado");
}
{ // 5. Cambiar el título actualiza el origen (el panel muestra «Tras no respuesta · título») y sigue siendo cancelable.
  const e = await nuevoEscenario([{ horas: 2, body: A1 }]);
  await programarSeguimientoDeRapida(e.db, 1, 9003);
  await editarRapida(e, 9003, { title: "URO · Lima msj. 3 (nuevo)", pasos: [{ horas: 2, body: A1 }] });
  check("renombrar la rápida actualiza el origen de sus pendientes", pendientes(e.sq, 1)[0].created_by.endsWith("URO · Lima msj. 3 (nuevo)"));
  await cancelarSeguimientosDeLead(e.db, 1);
  check("y siguen cancelándose cuando se le escribe al cliente", pendientes(e.sq, 1)[0].status === "cancelado");
}
{ // 6. Sin cambios en el seguimiento no toca nada.
  const e = await nuevoEscenario([{ horas: 2, body: A1 }]);
  await programarSeguimientoDeRapida(e.db, 1, 9003);
  check("guardar la rápida sin cambiar el seguimiento no modifica nada", (await editarRapida(e, 9003, { pasos: [{ horas: 2, body: A1 }] })) === 0);
}

console.log(fallas === 0 ? "\nSeguimientos de respuesta rápida en orden." : `\n${fallas} prueba(s) fallaron.`);
process.exit(fallas === 0 ? 0 : 1);

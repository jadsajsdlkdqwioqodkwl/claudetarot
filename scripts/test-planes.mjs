/**
 * Planes de seguimiento con nombre (dueño, 2026-11-03): «día N a las HH:MM» en hora de Lima, versión B con brazo
 * fijo por chat, día 7 marcado como pagado, el plan desde una rápida y desde la bienvenida, una sola cadena, y el
 * horario 06:30–23:30. `node scripts/test-planes.mjs` (también la corre `npm run check`). SQLite real con las migraciones.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const db0 = await import(join(root, "src/lib/crm-db.js"));
const { normalizarPasosSeguimiento, calendarioDePasos, medianocheLima, pasosDePlan, brazoPorHash, programarSeguimientoDeRapida, programarPlanEnChat, cancelarSeguimientosPendientes, cancelarSeguimientosDeLead, leerPlan, esOrigenAutomatico, MAX_PASOS_SEGUIMIENTO } = db0;
const { ajustarAlHorario, enSilencio } = await import(join(root, "src/lib/horario.js"));
const { programarSeguimientoDeInteresados } = await import(join(root, "src/lib/crm-interesados.js"));
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
const H = 3600 * 1000, DIA = 24 * H, LIMA = 5 * H;
const chat = (sq, id, { hace, creadoHace }) => sq.prepare("INSERT INTO conversations (id, contact_id, last_inbound_at, created_at) VALUES (?, 1, ?, ?)").run(id, sqlFecha(Date.now() - hace), sqlFecha(Date.now() - creadoHace));
const pendientes = (sq, id) => sq.prepare("SELECT body, template_name, send_at, status, created_by, plan_id, plan_brazo, plan_paso FROM scheduled_messages WHERE conversation_id = ? ORDER BY send_at").all(id);
const horaLima = (iso) => new Date(new Date(iso).getTime() - LIMA).toISOString().slice(11, 16);

console.log("Planes de seguimiento con nombre");
{
  // 1. Normalización: dia + hora (Lima) reemplaza a horas; hora mal escrita se ignora; tope 10 pasos.
  const n = normalizarPasosSeguimiento([{ dia: 2, hora: "19:30", plantilla: "g1" }, { dia: 3, hora: "9:05", body: "x" }, { dia: "x", hora: "10:00", horas: 4, body: "y" }, { horas: 1, body: "z" }]);
  check("«día 2 a las 19:30» se guarda como dia/hora sin horas", n[0].dia === 2 && n[0].hora === "19:30" && !("horas" in n[0]), JSON.stringify(n[0]));
  check("la hora se normaliza a HH:MM", n[1].hora === "09:05");
  check("sin día válido queda el modo relativo (horas)", n[2].horas === 4 && !("dia" in n[2]));
  check(`tope ${MAX_PASOS_SEGUIMIENTO} pasos`, normalizarPasosSeguimiento([...Array(14)].map((_, i) => ({ horas: 1, body: `p${i}` }))).length === MAX_PASOS_SEGUIMIENTO);

  // 2. Calendario: chat que empezó ayer a las 10:00 Lima y escribió hace 10 min; plan diario.
  const ahora = Date.now();
  const inicio = medianocheLima(ahora) - DIA + 10 * H;
  const plan = normalizarPasosSeguimiento([
    { horas: 0.75, body: "+45 min" }, { horas: 4, body: "+4 h con foto", media_key: "x.jpg", media_type: "image" },
    { dia: 2, hora: "20:00", plantilla: "r2" }, { dia: 3, hora: "13:00", plantilla: "r3" }, { dia: 5, hora: "10:30", plantilla: "g5" },
    { dia: 7, hora: "11:00", plantilla: "tarde" }, { dia: 0, hora: "08:00", plantilla: "ya_paso" }
  ]);
  const cal = calendarioDePasos(plan, { inicioMs: inicio, ultimoMs: ahora - 10 * 60000, ahoraMs: ahora });
  check("el paso del día 2 cae a las 20:00 de Lima del día 2 del chat", horaLima(cal[2].cuando) === "20:00" && cal[2].cuando === medianocheLima(inicio) + 2 * DIA + 20 * H, horaLima(cal[2].cuando));
  check("el del día 5 a las 10:30", horaLima(cal[4].cuando) === "10:30" && cal[4].dia === 5);
  check("una plantilla pasados los 7 días (168 h) del chat se marca como pagada y no sale", cal[5].pagado === true && cal[5].salta && /7 días/.test(cal[5].motivo) && cal[4].pagado === false && !cal[4].salta, JSON.stringify(cal[5]));
  check("un día que ya pasó se salta", cal[6].salta && cal[6].motivo === "ya pasó");
  // Mínimo de 5 h entre seguimientos (dueño, 2026-11-04): el +4 h se corre a 5 h después del +45 min.
  check("los textos relativos respetan el mínimo de 5 h (+45 min; el +4 h se corre a +5:45)", Math.abs(cal[0].cuando - (ahora + 0.75 * H)) < 1000 && !cal[0].espaciado && Math.abs(cal[1].cuando - (ahora + 5.75 * H)) < 1000 && cal[1].espaciado, JSON.stringify([cal[0], cal[1]]));
  const calSin = calendarioDePasos(plan.slice(0, 2), { inicioMs: inicio, ultimoMs: ahora - 10 * 60000, ahoraMs: ahora, espacioMs: 0 });
  check("con el mínimo en 0 los pasos salen como están escritos (+45 min, +4 h)", Math.abs(calSin[1].cuando - (ahora + 4.75 * H)) < 1000 && !calSin[1].espaciado);
  const calUltimo = calendarioDePasos(plan.slice(0, 1), { inicioMs: inicio, ultimoMs: ahora - 10 * 60000, ahoraMs: ahora, ultimoEnvioMs: ahora - 1 * H });
  check("si hace 1 h salió un seguimiento, el primero de la cadena nueva espera a cumplir las 5 h", Math.abs(calUltimo[0].cuando - (ahora + 4 * H)) < 1000 && calUltimo[0].espaciado, JSON.stringify(calUltimo));
  const calDesde = calendarioDePasos(plan.slice(0, 3), { inicioMs: inicio, ultimoMs: ahora - 10 * 60000, ahoraMs: ahora, desdePaso: 1 });
  check("con desdePaso 1, el primer paso se salta como «ya se mandó» y el segundo sale como primero", calDesde[0].salta && calDesde[0].motivo === "ya se mandó en este chat" && !calDesde[1].salta && Math.abs(calDesde[1].cuando - (ahora + 4 * H)) < 1000, JSON.stringify(calDesde));
  const calTope = calendarioDePasos(plan.slice(0, 2), { inicioMs: inicio, ultimoMs: ahora - 22 * H, ahoraMs: ahora });
  check("un texto que caería pasadas las 23 h del cliente se salta (el primero aún entra)", !calTope[0].salta && Math.abs(calTope[0].cuando - (ahora + 0.75 * H)) < 1000 && calTope[1].salta && calTope[1].motivo === "fuera de las 24 h del cliente", JSON.stringify(calTope));
  const calAdelanto = calendarioDePasos([{ horas: 5, body: "se adelanta" }], { inicioMs: inicio, ultimoMs: ahora - 20 * H, ahoraMs: ahora });
  check("el primer texto se adelanta al tope de 23 h en vez de saltarse", !calAdelanto[0].salta && calAdelanto[0].cuando === ahora - 20 * H + 23 * H);
  const cal7 = calendarioDePasos([{ horas: 1, body: "texto" }, { horas: 2, body: "otro" }], { inicioMs: ahora - 166.5 * H, ultimoMs: ahora - 10 * 60000, ahoraMs: ahora });
  check("un texto también se salta si pasa las 168 h del chat", !cal7[0].salta && cal7[1].salta && /7 días/.test(cal7[1].motivo), JSON.stringify(cal7));

  // 3. Brazo fijo por chat y reparto.
  const brazos = [...Array(2000)].map((_, i) => brazoPorHash(i + 1, 7, 0.5));
  const b = brazos.filter((x) => x === "B").length;
  check("el reparto 50/50 cae cerca del 50 % (entre 44 y 56 %)", b > 880 && b < 1120, String(b));
  check("el mismo chat siempre tiene el mismo brazo", brazoPorHash(123, 7, 0.5) === brazoPorHash(123, 7, 0.5) && brazoPorHash(5, 1, 0) === "A" && brazoPorHash(5, 1, 1) === "B");

  // 4. Con base real: plan con versión B, rápida que lo usa, bienvenida con plan_interesados_id.
  const { sq, db } = baseNueva();
  sq.prepare("INSERT INTO planes_seguimiento (id, nombre, segmento, pasos, version_b, reparto_b) VALUES (7, 'PROV · Sin adelanto', 'provincia', ?, ?, 0.5)")
    .run(JSON.stringify(plan.slice(0, 5)), JSON.stringify([{ horas: 1, body: "B: collar" }, { dia: 2, hora: "20:00", plantilla: "r2" }]));
  sq.prepare("INSERT INTO quick_replies (id, title, body, followup_plan_id) VALUES (901, 'Provincia Msj. 3', 'texto', 7)").run();
  const p1 = await leerPlan(db, 7);
  check("leerPlan devuelve pasos y versión B normalizados", p1.pasos.length === 5 && p1.version_b.length === 2 && p1.reparto_b === 0.5);
  let brazoA = null, brazoB = null;
  for (let id = 20; id < 60 && !(brazoA && brazoB); id++) {
    chat(sq, id, { hace: 10 * 60000, creadoHace: 26 * H });
    const motivo = await programarSeguimientoDeRapida(db, id, 901);
    check(`la rápida con plan programa el chat ${id}`, motivo === null, String(motivo));
    const p = pendientes(sq, id);
    const brazo = p[0]?.plan_brazo;
    if (brazo === "A" && !brazoA) brazoA = { id, p };
    if (brazo === "B" && !brazoB) brazoB = { id, p };
    if (brazoA && brazoB) break;
  }
  check("hay chats en los dos brazos", Boolean(brazoA && brazoB));
  check("el brazo A recibe los pasos del plan, con plan_id, brazo y nº de paso", brazoA.p.every((x) => x.plan_id === 7 && x.plan_brazo === "A") && brazoA.p[0].body === "+45 min" && brazoA.p[0].plan_paso === 0, JSON.stringify(brazoA.p.map((x) => [x.body, x.plan_paso])));
  check("el brazo B recibe su versión", brazoB.p[0].body === "B: collar" && brazoB.p.every((x) => x.plan_brazo === "B"));
  check("el origen lleva el nombre del plan y cuenta como automático", brazoA.p[0].created_by === "Plan de seguimiento · PROV · Sin adelanto" && esOrigenAutomatico(brazoA.p[0].created_by));
  check("la asignación queda guardada", sq.prepare("SELECT brazo FROM plan_asignaciones WHERE plan_id = 7 AND conversation_id = ?").get(brazoB.id)?.brazo === "B");
  // Reactivar en el mismo chat: mismo brazo, una sola cadena (la anterior cancelada).
  await cancelarSeguimientosPendientes(db, brazoB.id);
  await programarPlanEnChat(db, brazoB.id, 7);
  const otra = pendientes(sq, brazoB.id);
  check("al reactivar, el chat sigue en su brazo y queda una sola cadena pendiente", otra.filter((x) => x.status === "pendiente").every((x) => x.plan_brazo === "B") && otra.filter((x) => x.status === "pendiente").length === 2 && otra.filter((x) => x.status === "cancelado").length === 2);
  // Reanudar desde el paso que sigue (dueño, 2026-11-04): el paso 0 ya salió, el cliente respondió (cadena cancelada) y la
  // vendedora manda otra vez una rápida con el mismo plan: la cadena sigue desde el paso 1, y respeta 5 h desde el que salió.
  chat(sq, 80, { hace: 10 * 60000, creadoHace: 20 * H });
  sq.prepare("INSERT INTO plan_asignaciones (plan_id, conversation_id, brazo) VALUES (7, 80, 'A')").run();
  check("la rápida programa el chat 80 (brazo A)", (await programarSeguimientoDeRapida(db, 80, 901)) === null && pendientes(sq, 80)[0].plan_paso === 0);
  sq.prepare("UPDATE scheduled_messages SET status = 'enviado', sent_at = ? WHERE conversation_id = 80 AND plan_paso = 0").run(sqlFecha(Date.now() - 2 * H));
  // Dueño 4/11: el cliente ya no corta la cadena; sí se cancela la sugerencia del asesor. Solo el botón la detiene.
  sq.prepare("INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, status) VALUES (80, 'sugerencia', ?, 'Sugerencia del asesor · x', 'pendiente')").run(new Date(Date.now() + H).toISOString());
  await cancelarSeguimientosPendientes(db, 80);
  const tras80 = pendientes(sq, 80);
  check("cuando el cliente escribe, la cadena del plan sigue y solo se cancela la sugerencia del asesor", tras80.filter((x) => x.status === "pendiente" && x.plan_paso !== null).length === 4 && tras80.find((x) => x.body === "sugerencia")?.status === "cancelado", JSON.stringify(tras80.map((x) => [x.body, x.status])));
  await cancelarSeguimientosDeLead(db, 80); // el botón «Detener»
  check("el botón «Detener» sí cancela la cadena", pendientes(sq, 80).filter((x) => x.status === "pendiente").length === 0);
  check("al mandar otra rápida con el mismo plan, sigue desde el paso 1", (await programarSeguimientoDeRapida(db, 80, 901)) === null);
  const p80 = pendientes(sq, 80).filter((x) => x.status === "pendiente");
  check("no se repite el paso 0; el primero pendiente es el paso 1 (+4 h, ya pasadas las 5 h del que salió)", p80.length > 0 && p80.every((x) => x.plan_paso >= 1) && p80[0].plan_paso === 1 && Math.abs(new Date(p80[0].send_at).getTime() - (Date.now() + 4 * H)) < 60000, JSON.stringify(p80.map((x) => [x.plan_paso, x.send_at])));
  sq.prepare("UPDATE scheduled_messages SET status = 'enviado' WHERE conversation_id = 80").run();
  check("si ya salieron todos los pasos, lo dice y no programa nada", /ya recibió todos/.test(await programarSeguimientoDeRapida(db, 80, 901) || ""));
  // Campaña a chats antiguos (dueño 4/11): el plan arranca «desde hoy» (inicioMs) sin el tope de 168 h; los textos del día 0
  // no salen (sin ventana) y las plantillas caen en los días 2, 3 y 5 contados desde mañana.
  chat(sq, 90, { hace: 40 * DIA, creadoHace: 40 * DIA });
  const inicio90 = Date.now() + DIA;
  const m90 = await (await import(join(root, "src/lib/crm-db.js"))).programarPasosEnChat(db, 90, plan.slice(0, 5), "Plan de seguimiento · PROV · Sin adelanto", { plan_id: 7, brazo: "A", inicioMs: inicio90, sinTope7d: true });
  const p90 = pendientes(sq, 90);
  check("a un chat de hace 40 días se le programan solo las plantillas, contadas desde mañana", m90 === null && p90.length === 3 && p90.every((x) => x.template_name) && new Date(p90[0].send_at).getTime() === medianocheLima(inicio90) + 2 * DIA + 20 * H, `${m90} ${JSON.stringify(p90.map((x) => [x.template_name, x.send_at]))}`);
  // Al marcar compra muere la cadena de venta (dueño 4/11); el recojo de Shalom (plan con plantilla) sigue.
  chat(sq, 95, { hace: 10 * 60000, creadoHace: 2 * H });
  await programarSeguimientoDeRapida(db, 95, 901);
  sq.prepare("INSERT INTO scheduled_messages (conversation_id, body, send_at, created_by, status, template_name) VALUES (95, 'Plantilla: shalom', ?, 'Plan con plantilla · Recojo en Shalom', 'pendiente', 'shalom_recojo_1')").run(new Date(Date.now() + 3 * DIA).toISOString());
  await (await import(join(root, "src/lib/crm-db.js"))).agregarEtiquetaMeta(db, 95, "purchase");
  const p95 = pendientes(sq, 95);
  check("marcar compra cancela los pasos del plan y deja el recojo de Shalom", p95.filter((x) => x.plan_paso !== null).every((x) => x.status === "cancelado") && p95.find((x) => x.template_name === "shalom_recojo_1")?.status === "pendiente", JSON.stringify(p95.map((x) => [x.body, x.status])));
  // La bienvenida con plan_interesados_id programa el plan y no la secuencia vieja.
  sq.prepare("INSERT INTO crm_settings (key, value) VALUES ('plan_interesados_id', '7')").run();
  chat(sq, 70, { hace: 60000, creadoHace: 60000 });
  const n70 = await programarSeguimientoDeInteresados({ CRM_DB: db }, 70);
  check("la bienvenida con plan_interesados_id programa el plan con nombre", n70 === 1 && pendientes(sq, 70).length >= 2 && pendientes(sq, 70)[0].created_by.startsWith("Plan de seguimiento"));
  // Chat ya comprado: nada.
  chat(sq, 71, { hace: 60000, creadoHace: 60000 });
  sq.prepare("UPDATE conversations SET etapa = 5 WHERE id = 71").run();
  check("a quien ya compró no se le programa el plan", /compró/.test(await programarPlanEnChat(db, 71, 7) || "") && !pendientes(sq, 71).length);
  // Toques: la guardia del cron es «sin seguimiento pendiente»; un plan activo cumple esa condición.
  const bloqueado = sq.prepare("SELECT EXISTS (SELECT 1 FROM scheduled_messages s WHERE s.conversation_id = ? AND s.status IN ('pendiente', 'enviando', 'por_aprobar')) AS b").get(brazoA.id).b;
  check("un plan activo deja un pendiente, que es lo que bloquea los toques d2/d7 (toques.js)", bloqueado === 1);
}

console.log("Horario 06:30–23:30");
{
  const lima = (h, m) => medianocheLima(Date.now()) + DIA + h * H + m * 60000; // mañana, hora de Lima
  const HOR = "06:30-23:30";
  check("a las 23:29 se manda", !enSilencio(lima(23, 29), HOR));
  check("a las 23:31 es silencio", enSilencio(lima(23, 31), HOR));
  check("a las 06:29 es silencio y a las 06:31 no", enSilencio(lima(6, 29), HOR) && !enSilencio(lima(6, 31), HOR));
  check("un texto de las 02:00 se corre a las 06:30 si la ventana sigue abierta", horaLima(new Date(ajustarAlHorario(lima(2, 0), lima(12, 0), lima(1, 0), HOR)).toISOString()) === "06:30");
  check("si la ventana cierra antes de las 06:30, se adelanta a las 23:29 de la noche", horaLima(new Date(ajustarAlHorario(lima(2, 0), lima(4, 0), lima(1, 0) - DIA, HOR)).toISOString()) === "23:29");
  check("una plantilla (sin ventana) se corre a las 06:30", horaLima(new Date(ajustarAlHorario(lima(23, 45), null, lima(23, 40), HOR)).toISOString()) === "06:30");
}

console.log(fallas ? `\n${fallas} prueba(s) fallaron.` : "\nTodo en orden.");
process.exit(fallas ? 1 : 0);

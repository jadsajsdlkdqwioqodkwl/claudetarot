// Pruebas de src/api/llamadas-uro.js con una base D1 falsa (sin red).
//   node --test scripts/pruebas/llamadas-uro.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { onRequestPostAsesor, onRequestGetAsesor, handlersCrm } from "../../src/api/llamadas-uro.js";

const CLAVE = "a".repeat(40);
async function sha256Hex(texto) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function bdFalsa() {
  const sentencias = [];
  const filas = new Map();
  return {
    sentencias, filas,
    prepare(sql) {
      return {
        sql,
        bind(...args) { this.args = args; return this; },
        run() {
          sentencias.push({ sql, args: this.args });
          const wa = this.args?.[this.args.length - 1];
          if (/^UPDATE/.test(sql) && filas.has(wa)) {
            Object.assign(filas.get(wa), { llamada: this.args[0], llamada_fecha: this.args[1], llamada_por: this.args[2] });
            return Promise.resolve({ meta: { changes: 1 } });
          }
          return Promise.resolve({ meta: { changes: 0 } });
        },
        all() { return Promise.resolve({ results: [...filas.values()] }); }
      };
    },
    batch(lote) {
      for (const s of lote) {
        sentencias.push({ sql: s.sql, args: s.args });
        const wa = s.args[0];
        const previo = filas.get(wa) || { llamada: 0, llamada_fecha: "", llamada_por: "" };
        filas.set(wa, { ...previo, wa, ultimo_cliente: s.args[5], resumen: s.args[9], speech: s.args[10] });
      }
      return Promise.resolve([]);
    }
  };
}

async function entorno() {
  return { ASESOR_CLAVE_SHA256: await sha256Hex(CLAVE), CRM_DB: bdFalsa() };
}
const peticion = (body, headers = {}) => new Request("https://x/api", {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body)
});

test("sin la clave de asesor no entra", async () => {
  const env = await entorno();
  const r = await onRequestPostAsesor({ request: peticion({ writes: [] }), env });
  assert.equal(r.status, 401);
});

test("el upsert nunca escribe las columnas del check", async () => {
  const env = await entorno();
  const lote = { writes: [{ op: "set", doc_id: "51987654321", data: {
    nombre: "Ana", telefono: "+51 987 654 321", interes: "Alta", ultimo_cliente: "2026-10-15 10:00",
    resumen: "Preguntó precio.", speech: "Buenos días.", llamada: true, llamada_por: "hackeo" } }] };
  const r = await onRequestPostAsesor({ request: peticion(lote, { "x-asesor-clave": CLAVE }), env });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { guardados: 1, rechazados: [] });
  const sql = env.CRM_DB.sentencias[0].sql;
  assert.doesNotMatch(sql, /\bllamada\b|llamada_(fecha|por)/);
});

test("rechaza un doc_id que no es un número de WhatsApp", async () => {
  const env = await entorno();
  const r = await onRequestPostAsesor({ request: peticion({ writes: [{ doc_id: "abc", data: {} }] }, { "x-asesor-clave": CLAVE }), env });
  assert.deepEqual(await r.json(), { guardados: 0, rechazados: ["abc"] });
});

test("GET para la Routine devuelve los documentos con ultimo_cliente", async () => {
  const env = await entorno();
  env.CRM_DB.filas.set("51987654321", { wa: "51987654321", ultimo_cliente: "2026-10-15 10:00" });
  const r = await onRequestGetAsesor({ request: new Request("https://x/api?ya=1", { headers: { "x-asesor-clave": CLAVE } }), env });
  assert.deepEqual(await r.json(), { documentos: [{ id: "51987654321", data: { ultimo_cliente: "2026-10-15 10:00" } }] });
});

test("el check guarda quién y cuándo, y se puede desmarcar", async () => {
  const env = await entorno();
  env.CRM_DB.filas.set("51987654321", { wa: "51987654321", llamada: 0, llamada_fecha: "", llamada_por: "" });
  const agent = { displayName: "Veronika", username: "veronika" };
  const pedir = (llamada) => new Request("https://x/api/crm/llamadas-uro/check", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wa: "51987654321", llamada })
  });
  let r = await handlersCrm.check({ request: pedir(true), env, agent });
  assert.equal(r.status, 200);
  assert.equal(env.CRM_DB.filas.get("51987654321").llamada, 1);
  assert.equal(env.CRM_DB.filas.get("51987654321").llamada_por, "Veronika");
  r = await handlersCrm.check({ request: pedir(false), env, agent });
  assert.equal(env.CRM_DB.filas.get("51987654321").llamada, 0);
});

test("marcar un número que no está en la lista responde 404", async () => {
  const env = await entorno();
  const r = await handlersCrm.check({
    request: new Request("https://x/api", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wa: "51900000000", llamada: true }) }),
    env, agent: { username: "x" }
  });
  assert.equal(r.status, 404);
});

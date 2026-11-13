// Oferta de collar extra una sola vez por chat (dueño 2026-11-13): el paso del día 5 no sale a quien ya la recibió.
import assert from "node:assert/strict";
import { ofreceCollarExtra, yaRecibioOfertaCollar, PLANTILLAS_OFERTA_COLLAR } from "../src/lib/oferta-collar.js";

let ok = 0;
const t = (n, f) => { f(); ok++; console.log("✓ " + n); };

t("el seguimiento de +20 h de la respuesta rápida cuenta como oferta", () =>
  assert.ok(ofreceCollarExtra("Hola, bell@ 🩷🤗 Si aún desea aprovechar la promoción, *separando tu pedido HOY* le obsequiaremos además un 🎁 *COLLAR AMULETO de carta de Tarot EXTRA*")));
t("la versión «totalmente GRATIS» también cuenta", () =>
  assert.ok(ofreceCollarExtra("te llevas además un 🎁 **COLLAR AMULETO de carta de Tarot totalmente GRATIS**, valorizado en **S/20**")));
t("la plantilla del día 5 cuenta", () => assert.ok(ofreceCollarExtra("se lo enviamos con las clases, los libros y un collar amuleto extra 🫶")));
t("la bienvenida (collar incluido en el kit) no cuenta", () =>
  assert.ok(!ofreceCollarExtra("✅ *Collar amuleto* carta de tarot para protección\n\n🎁 Clases de Tarot grabadas y material imprimible (manuales con información adicional)")));
t("la plantilla del día 5 está en la lista", () => assert.ok(PLANTILLAS_OFERTA_COLLAR.includes("seg_d5_ultimo_bono")));

const db = (plantilla, cuerpos) => ({
  prepare: (sql) => ({
    bind: () => ({
      first: async () => (sql.includes("template_name IN") ? (plantilla ? { 1: 1 } : null) : null),
      all: async () => ({ results: cuerpos.map((body) => ({ body })) })
    })
  })
});
t("chat con el collar de la respuesta rápida: ya recibió", async () => assert.ok(await yaRecibioOfertaCollar(db(false, ["Si aún desea… *COLLAR AMULETO de carta de Tarot EXTRA*"]), 1)));
assert.equal(await yaRecibioOfertaCollar(db(false, ["Hola ☺️ ¿para qué distrito sería?"]), 1), false); ok++; console.log("✓ chat sin oferta: el día 5 sí sale");
assert.equal(await yaRecibioOfertaCollar(db(true, []), 1), true); ok++; console.log("✓ chat que ya recibió la plantilla de oferta: no se repite");
console.log(`\n${ok} pruebas de la oferta de collar en orden.`);

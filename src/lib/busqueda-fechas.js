/**
 * Fechas dentro del buscador del CRM (2026-10-18): «venta del 15/10», «15/10», «ayer», «10/10 al 12/10»,
 * «ventas 15 oct», «2026-10-15». Las fechas se leen en hora de Lima (UTC-5).
 *   - Con la palabra venta/ventas/compra/compró/vendió: chats cuya compra (evento Purchase) cae en esos días.
 *   - Sin ella: chats con algún mensaje (de cualquiera) en esos días.
 * Devuelve { resto, desde, hasta, tipo } con `resto` = el texto sin la fecha ni la palabra de venta (para
 * seguir buscando por nombre, número, etc.), `desde`/`hasta` = 'AAAA-MM-DD' (inclusive); sin fecha, null.
 */
const MESES = { ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6,
  jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, set: 9, sept: 9, septiembre: 9, setiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12 };
const NOMBRES_MES = Object.keys(MESES).sort((a, b) => b.length - a.length).join("|");

const dos = (n) => String(n).padStart(2, "0");
const iso = (a, m, d) => `${a}-${dos(m)}-${dos(d)}`;
function valida(a, m, d) {
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

export function limaHoy(ahoraMs = Date.now()) {
  const l = new Date(ahoraMs - 5 * 3600 * 1000);
  return { a: l.getUTCFullYear(), m: l.getUTCMonth() + 1, d: l.getUTCDate() };
}

/** Un día suelto con el año que falte: el actual, o el anterior si así quedaría en el futuro. */
function armar(d, m, a, hoy) {
  if (a == null) {
    a = hoy.a;
    if (m > hoy.m || (m === hoy.m && d > hoy.d)) a -= 1;
  } else if (a < 100) a += 2000;
  return valida(a, m, d) ? iso(a, m, d) : null;
}

function sumarDias(fecha, n) {
  const [a, m, d] = fecha.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + n));
  return iso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
}

export function extraerFechas(q, ahoraMs = Date.now()) {
  let texto = String(q || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hoy = limaHoy(ahoraMs);
  const hoyIso = iso(hoy.a, hoy.m, hoy.d);
  const un = [
    // 2026-10-15
    [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (m) => armar(+m[3], +m[2], +m[1], hoy)],
    // 15/10, 15/10/2026, 15-10, 15.10.26
    [/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/, (m) => armar(+m[1], +m[2], m[3] ? +m[3] : null, hoy)],
    // 15 oct, 15 de octubre, 15 oct 2026
    [new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${NOMBRES_MES})\\b(?:\\s*(?:de\\s+)?(\\d{4}))?`), (m) => armar(+m[1], MESES[m[2]], m[3] ? +m[3] : null, hoy)],
    [/\banteayer\b/, () => sumarDias(hoyIso, -2)],
    [/\bayer\b/, () => sumarDias(hoyIso, -1)],
    [/\bhoy\b/, () => hoyIso]
  ];
  const hallar = (t) => {
    for (const [re, f] of un) {
      const m = re.exec(t);
      if (m) { const dia = f(m); if (dia) return { dia, ini: m.index, fin: m.index + m[0].length }; }
    }
    return null;
  };
  let primero = hallar(texto);
  if (!primero) return { resto: String(q || "").trim(), desde: null, hasta: null, tipo: null };
  let desde = primero.dia;
  let hasta = primero.dia;
  let corte = [primero.ini, primero.fin];
  // Rango: «10/10 al 12/10», «del 10/10 al 12/10» (también «a», «hasta»).
  const despues = texto.slice(primero.fin);
  const r = /^\s*(?:al|a|hasta|-)\s+/.exec(despues);
  if (r) {
    const segundo = hallar(despues.slice(r[0].length));
    if (segundo && segundo.ini === 0) {
      hasta = segundo.dia;
      corte = [primero.ini, primero.fin + r[0].length + segundo.fin];
    }
  }
  if (hasta < desde) [desde, hasta] = [hasta, desde];
  let resto = texto.slice(0, corte[0]) + " " + texto.slice(corte[1]);
  const esVenta = /\b(ventas?|compras?|compro|compraron|vendio|vendimos)\b/.test(resto);
  resto = resto.replace(/\b(ventas?|compras?|compro|compraron|vendio|vendimos|del|de|el|dia|desde)\b/g, " ").replace(/\s+/g, " ").trim();
  return { resto, desde, hasta, tipo: esVenta ? "compra" : "actividad" };
}

/** Los límites en UTC (texto como lo guarda D1) del rango de días de Lima: [inicio, fin). */
export function limitesUtc(desde, hasta) {
  return [`${desde} 05:00:00`, `${sumarDias(hasta, 1)} 05:00:00`];
}

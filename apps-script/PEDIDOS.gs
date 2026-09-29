/**
 * Botón "Sacar pedidos" — va en el MISMO proyecto que ASESOR.gs (la hoja de
 * chats) y usa sus funciones: agruparChats, leerDia_, esAutomatico, prop_.
 *
 * APAGADO: clasificaba los chats llamando a la API de Anthropic, que se
 * cobra por uso aparte del plan. Los pedidos los saca ahora la Routine de
 * las 21:00/22:30 con el plan de Claude (docs/asesor.md). Quedan las
 * funciones puras (las prueba npm run check:gs) por si se reusan.
 *
 * Que no se pase ninguno: cada chat enviado tiene que volver clasificado. Si
 * Claude omite uno, o un lote falla, ese chat entra igual a la pestaña como
 * "REVISAR A MANO" con el motivo. Nunca desaparece en silencio.
 */

const PEDIDOS = {
  PESTANA: "Pedidos IA",
  RE_PESTANA_DIA: /^(\d{2})-(\d{2})-(\d{4})$/,
  SALUDO_ANUNCIO: /^¡?hola!? me gustar[ií]a m[aá]s informaci[oó]n\.?$/i,
  MAX_CHARS_LOTE: 24000,
  MAX_CHARS_CLIENTE: 400,
  MAX_CHARS_EQUIPO: 160,
  ORDEN: ["CONFIRMADO", "POR_CONFIRMAR", "OTRO_DIA", "REVISAR A MANO", "INTENCION", "EN_TRANSITO", "ENTREGADO", "DESCARTAR"],
  COLORES: { CONFIRMADO: "#d9f2d9", POR_CONFIRMAR: "#fff2cc", OTRO_DIA: "#dde8f7", "REVISAR A MANO": "#f8d0d0", INTENCION: "#fbe5d6" }
};

/* ───────────────────────── Menú (lo cuelga el onOpen de ASESOR.gs) ───────────────────────── */

function pedidosParaManana() { sacarPedidos_(1); }
function pedidosParaHoy() { sacarPedidos_(0); }

/* ───────────────────────── Lógica pura (npm run check:gs) ───────────────────────── */

/** Vale la pena leerlo: el cliente dijo algo más que el saludo del anuncio, o le respondió una persona. */
function chatRelevante(c) {
  const delCliente = c.mensajes.filter((m) => m.quien === "Cliente");
  if (!delCliente.length) return false;
  const soloSaludo = delCliente.every((m) => PEDIDOS.SALUDO_ANUNCIO.test(String(m.msg || "").trim()));
  const hablaPersona = c.mensajes.some((m) => m.quien !== "Cliente" && !esAutomatico(m.vendedor));
  return !soloSaludo || hablaPersona;
}

/** Transcripción mínima: sin mensajes automáticos, lo del equipo recortado, lo del cliente casi entero. */
function transcripcionChat(c) {
  const lineas = [];
  let anterior = "";
  for (const m of c.mensajes) {
    const esCliente = m.quien === "Cliente";
    if (!esCliente && esAutomatico(m.vendedor)) continue;
    let cuerpo = String(m.msg || "").replace(/\s+/g, " ").trim();
    if (!cuerpo) cuerpo = "[" + (m.tipo || "text") + "]";
    else if (m.tipo === "image" && esCliente) cuerpo = "[imagen] " + cuerpo;
    cuerpo = cuerpo.slice(0, esCliente ? PEDIDOS.MAX_CHARS_CLIENTE : PEDIDOS.MAX_CHARS_EQUIPO);
    const linea = String(m.fecha).slice(5, 16) + " " + (esCliente ? "C" : "V(" + (m.vendedor || "?") + ")") + ": " + cuerpo;
    if (linea !== anterior) lineas.push(linea);
    anterior = linea;
  }
  return "=== " + c.wa + " | " + (c.nombre || "sin nombre") + "\n" + lineas.join("\n");
}

/** Reparte los chats en lotes que no pasen de maxChars (un chat enorme va solo). */
function lotesDeChats(chats, maxChars) {
  const lotes = [];
  let actual = [], tam = 0;
  for (const c of chats) {
    const t = transcripcionChat(c);
    if (actual.length && tam + t.length > maxChars) { lotes.push(actual); actual = []; tam = 0; }
    actual.push({ wa: c.wa, nombre: c.nombre, texto: t });
    tam += t.length;
  }
  if (actual.length) lotes.push(actual);
  return lotes;
}

/**
 * Une lo que devolvió Claude con lo que se le mandó. Cada chat del lote sale
 * exactamente una vez: si Claude lo omitió, sale como REVISAR A MANO.
 */
function completarLote(lote, pedidos, motivoSiFalta) {
  // Se compara por los últimos 9 dígitos: Claude a veces quita o agrega el 51.
  const clave = (wa) => String(wa || "").replace(/\D/g, "").slice(-9);
  const porWa = {};
  for (const p of pedidos || []) {
    const k = clave(p.whatsapp);
    if (k && !porWa[k]) porWa[k] = p;
  }
  return lote.map((c) => porWa[clave(c.wa)] ? Object.assign({}, porWa[clave(c.wa)], { whatsapp: c.wa }) : {
    whatsapp: c.wa, nombre: c.nombre, estado: "REVISAR A MANO", destino: "DESCONOCIDO", fecha_entrega: "",
    dni: "", telefono: "", direccion_o_agencia: "", courier: "", kits: 0, pago: "", falta: "", nota: motivoSiFalta
  });
}

function ordenarPedidos(filas) {
  const rango = (e) => { const i = PEDIDOS.ORDEN.indexOf(e); return i < 0 ? 99 : i; };
  return filas.slice().sort((a, b) => (rango(a.estado) - rango(b.estado)) || String(a.destino).localeCompare(String(b.destino)));
}

/* ───────────────────────── Google + Claude ───────────────────────── */

function pestanasDiarias_(dias) {
  const hoy = new Date();
  const limite = new Date(hoy.getTime() - dias * 86400000);
  return SpreadsheetApp.getActive().getSheets().map((h) => h.getName()).filter((n) => {
    const m = n.match(PEDIDOS.RE_PESTANA_DIA);
    return m && new Date(+m[3], +m[2] - 1, +m[1]) >= new Date(limite.getFullYear(), limite.getMonth(), limite.getDate());
  });
}

function sacarPedidos_() {
  avisar_("Esto ya no corre aquí (usaba la API de Claude, que se cobra aparte). Los pedidos llegan por Telegram y a CRM → Reportes desde la Routine del asesor.");
}

function escribirPedidos_(pedidos, objetivoTxt, total, leidos) {
  const ss = SpreadsheetApp.getActive();
  const hoja = ss.getSheetByName(PEDIDOS.PESTANA) || ss.insertSheet(PEDIDOS.PESTANA, 0);
  hoja.clear();
  const enc = ["Estado", "Destino", "Fecha entrega", "Nombre", "WhatsApp", "Teléfono recibe", "DNI", "Dirección / Agencia", "Courier", "Kits", "Pago", "Falta", "Nota"];
  const cuenta = (e) => pedidos.filter((p) => p.estado === e).length;
  hoja.getRange(1, 1).setValue("Pedidos para " + objetivoTxt + " — generado " + Utilities.formatDate(new Date(), ASESOR.ZONA, "dd/MM HH:mm") +
    " · " + leidos + " de " + total + " chats leídos · ✅ " + cuenta("CONFIRMADO") + " confirmados · 🟡 " + cuenta("POR_CONFIRMAR") +
    " por confirmar · ❗ " + cuenta("REVISAR A MANO") + " revisar a mano").setFontWeight("bold");
  hoja.getRange(2, 1, 1, enc.length).setValues([enc]).setFontWeight("bold").setBackground("#333").setFontColor("#fff");
  if (pedidos.length) {
    const valores = pedidos.map((p) => [p.estado, p.destino, p.fecha_entrega, p.nombre, p.whatsapp, p.telefono, p.dni,
      p.direccion_o_agencia, p.courier, p.kits || "", p.pago, p.falta, p.nota]);
    hoja.getRange(3, 1, valores.length, enc.length).setNumberFormat("@").setValues(valores);
    pedidos.forEach((p, i) => { const c = PEDIDOS.COLORES[p.estado]; if (c) hoja.getRange(3 + i, 1, 1, enc.length).setBackground(c); });
  }
  hoja.setFrozenRows(2);
  hoja.autoResizeColumns(1, enc.length);
  ss.setActiveSheet(hoja);
}

/**
 * Botón "Sacar pedidos" — va en el MISMO proyecto que ASESOR.gs (la hoja de
 * chats) y usa sus funciones: agruparChats, leerDia_, esAutomatico, prop_.
 *
 * Un clic: lee todas las pestañas diarias de los últimos DIAS_PEDIDOS días,
 * arma una transcripción corta por cliente y se la pasa a Claude en lotes
 * paralelos. Claude clasifica cada chat y saca los datos de envío; el
 * resultado se escribe en la pestaña "Pedidos IA".
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

function sacarPedidos_(diasAdelante) {
  const key = prop_("ANTHROPIC_API_KEY", "");
  if (!key) return avisar_("Falta ANTHROPIC_API_KEY en Propiedades del script.");

  const hoy = new Date();
  const objetivo = new Date(hoy.getTime() + diasAdelante * 86400000);
  const hoyTxt = Utilities.formatDate(hoy, ASESOR.ZONA, "yyyy-MM-dd (EEEE)");
  const objetivoTxt = Utilities.formatDate(objetivo, ASESOR.ZONA, "yyyy-MM-dd (EEEE)");

  const ss = SpreadsheetApp.getActive();
  const filas = [];
  pestanasDiarias_(+prop_("DIAS_PEDIDOS", "7")).forEach((n) => {
    const m = n.match(PEDIDOS.RE_PESTANA_DIA);
    filas.push.apply(filas, leerDia_(new Date(+m[3], +m[2] - 1, +m[1], 12)));
  });
  const todos = Array.from(agruparChats(filas).values());
  const relevantes = todos.filter(chatRelevante);
  const lotes = lotesDeChats(relevantes, PEDIDOS.MAX_CHARS_LOTE);
  ss.toast(relevantes.length + " chats en " + lotes.length + " lotes. Claude está leyendo…", "Pedidos", 30);

  const resultados = llamarClaudeEnParalelo_(key, lotes, hoyTxt, objetivoTxt);
  const pedidos = [];
  lotes.forEach((lote, i) => {
    const r = resultados[i];
    pedidos.push.apply(pedidos, completarLote(lote, r.pedidos, r.error ? "El lote falló: " + r.error : "Claude no lo clasificó"));
  });

  escribirPedidos_(ordenarPedidos(pedidos), objetivoTxt, todos.length, relevantes.length);
  const n = (e) => pedidos.filter((p) => p.estado === e).length;
  ss.toast("Confirmados: " + n("CONFIRMADO") + " · Por confirmar: " + n("POR_CONFIRMAR") + " · Revisar a mano: " + n("REVISAR A MANO"), "Pedidos listos", 15);
}

function llamarClaudeEnParalelo_(key, lotes, hoyTxt, objetivoTxt) {
  const system =
    "Eres el asesor logístico de Tarot Store Perú. Vendemos kits de tarot por WhatsApp (S/89, a veces S/79 o S/139 el plastificado). " +
    "Lima: entrega por motorizado de 12 a 5 pm al día siguiente, pago contraentrega. Provincia: por Shalom u Olva con adelanto de S/20 (a veces S/10 para separar) y el saldo al recoger.\n\n" +
    "Clasifica CADA chat que recibes, sin saltarte ninguno, con estas reglas:\n" +
    "- CONFIRMADO: Lima si el cliente dio dirección o ubicación y la vendedora lo agendó para la fecha objetivo. Provincia si mandó la captura del adelanto ([imagen] después de que le pidieron el pago) y dio nombre, DNI y agencia, y aún no se le envió el comprobante de Shalom/Olva. Las vendedoras a veces se olvidan de marcar la venta: guíate por la conversación.\n" +
    "- POR_CONFIRMAR: prometió pagar o dar datos para la fecha objetivo, o falta un dato para despachar (dirección, teléfono, DNI, agencia) o hay una duda (monto, horario, captura dudosa).\n" +
    "- OTRO_DIA: pidió otra fecha concreta; pon esa fecha en fecha_entrega (yyyy-mm-dd).\n" +
    "- EN_TRANSITO: ya se despachó o se agendó para un día anterior (Lima o provincia).\n" +
    "- ENTREGADO: ya recogió, recibió o pagó todo.\n" +
    "- INTENCION: mostró interés real (dijo lugar, pidió yape, dijo que quiere) pero no concretó.\n" +
    "- DESCARTAR: solo preguntó el precio, dijo que no, spam o prueba interna.\n" +
    "Un pedido agendado o despachado para un día anterior a la fecha objetivo es EN_TRANSITO: la entrega la sigue el courier en su plataforma, no la confirmamos por chat.\n" +
    "Copia los datos tal como los escribió el cliente. Si no hay un dato, deja el texto vacío. En 'falta' pon qué falta para despachar; en 'nota', lo que el repartidor o la vendedora deban saber (horario, precio especial, número de kits, vía aérea). " +
    "Responde con un solo objeto por cada chat, usando el número de WhatsApp de la cabecera '=== número | nombre'.";

  const schema = {
    type: "object", additionalProperties: false, required: ["pedidos"],
    properties: { pedidos: { type: "array", items: {
      type: "object", additionalProperties: false,
      required: ["whatsapp", "nombre", "estado", "destino", "fecha_entrega", "dni", "telefono", "direccion_o_agencia", "courier", "kits", "pago", "falta", "nota"],
      properties: {
        whatsapp: { type: "string" }, nombre: { type: "string" },
        estado: { type: "string", enum: ["CONFIRMADO", "POR_CONFIRMAR", "OTRO_DIA", "EN_TRANSITO", "ENTREGADO", "INTENCION", "DESCARTAR"] },
        destino: { type: "string", enum: ["LIMA", "PROVINCIA", "DESCONOCIDO"] },
        fecha_entrega: { type: "string" }, dni: { type: "string" }, telefono: { type: "string" },
        direccion_o_agencia: { type: "string" }, courier: { type: "string" }, kits: { type: "integer" },
        pago: { type: "string" }, falta: { type: "string" }, nota: { type: "string" }
      }
    } } }
  };

  const pedir = (lote) => ({
    url: "https://api.anthropic.com/v1/messages",
    method: "post", contentType: "application/json", muteHttpExceptions: true,
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-beta": "server-side-fallback-2026-07-01" },
    payload: JSON.stringify({
      model: prop_("CLAUDE_MODEL", ASESOR.MODELO_DEFAULT),
      max_tokens: 16000,
      output_config: { effort: prop_("CLAUDE_EFFORT_PEDIDOS", "low"), format: { type: "json_schema", schema: schema } },
      fallbacks: "default",
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "Hoy es " + hoyTxt + ". Fecha objetivo: " + objetivoTxt + ".\n" + lote.length + " chats:\n\n" + lote.map((c) => c.texto).join("\n\n") }]
    })
  });

  const leer = (res) => {
    try {
      const cuerpo = JSON.parse(res.getContentText() || "{}");
      if (res.getResponseCode() !== 200) return { error: (cuerpo.error && cuerpo.error.message) || "HTTP " + res.getResponseCode() };
      if (cuerpo.stop_reason === "refusal") return { error: "el modelo declinó el lote" };
      if (cuerpo.stop_reason === "max_tokens") return { error: "respuesta cortada (lote muy grande)" };
      const texto = (cuerpo.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      return { pedidos: JSON.parse(texto).pedidos };
    } catch (err) {
      return { error: String(err.message || err) };
    }
  };

  let resultados = UrlFetchApp.fetchAll(lotes.map(pedir)).map(leer);
  // Un reintento para los que fallaron (saturación, timeout).
  const fallidos = resultados.map((r, i) => r.error ? i : -1).filter((i) => i >= 0);
  if (fallidos.length) {
    const otra = UrlFetchApp.fetchAll(fallidos.map((i) => pedir(lotes[i]))).map(leer);
    fallidos.forEach((i, k) => { if (!otra[k].error) resultados[i] = otra[k]; });
  }
  return resultados;
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

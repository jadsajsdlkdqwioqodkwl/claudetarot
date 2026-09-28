/**
 * Asesor logístico — va en la hoja de chats (TAROT CHATS - VENTAS CRM), NO en
 * la de Pedidos/Ventas: es otro libro y otro proyecto de Apps Script.
 *
 * Lee las pestañas diarias (22-09-2026, 23-09-2026, …) que el Worker escribe
 * cada 10 min y hace dos cosas:
 *
 *   1. Alertas al equipo por Telegram, cada 30 min en horario de atención:
 *      clientes esperando respuesta, pedidos del catálogo sin atender y
 *      ventanas de 24 h a punto de cerrarse. Cero tokens, cero mensajes al
 *      cliente: el aviso va a las vendedoras, nunca al número de WhatsApp.
 *   2. Reporte del día anterior, cada mañana: métricas calculadas aquí (gratis)
 *      y, si hay ANTHROPIC_API_KEY, UNA sola llamada a Claude con un resumen
 *      comprimido de los chats para las recomendaciones CRO.
 *
 * El envío automático al cliente (carrito abandonado) NO vive aquí: lo hace el
 * Worker, que tiene el token de WhatsApp, sabe si la ventana de 24 h sigue
 * abierta y deja el mensaje registrado en el CRM. Ver src/lib/crm-carrito.js.
 */

const ASESOR = {
  ZONA: "America/Lima",
  PESTANA_REPORTES: "Reportes IA",
  // Columnas de las pestañas diarias (0-based). Las escribe crm-sheets-export.js.
  COL: { FECHA: 0, WA: 1, NOMBRE: 2, QUIEN: 3, VENDEDOR: 4, TIPO: 5, MSG: 6, ORIGEN: 7, ANUNCIO: 8, CTWA: 9, NOTAS: 10, ASESORA: 11, EMBUDO: 13 },
  // Mensajes que manda el sistema, no una persona: no cuentan como respuesta.
  RE_AUTOMATICO: /autom[aá]tic|masivo|carrito/i,
  MODELO_DEFAULT: "claude-opus-5",
  // Cuánto de cada chat viaja a Claude: lo justo para entender qué pasó.
  MAX_CHATS_IA: 40,
  MAX_MSGS_POR_CHAT: 14,
  MAX_CHARS_MSG: 160
};

/* ───────────────────────── Menú ───────────────────────── */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Asesor")
    .addItem("📦 Sacar pedidos para mañana (Claude)", "pedidosParaManana")
    .addItem("📦 Sacar pedidos para hoy (Claude)", "pedidosParaHoy")
    .addSeparator()
    .addItem("Reporte de ayer (ahora)", "reporteDeAyer")
    .addItem("Reporte de hoy hasta ahora", "reporteDeHoy")
    .addItem("Revisar alertas ahora", "revisarAlertas")
    .addSeparator()
    .addItem("Activar automatismos", "activarAsesor")
    .addItem("Desactivar automatismos", "desactivarAsesor")
    .addItem("Probar Telegram", "probarTelegram_")
    .addToUi();
}

function activarAsesor() {
  desactivarAsesor();
  ScriptApp.newTrigger("revisarAlertas").timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger("reporteDeAyer").timeBased().atHour(8).nearMinute(5).everyDays(1).inTimezone(ASESOR.ZONA).create();
  avisar_("✅ Asesor activo: alertas cada 30 min y reporte diario a las 8:00 (Lima).");
}

function desactivarAsesor() {
  ScriptApp.getProjectTriggers()
    .filter((t) => ["revisarAlertas", "reporteDeAyer"].includes(t.getHandlerFunction()))
    .forEach((t) => ScriptApp.deleteTrigger(t));
}

/* ───────────────────────── Lógica pura (se prueba con npm run check:gs) ───────────────────────── */

/** "2026-09-22 12:37:12" → minutos desde época, tratándolo como hora de Lima (sin zona). */
function minutosDe(texto) {
  const m = String(texto || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 60000;
}

function esAutomatico(vendedor) {
  return ASESOR.RE_AUTOMATICO.test(String(vendedor || ""));
}

/**
 * Agrupa las filas por cliente. `filas` son objetos { fecha, wa, nombre, quien,
 * vendedor, tipo, msg, ctwa, anuncio, embudo, asesora } con `fecha` en texto
 * "yyyy-MM-dd HH:mm:ss" de Lima, ya ordenadas o no.
 */
function agruparChats(filas) {
  const chats = new Map();
  const ordenadas = filas.filter((f) => f.wa && !isNaN(minutosDe(f.fecha)))
    .sort((a, b) => minutosDe(a.fecha) - minutosDe(b.fecha));
  for (const f of ordenadas) {
    const t = minutosDe(f.fecha);
    let c = chats.get(f.wa);
    if (!c) {
      c = { wa: f.wa, nombre: f.nombre || "", deAnuncio: false, anuncio: "", embudo: "", asesora: "",
            msgsCliente: 0, msgsEquipo: 0, msgsAuto: 0, pedidos: [], vendedoras: {},
            ultimoCliente: null, ultimoEquipo: null, ultimoQuien: "", ultimoTipo: "",
            primerCliente: null, primeraRespuestaMin: null, esperandoDesde: null, mensajes: [] };
      chats.set(f.wa, c);
    }
    if (f.nombre && f.nombre !== ".") c.nombre = f.nombre;
    if (f.ctwa) c.deAnuncio = true;
    if (f.anuncio) c.anuncio = f.anuncio;
    if (f.embudo) c.embudo = f.embudo;
    if (f.asesora) c.asesora = f.asesora;
    c.mensajes.push(f);

    if (f.quien === "Cliente") {
      c.msgsCliente++;
      c.ultimoCliente = t;
      if (c.primerCliente === null) c.primerCliente = t;
      if (c.esperandoDesde === null) c.esperandoDesde = t;
      if (f.tipo === "order") c.pedidos.push({ t, detalle: f.msg });
      c.ultimoQuien = "Cliente";
    } else if (esAutomatico(f.vendedor)) {
      c.msgsAuto++; // no cierra la espera: un bot no atiende
    } else {
      c.msgsEquipo++;
      c.ultimoEquipo = t;
      if (f.vendedor) c.vendedoras[f.vendedor] = (c.vendedoras[f.vendedor] || 0) + 1;
      if (c.esperandoDesde !== null && c.primeraRespuestaMin === null && c.primerCliente !== null) {
        c.primeraRespuestaMin = t - c.primerCliente;
      }
      c.esperandoDesde = null;
      c.ultimoQuien = "Equipo";
    }
    c.ultimoTipo = f.tipo;
  }
  return chats;
}

const tieneEtiqueta = (c, e) => (" " + (c.embudo || "") + " ").indexOf(" " + e + " ") >= 0;

/** Métricas del día sin gastar un token. */
function metricasDelDia(chats) {
  const lista = Array.from(chats.values());
  const clientes = lista.filter((c) => c.msgsCliente > 0);
  const tiempos = clientes.map((c) => c.primeraRespuestaMin).filter((x) => x !== null).sort((a, b) => a - b);
  const porVendedora = {};
  for (const c of lista) {
    for (const v of Object.keys(c.vendedoras)) {
      porVendedora[v] = porVendedora[v] || { chats: 0, mensajes: 0, ventas: 0 };
      porVendedora[v].chats++;
      porVendedora[v].mensajes += c.vendedoras[v];
      if (tieneEtiqueta(c, "purchase")) porVendedora[v].ventas++;
    }
  }
  const porAnuncio = {};
  for (const c of clientes.filter((x) => x.deAnuncio)) {
    const k = c.anuncio || "(sin título)";
    porAnuncio[k] = porAnuncio[k] || { chats: 0, pedidos: 0, ventas: 0 };
    porAnuncio[k].chats++;
    if (c.pedidos.length) porAnuncio[k].pedidos++;
    if (tieneEtiqueta(c, "purchase")) porAnuncio[k].ventas++;
  }
  const ventas = clientes.filter((c) => tieneEtiqueta(c, "purchase")).length;
  const conPedido = clientes.filter((c) => c.pedidos.length > 0);
  return {
    chatsConCliente: clientes.length,
    deAnuncio: clientes.filter((c) => c.deAnuncio).length,
    conPedidoCatalogo: conPedido.length,
    pedidoSinVenta: conPedido.filter((c) => !tieneEtiqueta(c, "purchase")).length,
    interes: clientes.filter((c) => tieneEtiqueta(c, "lead")).length,
    ventas,
    conversion: clientes.length ? Math.round((ventas / clientes.length) * 1000) / 10 : 0,
    sinRespuesta: clientes.filter((c) => c.ultimoQuien === "Cliente").length,
    respuestaMedianaMin: tiempos.length ? Math.round(tiempos[Math.floor(tiempos.length / 2)]) : null,
    respuestaLentas: tiempos.filter((x) => x > 30).length,
    porVendedora,
    porAnuncio
  };
}

/**
 * Qué requiere acción ahora. `ahora` en minutos (misma escala que minutosDe).
 * `esperaMin`: cuánto puede esperar un cliente antes de avisar.
 */
function detectarAlertas(chats, ahora, esperaMin) {
  const out = { esperando: [], pedidosSinAtender: [], ventanaPorCerrar: [] };
  for (const c of chats.values()) {
    if (c.ultimoCliente === null || tieneEtiqueta(c, "purchase")) continue;
    if (c.ultimoQuien === "Cliente" && c.esperandoDesde !== null) {
      const espera = ahora - c.esperandoDesde;
      if (espera >= esperaMin && espera < 24 * 60) {
        (c.pedidos.some((p) => p.t >= c.esperandoDesde) ? out.pedidosSinAtender : out.esperando).push({ c, espera });
      }
    }
    // La ventana gratis de 24 h se cierra y no hay venta: última oportunidad
    // de escribirle con texto libre. Entre 20 y 23 h desde su último mensaje.
    const desde = ahora - c.ultimoCliente;
    if (desde >= 20 * 60 && desde < 23 * 60 && (c.pedidos.length || tieneEtiqueta(c, "lead"))) {
      out.ventanaPorCerrar.push({ c, restan: 24 * 60 - desde });
    }
  }
  const porEspera = (a, b) => b.espera - a.espera;
  out.esperando.sort(porEspera);
  out.pedidosSinAtender.sort(porEspera);
  out.ventanaPorCerrar.sort((a, b) => a.restan - b.restan);
  return out;
}

/** Transcripción mínima para Claude: solo chats con señal, números enmascarados. */
function digestParaIA(chats) {
  const relevantes = Array.from(chats.values())
    .filter((c) => c.msgsCliente > 0)
    .sort((a, b) => (b.pedidos.length - a.pedidos.length) || (b.msgsCliente - a.msgsCliente))
    .slice(0, ASESOR.MAX_CHATS_IA);
  return relevantes.map((c, i) => {
    const etiquetas = [c.deAnuncio ? "anuncio:" + (c.anuncio || "?") : "orgánico",
      c.pedidos.length ? "pidió-en-catálogo" : "", tieneEtiqueta(c, "purchase") ? "VENDIDO" : "",
      c.primeraRespuestaMin !== null ? "1ra-resp:" + Math.round(c.primeraRespuestaMin) + "min" : "sin-respuesta"]
      .filter(Boolean).join(" | ");
    const msgs = c.mensajes.slice(-ASESOR.MAX_MSGS_POR_CHAT).map((m) => {
      const quien = m.quien === "Cliente" ? "C" : (esAutomatico(m.vendedor) ? "BOT" : "V");
      const cuerpo = m.msg ? String(m.msg).replace(/\s+/g, " ").slice(0, ASESOR.MAX_CHARS_MSG) : "[" + m.tipo + "]";
      return "  " + String(m.fecha).slice(11, 16) + " " + quien + ": " + cuerpo;
    });
    return "#" + (i + 1) + " (" + etiquetas + ")\n" + msgs.join("\n");
  }).join("\n\n");
}

function textoMetricas(fecha, m) {
  const l = [
    "📊 *Reporte " + fecha + "*",
    "",
    "💬 Chats con cliente: *" + m.chatsConCliente + "* (" + m.deAnuncio + " de anuncio)",
    "🛒 Pidieron en catálogo: *" + m.conPedidoCatalogo + "* · sin venta: " + m.pedidoSinVenta,
    "⭐ Interés: " + m.interes + " · ✅ Ventas: *" + m.ventas + "* · conversión " + m.conversion + "%",
    "⏱ 1ra respuesta mediana: " + (m.respuestaMedianaMin === null ? "—" : m.respuestaMedianaMin + " min") + " · lentas (>30 min): " + m.respuestaLentas,
    "🙋 Quedaron sin respuesta: *" + m.sinRespuesta + "*"
  ];
  const vs = Object.keys(m.porVendedora);
  if (vs.length) {
    l.push("", "👩‍💼 *Por vendedora*");
    vs.forEach((v) => { const x = m.porVendedora[v]; l.push("• " + v + ": " + x.chats + " chats, " + x.mensajes + " msgs, " + x.ventas + " ventas"); });
  }
  const as = Object.keys(m.porAnuncio);
  if (as.length) {
    l.push("", "📣 *Por anuncio*");
    as.forEach((a) => { const x = m.porAnuncio[a]; l.push("• " + a.slice(0, 40) + ": " + x.chats + " chats → " + x.pedidos + " pedidos → " + x.ventas + " ventas"); });
  }
  return l.join("\n");
}

/* ───────────────────────── Google (lectura de la hoja) ───────────────────────── */

function nombrePestana_(d) {
  return Utilities.formatDate(d, ASESOR.ZONA, "dd-MM-yyyy");
}

function textoFecha_(v) {
  return v instanceof Date ? Utilities.formatDate(v, ASESOR.ZONA, "yyyy-MM-dd HH:mm:ss") : String(v || "");
}

function leerDia_(d) {
  const hoja = SpreadsheetApp.getActive().getSheetByName(nombrePestana_(d));
  if (!hoja || hoja.getLastRow() < 2) return [];
  const C = ASESOR.COL;
  return hoja.getRange(2, 1, hoja.getLastRow() - 1, Math.max(hoja.getLastColumn(), C.EMBUDO + 1)).getValues().map((r) => ({
    fecha: textoFecha_(r[C.FECHA]), wa: String(r[C.WA] || ""), nombre: String(r[C.NOMBRE] || ""),
    quien: String(r[C.QUIEN] || ""), vendedor: String(r[C.VENDEDOR] || ""), tipo: String(r[C.TIPO] || "text"),
    msg: String(r[C.MSG] || ""), ctwa: String(r[C.CTWA] || ""), anuncio: String(r[C.ANUNCIO] || ""),
    asesora: String(r[C.ASESORA] || ""), embudo: String(r[C.EMBUDO] || "")
  }));
}

function prop_(k, def) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  return v === null || v === "" ? def : v;
}

/* ───────────────────────── Alertas (cada 30 min) ───────────────────────── */

function revisarAlertas() {
  const ahoraD = new Date();
  const hora = +Utilities.formatDate(ahoraD, ASESOR.ZONA, "H");
  const [ini, fin] = String(prop_("HORARIO", "9-22")).split("-").map(Number);
  if (hora < ini || hora >= fin) return;

  const ayer = new Date(ahoraD.getTime() - 86400000);
  const chats = agruparChats(leerDia_(ayer).concat(leerDia_(ahoraD)));
  const ahora = minutosDe(textoFecha_(ahoraD));
  const a = detectarAlertas(chats, ahora, +prop_("ESPERA_MIN", "15"));

  // No repetir el mismo aviso: cada alerta se manda una vez por "evento".
  const cache = CacheService.getScriptCache();
  const nuevas = (lista, tipo, clave) => lista.filter((x) => {
    const k = tipo + ":" + x.c.wa + ":" + clave(x);
    if (cache.get(k)) return false;
    cache.put(k, "1", 6 * 3600);
    return true;
  });
  const pedidos = nuevas(a.pedidosSinAtender, "p", (x) => x.c.esperandoDesde);
  const esperando = nuevas(a.esperando, "e", (x) => x.c.esperandoDesde);
  const ventana = nuevas(a.ventanaPorCerrar, "v", (x) => x.c.ultimoCliente);
  if (!pedidos.length && !esperando.length && !ventana.length) return;

  const linea = (x, extra) => "• " + (x.c.nombre || "sin nombre") + " +" + x.c.wa + (x.c.asesora ? " (" + x.c.asesora + ")" : "") + " — " + extra;
  const l = ["🧭 *Asesor logístico*"];
  if (pedidos.length) l.push("", "🛒 *Pidieron en catálogo y nadie respondió:*", ...pedidos.map((x) => linea(x, Math.round(x.espera) + " min")));
  if (esperando.length) l.push("", "⏳ *Esperando respuesta:*", ...esperando.map((x) => linea(x, Math.round(x.espera) + " min")));
  if (ventana.length) l.push("", "⌛ *Ventana de 24 h por cerrarse (sin venta):*", ...ventana.map((x) => linea(x, "quedan " + Math.round(x.restan / 60 * 10) / 10 + " h")));
  telegram_(l.join("\n"));
}

/* ───────────────────────── Reporte diario ───────────────────────── */

function reporteDeAyer() { generarReporte_(new Date(Date.now() - 86400000)); }
function reporteDeHoy() { generarReporte_(new Date()); }

function generarReporte_(d) {
  const fecha = nombrePestana_(d);
  const chats = agruparChats(leerDia_(d));
  const m = metricasDelDia(chats);
  let texto = textoMetricas(fecha, m);

  let ia = "";
  if (prop_("ANTHROPIC_API_KEY", "") && m.chatsConCliente > 0) {
    try {
      ia = analizarConClaude_(fecha, m, digestParaIA(chats));
    } catch (err) {
      ia = "⚠️ No se pudo generar el análisis IA: " + err.message;
    }
  }
  if (ia) texto += "\n\n🧠 *Análisis y acciones*\n" + ia;

  guardarReporte_(fecha, m, ia);
  telegram_(texto);
  const correo = prop_("REPORTE_EMAIL", "");
  if (correo) MailApp.sendEmail(correo, "Reporte de ventas WhatsApp " + fecha, texto.replace(/\*/g, ""));
}

function guardarReporte_(fecha, m, ia) {
  const ss = SpreadsheetApp.getActive();
  let hoja = ss.getSheetByName(ASESOR.PESTANA_REPORTES);
  if (!hoja) {
    hoja = ss.insertSheet(ASESOR.PESTANA_REPORTES, 0);
    hoja.appendRow(["Día", "Chats", "De anuncio", "Pidieron catálogo", "Pedido sin venta", "Interés", "Ventas", "Conversión %", "Sin respuesta", "1ra resp. mediana (min)", "Análisis IA"]);
    hoja.setFrozenRows(1);
  }
  hoja.appendRow([fecha, m.chatsConCliente, m.deAnuncio, m.conPedidoCatalogo, m.pedidoSinVenta, m.interes, m.ventas, m.conversion, m.sinRespuesta, m.respuestaMedianaMin === null ? "" : m.respuestaMedianaMin, ia]);
}

/**
 * Una sola llamada por día. El system prompt es fijo (se cachea) y lo que
 * cambia va al final. Todo lo que se puede contar se cuenta aquí, así Claude
 * solo lee conversaciones y opina — no gasta tokens sumando.
 */
function analizarConClaude_(fecha, m, digest) {
  const system =
    "Eres el asesor comercial y logístico de una tienda online peruana que vende kits de tarot por WhatsApp " +
    "con pago contra entrega (Lima) y envío por agencia Shalom (provincia). Las ventas las cierran vendedoras humanas; " +
    "tú no escribes a clientes. Recibes las métricas del día (ya calculadas, confía en ellas) y transcripciones " +
    "abreviadas (C = cliente, V = vendedora, BOT = mensaje automático). Devuelve en español, texto plano con viñetas " +
    "y sin tablas, máximo 220 palabras:\n" +
    "1) Por qué se perdieron ventas hoy: las 2-3 objeciones o fricciones más repetidas, citando #chat.\n" +
    "2) CRO: 3 cambios concretos y medibles (guion, respuesta rápida, oferta, anuncio o tiempos), cada uno con el dato que lo justifica.\n" +
    "3) Seguimiento de mañana: los #chat que vale la pena retomar y con qué mensaje exacto (una línea cada uno).\n" +
    "No inventes datos que no estén en el texto. Si hay pocos chats, dilo y sé breve.";
  const usuario = "Día: " + fecha + "\nMétricas: " + JSON.stringify(m) + "\n\nChats:\n" + digest;

  const res = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: {
      "x-api-key": prop_("ANTHROPIC_API_KEY", ""),
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "server-side-fallback-2026-07-01"
    },
    payload: JSON.stringify({
      model: prop_("CLAUDE_MODEL", ASESOR.MODELO_DEFAULT),
      max_tokens: 4000,
      output_config: { effort: prop_("CLAUDE_EFFORT", "low") },
      fallbacks: "default",
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: usuario }]
    })
  });
  const cuerpo = JSON.parse(res.getContentText() || "{}");
  if (res.getResponseCode() !== 200) throw new Error((cuerpo.error && cuerpo.error.message) || "HTTP " + res.getResponseCode());
  if (cuerpo.stop_reason === "refusal") throw new Error("el modelo declinó el análisis");
  return (cuerpo.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

/* ───────────────────────── Salida ───────────────────────── */

function telegram_(texto) {
  const token = prop_("TELEGRAM_BOT_TOKEN", "");
  const chat = prop_("TELEGRAM_CHAT_ID", "");
  if (!token || !chat) { console.log(texto); return; }
  // Telegram corta en 4096 caracteres.
  for (let i = 0; i < texto.length; i += 3900) {
    const parte = texto.slice(i, i + 3900);
    const r = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "post", contentType: "application/json", muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: chat, text: parte, parse_mode: "Markdown", disable_web_page_preview: true })
    });
    // Si el Markdown rompe (un _ suelto en un nombre), se reenvía sin formato.
    if (r.getResponseCode() !== 200) {
      UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
        method: "post", contentType: "application/json", muteHttpExceptions: true,
        payload: JSON.stringify({ chat_id: chat, text: parte.replace(/\*/g, "") })
      });
    }
  }
}

function avisar_(t) {
  try { SpreadsheetApp.getUi().alert(t); } catch (e) { console.log(t); }
}

function probarTelegram_() {
  telegram_("🧭 Asesor conectado. Aquí llegarán alertas y reportes.");
  avisar_("Mensaje de prueba enviado (si no llegó, revisa TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID).");
}

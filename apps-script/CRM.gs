/**
 * CRM del Kit de Tarot — Google Apps Script
 *
 * Añade a la hoja un menú "CRM" con tres cosas:
 *   1. Reporte por rango de fechas (ventas, cierre, ticket promedio).
 *   2. Envío de las ventas a la Conversions API de Meta, con deduplicación.
 *   3. Archivado de pedidos viejos, para que la lista no se sature.
 *
 * Instalación y configuración: ver apps-script/README.md
 *
 * El script solo escribe en la columna P ("CAPI") y en las pestañas que crea.
 * Las columnas A–O las gestiona el Worker: no las toca.
 */

const HOJA_PEDIDOS = "Pedidos";
const HOJA_REPORTE = "Reporte";
const HOJA_HISTORICO = "Histórico";

/** Columnas de la hoja, 1-indexadas como las pide getRange. */
const COL = {
  FECHA: 1, NOMBRE: 2, WHATSAPP: 3, ENVIO: 4, DESTINO: 5, PRODUCTO: 6,
  SUBTOTAL: 7, BUMP: 8, TOTAL: 9, ESTADO: 10,
  FBP: 11, FBC: 12, EVENT_ID: 13, USER_AGENT: 14, IP: 15,
  CAPI: 16
};
const TOTAL_COLUMNAS = 16;

/** Solo se reporta a Meta lo cobrado de verdad. */
const ESTADO_VENDIDO = "Pagado";
/** Para el reporte, "cerrado" incluye lo que ya salió a ruta. */
const ESTADOS_CERRADOS = ["Enviado", "Pagado"];

/** Meta corta las versiones viejas cada ~2 años; si falla, sube este número. */
const META_API = "v21.0";
const MONEDA = "PEN";
const URL_ORIGEN = "https://kittarot.com/";

/** Meta rechaza eventos de más de 7 días; dejamos un día de margen. */
const DIAS_MAXIMO_EVENTO = 6;

/* ────────────────────────────  Menú  ──────────────────────────── */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("CRM")
    .addItem("Preparar hoja (columna CAPI y pestañas)", "prepararHojaCRM")
    .addSeparator()
    .addItem("Reporte por rango de fechas…", "reportePorRango")
    .addItem("Reporte de hoy", "reporteDeHoy")
    .addSeparator()
    .addItem("Enviar ventas a Meta (CAPI)", "enviarVentasAMeta")
    .addItem("Activar envío automático al marcar Pagado", "instalarDisparador")
    .addItem("Desactivar envío automático", "quitarDisparador")
    .addItem("Probar conexión con Meta", "probarConexionMeta")
    .addSeparator()
    .addItem("Archivar pedidos antiguos…", "archivarAntiguos")
    .addToUi();
}

/* ─────────────────────  Preparar la hoja  ─────────────────────── */

/**
 * Crea lo que el script necesita y aun no existe: la columna CAPI y las
 * pestanas de Reporte e Historico.
 *
 * Existe como opcion aparte porque antes esto vivia dentro de
 * enviarVentasAMeta, detras de la comprobacion de credenciales: sin el token de
 * Meta la funcion salia antes de llegar, y la columna no aparecia nunca.
 */
function prepararHojaCRM() {
  const ui = SpreadsheetApp.getUi();
  const libro = SpreadsheetApp.getActive();
  const hoja = hojaPedidos_();
  const hecho = [];

  const celda = hoja.getRange(1, COL.CAPI);
  if (String(celda.getValue() || "").trim() !== "CAPI") {
    asegurarColumnaCapi_(hoja);
    hecho.push('Columna P "CAPI" creada.');
  } else {
    hecho.push('La columna P "CAPI" ya estaba.');
  }

  [HOJA_REPORTE, HOJA_HISTORICO].forEach(function (nombre) {
    if (!libro.getSheetByName(nombre)) {
      const nueva = libro.insertSheet(nombre);
      if (nombre === HOJA_HISTORICO) {
        nueva.getRange(1, 1, 1, TOTAL_COLUMNAS)
          .setValues([hoja.getRange(1, 1, 1, TOTAL_COLUMNAS).getValues()[0]])
          .setFontWeight("bold");
        nueva.setFrozenRows(1);
      }
      hecho.push('Pestana "' + nombre + '" creada.');
    } else {
      hecho.push('La pestana "' + nombre + '" ya estaba.');
    }
  });

  libro.setActiveSheet(hoja);
  ui.alert("CRM listo\n\n" + hecho.join("\n"));
}

/* ──────────────────────────  Reportes  ────────────────────────── */

function reporteDeHoy() {
  const hoy = new Date();
  escribirReporte_(hoy, hoy);
}

function reportePorRango() {
  const ui = SpreadsheetApp.getUi();
  const hoy = new Date();
  const haceUnaSemana = new Date(hoy.getTime() - 6 * 86400000);

  const desde = pedirFecha_(ui, "¿Desde qué día? (dd/mm/aaaa)", haceUnaSemana);
  if (!desde) return;
  const hasta = pedirFecha_(ui, "¿Hasta qué día? (dd/mm/aaaa)", hoy);
  if (!hasta) return;

  if (desde > hasta) {
    ui.alert("El día inicial es posterior al final. Revísalo y vuelve a intentarlo.");
    return;
  }
  escribirReporte_(desde, hasta);
}

function escribirReporte_(desde, hasta) {
  const libro = SpreadsheetApp.getActive();
  const pedidos = leerPedidos_();
  const enRango = filtrarPorRango(pedidos, desde, hasta);
  const dias = agruparPorDia(enRango);
  const totales = sumarTotales(enRango);

  let hoja = libro.getSheetByName(HOJA_REPORTE);
  if (!hoja) hoja = libro.insertSheet(HOJA_REPORTE);
  hoja.clear();

  const tz = libro.getSpreadsheetTimeZone();
  const fmt = (d) => Utilities.formatDate(d, tz, "dd/MM/yyyy");

  const encabezado = ["Día", "Leads", "Cerrados", "Pagados", "Ingresos cobrados",
                      "Ingresos potenciales", "Ticket promedio", "Cierre %"];
  const filas = dias.map((d) => [
    d.dia, d.leads, d.cerrados, d.pagados, d.cobrado, d.potencial, d.ticket, d.cierre
  ]);

  const contenido = [
    [`Reporte del ${fmt(desde)} al ${fmt(hasta)}`],
    [`Generado el ${Utilities.formatDate(new Date(), tz, "dd/MM/yyyy HH:mm")}`],
    [],
    encabezado,
    ...filas,
    [],
    ["TOTAL", totales.leads, totales.cerrados, totales.pagados, totales.cobrado,
     totales.potencial, totales.ticket, totales.cierre]
  ];

  hoja.getRange(1, 1, contenido.length, encabezado.length)
      .setValues(contenido.map((f) => {
        const fila = f.slice();
        while (fila.length < encabezado.length) fila.push("");
        return fila;
      }));

  // Formato: títulos, fechas, soles y porcentaje.
  hoja.getRange("A1").setFontSize(14).setFontWeight("bold");
  hoja.getRange(4, 1, 1, encabezado.length).setFontWeight("bold").setBackground("#e8eaf0");
  const ultimaFila = contenido.length;
  hoja.getRange(ultimaFila, 1, 1, encabezado.length).setFontWeight("bold").setBackground("#dde7dd");
  if (filas.length) {
    hoja.getRange(5, 1, filas.length, 1).setNumberFormat("ddd dd/MM/yyyy");
  }
  hoja.getRange(5, 5, Math.max(filas.length, 1) + 2, 3).setNumberFormat('"S/ "#,##0.00');
  hoja.getRange(5, 8, Math.max(filas.length, 1) + 2, 1).setNumberFormat("0%");
  hoja.autoResizeColumns(1, encabezado.length);
  libro.setActiveSheet(hoja);

  SpreadsheetApp.getActive().toast(
    `${totales.leads} leads · ${totales.pagados} pagados · S/ ${totales.cobrado.toFixed(2)} cobrados`,
    "Reporte listo", 8);
}

function pedirFecha_(ui, mensaje, porDefecto) {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const sugerida = Utilities.formatDate(porDefecto, tz, "dd/MM/yyyy");
  const res = ui.prompt(mensaje, `Déjalo vacío para usar ${sugerida}`, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return null;

  const texto = res.getResponseText().trim();
  if (!texto) return porDefecto;

  const fecha = parsearFecha(texto);
  if (!fecha) {
    ui.alert(`No entendí "${texto}". Usa el formato dd/mm/aaaa, por ejemplo 05/09/2026.`);
    return null;
  }
  return fecha;
}

/* ────────────────────────  Conversions API  ───────────────────── */

function probarConexionMeta() {
  const ui = SpreadsheetApp.getUi();
  try {
    const { pixelId, token } = credencialesMeta_();
    const res = UrlFetchApp.fetch(
      `https://graph.facebook.com/${META_API}/${pixelId}?fields=name&access_token=${encodeURIComponent(token)}`,
      { muteHttpExceptions: true });
    const cuerpo = JSON.parse(res.getContentText());
    if (res.getResponseCode() !== 200) {
      ui.alert("Meta rechazó las credenciales:\n\n" + (cuerpo.error?.message || res.getContentText()));
      return;
    }
    ui.alert(`Conectado al pixel "${cuerpo.name || pixelId}".`);
  } catch (err) {
    ui.alert(err.message);
  }
}

function enviarVentasAMeta() {
  const ui = SpreadsheetApp.getUi();

  // La columna se crea antes de mirar las credenciales: si se hace despues y
  // el token de Meta no esta puesto, la funcion sale y la columna no aparece
  // nunca, que es justo lo que pasaba.
  const hoja = hojaPedidos_();
  asegurarColumnaCapi_(hoja);

  let credenciales;
  try {
    credenciales = credencialesMeta_();
  } catch (err) {
    ui.alert(err.message);
    return;
  }

  const pedidos = leerPedidos_();
  const pendientes = pedidos.filter((p) => debeReportarse(p.estado, p.capi));

  if (!pendientes.length) {
    ui.alert("No hay ventas nuevas que reportar. Marca pedidos como \"Pagado\" y vuelve a intentarlo.");
    return;
  }

  const ahora = Math.floor(Date.now() / 1000);
  let enviados = 0;
  const errores = [];

  // Meta acepta hasta 1000 eventos por llamada; de 50 en 50 va sobrado y hace
  // que un fallo no arrastre a todo el lote.
  for (let i = 0; i < pendientes.length; i += 50) {
    const lote = pendientes.slice(i, i + 50);
    const eventos = lote.map((p) => construirEvento(p, ahora, DIAS_MAXIMO_EVENTO, sha256Hex_));
    const resultado = enviarLote_(credenciales, eventos);

    const marca = resultado.ok
      ? `✅ CAPI enviado ${Utilities.formatDate(new Date(), SpreadsheetApp.getActive().getSpreadsheetTimeZone(), "dd/MM/yyyy HH:mm")}`
      : `❌ ${resultado.error}`.slice(0, 200);

    lote.forEach((p) => hoja.getRange(p.fila, COL.CAPI).setValue(marca));
    if (resultado.ok) enviados += lote.length;
    else errores.push(resultado.error);
  }

  ui.alert(errores.length
    ? `Enviados ${enviados} de ${pendientes.length}.\n\nPrimer error:\n${errores[0]}`
    : `Listo: ${enviados} venta(s) reportadas a Meta.`);
}

function enviarLote_({ pixelId, token, testCode }, eventos) {
  const payload = { data: eventos };
  if (testCode) payload.test_event_code = testCode;

  const res = UrlFetchApp.fetch(
    `https://graph.facebook.com/${META_API}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
    {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

  const texto = res.getContentText();
  if (res.getResponseCode() !== 200) {
    let mensaje = texto;
    try { mensaje = JSON.parse(texto).error.message; } catch (e) { /* nos quedamos con el texto */ }
    return { ok: false, error: mensaje };
  }
  return { ok: true };
}

function credencialesMeta_() {
  const props = PropertiesService.getScriptProperties();
  const pixelId = props.getProperty("META_PIXEL_ID");
  const token = props.getProperty("META_ACCESS_TOKEN");
  if (!pixelId || !token) {
    throw new Error(
      "Faltan credenciales.\n\nExtensiones → Apps Script → Configuración del proyecto → " +
      "Propiedades del script, y añade META_PIXEL_ID y META_ACCESS_TOKEN.");
  }
  return { pixelId, token, testCode: props.getProperty("META_TEST_EVENT_CODE") };
}

/* ───────────────  Envío automático al marcar "Pagado"  ─────────────── */

/**
 * Decide si una fila toca reportar. Se saca aparte para poder probarla:
 * es la regla que evita cobrar dos veces el mismo pedido.
 */
function debeReportarse(estado, capiActual) {
  if (String(estado || "").trim() !== ESTADO_VENDIDO) return false;
  const marca = String(capiActual || "").trim();
  // Un intento fallido anterior sí se reintenta; uno enviado, nunca.
  return marca === "" || marca.indexOf("Error") === 0 || marca.indexOf("❌") === 0;
}

/**
 * Crea el disparador que vigila la columna Estado. Hace falta instalarlo desde
 * el menú (y no dejarlo como onEdit simple) porque un onEdit simple no puede
 * llamar a UrlFetchApp: Google no le da permiso para salir a internet.
 */
function instalarDisparador() {
  const ui = SpreadsheetApp.getUi();
  quitarDisparador(true);
  ScriptApp.newTrigger("alEditarEstado")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  ui.alert('Listo.\n\nDesde ahora, al poner "' + ESTADO_VENDIDO + '" en la columna Estado, ' +
           "la venta se reporta sola a Meta y el resultado aparece en la columna CAPI.");
}

function quitarDisparador(silencioso) {
  const previos = ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "alEditarEstado"; });
  previos.forEach(function (t) { ScriptApp.deleteTrigger(t); });
  if (!silencioso) {
    SpreadsheetApp.getUi().alert(previos.length
      ? "Envío automático desactivado."
      : "No había ningún envío automático activo.");
  }
}

/**
 * Se dispara con cada edición de la hoja. Sale corriendo salvo que sea
 * justo lo que interesa: la columna Estado puesta en "Pagado".
 */
function alEditarEstado(e) {
  if (!e || !e.range) return;
  const hoja = e.range.getSheet();
  if (hoja.getName() !== HOJA_PEDIDOS) return;
  if (e.range.getColumn() !== COL.ESTADO) return;

  const fila = e.range.getRow();
  if (fila < 2) return;   // la fila 1 son los encabezados

  asegurarColumnaCapi_(hoja);
  const capiActual = hoja.getRange(fila, COL.CAPI).getValue();
  if (!debeReportarse(hoja.getRange(fila, COL.ESTADO).getValue(), capiActual)) return;

  reportarFila_(hoja, fila);
}

/** Manda una sola fila a Meta y deja el resultado escrito en la columna CAPI. */
function reportarFila_(hoja, fila) {
  const celda = hoja.getRange(fila, COL.CAPI);
  let credenciales;
  try {
    credenciales = credencialesMeta_();
  } catch (err) {
    celda.setValue("❌ Falta META_ACCESS_TOKEN");
    return;
  }

  const pedido = leerFila_(hoja, fila);
  const evento = construirEvento(pedido, Math.floor(Date.now() / 1000), DIAS_MAXIMO_EVENTO, sha256Hex_);
  const resultado = enviarLote_(credenciales, [evento]);

  const cuando = Utilities.formatDate(new Date(),
    SpreadsheetApp.getActive().getSpreadsheetTimeZone(), "dd/MM/yyyy HH:mm");
  celda.setValue(resultado.ok
    ? "✅ CAPI enviado " + cuando
    : ("❌ " + resultado.error).slice(0, 200));
}

/** Una sola fila leída con la misma forma que usa leerPedidos_. */
function leerFila_(hoja, fila) {
  const f = hoja.getRange(fila, 1, 1, TOTAL_COLUMNAS).getValues()[0];
  return {
    fila: fila,
    fecha: f[COL.FECHA - 1],
    nombre: String(f[COL.NOMBRE - 1] || ""),
    telefono: String(f[COL.WHATSAPP - 1] || ""),
    producto: String(f[COL.PRODUCTO - 1] || ""),
    total: Number(f[COL.TOTAL - 1]) || 0,
    estado: String(f[COL.ESTADO - 1] || "").trim(),
    fbp: String(f[COL.FBP - 1] || ""),
    fbc: String(f[COL.FBC - 1] || ""),
    eventId: String(f[COL.EVENT_ID - 1] || ""),
    userAgent: String(f[COL.USER_AGENT - 1] || ""),
    ip: String(f[COL.IP - 1] || ""),
    capi: String(f[COL.CAPI - 1] || "").trim()
  };
}

/* ─────────────────────────  Archivado  ────────────────────────── */

function archivarAntiguos() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt("Archivar pedidos", "¿Cuántos días quieres conservar a la vista? (por defecto 30)",
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const dias = Number(res.getResponseText().trim() || 30);
  if (!Number.isFinite(dias) || dias < 1) {
    ui.alert("Pon un número de días mayor que cero.");
    return;
  }

  const libro = SpreadsheetApp.getActive();
  const hoja = hojaPedidos_();
  const corte = new Date(Date.now() - dias * 86400000);
  const pedidos = leerPedidos_().filter((p) => p.fecha instanceof Date && p.fecha < corte);

  if (!pedidos.length) {
    ui.alert(`No hay pedidos de más de ${dias} días.`);
    return;
  }

  let historico = libro.getSheetByName(HOJA_HISTORICO);
  if (!historico) {
    historico = libro.insertSheet(HOJA_HISTORICO);
    historico.getRange(1, 1, 1, TOTAL_COLUMNAS)
      .setValues([hoja.getRange(1, 1, 1, TOTAL_COLUMNAS).getValues()[0]])
      .setFontWeight("bold");
  }

  const valores = pedidos.map((p) => hoja.getRange(p.fila, 1, 1, TOTAL_COLUMNAS).getValues()[0]);
  historico.getRange(historico.getLastRow() + 1, 1, valores.length, TOTAL_COLUMNAS).setValues(valores);

  // De abajo hacia arriba: borrar de arriba abajo desplaza las filas siguientes.
  pedidos.map((p) => p.fila).sort((a, b) => b - a).forEach((fila) => hoja.deleteRow(fila));

  ui.alert(`${pedidos.length} pedido(s) movidos a "${HOJA_HISTORICO}".`);
}

/* ──────────────────────────  Lectura  ─────────────────────────── */

function hojaPedidos_() {
  const hoja = SpreadsheetApp.getActive().getSheetByName(HOJA_PEDIDOS);
  if (!hoja) throw new Error(`No existe la pestaña "${HOJA_PEDIDOS}".`);
  return hoja;
}

function asegurarColumnaCapi_(hoja) {
  // Si la hoja tiene menos columnas que la P, primero hay que crearlas: sin
  // esto getRange(1, 16) lanza y el script se queda a medias.
  if (hoja.getMaxColumns() < COL.CAPI) {
    hoja.insertColumnsAfter(hoja.getMaxColumns(), COL.CAPI - hoja.getMaxColumns());
  }
  const celda = hoja.getRange(1, COL.CAPI);
  if (String(celda.getValue() || "").trim() !== "CAPI") {
    celda.setValue("CAPI");
  }
  celda.setFontWeight("bold").setFontColor("#ffffff").setBackground("#111111");
  hoja.setColumnWidth(COL.CAPI, 170);
}

/** Lee la hoja completa a objetos, con el número de fila para poder escribir. */
function leerPedidos_() {
  const hoja = hojaPedidos_();
  const ultima = hoja.getLastRow();
  if (ultima < 2) return [];

  const valores = hoja.getRange(2, 1, ultima - 1, TOTAL_COLUMNAS).getValues();
  return valores
    .map((f, i) => ({
      fila: i + 2,
      fecha: f[COL.FECHA - 1],
      nombre: String(f[COL.NOMBRE - 1] || ""),
      telefono: String(f[COL.WHATSAPP - 1] || ""),
      producto: String(f[COL.PRODUCTO - 1] || ""),
      total: Number(f[COL.TOTAL - 1]) || 0,
      estado: String(f[COL.ESTADO - 1] || "").trim(),
      fbp: String(f[COL.FBP - 1] || ""),
      fbc: String(f[COL.FBC - 1] || ""),
      eventId: String(f[COL.EVENT_ID - 1] || ""),
      userAgent: String(f[COL.USER_AGENT - 1] || ""),
      ip: String(f[COL.IP - 1] || ""),
      capi: String(f[COL.CAPI - 1] || "").trim()
    }))
    .filter((p) => p.fecha instanceof Date || p.nombre);
}

function sha256Hex_(texto) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return bytes.map((b) => ((b < 0 ? b + 256 : b) + 0x100).toString(16).slice(1)).join("");
}

/* ═══════════════  Lógica pura (probada en scripts/check-gs.mjs)  ═══════════════ */

/** "05/09/2026" o "2026-09-05" -> Date a medianoche. null si no se entiende. */
function parsearFecha(texto) {
  let m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(texto);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texto);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

/** Medianoche del día de una fecha, para comparar días sin la hora. */
function soloDia(fecha) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

/** Pedidos cuya fecha cae dentro del rango, incluidos ambos extremos. */
function filtrarPorRango(pedidos, desde, hasta) {
  const ini = soloDia(desde).getTime();
  const fin = soloDia(hasta).getTime();
  return pedidos.filter((p) => {
    if (!(p.fecha instanceof Date)) return false;
    const dia = soloDia(p.fecha).getTime();
    return dia >= ini && dia <= fin;
  });
}

function sumarTotales(pedidos) {
  const cerrados = pedidos.filter((p) => ESTADOS_CERRADOS.indexOf(p.estado) !== -1);
  const pagados = pedidos.filter((p) => p.estado === ESTADO_VENDIDO);
  const cobrado = pagados.reduce((s, p) => s + p.total, 0);
  return {
    leads: pedidos.length,
    cerrados: cerrados.length,
    pagados: pagados.length,
    cobrado,
    potencial: pedidos.reduce((s, p) => s + p.total, 0),
    ticket: pagados.length ? cobrado / pagados.length : 0,
    cierre: pedidos.length ? pagados.length / pedidos.length : 0
  };
}

/** Un renglón por día, del más reciente al más antiguo. */
function agruparPorDia(pedidos) {
  const porDia = new Map();
  pedidos.forEach((p) => {
    const clave = soloDia(p.fecha).getTime();
    if (!porDia.has(clave)) porDia.set(clave, []);
    porDia.get(clave).push(p);
  });

  return [...porDia.keys()]
    .sort((a, b) => b - a)
    .map((clave) => Object.assign({ dia: new Date(clave) }, sumarTotales(porDia.get(clave))));
}

/** Solo dígitos y con código de país: es como Meta espera el teléfono. */
function normalizarTelefono(telefono) {
  const digitos = String(telefono).replace(/\D/g, "");
  if (!digitos) return "";
  return digitos.length === 9 && digitos.charAt(0) === "9" ? "51" + digitos : digitos;
}

/**
 * Arma el evento Purchase de un pedido.
 *
 * event_time: Meta rechaza lo que pase de 7 días, y un pedido puede cobrarse
 * mucho después de entrar. Si la fecha original ya no entra en la ventana, se
 * usa la de ahora: es cuando se confirmó el cobro.
 */
function construirEvento(pedido, ahoraSegundos, diasMaximo, hash) {
  const original = pedido.fecha instanceof Date ? Math.floor(pedido.fecha.getTime() / 1000) : ahoraSegundos;
  const limite = ahoraSegundos - diasMaximo * 86400;
  const eventTime = original < limite ? ahoraSegundos : Math.min(original, ahoraSegundos);

  const partes = pedido.nombre.trim().toLowerCase().split(/\s+/);
  const userData = {};

  const telefono = normalizarTelefono(pedido.telefono);
  if (telefono) userData.ph = [hash(telefono)];
  if (partes[0]) userData.fn = [hash(partes[0])];
  if (partes.length > 1) userData.ln = [hash(partes[partes.length - 1])];
  if (pedido.fbp) userData.fbp = pedido.fbp;
  if (pedido.fbc) userData.fbc = pedido.fbc;
  if (pedido.ip) userData.client_ip_address = pedido.ip;
  if (pedido.userAgent) userData.client_user_agent = pedido.userAgent;

  return {
    event_name: "Purchase",
    event_time: eventTime,
    // El navegador dispara Lead sin eventID, así que este id no choca con nada
    // y evita duplicados si se reenvía el mismo pedido dos veces.
    event_id: pedido.eventId || `fila-${pedido.fila}`,
    action_source: "website",
    event_source_url: URL_ORIGEN,
    user_data: userData,
    custom_data: {
      currency: MONEDA,
      value: pedido.total,
      content_name: pedido.producto
    }
  };
}

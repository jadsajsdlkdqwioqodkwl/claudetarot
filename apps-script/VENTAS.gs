/**
 * CRM de ventas manuales — Google Apps Script
 *
 * Convierte una pestaña "Ventas" en el reporte diario de ventas del vendedor,
 * y le da a cada venta una página pública de seguimiento para el cliente de
 * provincia: https://…/TS-K3M582R
 *
 * Convive con CRM.gs sin tocarlo:
 *   · CRM.gs manda la pestaña "Pedidos" (leads de la landing) y la CAPI.
 *   · Este manda la pestaña "Ventas" (reporte manual) y el seguimiento.
 * No comparten ni una constante ni una función, a propósito: son dos negocios
 * distintos en el mismo libro y mezclarlos obliga a tocar los dos para cambiar
 * uno.
 *
 * OJO: este archivo NO define onOpen(). El menú lo cuelga CRM.gs llamando a
 * menuVentas_(). Dos onOpen() en el mismo proyecto no conviven — el segundo
 * pisa al primero sin avisar y te quedas sin uno de los dos menús.
 *
 * Instalación y decisiones: ver apps-script/README.md
 */

/* ══════════════════════════  Configuración  ══════════════════════════ */

const HOJA_VENTAS = "Ventas";
const HOJA_PANEL_V = "Panel Ventas";

/** El dominio donde vive la página de seguimiento. Sin barra final. */
const SITIO = "https://kit-tarot-para-principiantes.tarotperu.store";

/** Carpeta de Drive donde van las fotos de los vouchers. */
const CARPETA_VOUCHERS = "Vouchers de envío — Tarot Store Perú";
const PROP_CARPETA_V = "VENTAS_CARPETA_ID";

/**
 * Las columnas, 1-indexadas como las pide getRange.
 * Este orden ES el de src/lib/ventas.js en el Worker. `npm run check` compara
 * los dos archivos y falla si dejan de coincidir: si se desalinean, el Worker
 * lee la clave de Shalom en la columna del precio y nadie se entera.
 */
const COL_V = {
  FECHA: 1, CODIGO: 2, CLIENTE: 3, WHATSAPP: 4, PRODUCTO: 5, CANTIDAD: 6,
  PRECIO: 7, ADELANTO: 8, SALDO: 9, CANAL: 10, CIUDAD: 11, DIRECCION: 12,
  CLAVE: 13, ESTADO: 14, VOUCHER: 15, NOTAS: 16, LINK: 17,
  EN_DESTINO: 18, ALERTA: 19, ACTUALIZADO: 20, DRIVE_ID: 21
};
const TOTAL_COLUMNAS_V = 21;

const ENCABEZADOS_V = [
  "Fecha", "Código", "Cliente", "WhatsApp", "Producto", "Cantidad",
  "Precio", "Adelanto", "Saldo", "Canal", "Ciudad", "Agencia / Dirección",
  "Clave Shalom", "Estado", "Voucher", "Notas", "Link seguimiento",
  "En destino desde", "Alerta", "Actualizado", "Drive ID"
];

/** El recorrido del envío, en orden. La página de seguimiento lo repite. */
const ESTADOS_V = ["Separado", "Preparando", "En camino", "En destino", "Entregado", "Cancelado"];
const ESTADO_INICIAL_V = "Separado";
const ESTADO_ESPERANDO_V = "En destino";

/** Cómo sale el paquete. Apartar no es una forma de envío: es un estado. */
const CANALES_V = ["Shalom", "Dinsides", "Entrega directa", "Por definir"];
const CANAL_AGENCIA_V = "Shalom";

/**
 * Los avisos de recojo. Cada escalón se muestra en la columna "Alerta" y, el
 * día que una venta lo cruza, sale por correo.
 */
const ALERTAS_V = [
  { dias: 2, icono: "🟡", texto: "sin recoger — recuérdale" },
  { dias: 6, icono: "🟠", texto: "sin recoger — insiste" },
  { dias: 15, icono: "🔴", texto: "sin recoger — riesgo de devolución" },
  { dias: 25, icono: "⛔", texto: "sin recoger — Shalom lo devuelve pronto" }
];

const ZONA = "America/Lima";

/* ════════════════════════════  El menú  ═════════════════════════════ */

/**
 * Cuelga el menú "Ventas". Lo llama onOpen() de CRM.gs.
 * @param {GoogleAppsScript.Base.Ui} ui
 */
function menuVentas_(ui) {
  ui.createMenu("Ventas")
    .addItem("Preparar hoja de Ventas", "prepararHojaVentas")
    .addItem("Registrar venta nueva", "nuevaVenta")
    .addItem("Completar códigos y fechas que falten", "completarFilasSueltas")
    .addSeparator()
    .addItem("Marcar «En camino»", "marcarEnCamino")
    .addItem("Marcar «En destino» (llegó a la agencia)", "marcarEnDestino")
    .addItem("Marcar «Entregado»", "marcarEntregado")
    .addSeparator()
    .addItem("Subir voucher de envío…", "subirVoucher")
    .addItem("Copiar link de seguimiento", "verLinkSeguimiento")
    .addItem("Avisar al cliente por WhatsApp", "avisarPorWhatsApp")
    .addSeparator()
    .addItem("Abrir panel del celular", "abrirPanelMovil")
    .addItem("Revisar pendientes de recojo ahora", "revisarPendientesDeRecojo")
    .addSeparator()
    .addItem("Activar automatismos de Ventas", "instalarDisparadoresVentas")
    .addItem("Desactivar automatismos de Ventas", "quitarDisparadoresVentas")
    .addToUi();
}

/* ═════════════════════════  Preparar la hoja  ════════════════════════ */

/**
 * Deja la pestaña "Ventas" lista para trabajar. Idempotente: córrela las veces
 * que quieras y siempre termina igual.
 */
function prepararHojaVentas() {
  const ui = SpreadsheetApp.getUi();
  const libro = SpreadsheetApp.getActive();
  const hecho = [];

  let hoja = libro.getSheetByName(HOJA_VENTAS);
  if (!hoja) {
    hoja = libro.insertSheet(HOJA_VENTAS);
    hecho.push('Pestaña "' + HOJA_VENTAS + '" creada.');
  }

  // La cuadrícula tiene que existir antes de escribir en la columna 21, o
  // getRange revienta y la rutina muere sin haber creado nada.
  if (hoja.getMaxColumns() < TOTAL_COLUMNAS_V) {
    hoja.insertColumnsAfter(hoja.getMaxColumns(), TOTAL_COLUMNAS_V - hoja.getMaxColumns());
  }

  hoja.getRange(1, 1, 1, TOTAL_COLUMNAS_V).setValues([ENCABEZADOS_V]);
  hecho.push("Encabezados escritos (" + TOTAL_COLUMNAS_V + " columnas).");

  formatearVentas_(hoja);
  escribirFormulasVentas_(hoja);
  colorearVentas_(hoja);
  hecho.push("Formato, desplegables y fórmulas al día.");

  construirPanelVentas_(libro);
  hecho.push('Pestaña "' + HOJA_PANEL_V + '" al día.');

  try {
    carpetaVouchers_();
    hecho.push('Carpeta de Drive "' + CARPETA_VOUCHERS + '" lista.');
  } catch (err) {
    hecho.push("⚠️ No se pudo preparar la carpeta de Drive: " + err.message);
  }

  ui.alert("Ventas", hecho.join("\n"), ui.ButtonSet.OK);
}

function formatearVentas_(hoja) {
  hoja.setFrozenRows(1);
  hoja.setFrozenColumns(3);

  hoja.getRange(1, 1, 1, TOTAL_COLUMNAS_V)
    .setFontWeight("bold")
    .setFontColor("#ffffff")
    .setBackground("#111111")
    .setVerticalAlignment("middle");

  const ultima = Math.max(hoja.getMaxRows() - 1, 1);
  const datos = function (col) { return hoja.getRange(2, col, ultima, 1); };

  datos(COL_V.FECHA).setNumberFormat("dd/mm/yyyy");
  datos(COL_V.EN_DESTINO).setNumberFormat("dd/mm/yyyy");
  datos(COL_V.ACTUALIZADO).setNumberFormat("dd/mm/yyyy hh:mm");
  [COL_V.PRECIO, COL_V.ADELANTO, COL_V.SALDO].forEach(function (c) {
    datos(c).setNumberFormat('"S/ "#,##0.00');
  });
  // El WhatsApp como texto: como número, Sheets se come el 9 inicial.
  datos(COL_V.WHATSAPP).setNumberFormat("@");
  datos(COL_V.CODIGO).setNumberFormat("@").setFontFamily("Roboto Mono");

  const lista = function (valores) {
    return SpreadsheetApp.newDataValidation()
      .requireValueInList(valores, true).setAllowInvalid(false).build();
  };
  datos(COL_V.ESTADO).setDataValidation(lista(ESTADOS_V));
  datos(COL_V.CANAL).setDataValidation(lista(CANALES_V));

  const anchos = {};
  anchos[COL_V.FECHA] = 95;
  anchos[COL_V.CODIGO] = 115;
  anchos[COL_V.CLIENTE] = 180;
  anchos[COL_V.WHATSAPP] = 115;
  anchos[COL_V.PRODUCTO] = 190;
  anchos[COL_V.CANTIDAD] = 70;
  anchos[COL_V.CANAL] = 115;
  anchos[COL_V.CIUDAD] = 130;
  anchos[COL_V.DIRECCION] = 230;
  anchos[COL_V.CLAVE] = 120;
  anchos[COL_V.ESTADO] = 120;
  anchos[COL_V.VOUCHER] = 110;
  anchos[COL_V.NOTAS] = 240;
  anchos[COL_V.LINK] = 145;
  anchos[COL_V.ALERTA] = 250;
  Object.keys(anchos).forEach(function (c) { hoja.setColumnWidth(Number(c), anchos[c]); });

  // El id de Drive es plomería: lo lee el Worker, no el vendedor.
  hoja.hideColumns(COL_V.DRIVE_ID);

  // El filtro es lo que convierte esto en un CRM: filtrar por canal, por
  // estado o por día es el 90% del uso diario.
  const filtro = hoja.getFilter();
  if (filtro) filtro.remove();
  hoja.getRange(1, 1, hoja.getMaxRows(), TOTAL_COLUMNAS_V).createFilter();
}

/**
 * Las columnas calculadas van como ARRAYFORMULA en la fila 2 y no como una
 * fórmula por fila. Es la única forma de que una venta nueva salga con su
 * saldo y su link ya puestos sin que nadie arrastre nada hacia abajo.
 *
 * El precio: si escribes a mano en I, Q o S, rompes el array de esa columna.
 * Son columnas de solo lectura.
 */
function escribirFormulasVentas_(hoja) {
  const r = function (letra) { return "$" + letra + "$2:$" + letra; };
  const rCliente = r("C"), rCodigo = r("B"), rPrecio = r("G"), rAdelanto = r("H");
  const rEstado = r("N"), rDestino = r("R");

  hoja.getRange(2, COL_V.SALDO).setFormula(
    '=ARRAYFORMULA(IF(' + rCliente + '="","",N(' + rPrecio + ')-N(' + rAdelanto + ')))'
  );

  hoja.getRange(2, COL_V.LINK).setFormula(
    '=ARRAYFORMULA(IF(' + rCodigo + '="","",HYPERLINK("' + SITIO + '/"&' + rCodigo + ',"🔗 Ver seguimiento")))'
  );

  // Los escalones se anidan de mayor a menor: el primero que se cumple gana,
  // así 30 días muestra el aviso de 25 y no el de 2.
  const dias = "(TODAY()-INT(" + rDestino + "))";
  let alerta = '""';
  ALERTAS_V.slice().sort(function (a, b) { return a.dias - b.dias; }).forEach(function (esc) {
    alerta = "IF(" + dias + ">=" + esc.dias + ',"' + esc.icono + ' "&' + dias +
      '&" días ' + esc.texto + '",' + alerta + ")";
  });
  hoja.getRange(2, COL_V.ALERTA).setFormula(
    '=ARRAYFORMULA(IF((' + rEstado + '="' + ESTADO_ESPERANDO_V + '")*(' + rDestino + '<>""),' +
    alerta + ',""))'
  );
}

function colorearVentas_(hoja) {
  const rango = hoja.getRange(2, 1, Math.max(hoja.getMaxRows() - 1, 1), TOTAL_COLUMNAS_V);
  const porEstado = function (estado, color) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$N2="' + estado + '"')
      .setBackground(color)
      .setRanges([rango])
      .build();
  };

  // Se reemplazan todas las reglas para que la rutina sea idempotente: si no,
  // cada corrida apilaba una copia más y la hoja se volvía lentísima.
  const reglas = [
    porEstado("Separado", "#F3EEFB"),
    porEstado("En camino", "#E3F0FD"),
    porEstado(ESTADO_ESPERANDO_V, "#FFF4E5"),
    porEstado("Entregado", "#E2F6E4"),
    porEstado("Cancelado", "#F1F1F1")
  ];

  // Y la alerta grave se pinta encima, sobre su propia celda.
  const colAlerta = hoja.getRange(2, COL_V.ALERTA, Math.max(hoja.getMaxRows() - 1, 1), 1);
  reglas.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=OR(LEFT($S2,1)="🔴",LEFT($S2,1)="⛔")')
      .setBackground("#FDE2E0").setFontColor("#B3261E").setBold(true)
      .setRanges([colAlerta]).build()
  );

  hoja.setConditionalFormatRules(reglas);
}

/* ══════════════════════════  Panel de ventas  ════════════════════════ */

/**
 * El resumen. Todo por fórmulas: no hay que refrescar nada ni correr ninguna
 * macro para que esté al día.
 *
 * Los dos bloques que crecen solos (por día, y pendientes de recojo) van en
 * grupos de columnas distintos. Uno debajo del otro, el que crece de arriba
 * se comía al de abajo apenas hubiera unas cuantas ventas.
 */
function construirPanelVentas_(libro) {
  let panel = libro.getSheetByName(HOJA_PANEL_V);
  if (!panel) panel = libro.insertSheet(HOJA_PANEL_V);
  panel.clear();
  panel.clearConditionalFormatRules();

  const V = "'" + HOJA_VENTAS + "'!";
  const r = function (letra) { return V + "$" + letra + "$2:$" + letra; };
  const rFecha = r("A"), rCodigo = r("B"), rCliente = r("C"), rPrecio = r("G");
  const rAdelanto = r("H"), rSaldo = r("I"), rCanal = r("J"), rCiudad = r("K");
  const rEstado = r("N"), rDestino = r("R"), rAlerta = r("S");

  const hoy = function (rangoSuma) {
    return "SUMIFS(" + rangoSuma + "," + rFecha + ',">="&TODAY(),' + rFecha + ',"<"&TODAY()+1)';
  };

  panel.getRange("A1").setValue("Panel de ventas manuales");
  panel.getRange("A2").setValue(
    "Se actualiza solo. Los importes salen de la pestaña " + HOJA_VENTAS + "."
  );

  /* ── Hoy ─────────────────────────────────────────────────────────── */
  panel.getRange("A4").setValue("HOY");
  panel.getRange("A5:B9").setValues([
    ["Ventas registradas", "=COUNTIFS(" + rFecha + ',">="&TODAY(),' + rFecha + ',"<"&TODAY()+1)'],
    ["Ingresos del día", "=" + hoy(rPrecio)],
    ["Cobrado (adelantos)", "=" + hoy(rAdelanto)],
    ["Por cobrar", "=" + hoy(rSaldo)],
    ["Ticket promedio", '=IFERROR(B6/B5,0)']
  ]);

  /* ── Ahora mismo ─────────────────────────────────────────────────── */
  panel.getRange("A11").setValue("AHORA MISMO");
  panel.getRange("A12:B16").setValues([
    ["Apartados sin despachar", '=COUNTIF(' + rEstado + ',"Separado")'],
    ["Preparando", '=COUNTIF(' + rEstado + ',"Preparando")'],
    ["En camino", '=COUNTIF(' + rEstado + ',"En camino")'],
    ["Esperando recojo", '=COUNTIF(' + rEstado + ',"' + ESTADO_ESPERANDO_V + '")'],
    ["Por cobrar (todo lo vivo)", '=SUMIFS(' + rSaldo + "," + rEstado + ',"<>Cancelado")']
  ]);

  /* ── Por canal ───────────────────────────────────────────────────── */
  panel.getRange("A18").setValue("POR CANAL");
  panel.getRange("A19:E19").setValues([["Canal", "Ventas", "Ingresos", "Cobrado", "Por cobrar"]]);
  const filasCanal = CANALES_V.map(function (canal) {
    const c = '"' + canal + '"';
    return [
      canal,
      "=COUNTIF(" + rCanal + "," + c + ")",
      "=SUMIF(" + rCanal + "," + c + "," + rPrecio + ")",
      "=SUMIF(" + rCanal + "," + c + "," + rAdelanto + ")",
      "=SUMIFS(" + rSaldo + "," + rCanal + "," + c + "," + rEstado + ',"<>Cancelado")'
    ];
  });
  panel.getRange(20, 1, filasCanal.length, 5).setValues(filasCanal);

  /* ── Por día (crece hacia abajo) ─────────────────────────────────── */
  const filaDia = 20 + filasCanal.length + 2;
  panel.getRange(filaDia, 1).setValue("POR DÍA");
  panel.getRange(filaDia + 1, 1, 1, 5)
    .setValues([["Día", "Ventas", "Ingresos", "Cobrado", "Por cobrar"]]);

  const A = "$A$" + (filaDia + 2) + ":$A";
  const porDia = function (rangoSuma) {
    return "=ARRAYFORMULA(IF(" + A + '="","",SUMIFS(' + rangoSuma + "," +
      rFecha + ',">="&' + A + "," + rFecha + ',"<"&' + A + "+1))" + ")";
  };
  panel.getRange(filaDia + 2, 1, 1, 5).setFormulas([[
    "=IFERROR(SORT(UNIQUE(FILTER(INT(" + rFecha + ")," + rFecha + '<>"")),1,FALSE),"")',
    "=ARRAYFORMULA(IF(" + A + '="","",COUNTIFS(' + rFecha + ',">="&' + A + "," + rFecha + ',"<"&' + A + "+1)))",
    porDia(rPrecio),
    porDia(rAdelanto),
    porDia(rSaldo)
  ]]);

  /* ── Pendientes de recojo (columnas G–L, crece hacia abajo) ──────── */
  panel.getRange("G4").setValue("PENDIENTES DE RECOJO");
  panel.getRange("G5:L5")
    .setValues([["Código", "Cliente", "Ciudad", "Días", "Alerta", "Saldo"]]);

  // INT() sobre una celda vacía devuelve #VALUE! y envenena el array entero,
  // así que la resta se hace solo donde hay fecha.
  const diasEspera = "ARRAYFORMULA(IF(" + rDestino + '="","",TODAY()-INT(' + rDestino + ")))";
  panel.getRange("G6").setFormula(
    "=IFERROR(SORT(FILTER({" +
      rCodigo + "," + rCliente + "," + rCiudad + "," + diasEspera + "," + rAlerta + "," + rSaldo +
    "}," + rEstado + '="' + ESTADO_ESPERANDO_V + '",' + rDestino + '<>""),4,FALSE),' +
    '"Nada pendiente de recojo 🎉")'
  );

  /* ── Formato ─────────────────────────────────────────────────────── */
  panel.getRange("A1").setFontSize(15).setFontWeight("bold");
  panel.getRange("A2").setFontColor("#666666").setFontSize(10);
  ["A4", "A11", "A18", "G4"].concat(["A" + filaDia]).forEach(function (celda) {
    panel.getRange(celda).setFontWeight("bold").setFontColor("#068988")
      .setFontSize(11).setNumberFormat("@");
  });
  [panel.getRange("A19:E19"), panel.getRange("G5:L5"),
   panel.getRange(filaDia + 1, 1, 1, 5)].forEach(function (rango) {
    rango.setFontWeight("bold").setFontColor("#ffffff").setBackground("#111111");
  });

  const soles = '"S/ "#,##0.00';
  panel.getRange("B6:B9").setNumberFormat(soles);
  panel.getRange("B16").setNumberFormat(soles);
  panel.getRange(20, 3, filasCanal.length, 3).setNumberFormat(soles);
  panel.getRange(filaDia + 2, 3, 400, 3).setNumberFormat(soles);
  panel.getRange(filaDia + 2, 1, 400, 1).setNumberFormat("ddd dd/mm/yyyy");
  panel.getRange("L6:L400").setNumberFormat(soles);

  panel.setColumnWidth(1, 190);
  [2, 3, 4, 5].forEach(function (c) { panel.setColumnWidth(c, 125); });
  panel.setColumnWidth(6, 30);
  panel.setColumnWidth(7, 115);
  panel.setColumnWidth(8, 170);
  panel.setColumnWidth(9, 130);
  panel.setColumnWidth(10, 60);
  panel.setColumnWidth(11, 250);
  panel.setColumnWidth(12, 110);
  panel.setFrozenRows(5);
}

/* ═══════════════════════════  Registrar  ════════════════════════════ */

/** Prepara la siguiente fila vacía con fecha, código y estado inicial. */
function nuevaVenta() {
  const hoja = hojaVentas_();
  const fila = hoja.getLastRow() + 1;

  hoja.getRange(fila, COL_V.FECHA).setValue(hoy_());
  hoja.getRange(fila, COL_V.CODIGO).setValue(codigoLibre_(hoja));
  hoja.getRange(fila, COL_V.ESTADO).setValue(ESTADO_INICIAL_V);
  hoja.getRange(fila, COL_V.CANAL).setValue("Por definir");
  hoja.getRange(fila, COL_V.CANTIDAD).setValue(1);
  hoja.getRange(fila, COL_V.ACTUALIZADO).setValue(new Date());

  hoja.setActiveRange(hoja.getRange(fila, COL_V.CLIENTE));
  SpreadsheetApp.getActive().toast(
    "Fila " + fila + " lista. Escribe el nombre del cliente.", "Venta nueva", 5
  );
}

/**
 * Recorre la hoja y completa lo que falte en las filas que tengan cliente:
 * código, fecha, estado y canal.
 *
 * Existe para la migración: cuando pegas de golpe las ventas de tu hoja vieja,
 * el disparador de edición no se entera —un pegado múltiple no trae `value` y
 * no distingue una fila de cincuenta—, así que esas filas se quedarían sin
 * código y por lo tanto sin página de seguimiento.
 */
function completarFilasSueltas() {
  const ui = SpreadsheetApp.getUi();
  const hoja = hojaVentas_();
  const ultima = hoja.getLastRow();
  if (ultima < 2) {
    ui.alert("Ventas", "La hoja todavía no tiene ventas.", ui.ButtonSet.OK);
    return;
  }

  const filas = hoja.getRange(2, 1, ultima - 1, TOTAL_COLUMNAS_V).getValues();
  const usados = {};
  filas.forEach(function (f) {
    const c = String(f[COL_V.CODIGO - 1] || "").trim().toUpperCase();
    if (c) usados[c] = true;
  });

  let tocadas = 0;
  filas.forEach(function (f, i) {
    if (!String(f[COL_V.CLIENTE - 1] || "").trim()) return;

    const fila = i + 2;
    let cambio = false;

    if (!String(f[COL_V.CODIGO - 1] || "").trim()) {
      let codigo;
      do { codigo = nuevoCodigoVenta_(); } while (usados[codigo]);
      usados[codigo] = true;
      hoja.getRange(fila, COL_V.CODIGO).setValue(codigo);
      cambio = true;
    }
    if (!f[COL_V.FECHA - 1]) {
      hoja.getRange(fila, COL_V.FECHA).setValue(hoy_());
      cambio = true;
    }
    if (!String(f[COL_V.ESTADO - 1] || "").trim()) {
      hoja.getRange(fila, COL_V.ESTADO).setValue(ESTADO_INICIAL_V);
      cambio = true;
    }
    if (!String(f[COL_V.CANAL - 1] || "").trim()) {
      hoja.getRange(fila, COL_V.CANAL).setValue("Por definir");
      cambio = true;
    }
    // Una venta que ya está esperando en agencia pero sin día de llegada nunca
    // dispararía las alertas de recojo. Se cuenta desde hoy, que es lo único
    // que sabemos con certeza.
    if (String(f[COL_V.ESTADO - 1] || "").trim() === ESTADO_ESPERANDO_V &&
        !f[COL_V.EN_DESTINO - 1]) {
      hoja.getRange(fila, COL_V.EN_DESTINO).setValue(hoy_());
      cambio = true;
    }

    if (cambio) tocadas++;
  });

  ui.alert(
    "Ventas",
    tocadas ? "Completé " + tocadas + " fila(s)." : "No faltaba nada: todas las filas están completas.",
    ui.ButtonSet.OK
  );
}

/**
 * Disparador instalable sobre la hoja. Hace dos cosas:
 *
 *  1. Si escribes un cliente en una fila sin código, la completa sola (fecha,
 *     código, estado, canal). Así registrar una venta es escribir el nombre.
 *  2. Si mueves el Estado a "En destino", anota el día. Ese día es el que
 *     cuentan las alertas de 2, 6, 15 y 25 días — sin él, el paquete puede
 *     pasarse un mes en la agencia sin que nadie lo note.
 *
 * Va como disparador instalable y no como onEdit simple porque el simple no
 * tiene permiso para escribir en Drive ni para mandar correo, y comparte
 * nombre con el que ya usa CRM.gs.
 */
function alEditarVenta(e) {
  if (!e || !e.range) return;
  const hoja = e.range.getSheet();
  if (hoja.getName() !== HOJA_VENTAS) return;

  const fila = e.range.getRow();
  const col = e.range.getColumn();
  if (fila < 2) return;

  if (col === COL_V.CLIENTE && String(e.value || "").trim()) {
    if (!String(hoja.getRange(fila, COL_V.CODIGO).getValue() || "").trim()) {
      hoja.getRange(fila, COL_V.CODIGO).setValue(codigoLibre_(hoja));
      if (!hoja.getRange(fila, COL_V.FECHA).getValue()) {
        hoja.getRange(fila, COL_V.FECHA).setValue(hoy_());
      }
      if (!hoja.getRange(fila, COL_V.ESTADO).getValue()) {
        hoja.getRange(fila, COL_V.ESTADO).setValue(ESTADO_INICIAL_V);
      }
      if (!hoja.getRange(fila, COL_V.CANAL).getValue()) {
        hoja.getRange(fila, COL_V.CANAL).setValue("Por definir");
      }
    }
  }

  if (col === COL_V.ESTADO) {
    sellarEstado_(hoja, fila, String(e.value || "").trim());
  }
}

/**
 * Anota la hora del cambio y, si el paquete acaba de llegar a la agencia, el
 * día en que llegó. Al salir de "En destino" ese día se borra: si no, un
 * paquete entregado seguía sumando días y disparando alertas para siempre.
 */
function sellarEstado_(hoja, fila, estado) {
  hoja.getRange(fila, COL_V.ACTUALIZADO).setValue(new Date());

  const celdaDestino = hoja.getRange(fila, COL_V.EN_DESTINO);
  if (estado === ESTADO_ESPERANDO_V) {
    if (!celdaDestino.getValue()) celdaDestino.setValue(hoy_());
  } else {
    celdaDestino.clearContent();
  }
}

/* ═════════════════════════  Cambiar estados  ═════════════════════════ */

function marcarEnCamino() { cambiarEstadoSeleccion_("En camino"); }
function marcarEnDestino() { cambiarEstadoSeleccion_(ESTADO_ESPERANDO_V); }
function marcarEntregado() { cambiarEstadoSeleccion_("Entregado"); }

function cambiarEstadoSeleccion_(estado) {
  const ui = SpreadsheetApp.getUi();
  const hoja = hojaVentas_();
  const fila = filaSeleccionada_(hoja);
  if (!fila) return;

  const venta = leerVenta_(hoja, fila);

  if (estado === ESTADO_ESPERANDO_V && venta.canal === CANAL_AGENCIA_V && !venta.clave) {
    const r = ui.alert(
      "Sin clave de recojo",
      "Este envío es por " + CANAL_AGENCIA_V + " y la columna «Clave Shalom» está vacía.\n\n" +
      "El cliente va a ver la página de seguimiento sin la clave que necesita en el " +
      "mostrador. ¿Lo marco igual?",
      ui.ButtonSet.YES_NO
    );
    if (r !== ui.Button.YES) return;
  }

  hoja.getRange(fila, COL_V.ESTADO).setValue(estado);
  sellarEstado_(hoja, fila, estado);

  SpreadsheetApp.getActive().toast(
    venta.cliente + " → " + estado, "Estado actualizado", 5
  );
}

/* ═══════════════════════  Voucher y links  ══════════════════════════ */

/** Abre el diálogo para subir la foto del voucher de la fila seleccionada. */
function subirVoucher() {
  const hoja = hojaVentas_();
  const fila = filaSeleccionada_(hoja);
  if (!fila) return;

  const venta = leerVenta_(hoja, fila);
  if (!venta.codigo) {
    SpreadsheetApp.getUi().alert("Esa fila todavía no tiene código de venta.");
    return;
  }

  const html = HtmlService.createTemplateFromFile("SUBIR");
  html.codigo = venta.codigo;
  html.cliente = venta.cliente;
  SpreadsheetApp.getUi().showModalDialog(
    html.evaluate().setWidth(420).setHeight(430), "Voucher de " + venta.codigo
  );
}

/**
 * Guarda la foto en Drive y deja el link en la hoja. La llaman el diálogo del
 * Sheets y el panel del celular.
 *
 * El archivo lo crea TU cuenta (el script corre como tú), así que ocupa tu
 * cuota de Drive. La service account del Worker no podría: tiene 0 bytes de
 * cuota y toda subida suya muere con "storageQuotaExceeded".
 *
 * @return {string} el mensaje de confirmación para mostrar en la interfaz
 */
function guardarVoucherVenta(codigo, base64, mime, nombre) {
  const hoja = hojaVentas_();
  const fila = filaDeCodigo_(hoja, codigo);
  if (!fila) throw new Error("No existe ninguna venta con el código " + codigo + ".");
  if (!/^image\//.test(mime || "")) throw new Error("El archivo tiene que ser una imagen.");

  const bytes = Utilities.base64Decode(base64);
  const extension = (nombre || "").split(".").pop().toLowerCase();
  const archivo = carpetaVouchers_().createFile(
    Utilities.newBlob(bytes, mime, codigo + "." + (/^(jpe?g|png|webp)$/.test(extension) ? extension : "jpg"))
  );

  // Sin esto, el Worker recibe un HTML de "pide acceso" en vez de la foto y el
  // cliente ve un cuadro roto. El id es lo único que abre el archivo, y el id
  // nunca sale de la hoja: al navegador solo le llega /v/<código>.
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // La foto anterior se va a la papelera: reemplazar un voucher es corregir un
  // error, y dejar el equivocado en Drive solo confunde después.
  const anterior = String(hoja.getRange(fila, COL_V.DRIVE_ID).getValue() || "").trim();
  if (anterior && anterior !== archivo.getId()) {
    try {
      DriveApp.getFileById(anterior).setTrashed(true);
    } catch (err) {
      console.warn("No se pudo borrar el voucher anterior: " + err.message);
    }
  }

  hoja.getRange(fila, COL_V.DRIVE_ID).setValue(archivo.getId());
  hoja.getRange(fila, COL_V.VOUCHER)
    .setFormula('=HYPERLINK("' + SITIO + "/v/" + codigo + '","📷 Ver foto")');
  hoja.getRange(fila, COL_V.ACTUALIZADO).setValue(new Date());

  return "Voucher de " + codigo + " guardado. Ya se ve en su página de seguimiento.";
}

/** El link de seguimiento de la fila seleccionada, listo para copiar. */
function verLinkSeguimiento() {
  const hoja = hojaVentas_();
  const fila = filaSeleccionada_(hoja);
  if (!fila) return;

  const venta = leerVenta_(hoja, fila);
  if (!venta.codigo) {
    SpreadsheetApp.getUi().alert("Esa fila todavía no tiene código de venta.");
    return;
  }

  const link = SITIO + "/" + venta.codigo;
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Inter,Arial,sans-serif;padding:16px 18px">' +
    '<p style="font-size:13px;color:#666;margin:0 0 10px">Link de seguimiento de <b>' +
    escaparHtml_(venta.cliente) + "</b></p>" +
    '<input id="l" value="' + escaparHtml_(link) + '" readonly ' +
    'style="width:100%;padding:11px;font-size:13px;border:1.5px solid #E0E0E0;' +
    'border-radius:9px;font-family:ui-monospace,monospace">' +
    '<button onclick="c()" style="margin-top:12px;width:100%;padding:12px;' +
    "background:#068988;color:#fff;border:none;border-radius:9px;font-weight:700;" +
    'font-size:14px;cursor:pointer">Copiar link</button>' +
    '<p id="ok" style="display:none;color:#28A745;font-size:13px;font-weight:700;' +
    'text-align:center;margin-top:10px">¡Copiado!</p>' +
    "<script>function c(){var i=document.getElementById('l');i.select();" +
    "document.execCommand('copy');document.getElementById('ok').style.display='block';}" +
    "<\/script></div>"
  ).setWidth(420).setHeight(210);

  SpreadsheetApp.getUi().showModalDialog(html, "Seguimiento " + venta.codigo);
}

/** Abre WhatsApp con el mensaje ya escrito según el estado del envío. */
function avisarPorWhatsApp() {
  const hoja = hojaVentas_();
  const fila = filaSeleccionada_(hoja);
  if (!fila) return;

  const venta = leerVenta_(hoja, fila);
  if (!venta.telefono) {
    SpreadsheetApp.getUi().alert("Esa fila no tiene número de WhatsApp.");
    return;
  }

  const url = "https://wa.me/" + telefonoInternacional_(venta.telefono) +
    "?text=" + encodeURIComponent(mensajeParaCliente_(venta));

  abrirEnPestana_(url, "Avisar a " + venta.cliente);
}

/**
 * El texto que se le manda al cliente. Cambia con el estado porque un "ya
 * salió" y un "ya puedes recogerlo" piden cosas distintas: el primero pide
 * paciencia, el segundo pide que agarre su DNI y vaya.
 */
function mensajeParaCliente_(venta) {
  const link = SITIO + "/" + venta.codigo;
  const nombre = String(venta.cliente || "").trim().split(/\s+/)[0] || "";
  const hola = "Hola " + nombre + "! ";

  if (venta.estado === ESTADO_ESPERANDO_V) {
    return hola + "Tu pedido ya llegó a " +
      (venta.direccion || CANAL_AGENCIA_V) + (venta.ciudad ? " (" + venta.ciudad + ")" : "") +
      " y puedes recogerlo.\n\n" +
      "Acá ves todo lo que necesitas llevar (no olvides tu DNI físico) y la clave de recojo:\n" +
      link +
      (venta.saldo > 0 ? "\n\nTe queda un saldo de S/ " + venta.saldo.toFixed(2) +
        ". Coordinamos por acá antes de que vayas." : "");
  }

  if (venta.estado === "En camino") {
    return hola + "Tu pedido ya salió" + (venta.ciudad ? " rumbo a " + venta.ciudad : "") +
      ". Te aviso apenas llegue a la agencia.\n\n" +
      "Puedes seguirlo acá en cualquier momento:\n" + link;
  }

  if (venta.estado === "Entregado") {
    return hola + "Confirmo que ya recogiste tu pedido 🎉 Cualquier cosa me escribes.\n\n" + link;
  }

  return hola + "Ya tengo registrado tu pedido. Acá puedes ver su estado cuando quieras:\n" + link;
}

/* ═══════════════════  Alertas de recojo (2/6/15/25)  ═════════════════ */

/**
 * Revisa qué paquetes llevan demasiado tiempo esperando en la agencia.
 *
 * Manda correo SOLO el día que una venta cruza un escalón (2, 6, 15 o 25
 * días), no todos los días. Un aviso diario de lo mismo se vuelve ruido y en
 * dos semanas dejas de abrirlo — que es exactamente cuando importaba.
 *
 * En la hoja el aviso está siempre visible en la columna "Alerta" y en el
 * bloque "Pendientes de recojo" del panel, sin depender de este disparador.
 */
function revisarPendientesDeRecojo() {
  const hoja = hojaVentas_();
  const ultima = hoja.getLastRow();
  if (ultima < 2) return avisarSinPendientes_();

  const filas = hoja.getRange(2, 1, ultima - 1, TOTAL_COLUMNAS_V).getValues();
  const cruzaron = [];
  const esperando = [];

  filas.forEach(function (fila, i) {
    if (String(fila[COL_V.ESTADO - 1] || "").trim() !== ESTADO_ESPERANDO_V) return;

    const desde = fila[COL_V.EN_DESTINO - 1];
    if (!(desde instanceof Date)) return;

    const dias = diasDesde_(desde);
    const venta = ventaDeFila_(fila, i + 2);
    venta.dias = dias;
    esperando.push(venta);

    // El escalón se cumple hoy, ni antes ni después: por eso la igualdad.
    ALERTAS_V.forEach(function (escalon) {
      if (dias === escalon.dias) {
        venta.escalon = escalon;
        cruzaron.push(venta);
      }
    });
  });

  if (!cruzaron.length) {
    if (esperando.length) {
      console.log("Sin escalones cruzados hoy; " + esperando.length + " esperando recojo.");
    }
    return avisarSinPendientes_(esperando);
  }

  const asunto = cruzaron.length === 1
    ? "Recojo pendiente: " + cruzaron[0].cliente + " (" + cruzaron[0].dias + " días)"
    : cruzaron.length + " pedidos llevan días sin recoger";

  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: "🔔 " + asunto,
    htmlBody: correoDePendientes_(cruzaron, esperando)
  });

  if (manual_()) {
    SpreadsheetApp.getUi().alert(
      "Ventas",
      "Te mandé un correo con " + cruzaron.length + " aviso(s) de recojo.\n" +
      esperando.length + " pedido(s) esperando en total.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

function correoDePendientes_(cruzaron, esperando) {
  const fmt = function (n) { return "S/ " + Number(n || 0).toFixed(2); };

  let html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px">';
  html += "<h2 style=\"font-size:19px;margin:0 0 6px\">Pedidos sin recoger</h2>";
  html += '<p style="color:#666;font-size:13px;margin:0 0 18px">' +
    "Estos cruzaron hoy un plazo de aviso. La agencia guarda el paquete alrededor de un mes " +
    "antes de devolverlo.</p>";

  cruzaron.forEach(function (v) {
    html += '<div style="border:1.5px solid #E0E0E0;border-left:5px solid #FF2A00;' +
      'border-radius:10px;padding:14px 16px;margin-bottom:12px">' +
      '<div style="font-size:16px;font-weight:bold">' + v.escalon.icono + " " + v.dias +
      " días · " + escaparHtml_(v.cliente) + "</div>" +
      '<div style="font-size:13px;color:#444;margin-top:6px">' +
      escaparHtml_(v.producto) + " · " + escaparHtml_(v.ciudad || "") + " · " +
      escaparHtml_(v.direccion || "") + "</div>" +
      (v.saldo > 0
        ? '<div style="font-size:13px;color:#C62828;margin-top:4px"><b>Saldo por cobrar: ' +
          fmt(v.saldo) + "</b></div>"
        : "") +
      '<div style="margin-top:10px;font-size:13px">' +
      '<a href="https://wa.me/' + telefonoInternacional_(v.telefono) + "?text=" +
      encodeURIComponent(mensajeParaCliente_(v)) +
      '" style="color:#25D366;font-weight:bold;text-decoration:none">Escribirle por WhatsApp</a>' +
      ' &nbsp;·&nbsp; <a href="' + SITIO + "/" + v.codigo +
      '" style="color:#068988;text-decoration:none">Ver su seguimiento</a></div>' +
      "</div>";
  });

  if (esperando.length > cruzaron.length) {
    html += '<p style="font-size:13px;color:#666;margin-top:20px">' +
      "En total hay <b>" + esperando.length + "</b> pedido(s) esperando en agencia. " +
      "El detalle completo está en la pestaña «" + HOJA_PANEL_V + "».</p>";
  }

  html += "</div>";
  return html;
}

function avisarSinPendientes_(esperando) {
  if (!manual_()) return;
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    "Ventas",
    esperando && esperando.length
      ? esperando.length + " pedido(s) esperando recojo, pero ninguno cruzó hoy un plazo de " +
        "aviso (" + ALERTAS_V.map(function (a) { return a.dias; }).join(", ") + " días).\n\n" +
        "Los ves todos en la pestaña «" + HOJA_PANEL_V + "»."
      : "No hay ningún pedido esperando recojo. Todo al día.",
    ui.ButtonSet.OK
  );
}

/* ═══════════════════════════  Disparadores  ══════════════════════════ */

/**
 * Instala los dos automatismos: el autocódigo al escribir un cliente y la
 * revisión diaria de recojos. Idempotente: quita los suyos antes de poner.
 */
function instalarDisparadoresVentas() {
  quitarDisparadoresVentas(true);

  const libro = SpreadsheetApp.getActive();
  ScriptApp.newTrigger("alEditarVenta").forSpreadsheet(libro).onEdit().create();
  ScriptApp.newTrigger("revisarPendientesDeRecojo")
    .timeBased().atHour(9).nearMinute(0).everyDays(1).inTimezone(ZONA).create();

  SpreadsheetApp.getUi().alert(
    "Ventas",
    "Listo. Desde ahora:\n\n" +
    "· Escribes el nombre de un cliente y la fila se completa sola con su código y su link.\n" +
    "· Mover el Estado a «" + ESTADO_ESPERANDO_V + "» anota el día de llegada.\n" +
    "· Cada mañana reviso los recojos pendientes y te escribo a " +
    Session.getEffectiveUser().getEmail() + " cuando alguno cumple " +
    ALERTAS_V.map(function (a) { return a.dias; }).join(", ") + " días.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function quitarDisparadoresVentas(silencioso) {
  const mios = ["alEditarVenta", "revisarPendientesDeRecojo"];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (mios.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  if (!silencioso) {
    SpreadsheetApp.getUi().alert("Ventas", "Automatismos de Ventas desactivados.",
      SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/* ═══════════════════════  Panel del celular  ════════════════════════ */

/**
 * La Web App. Existe porque los menús de Apps Script NO aparecen en la app
 * móvil de Google Sheets, y el momento en que hay que marcar «En destino» y
 * subir la foto del voucher es justamente cuando estás en la agencia con el
 * celular en la mano.
 *
 * Se despliega como "Ejecutar como: yo" y "Quién tiene acceso: solo yo", así
 * que la autenticación es tu propia cuenta de Google: no hay token que pegar
 * ni contraseña que se pueda filtrar.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile("PANEL")
    .setTitle("Envíos — Tarot Store Perú")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");
}

/** Todo lo que el panel necesita para dibujarse, en una sola llamada. */
function panelVentasDatos() {
  const hoja = hojaVentas_();
  const ultima = hoja.getLastRow();
  const envios = [];

  if (ultima >= 2) {
    const filas = hoja.getRange(2, 1, ultima - 1, TOTAL_COLUMNAS_V).getValues();
    filas.forEach(function (fila, i) {
      const estado = String(fila[COL_V.ESTADO - 1] || "").trim();
      const codigo = String(fila[COL_V.CODIGO - 1] || "").trim();
      if (!codigo) return;
      // Entregados y cancelados no se tocan más: el panel es para lo que está vivo.
      if (estado === "Entregado" || estado === "Cancelado") return;

      const venta = ventaDeFila_(fila, i + 2);
      const desde = fila[COL_V.EN_DESTINO - 1];
      venta.dias = desde instanceof Date ? diasDesde_(desde) : null;
      venta.tieneVoucher = Boolean(String(fila[COL_V.DRIVE_ID - 1] || "").trim());
      venta.link = SITIO + "/" + venta.codigo;
      venta.wa = "https://wa.me/" + telefonoInternacional_(venta.telefono) +
        "?text=" + encodeURIComponent(mensajeParaCliente_(venta));
      envios.push(venta);
    });
  }

  // Primero lo que reclama atención: lo que espera en agencia, y de eso, lo
  // que más lleva esperando.
  const orden = { "En destino": 0, "En camino": 1, "Preparando": 2, "Separado": 3 };
  envios.sort(function (a, b) {
    const d = (orden[a.estado] === undefined ? 9 : orden[a.estado]) -
              (orden[b.estado] === undefined ? 9 : orden[b.estado]);
    return d !== 0 ? d : (b.dias || 0) - (a.dias || 0);
  });

  return { envios: envios, estados: ESTADOS_V, alertas: ALERTAS_V };
}

/** Cambia el estado desde el panel. Devuelve la venta ya actualizada. */
function panelVentasCambiarEstado(codigo, estado) {
  if (ESTADOS_V.indexOf(estado) === -1) throw new Error("Estado desconocido: " + estado);

  const hoja = hojaVentas_();
  const fila = filaDeCodigo_(hoja, codigo);
  if (!fila) throw new Error("No existe la venta " + codigo + ".");

  hoja.getRange(fila, COL_V.ESTADO).setValue(estado);
  sellarEstado_(hoja, fila, estado);

  const venta = leerVenta_(hoja, fila);
  venta.wa = "https://wa.me/" + telefonoInternacional_(venta.telefono) +
    "?text=" + encodeURIComponent(mensajeParaCliente_(venta));
  return venta;
}

/** Enseña la URL del panel para abrirla en el celular. */
function abrirPanelMovil() {
  const ui = SpreadsheetApp.getUi();
  let url = "";
  try {
    url = ScriptApp.getService().getUrl();
  } catch (err) {
    url = "";
  }

  if (!url) {
    ui.alert(
      "Panel del celular",
      "Todavía no está publicado.\n\n" +
      "En el editor de Apps Script: Implementar → Nueva implementación → " +
      "Aplicación web → Ejecutar como: Yo · Quién tiene acceso: Solo yo.\n\n" +
      "Copia la URL que te dé y guárdala en la pantalla de inicio del celular.",
      ui.ButtonSet.OK
    );
    return;
  }

  abrirEnPestana_(url, "Panel de envíos");
}

/* ══════════════════════════  Utilidades  ════════════════════════════ */

function hojaVentas_() {
  const hoja = SpreadsheetApp.getActive().getSheetByName(HOJA_VENTAS);
  if (!hoja) {
    throw new Error('No existe la pestaña "' + HOJA_VENTAS + '". Corre Ventas → Preparar hoja.');
  }
  return hoja;
}

/** La fila de datos donde está el cursor, o null con un aviso claro. */
function filaSeleccionada_(hoja) {
  const activa = SpreadsheetApp.getActive().getActiveSheet();
  const fila = SpreadsheetApp.getActive().getActiveRange().getRow();

  if (activa.getName() !== HOJA_VENTAS || fila < 2) {
    SpreadsheetApp.getUi().alert(
      "Ventas",
      'Primero pon el cursor sobre la fila de la venta, en la pestaña "' + HOJA_VENTAS + '".',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return null;
  }
  return fila;
}

/** Una fila como objeto, con los números ya como números. */
function leerVenta_(hoja, fila) {
  return ventaDeFila_(hoja.getRange(fila, 1, 1, TOTAL_COLUMNAS_V).getValues()[0], fila);
}

/**
 * Lo mismo, pero a partir de valores ya leídos.
 *
 * Existe porque recorrer la hoja llamando a leerVenta_ hacía un getRange por
 * cada venta: con doscientas filas eso son doscientos viajes a Sheets y la
 * revisión diaria se comía el minuto de ejecución que da Apps Script.
 */
function ventaDeFila_(v, fila) {
  const num = function (x) {
    const n = typeof x === "number" ? x : parseFloat(String(x).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? 0 : n;
  };
  const precio = num(v[COL_V.PRECIO - 1]);
  const adelanto = num(v[COL_V.ADELANTO - 1]);

  return {
    fila: fila,
    codigo: String(v[COL_V.CODIGO - 1] || "").trim(),
    cliente: String(v[COL_V.CLIENTE - 1] || "").trim(),
    telefono: String(v[COL_V.WHATSAPP - 1] || "").trim(),
    producto: String(v[COL_V.PRODUCTO - 1] || "").trim(),
    cantidad: num(v[COL_V.CANTIDAD - 1]) || 1,
    precio: precio,
    adelanto: adelanto,
    // El saldo se recalcula acá: la celda I es una fórmula y viene formateada.
    saldo: Math.max(0, precio - adelanto),
    canal: String(v[COL_V.CANAL - 1] || "").trim(),
    ciudad: String(v[COL_V.CIUDAD - 1] || "").trim(),
    direccion: String(v[COL_V.DIRECCION - 1] || "").trim(),
    clave: String(v[COL_V.CLAVE - 1] || "").trim(),
    estado: String(v[COL_V.ESTADO - 1] || "").trim(),
    notas: String(v[COL_V.NOTAS - 1] || "").trim()
  };
}

function filaDeCodigo_(hoja, codigo) {
  const ultima = hoja.getLastRow();
  if (ultima < 2) return null;

  const buscado = String(codigo || "").trim().toUpperCase();
  const codigos = hoja.getRange(2, COL_V.CODIGO, ultima - 1, 1).getValues();
  for (let i = 0; i < codigos.length; i++) {
    if (String(codigos[i][0] || "").trim().toUpperCase() === buscado) return i + 2;
  }
  return null;
}

/**
 * Un código nuevo que no esté ya en uso. Sin I, O, 0 ni 1: el cliente lo va a
 * dictar por teléfono y esos cuatro se confunden entre sí.
 */
function nuevoCodigoVenta_() {
  const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const DIGITOS = "23456789";
  const de = function (alfabeto) {
    return alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  };
  return "TS-" + de(LETRAS) + de(DIGITOS) + de(LETRAS) +
    de(DIGITOS) + de(DIGITOS) + de(DIGITOS) + de(LETRAS);
}

function codigoLibre_(hoja) {
  const ultima = hoja.getLastRow();
  const usados = {};
  if (ultima >= 2) {
    hoja.getRange(2, COL_V.CODIGO, ultima - 1, 1).getValues().forEach(function (f) {
      const c = String(f[0] || "").trim().toUpperCase();
      if (c) usados[c] = true;
    });
  }
  for (let i = 0; i < 50; i++) {
    const codigo = nuevoCodigoVenta_();
    if (!usados[codigo]) return codigo;
  }
  throw new Error("No se pudo generar un código libre. Avísale a quien mantiene el script.");
}

/** La carpeta de vouchers en TU Drive. Se crea la primera vez y se recuerda. */
function carpetaVouchers_() {
  const props = PropertiesService.getScriptProperties();
  const guardada = props.getProperty(PROP_CARPETA_V);

  if (guardada) {
    try {
      const carpeta = DriveApp.getFolderById(guardada);
      // Una carpeta en la papelera sigue devolviéndose por id, y los archivos
      // que cayeran ahí se borrarían solos a los 30 días.
      if (!carpeta.isTrashed()) return carpeta;
    } catch (err) {
      console.warn("La carpeta guardada ya no existe: " + err.message);
    }
  }

  const existentes = DriveApp.getFoldersByName(CARPETA_VOUCHERS);
  const carpeta = existentes.hasNext() ? existentes.next() : DriveApp.createFolder(CARPETA_VOUCHERS);
  props.setProperty(PROP_CARPETA_V, carpeta.getId());
  return carpeta;
}

/** Hoy a medianoche, hora de Lima. Sin hora: lo que se cuenta son días. */
function hoy_() {
  const ahora = new Date();
  const lima = Utilities.formatDate(ahora, ZONA, "yyyy/MM/dd").split("/");
  return new Date(Number(lima[0]), Number(lima[1]) - 1, Number(lima[2]));
}

/** Días enteros entre una fecha y hoy, por día calendario. */
function diasDesde_(fecha) {
  const dia = 24 * 60 * 60 * 1000;
  const desde = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  return Math.max(0, Math.round((hoy_().getTime() - desde.getTime()) / dia));
}

/**
 * El teléfono como lo quiere wa.me: solo dígitos y con código de país.
 * Un celular peruano de 9 dígitos se asume peruano; lo demás se respeta.
 */
function telefonoInternacional_(telefono) {
  const digitos = String(telefono || "").replace(/\D/g, "");
  if (digitos.length === 9 && digitos.charAt(0) === "9") return "51" + digitos;
  return digitos;
}

function escaparHtml_(texto) {
  return String(texto == null ? "" : texto)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Apps Script no puede abrir una pestaña desde el servidor, así que el link
 * se abre desde un diálogo. El click automático lo bloquean los navegadores,
 * por eso además hay un botón: si el bloqueo salta, sigue habiendo qué pulsar.
 */
function abrirEnPestana_(url, titulo) {
  const seguro = escaparHtml_(url);
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Inter,Arial,sans-serif;padding:18px;text-align:center">' +
    '<a id="a" href="' + seguro + '" target="_blank" rel="noopener" ' +
    'style="display:block;padding:14px;background:#25D366;color:#fff;border-radius:10px;' +
    'font-weight:700;text-decoration:none;font-size:15px">Abrir</a>' +
    '<p style="font-size:12px;color:#666;margin-top:12px">Si no se abrió solo, pulsa el botón.</p>' +
    "<script>document.getElementById('a').click();<\/script></div>"
  ).setWidth(320).setHeight(160);
  SpreadsheetApp.getUi().showModalDialog(html, titulo);
}

/**
 * ¿Nos está llamando una persona desde el menú, o el disparador de las 9?
 * getUi() revienta cuando no hay interfaz, y esa excepción mataba la revisión
 * diaria antes de mandar el correo.
 */
function manual_() {
  try {
    SpreadsheetApp.getUi();
    return true;
  } catch (err) {
    return false;
  }
}

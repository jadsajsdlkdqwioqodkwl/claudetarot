/**
 * CRM de ventas manuales — Google Apps Script
 *
 * Una pestaña "Ventas" donde cada fila es una venta, y una página pública de
 * seguimiento para el cliente: https://…/TS-K3M582R
 *
 * La hoja es corta a propósito. De sus 16 columnas visibles **solo se escriben
 * 10**, y tres de esas son un clic (dos desplegables y una casilla). Fecha,
 * código, alerta de recojo y los dos botones de la fila se rellenan solos.
 *
 * Los botones viven EN la fila, como fórmulas HYPERLINK: un clic y ya. No hay
 * ningún diálogo que abrir ni ninguna venta que elegir de una lista — la fila
 * en la que estás ya sabe de quién es.
 *
 * Convive con CRM.gs sin tocarlo:
 *   · CRM.gs manda la pestaña "Pedidos" (leads de la landing) y la CAPI.
 *   · Este manda la pestaña "Ventas" (reporte manual) y el seguimiento.
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
 * lee la clave de Shalom en la columna del saldo y nadie se entera.
 */
const COL_V = {
  FECHA: 1, CODIGO: 2, CLIENTE: 3, WHATSAPP: 4, ENVIO: 5, DNI: 6,
  ADELANTO: 7, SALDO: 8, PAGADO: 9, DESTINO: 10, CLAVE: 11, ESTADO: 12,
  NOTAS: 13, ALERTA: 14, AVISAR: 15, VOUCHER: 16,
  EN_DESTINO: 17, DRIVE_ID: 18
};
const TOTAL_COLUMNAS_V = 18;

const ENCABEZADOS_V = [
  "Fecha", "Código", "Cliente", "WhatsApp", "Envío", "DNI",
  "Adelanto", "Saldo", "Pagado", "Destino", "Clave Shalom", "Estado",
  "Notas", "Alerta", "Avisar", "Voucher",
  "En destino desde", "Drive ID"
];

/** Cómo sale el paquete. Decide qué pide la hoja y qué le dice la página. */
const ENVIOS_V = ["Lima", "Shalom", "Dinsides"];
const ENVIO_POR_DEFECTO_V = "Lima";
const ENVIO_AGENCIA_V = "Shalom";

/** El recorrido del envío. La página de seguimiento lo repite. */
const ESTADOS_V = ["Pendiente", "En camino", "En destino", "Entregado", "Cancelado"];
const ESTADO_INICIAL_V = "Pendiente";
const ESTADO_ESPERANDO_V = "En destino";

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
 *
 * Son seis opciones y ninguna es para el día a día: marcar un estado, avisar
 * al cliente o subir el voucher se hacen desde la propia fila. Un menú al que
 * hay que volver todos los días es un menú mal hecho.
 *
 * @param {GoogleAppsScript.Base.Ui} ui
 */
function menuVentas_(ui) {
  ui.createMenu("Ventas")
    .addItem("Preparar hoja de Ventas", "prepararHojaVentas")
    .addItem("Revisar y completar la hoja", "revisarHojaVentas")
    .addSeparator()
    .addItem("Abrir panel del celular", "abrirPanelMovil")
    .addItem("Revisar pendientes de recojo ahora", "revisarPendientesDeRecojo")
    .addSeparator()
    .addItem("Activar automatismos", "instalarDisparadoresVentas")
    .addItem("Desactivar automatismos", "quitarDisparadoresVentas")
    .addToUi();
}

/* ═════════════════════════  Preparar la hoja  ════════════════════════ */

/**
 * Deja la pestaña "Ventas" lista para trabajar. Idempotente: córrela las veces
 * que quieras y siempre termina igual. Vuelve a correrla también después de
 * publicar el panel del celular, para que el botón 📷 apunte a él.
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

  // La cuadrícula tiene que existir antes de escribir en la última columna, o
  // getRange revienta y la rutina muere sin haber creado nada.
  if (hoja.getMaxColumns() < TOTAL_COLUMNAS_V) {
    hoja.insertColumnsAfter(hoja.getMaxColumns(), TOTAL_COLUMNAS_V - hoja.getMaxColumns());
  }

  hoja.getRange(1, 1, 1, TOTAL_COLUMNAS_V).setValues([ENCABEZADOS_V]);

  formatearVentas_(hoja);
  escribirFormulasVentas_(hoja);
  colorearVentas_(hoja);
  hecho.push("Columnas, desplegables, colores y botones al día.");

  construirPanelVentas_(libro);
  hecho.push('Pestaña "' + HOJA_PANEL_V + '" al día.');

  try {
    carpetaVouchers_();
  } catch (err) {
    hecho.push("⚠️ No se pudo preparar la carpeta de Drive: " + err.message);
  }

  hecho.push(
    urlDelPanel_()
      ? "Botón 📷 conectado al panel del celular."
      : "⚠️ El botón 📷 todavía no funciona: falta publicar el panel del celular.\n" +
        "   Implementar → Nueva implementación → Aplicación web\n" +
        "   (Ejecutar como: Yo · Acceso: Solo yo), y vuelve a correr esta opción."
  );

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

  const filas = Math.max(hoja.getMaxRows() - 1, 1);
  const datos = function (col) { return hoja.getRange(2, col, filas, 1); };

  datos(COL_V.FECHA).setNumberFormat("dd/mm");
  datos(COL_V.EN_DESTINO).setNumberFormat("dd/mm/yyyy");
  [COL_V.ADELANTO, COL_V.SALDO].forEach(function (c) {
    datos(c).setNumberFormat('"S/ "#,##0.00');
  });
  // El WhatsApp y el DNI como texto: como números, Sheets se come el 0 o el 9
  // del principio y el número deja de servir para nada.
  [COL_V.WHATSAPP, COL_V.DNI, COL_V.CLAVE, COL_V.CODIGO].forEach(function (c) {
    datos(c).setNumberFormat("@");
  });

  const lista = function (valores) {
    return SpreadsheetApp.newDataValidation()
      .requireValueInList(valores, true).setAllowInvalid(false).build();
  };
  datos(COL_V.ENVIO).setDataValidation(lista(ENVIOS_V));
  datos(COL_V.ESTADO).setDataValidation(lista(ESTADOS_V));

  // "Pagado" es una casilla y no un sí/no escrito: un clic, y en el celular
  // se puede marcar con el pulgar sin abrir ningún teclado.
  datos(COL_V.PAGADO).insertCheckboxes().setHorizontalAlignment("center");

  const anchos = {};
  anchos[COL_V.FECHA] = 60;
  anchos[COL_V.CODIGO] = 105;
  anchos[COL_V.CLIENTE] = 165;
  anchos[COL_V.WHATSAPP] = 105;
  anchos[COL_V.ENVIO] = 95;
  anchos[COL_V.DNI] = 95;
  anchos[COL_V.ADELANTO] = 95;
  anchos[COL_V.SALDO] = 95;
  anchos[COL_V.PAGADO] = 70;
  anchos[COL_V.DESTINO] = 215;
  anchos[COL_V.CLAVE] = 105;
  anchos[COL_V.ESTADO] = 110;
  anchos[COL_V.NOTAS] = 220;
  anchos[COL_V.ALERTA] = 215;
  anchos[COL_V.AVISAR] = 95;
  anchos[COL_V.VOUCHER] = 105;
  Object.keys(anchos).forEach(function (c) { hoja.setColumnWidth(Number(c), anchos[c]); });

  // Plomería: la escribe el script y nadie la mira.
  hoja.hideColumns(COL_V.EN_DESTINO, 2);

  const filtro = hoja.getFilter();
  if (filtro) filtro.remove();
  hoja.getRange(1, 1, hoja.getMaxRows(), TOTAL_COLUMNAS_V).createFilter();
}

/* ═══════════════════  Las columnas que se rellenan solas  ═══════════ */

/**
 * Alerta y los dos botones van como ARRAYFORMULA en la fila 2, no como una
 * fórmula por fila. Es la única forma de que una venta nueva salga con sus
 * botones ya puestos sin que nadie arrastre nada hacia abajo.
 *
 * El precio: si escribes a mano en N, O o P rompes el array de esa columna.
 * Son columnas de solo lectura; para repararlas, vuelve a correr Preparar hoja.
 */
function escribirFormulasVentas_(hoja) {
  const r = function (letra) { return "$" + letra + "$2:$" + letra; };
  const rCodigo = r("B"), rCliente = r("C"), rTelefono = r("D"), rEnvio = r("E");
  const rDestino = r("J"), rEstado = r("L"), rDesde = r("Q"), rDrive = r("R");

  const link = '"' + SITIO + '/"&' + rCodigo;

  /* ── Alerta de recojo ───────────────────────────────────────────── */
  // Los escalones se anidan de mayor a menor: el primero que se cumple gana,
  // así 30 días muestra el aviso de 25 y no el de 2.
  const dias = "(TODAY()-INT(" + rDesde + "))";
  let alerta = '""';
  ALERTAS_V.slice().sort(function (a, b) { return a.dias - b.dias; }).forEach(function (esc) {
    alerta = "IF(" + dias + ">=" + esc.dias + ',"' + esc.icono + ' "&' + dias +
      '&" días ' + esc.texto + '",' + alerta + ")";
  });
  hoja.getRange(2, COL_V.ALERTA).setFormula(
    '=ARRAYFORMULA(IF((' + rEstado + '="' + ESTADO_ESPERANDO_V + '")*(' + rDesde + '<>""),' +
    alerta + ',""))'
  );

  /* ── Botón «Avisar»: WhatsApp con el mensaje ya escrito ─────────── */
  const soloDigitos = 'REGEXREPLACE(TO_TEXT(' + rTelefono + '),"\\D","")';
  // Nueve dígitos que empiezan en 9 es un celular peruano; lo demás se respeta
  // tal cual, por si algún día vendes fuera.
  const telefono = 'IF(LEN(' + soloDigitos + ')=9,"51","")&' + soloDigitos;

  const hola = '"Hola "&' + rCliente + '&"! "';
  const enAgencia = "(" + rEnvio + '="' + ENVIO_AGENCIA_V + '")';

  const mensaje =
    'IF(' + rEstado + '="' + ESTADO_ESPERANDO_V + '",' +
      "IF(" + enAgencia + "," +
        hola + '&"Tu pedido ya llegó a "&' + rDestino + '&" y puedes recogerlo. ' +
          'Lleva tu DNI físico. Acá está tu clave de recojo y todo lo que necesitas: "&' + link + "," +
        hola + '&"Tu pedido ya llegó a su destino. Acá puedes ver los detalles: "&' + link +
      ")," +
    "IF(" + rEstado + '="En camino",' +
      hola + '&"Tu pedido ya salió. Te aviso apenas llegue. Puedes seguirlo acá: "&' + link + "," +
    "IF(" + rEstado + '="Entregado",' +
      hola + '&"Confirmo que ya recogiste tu pedido. Cualquier cosa me escribes.",' +
      hola + '&"Ya tengo registrado tu pedido. Acá puedes ver su estado cuando quieras: "&' + link +
    ")))";

  // Nada de ENCODEURL: no funciona dentro de ARRAYFORMULA. Como el texto lo
  // escribimos nosotros y no lleva &, ? ni #, basta con codificar el espacio.
  hoja.getRange(2, COL_V.AVISAR).setFormula(
    '=ARRAYFORMULA(IF((' + rCodigo + '="")+(' + rTelefono + '=""),"",' +
    'HYPERLINK("https://wa.me/"&' + telefono + '&"?text="&' +
    'SUBSTITUTE(' + mensaje + '," ","%20"),"💬 Avisar")))'
  );

  /* ── Botón «Voucher»: abre el panel ya centrado en esa venta ────── */
  const panel = urlDelPanel_();
  hoja.getRange(2, COL_V.VOUCHER).setFormula(
    panel
      ? '=ARRAYFORMULA(IF(' + rCodigo + '="","",HYPERLINK("' + panel + '?c="&' + rCodigo +
        ',IF(' + rDrive + '="","📷 Subir","📷 Cambiar"))))'
      : '=ARRAYFORMULA(IF(' + rCodigo + '="","","📷 publica el panel"))'
  );
}

function colorearVentas_(hoja) {
  const filas = Math.max(hoja.getMaxRows() - 1, 1);
  const todo = hoja.getRange(2, 1, filas, TOTAL_COLUMNAS_V);
  const columna = function (col) { return hoja.getRange(2, col, filas, 1); };

  const regla = function () { return SpreadsheetApp.newConditionalFormatRule(); };
  const reglas = [];

  /* Lo que no aplica se apaga. Es lo que hace que no tengas que acordarte de
     qué llenar: en una fila de Lima, DNI y Clave Shalom se ven grises; en una
     de Shalom se encienden y te piden que las llenes. */
  reglas.push(
    regla()
      .whenFormulaSatisfied('=$E2<>"' + ENVIO_AGENCIA_V + '"')
      .setBackground("#F3F3F3").setFontColor("#CCCCCC")
      .setRanges([columna(COL_V.DNI), columna(COL_V.CLAVE)])
      .build()
  );

  /* El saldo: verde y tachado si ya cobraste, rojo si todavía no. */
  reglas.push(
    regla().whenFormulaSatisfied("=$I2=TRUE")
      .setBackground("#E2F6E4").setFontColor("#1E7B34").setStrikethrough(true)
      .setRanges([columna(COL_V.SALDO)]).build()
  );
  reglas.push(
    regla().whenFormulaSatisfied("=AND($I2<>TRUE,N($H2)>0)")
      .setFontColor("#C62828").setBold(true)
      .setRanges([columna(COL_V.SALDO)]).build()
  );

  /* La alerta grave, imposible de pasar por alto. */
  reglas.push(
    regla().whenFormulaSatisfied('=OR(LEFT($N2,1)="🔴",LEFT($N2,1)="⛔")')
      .setBackground("#FDE2E0").setFontColor("#B3261E").setBold(true)
      .setRanges([columna(COL_V.ALERTA)]).build()
  );

  /* Y la fila entera según el estado, para leer la lista de un vistazo. */
  const porEstado = function (estado, color) {
    return regla().whenFormulaSatisfied('=$L2="' + estado + '"')
      .setBackground(color).setRanges([todo]).build();
  };
  reglas.push(porEstado("En camino", "#E3F0FD"));
  reglas.push(porEstado(ESTADO_ESPERANDO_V, "#FFF4E5"));
  reglas.push(porEstado("Entregado", "#F4F4F4"));
  reglas.push(porEstado("Cancelado", "#EDEDED"));

  // Se reemplazan todas para que la rutina sea idempotente: si no, cada corrida
  // apilaba una copia más y la hoja se volvía lentísima.
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
  const rFecha = r("A"), rCodigo = r("B"), rCliente = r("C"), rEnvio = r("E");
  const rAdelanto = r("G"), rSaldo = r("H"), rPagado = r("I"), rDestino = r("J");
  const rEstado = r("L"), rAlerta = r("N"), rDesde = r("Q");

  // Lo que de verdad falta por cobrar: el saldo de lo que no está pagado ni
  // cancelado. Sumar la columna entera contaría plata que ya entró.
  const porCobrar = "SUMIFS(" + rSaldo + "," + rPagado + ",FALSE," + rEstado + ',"<>Cancelado")';
  const hoy = function (rango) {
    return "SUMIFS(" + rango + "," + rFecha + ',">="&TODAY(),' + rFecha + ',"<"&TODAY()+1)';
  };

  panel.getRange("A1").setValue("Panel de ventas");
  panel.getRange("A2").setValue("Se actualiza solo desde la pestaña " + HOJA_VENTAS + ".");

  /* ── Hoy ─────────────────────────────────────────────────────────── */
  panel.getRange("A4").setValue("HOY");
  panel.getRange("A5:B7").setValues([
    ["Ventas", "=COUNTIFS(" + rFecha + ',">="&TODAY(),' + rFecha + ',"<"&TODAY()+1)'],
    ["Cobrado (adelantos)", "=" + hoy(rAdelanto)],
    ["Queda por cobrar", "=" + hoy(rSaldo)]
  ]);

  /* ── Ahora mismo ─────────────────────────────────────────────────── */
  panel.getRange("A9").setValue("AHORA MISMO");
  panel.getRange("A10:B13").setValues([
    ["Sin despachar", '=COUNTIF(' + rEstado + ',"' + ESTADO_INICIAL_V + '")'],
    ["En camino", '=COUNTIF(' + rEstado + ',"En camino")'],
    ["Esperando recojo", '=COUNTIF(' + rEstado + ',"' + ESTADO_ESPERANDO_V + '")'],
    ["Por cobrar en total", "=" + porCobrar]
  ]);

  /* ── Por tipo de envío ───────────────────────────────────────────── */
  panel.getRange("A15").setValue("POR ENVÍO");
  panel.getRange("A16:D16").setValues([["Envío", "Ventas", "Cobrado", "Por cobrar"]]);
  const filasEnvio = ENVIOS_V.map(function (envio) {
    const e = '"' + envio + '"';
    return [
      envio,
      "=COUNTIF(" + rEnvio + "," + e + ")",
      "=SUMIF(" + rEnvio + "," + e + "," + rAdelanto + ")",
      "=SUMIFS(" + rSaldo + "," + rEnvio + "," + e + "," + rPagado + ",FALSE," +
        rEstado + ',"<>Cancelado")'
    ];
  });
  panel.getRange(17, 1, filasEnvio.length, 4).setValues(filasEnvio);

  /* ── Por día (crece hacia abajo) ─────────────────────────────────── */
  const filaDia = 17 + filasEnvio.length + 2;
  panel.getRange(filaDia, 1).setValue("POR DÍA");
  panel.getRange(filaDia + 1, 1, 1, 4)
    .setValues([["Día", "Ventas", "Cobrado", "Por cobrar"]]);

  const A = "$A$" + (filaDia + 2) + ":$A";
  const porDia = function (rango) {
    return "=ARRAYFORMULA(IF(" + A + '="","",SUMIFS(' + rango + "," +
      rFecha + ',">="&' + A + "," + rFecha + ',"<"&' + A + "+1)))";
  };
  panel.getRange(filaDia + 2, 1, 1, 4).setFormulas([[
    "=IFERROR(SORT(UNIQUE(FILTER(INT(" + rFecha + ")," + rFecha + '<>"")),1,FALSE),"")',
    "=ARRAYFORMULA(IF(" + A + '="","",COUNTIFS(' + rFecha + ',">="&' + A + "," +
      rFecha + ',"<"&' + A + "+1)))",
    porDia(rAdelanto),
    porDia(rSaldo)
  ]]);

  /* ── Pendientes de recojo (columnas F–J, crece hacia abajo) ──────── */
  panel.getRange("F4").setValue("PENDIENTES DE RECOJO");
  panel.getRange("F5:K5")
    .setValues([["Código", "Cliente", "Dónde", "Días", "Alerta", "Saldo"]]);

  // Los días van DENTRO del array y se ordena por su posición (la 4), no por un
  // rango aparte. SORT admite una columna externa, pero tiene que medir lo mismo
  // que lo que ordena, y aquí FILTER ya recortó las filas: pasarle la columna Q
  // entera daba un error de dimensiones que el IFERROR se tragaba, dejando el
  // bloque diciendo "nada pendiente" para siempre.
  //
  // Y la resta se hace solo donde hay fecha: INT() sobre una celda vacía
  // devuelve #VALUE! y envenena el array entero.
  const diasEspera = "IF(" + rDesde + '="","",TODAY()-INT(' + rDesde + "))";
  panel.getRange("F6").setFormula(
    "=IFERROR(SORT(FILTER(ARRAYFORMULA({" +
      rCodigo + "," + rCliente + "," + rDestino + "," + diasEspera + "," +
      rAlerta + "," + rSaldo +
    "})," + rEstado + '="' + ESTADO_ESPERANDO_V + '",' + rDesde + '<>""),4,FALSE),' +
    '"Nada pendiente de recojo 🎉")'
  );

  /* ── Formato ─────────────────────────────────────────────────────── */
  panel.getRange("A1").setFontSize(15).setFontWeight("bold");
  panel.getRange("A2").setFontColor("#666666").setFontSize(10);
  ["A4", "A9", "A15", "F4", "A" + filaDia].forEach(function (celda) {
    panel.getRange(celda).setFontWeight("bold").setFontColor("#068988").setFontSize(11);
  });
  [panel.getRange("A16:D16"), panel.getRange("F5:K5"),
   panel.getRange(filaDia + 1, 1, 1, 4)].forEach(function (rango) {
    rango.setFontWeight("bold").setFontColor("#ffffff").setBackground("#111111");
  });

  const soles = '"S/ "#,##0.00';
  panel.getRange("B6:B7").setNumberFormat(soles);
  panel.getRange("B13").setNumberFormat(soles);
  panel.getRange(17, 3, filasEnvio.length, 2).setNumberFormat(soles);
  panel.getRange(filaDia + 2, 3, 400, 2).setNumberFormat(soles);
  panel.getRange(filaDia + 2, 1, 400, 1).setNumberFormat("ddd dd/mm/yyyy");
  panel.getRange("K6:K400").setNumberFormat(soles);

  panel.setColumnWidth(1, 180);
  [2, 3, 4].forEach(function (c) { panel.setColumnWidth(c, 120); });
  panel.setColumnWidth(5, 30);
  panel.setColumnWidth(6, 110);
  panel.setColumnWidth(7, 165);
  panel.setColumnWidth(8, 195);
  panel.setColumnWidth(9, 60);
  panel.setColumnWidth(10, 235);
  panel.setColumnWidth(11, 100);
  panel.setFrozenRows(5);
}

/* ═══════════════════════════  Registrar  ════════════════════════════ */

/**
 * Disparador instalable sobre la hoja. Hace dos cosas y ninguna te pide nada:
 *
 *  1. Escribes el nombre de un cliente en una fila sin código y la fila se
 *     completa sola: fecha, código —que además queda como link a su página—,
 *     tipo de envío y estado. Registrar una venta es escribir un nombre.
 *  2. Mueves el Estado a "En destino" y anota el día. Ese día es el que
 *     cuentan las alertas de 2, 6, 15 y 25 días — sin él, el paquete puede
 *     pasarse un mes en la agencia sin que nadie lo note.
 *
 * Va como disparador instalable y no como onEdit simple porque el simple no
 * tiene permiso para salir a internet ni escribir en Drive, y porque comparte
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
    completarFila_(hoja, fila);
  }

  if (col === COL_V.ESTADO) {
    sellarEstado_(hoja, fila, String(e.value || "").trim());
  }
}

/** Le pone a una fila lo que le falte para existir. No pisa nada escrito. */
function completarFila_(hoja, fila, usados) {
  if (String(hoja.getRange(fila, COL_V.CODIGO).getValue() || "").trim()) return false;

  const codigo = codigoLibre_(hoja, usados);
  ponerCodigo_(hoja, fila, codigo);

  if (!hoja.getRange(fila, COL_V.FECHA).getValue()) {
    hoja.getRange(fila, COL_V.FECHA).setValue(hoy_());
  }
  if (!String(hoja.getRange(fila, COL_V.ENVIO).getValue() || "").trim()) {
    hoja.getRange(fila, COL_V.ENVIO).setValue(ENVIO_POR_DEFECTO_V);
  }
  if (!String(hoja.getRange(fila, COL_V.ESTADO).getValue() || "").trim()) {
    hoja.getRange(fila, COL_V.ESTADO).setValue(ESTADO_INICIAL_V);
  }
  return true;
}

/**
 * El código se escribe como enlace a su propia página de seguimiento, así que
 * un clic en la celda abre lo que ve el cliente. La celda sigue leyéndose como
 * el código pelado —getValue() de una fórmula devuelve su resultado—, así que
 * ni el Worker ni las macros se enteran de que hay un HYPERLINK debajo.
 */
function ponerCodigo_(hoja, fila, codigo) {
  hoja.getRange(fila, COL_V.CODIGO)
    .setFormula('=HYPERLINK("' + SITIO + "/" + codigo + '","' + codigo + '")');
}

/**
 * Anota el día en que el paquete llegó a la agencia. Al salir de "En destino"
 * se borra: si no, un paquete ya entregado seguiría sumando días y disparando
 * alertas para siempre.
 */
function sellarEstado_(hoja, fila, estado) {
  const celda = hoja.getRange(fila, COL_V.EN_DESTINO);
  if (estado === ESTADO_ESPERANDO_V) {
    if (!celda.getValue()) celda.setValue(hoy_());
  } else {
    celda.clearContent();
  }
}

/**
 * Repasa la hoja entera y arregla lo que el automatismo no pudo:
 *
 *  · Filas con cliente y sin código. Pasa al pegar varias de golpe: un pegado
 *    múltiple no trae valor y el disparador no puede saber qué cambió.
 *  · Códigos repetidos, que salen de copiar una fila entera. Dos ventas con el
 *    mismo código comparten página de seguimiento, y el cliente ve la del otro.
 *  · Ventas ya en la agencia sin día de llegada, que nunca dispararían alerta.
 */
function revisarHojaVentas() {
  const ui = SpreadsheetApp.getUi();
  const hoja = hojaVentas_();
  const ultima = hoja.getLastRow();
  if (ultima < 2) {
    ui.alert("Ventas", "La hoja todavía no tiene ventas.", ui.ButtonSet.OK);
    return;
  }

  const filas = hoja.getRange(2, 1, ultima - 1, TOTAL_COLUMNAS_V).getValues();
  const usados = {};
  const parte = { nuevas: 0, repetidas: 0, fechadas: 0 };

  filas.forEach(function (f, i) {
    if (!String(f[COL_V.CLIENTE - 1] || "").trim()) return;
    const fila = i + 2;
    const codigo = String(f[COL_V.CODIGO - 1] || "").trim().toUpperCase();

    if (!codigo) {
      completarFila_(hoja, fila, usados);
      parte.nuevas++;
    } else if (usados[codigo]) {
      ponerCodigo_(hoja, fila, codigoLibre_(hoja, usados));
      parte.repetidas++;
    } else {
      usados[codigo] = true;
    }

    if (String(f[COL_V.ESTADO - 1] || "").trim() === ESTADO_ESPERANDO_V &&
        !f[COL_V.EN_DESTINO - 1]) {
      // Se cuenta desde hoy: es lo único que sabemos con certeza.
      hoja.getRange(fila, COL_V.EN_DESTINO).setValue(hoy_());
      parte.fechadas++;
    }
  });

  const lineas = [];
  if (parte.nuevas) lineas.push(parte.nuevas + " fila(s) sin código, completadas.");
  if (parte.repetidas) lineas.push(parte.repetidas + " código(s) repetidos, cambiados.");
  if (parte.fechadas) lineas.push(parte.fechadas + " venta(s) en agencia, fechadas hoy.");

  ui.alert("Ventas", lineas.length ? lineas.join("\n") : "Todo en orden, no faltaba nada.",
    ui.ButtonSet.OK);
}

/* ═══════════════════════════  El voucher  ═══════════════════════════ */

/**
 * Guarda la foto en Drive y deja el link en la hoja. La llama el panel del
 * celular, al que se llega con el botón 📷 de la propia fila.
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

  const extension = String(nombre || "").split(".").pop().toLowerCase();
  const archivo = carpetaVouchers_().createFile(
    Utilities.newBlob(
      Utilities.base64Decode(base64), mime,
      codigo + "." + (/^(jpe?g|png|webp)$/.test(extension) ? extension : "jpg")
    )
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
  return "Voucher de " + codigo + " guardado. Ya se ve en su página de seguimiento.";
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

    const venta = ventaDeFila_(fila, i + 2);
    venta.dias = diasDesde_(desde);
    esperando.push(venta);

    // El escalón se cumple hoy, ni antes ni después: por eso la igualdad.
    ALERTAS_V.forEach(function (escalon) {
      if (venta.dias === escalon.dias) {
        venta.escalon = escalon;
        cruzaron.push(venta);
      }
    });
  });

  if (!cruzaron.length) {
    console.log("Sin escalones cruzados hoy; " + esperando.length + " esperando recojo.");
    return avisarSinPendientes_(esperando);
  }

  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: "🔔 " + (cruzaron.length === 1
      ? "Recojo pendiente: " + cruzaron[0].cliente + " (" + cruzaron[0].dias + " días)"
      : cruzaron.length + " pedidos llevan días sin recoger"),
    htmlBody: correoDePendientes_(cruzaron, esperando)
  });

  if (manual_()) {
    const ui = SpreadsheetApp.getUi();
    ui.alert("Ventas",
      "Te mandé un correo con " + cruzaron.length + " aviso(s) de recojo.\n" +
      esperando.length + " pedido(s) esperando en total.", ui.ButtonSet.OK);
  }
}

function correoDePendientes_(cruzaron, esperando) {
  let html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:600px">';
  html += '<h2 style="font-size:19px;margin:0 0 6px">Pedidos sin recoger</h2>';
  html += '<p style="color:#666;font-size:13px;margin:0 0 18px">' +
    "Estos cruzaron hoy un plazo de aviso. La agencia guarda el paquete alrededor de un mes " +
    "antes de devolverlo.</p>";

  cruzaron.forEach(function (v) {
    html += '<div style="border:1.5px solid #E0E0E0;border-left:5px solid #FF2A00;' +
      'border-radius:10px;padding:14px 16px;margin-bottom:12px">' +
      '<div style="font-size:16px;font-weight:bold">' + v.escalon.icono + " " + v.dias +
      " días · " + escaparHtml_(v.cliente) + "</div>" +
      '<div style="font-size:13px;color:#444;margin-top:6px">' +
      escaparHtml_(v.destino || "") + "</div>" +
      (v.saldo > 0 && !v.pagado
        ? '<div style="font-size:13px;color:#C62828;margin-top:4px"><b>Por cobrar: S/ ' +
          v.saldo.toFixed(2) + "</b></div>"
        : "") +
      '<div style="margin-top:10px;font-size:13px">' +
      '<a href="https://wa.me/' + telefonoInternacional_(v.telefono) + "?text=" +
      encodeURIComponent(
        "Hola " + primerNombre_(v.cliente) + "! Tu pedido sigue esperándote en " +
        (v.destino || "la agencia") + ". Acá están los detalles: " + SITIO + "/" + v.codigo
      ) +
      '" style="color:#25D366;font-weight:bold;text-decoration:none">Escribirle por WhatsApp</a>' +
      " &nbsp;·&nbsp; " +
      '<a href="' + SITIO + "/" + v.codigo +
      '" style="color:#068988;text-decoration:none">Ver su seguimiento</a></div></div>';
  });

  if (esperando.length > cruzaron.length) {
    html += '<p style="font-size:13px;color:#666;margin-top:20px">' +
      "En total hay <b>" + esperando.length + "</b> pedido(s) esperando en agencia. " +
      "El detalle completo está en la pestaña «" + HOJA_PANEL_V + "».</p>";
  }

  return html + "</div>";
}

function avisarSinPendientes_(esperando) {
  if (!manual_()) return;
  const ui = SpreadsheetApp.getUi();
  ui.alert("Ventas",
    esperando && esperando.length
      ? esperando.length + " pedido(s) esperando recojo, pero ninguno cruzó hoy un plazo de " +
        "aviso (" + ALERTAS_V.map(function (a) { return a.dias; }).join(", ") + " días).\n\n" +
        "Los ves todos en la pestaña «" + HOJA_PANEL_V + "»."
      : "No hay ningún pedido esperando recojo. Todo al día.",
    ui.ButtonSet.OK);
}

/* ═══════════════════════════  Disparadores  ══════════════════════════ */

/**
 * Instala los dos automatismos: el autocódigo al escribir un cliente y la
 * revisión diaria de recojos. Idempotente: quita los suyos antes de poner.
 */
function instalarDisparadoresVentas() {
  quitarDisparadoresVentas(true);

  ScriptApp.newTrigger("alEditarVenta")
    .forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  ScriptApp.newTrigger("revisarPendientesDeRecojo")
    .timeBased().atHour(9).nearMinute(0).everyDays(1).inTimezone(ZONA).create();

  const ui = SpreadsheetApp.getUi();
  ui.alert("Ventas",
    "Listo. Desde ahora:\n\n" +
    "· Escribes el nombre de un cliente y la fila se completa sola.\n" +
    "· Mover el Estado a «" + ESTADO_ESPERANDO_V + "» anota el día de llegada.\n" +
    "· Cada mañana reviso los recojos y te escribo a " +
    Session.getEffectiveUser().getEmail() + " cuando alguno cumple " +
    ALERTAS_V.map(function (a) { return a.dias; }).join(", ") + " días.",
    ui.ButtonSet.OK);
}

function quitarDisparadoresVentas(silencioso) {
  const mios = ["alEditarVenta", "revisarPendientesDeRecojo"];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (mios.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  if (!silencioso) {
    const ui = SpreadsheetApp.getUi();
    ui.alert("Ventas", "Automatismos desactivados.", ui.ButtonSet.OK);
  }
}

/* ═══════════════════════  Panel del celular  ════════════════════════ */

/**
 * La Web App. Existe porque los menús de Apps Script NO aparecen en la app
 * móvil de Google Sheets, y el momento de marcar «En destino» y subir la foto
 * del voucher es justamente cuando estás en la agencia con el celular.
 *
 * Con ?c=TS-… muestra solo esa venta: es a donde lleva el botón 📷 de la fila,
 * así que llegas directo a subirle la foto sin buscar nada.
 *
 * Se despliega como "Ejecutar como: yo" y "Quién tiene acceso: solo yo": la
 * autenticación es tu cuenta de Google, sin token que pegar.
 */
function doGet(e) {
  const pagina = HtmlService.createTemplateFromFile("PANEL");
  pagina.codigo = (e && e.parameter && e.parameter.c) || "";
  return pagina.evaluate()
    .setTitle("Envíos — Tarot Store Perú")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");
}

/** Todo lo que el panel necesita para dibujarse, en una sola llamada. */
function panelVentasDatos() {
  const hoja = hojaVentas_();
  const ultima = hoja.getLastRow();
  const envios = [];

  if (ultima >= 2) {
    hoja.getRange(2, 1, ultima - 1, TOTAL_COLUMNAS_V).getValues().forEach(function (fila, i) {
      const estado = String(fila[COL_V.ESTADO - 1] || "").trim();
      if (!String(fila[COL_V.CODIGO - 1] || "").trim()) return;
      // Entregados y cancelados no se tocan más: el panel es para lo vivo.
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
  const orden = {};
  orden[ESTADO_ESPERANDO_V] = 0;
  orden["En camino"] = 1;
  orden[ESTADO_INICIAL_V] = 2;
  envios.sort(function (a, b) {
    const pa = orden[a.estado] === undefined ? 9 : orden[a.estado];
    const pb = orden[b.estado] === undefined ? 9 : orden[b.estado];
    return pa !== pb ? pa - pb : (b.dias || 0) - (a.dias || 0);
  });

  return { envios: envios, estados: ESTADOS_V, alertas: ALERTAS_V, agencia: ENVIO_AGENCIA_V };
}

/** Cambia el estado desde el panel. Devuelve la venta ya actualizada. */
function panelVentasCambiarEstado(codigo, estado) {
  if (ESTADOS_V.indexOf(estado) === -1) throw new Error("Estado desconocido: " + estado);

  const hoja = hojaVentas_();
  const fila = filaDeCodigo_(hoja, codigo);
  if (!fila) throw new Error("No existe la venta " + codigo + ".");

  hoja.getRange(fila, COL_V.ESTADO).setValue(estado);
  sellarEstado_(hoja, fila, estado);
  return leerVenta_(hoja, fila);
}

/** Marca el saldo como cobrado desde el panel. */
function panelVentasMarcarPagado(codigo) {
  const hoja = hojaVentas_();
  const fila = filaDeCodigo_(hoja, codigo);
  if (!fila) throw new Error("No existe la venta " + codigo + ".");
  hoja.getRange(fila, COL_V.PAGADO).setValue(true);
  return "Saldo de " + codigo + " marcado como cobrado.";
}

/** Enseña la URL del panel para abrirla o guardarla en el celular. */
function abrirPanelMovil() {
  const ui = SpreadsheetApp.getUi();
  const url = urlDelPanel_();

  if (!url) {
    ui.alert("Panel del celular",
      "Todavía no está publicado.\n\n" +
      "En el editor de Apps Script: Implementar → Nueva implementación → " +
      "Aplicación web → Ejecutar como: Yo · Quién tiene acceso: Solo yo.\n\n" +
      "Después vuelve a correr «Preparar hoja de Ventas» para que el botón 📷 " +
      "de cada fila apunte al panel.",
      ui.ButtonSet.OK);
    return;
  }

  // Apps Script no puede abrir una pestaña desde el servidor, así que el link
  // se abre desde un diálogo. El clic automático lo bloquean los navegadores,
  // por eso además hay un botón: si el bloqueo salta, sigue habiendo qué pulsar.
  const seguro = escaparHtml_(url);
  ui.showModalDialog(
    HtmlService.createHtmlOutput(
      '<div style="font-family:Inter,Arial,sans-serif;padding:18px;text-align:center">' +
      '<a id="a" href="' + seguro + '" target="_blank" rel="noopener" ' +
      'style="display:block;padding:14px;background:#068988;color:#fff;border-radius:10px;' +
      'font-weight:700;text-decoration:none;font-size:15px">Abrir el panel</a>' +
      '<p style="font-size:12px;color:#666;margin-top:12px;word-break:break-all">' +
      seguro + "</p>" +
      "<script>document.getElementById('a').click();<\/script></div>"
    ).setWidth(360).setHeight(190),
    "Panel del celular"
  );
}

/** La URL publicada de la Web App, o "" si todavía no se ha publicado. */
function urlDelPanel_() {
  try {
    return ScriptApp.getService().getUrl() || "";
  } catch (err) {
    return "";
  }
}

/* ══════════════════════════  Utilidades  ════════════════════════════ */

function hojaVentas_() {
  const hoja = SpreadsheetApp.getActive().getSheetByName(HOJA_VENTAS);
  if (!hoja) {
    throw new Error('No existe la pestaña "' + HOJA_VENTAS + '". Corre Ventas → Preparar hoja.');
  }
  return hoja;
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
  const texto = function (col) { return String(v[col - 1] || "").trim(); };
  const num = function (col) {
    const x = v[col - 1];
    const n = typeof x === "number" ? x : parseFloat(String(x).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? 0 : n;
  };
  const pagado = v[COL_V.PAGADO - 1] === true;

  return {
    fila: fila,
    codigo: texto(COL_V.CODIGO),
    cliente: texto(COL_V.CLIENTE),
    telefono: texto(COL_V.WHATSAPP),
    envio: texto(COL_V.ENVIO),
    dni: texto(COL_V.DNI),
    adelanto: num(COL_V.ADELANTO),
    // Si marcó la casilla no queda nada por cobrar, diga lo que diga la celda
    // del saldo: la casilla es lo último que tocó.
    saldo: pagado ? 0 : Math.max(0, num(COL_V.SALDO)),
    pagado: pagado,
    destino: texto(COL_V.DESTINO),
    clave: texto(COL_V.CLAVE),
    estado: texto(COL_V.ESTADO),
    notas: texto(COL_V.NOTAS),
    enAgencia: texto(COL_V.ENVIO) === ENVIO_AGENCIA_V
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
 *
 * `usados` es opcional y sirve para recorrer la hoja entera sin releerla en
 * cada fila; cuando se pasa, se va llenando con lo que se reparte.
 */
function codigoLibre_(hoja, usados) {
  const yaVistos = usados || {};
  if (!usados) {
    const ultima = hoja.getLastRow();
    if (ultima >= 2) {
      hoja.getRange(2, COL_V.CODIGO, ultima - 1, 1).getValues().forEach(function (f) {
        const c = String(f[0] || "").trim().toUpperCase();
        if (c) yaVistos[c] = true;
      });
    }
  }

  const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const DIGITOS = "23456789";
  const de = function (alfabeto) {
    return alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  };

  for (let i = 0; i < 50; i++) {
    const codigo = "TS-" + de(LETRAS) + de(DIGITOS) + de(LETRAS) +
      de(DIGITOS) + de(DIGITOS) + de(DIGITOS) + de(LETRAS);
    if (!yaVistos[codigo]) {
      yaVistos[codigo] = true;
      return codigo;
    }
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

/**
 * El texto que se le manda al cliente desde el panel. Cambia con el estado
 * porque un "ya salió" y un "ya puedes recogerlo" piden cosas distintas: el
 * primero pide paciencia, el segundo pide que agarre su DNI y vaya.
 *
 * La columna «Avisar» de la hoja arma este mismo mensaje con fórmulas.
 */
function mensajeParaCliente_(venta) {
  const link = SITIO + "/" + venta.codigo;
  const hola = "Hola " + primerNombre_(venta.cliente) + "! ";

  if (venta.estado === ESTADO_ESPERANDO_V) {
    return venta.enAgencia
      ? hola + "Tu pedido ya llegó a " + (venta.destino || "la agencia") +
        " y puedes recogerlo. Lleva tu DNI físico. Acá está tu clave de recojo y todo lo " +
        "que necesitas: " + link
      : hola + "Tu pedido ya llegó a su destino. Acá puedes ver los detalles: " + link;
  }
  if (venta.estado === "En camino") {
    return hola + "Tu pedido ya salió. Te aviso apenas llegue. Puedes seguirlo acá: " + link;
  }
  if (venta.estado === "Entregado") {
    return hola + "Confirmo que ya recogiste tu pedido. Cualquier cosa me escribes.";
  }
  return hola + "Ya tengo registrado tu pedido. Acá puedes ver su estado cuando quieras: " + link;
}

function primerNombre_(nombre) {
  return String(nombre || "").trim().split(/\s+/)[0] || "";
}

/** Hoy a medianoche, hora de Lima. Sin hora: lo que se cuenta son días. */
function hoy_() {
  const lima = Utilities.formatDate(new Date(), ZONA, "yyyy/MM/dd").split("/");
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
 * Un celular peruano de nueve dígitos se asume peruano; lo demás se respeta.
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

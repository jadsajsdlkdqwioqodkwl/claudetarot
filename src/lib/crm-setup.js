/**
 * Deja la hoja lista como CRM del vendedor. Idempotente: se puede correr las
 * veces que haga falta y siempre termina en el mismo estado.
 *
 * Vive aquí y no en el script para que lo pueda ejecutar tanto `npm run
 * setup:sheet` (con .dev.vars) como POST /api/setup desde el Worker, que ya
 * tiene la clave privada cargada como secret. Así preparar la hoja no obliga
 * a tener las credenciales en la máquina.
 *
 * Hace tres cosas:
 *  1. Escribe los encabezados en el orden que espera el backend.
 *  2. Formatea la pestaña de pedidos para trabajar: fila fija, filtro, Estado
 *     como desplegable de colores, importes en soles y las columnas de la
 *     Conversions API ocultas.
 *  3. Crea la pestaña "Panel" con el resumen por día.
 */
import { updateValues, getValues, getSpreadsheet, batchUpdate } from "./google-sheets.js";
import { COLUMNAS, ESTADOS, ESTADOS_VENDIDOS, RANGO_ENCABEZADOS, indiceDe, letraDe } from "./hoja.js";

const PANEL = "Panel";

const rgb = (r, g, b) => ({ red: r / 255, green: g / 255, blue: b / 255 });

/**
 * @param {object} env  GOOGLE_SHEET_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY
 * @returns {Promise<string[]>} el parte de lo que hizo, línea a línea
 */
export async function prepararHoja(env) {
  const sheetName = env.GOOGLE_SHEET_NAME || "Pedidos";
  const pasos = [];
  const registrar = (...partes) => pasos.push(partes.join(" "));

  /* ── 1. Encabezados ─────────────────────────────────────────────────────── */

  const [existente = []] = await getValues(env, `${sheetName}!${RANGO_ENCABEZADOS}`);
  if (existente.join("|") !== COLUMNAS.join("|")) {
    if (existente.length) {
      registrar("Encabezados anteriores sobrescritos:", existente.join(" | "));
    }
    await updateValues(env, `${sheetName}!${RANGO_ENCABEZADOS}`, [COLUMNAS]);
    registrar(`Encabezados escritos: ${COLUMNAS.length} columnas (${RANGO_ENCABEZADOS}).`);
  } else {
    registrar("Los encabezados ya estaban correctos.");
  }

  /* ── 2. Formato del CRM ─────────────────────────────────────────────────── */

  const libro = await getSpreadsheet(env);
  const pestana = (titulo) => libro.sheets.find((s) => s.properties.title === titulo);

  const pedidos = pestana(sheetName);
  if (!pedidos) {
    throw new Error(`No existe la pestaña "${sheetName}" en esta hoja.`);
  }
  const idPedidos = pedidos.properties.sheetId;

  const col = (nombre) => indiceDe(nombre);
  const colEstado = col("Estado");
  const primeraCapi = col("FBP");

  /** Colorea la fila entera según el Estado, para leer la lista de un vistazo. */
  const reglaEstado = (estado, fondo, indice) => ({
    addConditionalFormatRule: {
      index: indice,
      rule: {
        ranges: [{ sheetId: idPedidos, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: COLUMNAS.length }],
        booleanRule: {
          condition: {
            type: "CUSTOM_FORMULA",
            values: [{ userEnteredValue: `=$${letraDe(colEstado)}2="${estado}"` }]
          },
          format: { backgroundColor: fondo }
        }
      }
    }
  });


  const requests = [
    // Fila de encabezados fija y en negrita.
    {
      updateSheetProperties: {
        properties: { sheetId: idPedidos, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount"
      }
    },
    {
      repeatCell: {
        range: { sheetId: idPedidos, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, foregroundColor: rgb(255, 255, 255) },
            backgroundColor: rgb(17, 17, 17),
            verticalAlignment: "MIDDLE"
          }
        },
        fields: "userEnteredFormat(textFormat,backgroundColor,verticalAlignment)"
      }
    },

    // Fecha legible y ordenable.
    {
      repeatCell: {
        range: { sheetId: idPedidos, startRowIndex: 1, startColumnIndex: col("Fecha"), endColumnIndex: col("Fecha") + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: "dd/mm/yyyy hh:mm" } } },
        fields: "userEnteredFormat.numberFormat"
      }
    },

    // Importes en soles.
    ...["Subtotal", "Total"].map((nombre) => ({
      repeatCell: {
        range: { sheetId: idPedidos, startRowIndex: 1, startColumnIndex: col(nombre), endColumnIndex: col(nombre) + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: '"S/ "#,##0.00' } } },
        fields: "userEnteredFormat.numberFormat"
      }
    })),

    // Estado como desplegable: es el toggle del vendedor.
    {
      setDataValidation: {
        range: { sheetId: idPedidos, startRowIndex: 1, startColumnIndex: colEstado, endColumnIndex: colEstado + 1 },
        rule: {
          condition: { type: "ONE_OF_LIST", values: ESTADOS.map((e) => ({ userEnteredValue: e })) },
          showCustomUi: true,
          strict: true
        }
      }
    },

    // Filtro en la cabecera: de ahí sale el filtrado por día.
    { clearBasicFilter: { sheetId: idPedidos } },
    {
      setBasicFilter: {
        filter: { range: { sheetId: idPedidos, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: COLUMNAS.length } }
      }
    },

    // Las columnas de la Conversions API se ocultan: el vendedor no las usa y
    // el Apps Script las lee igual estando ocultas.
    {
      updateDimensionProperties: {
        range: { sheetId: idPedidos, dimension: "COLUMNS", startIndex: primeraCapi, endIndex: COLUMNAS.length },
        properties: { hiddenByUser: true },
        fields: "hiddenByUser"
      }
    },

    // Anchos cómodos para lo que sí se lee.
    ...[["Nombre", 190], ["WhatsApp", 130], ["Dirección / Agencia", 260], ["Producto", 200], ["Estado", 130]]
      .map(([nombre, ancho]) => ({
        updateDimensionProperties: {
          range: { sheetId: idPedidos, dimension: "COLUMNS", startIndex: col(nombre), endIndex: col(nombre) + 1 },
          properties: { pixelSize: ancho },
          fields: "pixelSize"
        }
      }))
  ];

  // Las reglas de color se reemplazan enteras para que el script sea idempotente.
  for (let i = (pedidos.conditionalFormats?.length || 0) - 1; i >= 0; i--) {
    requests.push({ deleteConditionalFormatRule: { sheetId: idPedidos, index: i } });
  }
  [
    ["Pagado", rgb(226, 246, 228)],
    ["Enviado", rgb(226, 240, 253)],
    ["Cancelado", rgb(245, 245, 245)]
  ].forEach(([estado, fondo], i) => requests.push(reglaEstado(estado, fondo, i)));

  /* ── 3. Pestaña Panel ───────────────────────────────────────────────────── */

  if (!pestana(PANEL)) {
    requests.push({ addSheet: { properties: { title: PANEL, gridProperties: { rowCount: 400, columnCount: 8 } } } });
  }

  await batchUpdate(env, requests);
    registrar(`Pestaña "${sheetName}" formateada como CRM.`);

  // Rangos con nombre de columna, no con letras a mano: si el esquema cambia,
  // las fórmulas siguen apuntando a la columna correcta.
  const cFecha = letraDe(col("Fecha"));
  const cTotal = letraDe(col("Total"));
  const cEstado = letraDe(col("Estado"));
  const rFecha = `${sheetName}!$${cFecha}$2:$${cFecha}`;
  const rTotal = `${sheetName}!$${cTotal}$2:$${cTotal}`;
  const rEstado = `${sheetName}!$${cEstado}$2:$${cEstado}`;

  /** Suma o cuenta por día, sumando los estados que cuentan como venta. */
  const porEstadosVendidos = (fn, rangoSuma) =>
    ESTADOS_VENDIDOS.map((estado) =>
      `${fn}(${rangoSuma ? rangoSuma + "," : ""}${rFecha},">="&A4:A,${rFecha},"<"&A4:A+1,${rEstado},"${estado}")`
    ).join(" + ");

  const panel = [
    ["Panel de ventas", "", "", "", "", ""],
    [`Cada fila es un día. "Cerrados" cuenta los estados ${ESTADOS_VENDIDOS.join(" y ")}.`, "", "", "", "", ""],
    ["Día", "Leads", "Cerrados", "Ingresos cerrados", "Ingresos potenciales", "Por contactar"],
    [
      `=IFERROR(SORT(UNIQUE(FILTER(INT(${rFecha}), ${rFecha}<>"")), 1, FALSE), "")`,
      `=ARRAYFORMULA(IF(A4:A="","",COUNTIFS(${rFecha},">="&A4:A,${rFecha},"<"&A4:A+1)))`,
      `=ARRAYFORMULA(IF(A4:A="","",${porEstadosVendidos("COUNTIFS")}))`,
      `=ARRAYFORMULA(IF(A4:A="","",${porEstadosVendidos("SUMIFS", rTotal)}))`,
      `=ARRAYFORMULA(IF(A4:A="","",SUMIFS(${rTotal},${rFecha},">="&A4:A,${rFecha},"<"&A4:A+1)))`,
      `=ARRAYFORMULA(IF(A4:A="","",COUNTIFS(${rFecha},">="&A4:A,${rFecha},"<"&A4:A+1,${rEstado},"${ESTADOS[0]}")))`
    ]
  ];

  await updateValues(env, `${PANEL}!A1:F4`, panel);

  const idPanel = (await getSpreadsheet(env)).sheets.find((s) => s.properties.title === PANEL).properties.sheetId;
  await batchUpdate(env, [
    {
      updateSheetProperties: {
        properties: { sheetId: idPanel, gridProperties: { frozenRowCount: 3 } },
        fields: "gridProperties.frozenRowCount"
      }
    },
    {
      repeatCell: {
        range: { sheetId: idPanel, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } },
        fields: "userEnteredFormat.textFormat"
      }
    },
    {
      repeatCell: {
        range: { sheetId: idPanel, startRowIndex: 2, endRowIndex: 3 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, foregroundColor: rgb(255, 255, 255) },
            backgroundColor: rgb(17, 17, 17)
          }
        },
        fields: "userEnteredFormat(textFormat,backgroundColor)"
      }
    },
    {
      repeatCell: {
        range: { sheetId: idPanel, startRowIndex: 3, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "ddd dd/mm/yyyy" } } },
        fields: "userEnteredFormat.numberFormat"
      }
    },
    ...[3, 4].map((c) => ({
      repeatCell: {
        range: { sheetId: idPanel, startRowIndex: 3, startColumnIndex: c, endColumnIndex: c + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: '"S/ "#,##0.00' } } },
        fields: "userEnteredFormat.numberFormat"
      }
    })),
    {
      updateDimensionProperties: {
        range: { sheetId: idPanel, dimension: "COLUMNS", startIndex: 0, endIndex: 6 },
        properties: { pixelSize: 165 },
        fields: "pixelSize"
      }
    }
  ]);

    registrar(`Pestaña "${PANEL}" creada con el resumen por día.`);
  

  return pasos;
}

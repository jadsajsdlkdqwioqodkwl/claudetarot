/**
 * Creativos → Google Drive. Va en la hoja "Creativos Tarot Store — feedback"
 * (Extensiones → Apps Script), NO en la del CRM: es otro libro y otro proyecto.
 *
 * Cada 10 min revisa la pestaña Creativos: toda fila con Archivo (columna N)
 * y sin Drive (columna O) baja la imagen en resolución completa desde GitHub
 * y la guarda en Mi unidad / Creativos Tarot Store / <Lote>. En O deja el
 * link al archivo para abrirlo o descargarlo.
 *
 * Instalación: pegar este archivo, guardar, elegir la función "instalar" y
 * pulsar Ejecutar (pide permisos de Drive y de conexión externa una vez).
 */

const CREATIVOS_HOJA = "Creativos";
const CREATIVOS_CARPETA = "Creativos Tarot Store";
const CREATIVOS_RAW = "https://raw.githubusercontent.com/jadsajsdlkdqwioqodkwl/claudetarot/main/";
const COL_LOTE = 1;
const COL_ID = 2;
const COL_ARCHIVO = 14;
const COL_DRIVE = 15;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Creativos")
    .addItem("Guardar en Drive ahora", "guardarEnDrive")
    .addItem("Instalar guardado automático", "instalar")
    .addToUi();
}

function instalar() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "guardarEnDrive")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("guardarEnDrive").timeBased().everyMinutes(10).create();
  guardarEnDrive();
}

function guardarEnDrive() {
  const hoja = SpreadsheetApp.getActive().getSheetByName(CREATIVOS_HOJA);
  const ultima = hoja.getLastRow();
  if (ultima < 2) return;
  const filas = hoja.getRange(2, 1, ultima - 1, COL_DRIVE).getValues();
  const raiz = carpeta_(DriveApp.getRootFolder(), CREATIVOS_CARPETA);
  const inicio = Date.now();

  filas.forEach((f, i) => {
    const archivo = String(f[COL_ARCHIVO - 1] || "").trim();
    if (!archivo || f[COL_DRIVE - 1] || Date.now() - inicio > 5 * 60 * 1000) return;
    const res = UrlFetchApp.fetch(CREATIVOS_RAW + archivo, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return; // aún no llega a main: se reintenta en 10 min
    const lote = String(f[COL_LOTE - 1] || "sin-lote");
    const nombre = lote + "_" + f[COL_ID - 1] + "_" + archivo.split("/").pop();
    const file = carpeta_(raiz, lote).createFile(res.getBlob().setName(nombre));
    // Link como texto enriquecido: una fórmula HYPERLINK depende del separador
    // del idioma de la hoja (en español es ";") y salía #ERROR!.
    const link = SpreadsheetApp.newRichTextValue().setText("Abrir en Drive").setLinkUrl(file.getUrl()).build();
    hoja.getRange(i + 2, COL_DRIVE).setRichTextValue(link);
  });
}

function carpeta_(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

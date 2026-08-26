/**
 * Esquema de la pestaña "Ventas": el CRM de reporte manual.
 *
 * Es una tabla aparte de "Pedidos". Pedidos lo escribe el formulario de la
 * landing (leads); Ventas la escribe el vendedor a mano. Ninguna toca a la otra.
 *
 * La tabla es corta a propósito. De las 16 columnas, **solo se escriben 10**, y
 * tres de esas son un clic (dos desplegables y una casilla). El resto se
 * rellena solo: fecha, código, alerta de recojo y los dos botones de la fila.
 *
 * Este archivo es la única fuente del orden de columnas para el Worker.
 * `apps-script/VENTAS.gs` repite la lista porque corre en otro runtime y no
 * puede importar de aquí; `npm run check` compara las dos y falla si se
 * desalinean, que es el único modo en que esto se rompe en silencio.
 */

export const COLUMNAS_VENTA = [
  "Fecha",            // se pone sola
  "Código",           // se pone solo, y es el link a la página del cliente
  "Cliente",
  "WhatsApp",
  "Envío",            // desplegable
  "DNI",              // solo provincia
  "Adelanto",
  "Saldo",
  "Pagado",           // casilla
  "Destino",          // dirección (Lima) o agencia (provincia)
  "Clave Shalom",     // solo provincia
  "Estado",           // desplegable
  "Notas",
  "Alerta",           // se calcula sola
  "Avisar",           // botón: WhatsApp con el mensaje ya escrito
  "Voucher",          // botón: subir o cambiar la foto
  // Ocultas: plomería que nadie escribe a mano.
  "En destino desde",
  "Drive ID"
];

/** Las que el vendedor llena. El resto se rellenan solas. */
export const COLUMNAS_QUE_SE_ESCRIBEN = [
  "Cliente", "WhatsApp", "Envío", "DNI", "Adelanto",
  "Saldo", "Pagado", "Destino", "Clave Shalom", "Estado", "Notas"
];

/**
 * Cómo sale el paquete. Es lo único que decide qué le pide la hoja y qué le
 * dice la página al cliente: un envío por agencia necesita DNI y clave de
 * recojo; uno de Lima, ninguno de los dos.
 */
export const ENVIOS = ["Lima", "Shalom", "Dinsides"];
export const ENVIO_POR_DEFECTO = "Lima";

/** El único que obliga al cliente a ir a un mostrador con su DNI. */
export const ENVIO_AGENCIA = "Shalom";

/**
 * El recorrido del envío. La página dibuja su línea de tiempo desde acá, así
 * que el orden importa. "Cancelado" va al final porque no es un paso del
 * camino: es salirse de él.
 */
export const ESTADOS_ENVIO = ["Pendiente", "En camino", "En destino", "Entregado", "Cancelado"];

export const ESTADO_INICIAL = "Pendiente";

/** Único estado en el que el paquete espera al cliente en la agencia. */
export const ESTADO_ESPERANDO = "En destino";

/**
 * Los pasos que ve el cliente, según cómo le llega el pedido.
 *
 * Un envío a Lima no pasa por ninguna agencia, así que enseñarle "llegó a la
 * agencia" sería mentirle sobre un paso que nunca va a ocurrir.
 *
 * Salvo que ya esté ahí: si el vendedor marcó "En destino" en un envío que no
 * es por agencia, ese paso existe de verdad para ese pedido y hay que
 * dibujarlo. Sin esta excepción el estado no aparecía en la lista, la página
 * no encontraba dónde estaba y terminaba resaltando el primer paso — le decía
 * al cliente que su pedido seguía sin salir.
 */
export function pasosDe(envio, estado) {
  const conAgencia = envio === ENVIO_AGENCIA || estado === ESTADO_ESPERANDO;
  return conAgencia
    ? ["Pendiente", "En camino", "En destino", "Entregado"]
    : ["Pendiente", "En camino", "Entregado"];
}

/**
 * Días que lleva el paquete esperando en la agencia y qué avisar en cada
 * escalón. La hoja pinta la columna "Alerta" con esto y el correo diario
 * repite solo las ventas que cruzaron un escalón.
 *
 * Shalom guarda el paquete alrededor de un mes antes de devolverlo al
 * remitente; el escalón de 25 días es el último aviso útil.
 */
export const ALERTAS_RECOJO = [
  { dias: 2, icono: "🟡", texto: "sin recoger — recuérdale" },
  { dias: 6, icono: "🟠", texto: "sin recoger — insiste" },
  { dias: 15, icono: "🔴", texto: "sin recoger — riesgo de devolución" },
  { dias: 25, icono: "⛔", texto: "sin recoger — Shalom lo devuelve pronto" }
];

/**
 * Alfabeto del código de venta. Sin I, O, 0 ni 1: el cliente lo va a dictar
 * por teléfono y esos cuatro se confunden entre sí.
 */
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITOS = "23456789";

/** Forma del código: TS- y luego letra, dígito, letra, tres dígitos, letra. */
export const RE_CODIGO = /^TS-[A-HJ-NP-Z][2-9][A-HJ-NP-Z][2-9]{3}[A-HJ-NP-Z]$/;

/** ¿Es un código de venta bien formado? */
export function esCodigo(valor) {
  return typeof valor === "string" && RE_CODIGO.test(valor.trim().toUpperCase());
}

/**
 * Un código nuevo, aleatorio. No es correlativo a propósito: la página de
 * seguimiento no tiene login, así que el código es lo único que la protege.
 * Correlativo, cualquiera sumaría uno y vería el envío del vecino.
 *
 * @param {() => number} azar  inyectable para poder probarlo
 */
export function nuevoCodigo(azar = Math.random) {
  const de = (alfabeto) => alfabeto[Math.floor(azar() * alfabeto.length)];
  return (
    "TS-" +
    de(LETRAS) + de(DIGITOS) + de(LETRAS) +
    de(DIGITOS) + de(DIGITOS) + de(DIGITOS) + de(LETRAS)
  );
}

/** Índice 0-based de una columna por nombre. Lanza si no existe. */
export function indiceVenta(nombre) {
  const i = COLUMNAS_VENTA.indexOf(nombre);
  if (i === -1) throw new Error(`La pestaña Ventas no tiene la columna "${nombre}"`);
  return i;
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". Ventas pasa de la Z, así que hace falta. */
export function letraVenta(indice) {
  let n = indice;
  let letra = "";
  do {
    letra = String.fromCharCode(65 + (n % 26)) + letra;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letra;
}

/** "A1:R1" — el rango que ocupan los encabezados de Ventas. */
export const RANGO_ENCABEZADOS_VENTA = `A1:${letraVenta(COLUMNAS_VENTA.length - 1)}1`;

/** El rango de datos completo, sin encabezado: "A2:R". */
export const RANGO_DATOS_VENTA = `A2:${letraVenta(COLUMNAS_VENTA.length - 1)}`;

/**
 * Una casilla de la hoja como booleano.
 *
 * getValues del Worker devuelve lo que se ve en la celda, y una casilla marcada
 * se ve como el texto "TRUE". Comprobarla con Boolean() daría verdadero también
 * para "FALSE", que es justo el caso contrario.
 */
export function esVerdadero(valor) {
  if (typeof valor === "boolean") return valor;
  return /^(true|verdadero|sí|si|x|✓)$/i.test(String(valor ?? "").trim());
}

/**
 * Un número de la hoja como número de verdad.
 *
 * Sheets no devuelve el número crudo sino lo que se ve en la celda: con el
 * formato de soles, 1234.5 llega como "S/ 1,234.50". Cambiar la coma por punto
 * a lo bruto lo convertía en 1.234 — mil doscientos soles se volvían uno.
 *
 * La regla: el último separador que aparece es el decimal y el otro es de
 * miles. Con una sola coma seguida de tres dígitos y algo delante ("1,234"),
 * gana la lectura de miles, que es la que escribe Sheets.
 */
export function aNumero(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

  let texto = String(valor ?? "").replace(/[^\d.,-]/g, "");
  if (!texto) return 0;

  const ultimaComa = texto.lastIndexOf(",");
  const ultimoPunto = texto.lastIndexOf(".");

  if (ultimaComa !== -1 && ultimoPunto !== -1) {
    const decimal = ultimaComa > ultimoPunto ? "," : ".";
    const miles = decimal === "," ? "." : ",";
    texto = texto.split(miles).join("").replace(decimal, ".");
  } else if (ultimaComa !== -1) {
    const esMiles = /\d,\d{3}(?!\d)/.test(texto);
    texto = esMiles ? texto.split(",").join("") : texto.replace(",", ".");
  }

  const n = Number.parseFloat(texto);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Días enteros que un paquete lleva esperando en la agencia.
 * Cuenta por día calendario de Lima, no por horas: si lo dejaste ayer a las
 * 6 pm y hoy son las 8 am, para el cliente es "1 día", no "0".
 */
export function diasEsperando(desde, ahora = new Date()) {
  const inicio = fechaSuelta(desde);
  if (!inicio) return null;
  const dia = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((diaLima(ahora) - diaLima(inicio)) / dia));
}

/** La alerta que corresponde a esos días, o null si todavía no toca ninguna. */
export function alertaDe(dias) {
  if (dias === null || dias === undefined) return null;
  let activa = null;
  for (const escalon of ALERTAS_RECOJO) {
    if (dias >= escalon.dias) activa = escalon;
  }
  if (!activa) return null;
  return { ...activa, diasReales: dias, mensaje: `${activa.icono} ${dias} días ${activa.texto}` };
}

/** Medianoche de Lima del día al que pertenece esa fecha, en milisegundos. */
function diaLima(fecha) {
  const desplazada = new Date(fecha.getTime() - 5 * 3600 * 1000);
  return Date.UTC(
    desplazada.getUTCFullYear(),
    desplazada.getUTCMonth(),
    desplazada.getUTCDate()
  );
}

/**
 * Lee una fecha como la escribe la hoja: "dd/mm/yyyy", "yyyy-mm-dd" o
 * "yyyy-mm-dd hh:mm:ss". Devuelve null si no es una fecha.
 *
 * El formato peruano va primero porque Sheets muestra "05/09/2026" y leerlo
 * como mes 5 día 9 desplaza la cuenta de días varios meses sin avisar.
 */
export function fechaSuelta(valor) {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  const texto = String(valor ?? "").trim();
  if (!texto) return null;

  const peruano = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto);
  if (peruano) {
    const [, d, m, a] = peruano;
    return new Date(Date.UTC(+a, +m - 1, +d) + 5 * 3600 * 1000);
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) {
    const [, a, m, d] = iso;
    return new Date(Date.UTC(+a, +m - 1, +d) + 5 * 3600 * 1000);
  }

  return null;
}

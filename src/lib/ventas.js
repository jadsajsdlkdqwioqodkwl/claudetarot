/**
 * Esquema de la pestaña "Ventas": el CRM de reporte manual.
 *
 * Es una tabla aparte de "Pedidos". Pedidos lo escribe el formulario de la
 * landing (leads); Ventas la escribe el vendedor a mano. Ninguna toca a la otra.
 *
 * La tabla es corta a propósito: **solo se escriben cinco celdas por venta**, y
 * dos de ellas son un desplegable. Todo lo demás se rellena solo.
 *
 * Este archivo es la única fuente del orden de columnas para el Worker.
 * `apps-script/VENTAS.gs` repite la lista porque corre en otro runtime y no
 * puede importar de aquí; `npm run check` compara las dos y falla si se
 * desalinean, que es el único modo en que esto se rompe en silencio.
 */

export const COLUMNAS_VENTA = [
  "Fecha",                 // se pone sola, y tiene calendario para corregirla
  "DNI / WSP",             // el único dato de contacto: "45781234 / 987654321"
  "Envío",                 // desplegable
  "Adelanto",
  "Saldo",
  "Clave Shalom / Notas",  // la clave primero, tus notas después de la barra
  "Alerta",                // se calcula sola
  "Avisar",                // botón: WhatsApp al cliente, con el mensaje escrito
  "Voucher",               // botón: subir o cambiar la foto
  "Estado",                // desplegable — la única columna que se actualiza
  // Ocultas: plomería que nadie escribe ni lee a mano.
  "Código",
  "En destino desde",
  "Drive ID"
];

/** Las que el vendedor llena. El resto se rellenan solas. */
export const COLUMNAS_QUE_SE_ESCRIBEN = [
  "DNI / WSP", "Envío", "Adelanto", "Saldo", "Clave Shalom / Notas", "Estado"
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
 * El recorrido del envío, en una sola columna.
 *
 * No hay un "Entregado" aparte de "Pagado": en este negocio un paquete
 * recogido es un paquete cobrado, y dos columnas para el mismo momento
 * obligaban a acordarse de tocar las dos. "Cancelado" va al final porque no
 * es un paso del camino: es salirse de él.
 */
export const ESTADOS_ENVIO = ["Pendiente", "En camino", "En destino", "Pagado", "Cancelado"];

export const ESTADO_INICIAL = "Pendiente";

/** Único estado en el que el paquete espera al cliente en la agencia. */
export const ESTADO_ESPERANDO = "En destino";

/** El final feliz: recogido y cobrado. */
export const ESTADO_FINAL = "Pagado";

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
    ? [ESTADO_INICIAL, "En camino", ESTADO_ESPERANDO, ESTADO_FINAL]
    : [ESTADO_INICIAL, "En camino", ESTADO_FINAL];
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

/**
 * El celular que hay dentro de "DNI / WSP".
 *
 * La celda es una sola y el vendedor escribe lo que tiene: a veces el DNI y el
 * celular, a veces solo uno. Un celular peruano son nueve dígitos que empiezan
 * en 9 y un DNI son ocho, así que se distinguen sin pedirle a nadie que
 * respete ningún formato.
 *
 * Primero se quita lo que adorna un número —espacios, puntos, paréntesis y el
 * "+"— para que "+51 987 654 321" siga siendo un número. La barra y el guion
 * NO se tocan: en esta celda separan un dato del otro, y borrarlos pegaría el
 * DNI con el celular en una tira de dígitos donde ya no se sabe dónde empieza
 * cada uno.
 *
 * Después se exige que el número esté rodeado de algo que no sea un dígito, o
 * de los bordes de la celda. Sin ese requisito, "10293847987654321" da un
 * falso positivo: hay un 9 seguido de ocho dígitos en medio que no es el
 * teléfono de nadie.
 *
 * RE2 (el motor de Google Sheets) admite este mismo patrón, y la columna
 * "Avisar" lo usa tal cual: si aquí y allá dijeran cosas distintas, el botón
 * de la hoja escribiría a un número y el panel a otro.
 */
const RE_ADORNOS = /[\s.()+]/g;
const RE_CELULAR = /(?:^|\D)(?:51)?(9\d{8})(?:\D|$)/;

export function telefonoDe(texto) {
  const encontrado = RE_CELULAR.exec(String(texto ?? "").replace(RE_ADORNOS, ""));
  return encontrado ? encontrado[1] : "";
}

/**
 * La clave de recojo que hay dentro de "Clave Shalom / Notas".
 *
 * Se toma lo que va antes de la primera barra, pero **solo si parece una
 * clave**: corta, sin espacios y sin signos. Es lo que impide que una celda
 * con puras notas internas ("cliente pidió factura") acabe publicada en una
 * página sin login como si fuera su clave de recojo. Ante la duda, no hay
 * clave — fallar hacia el silencio es lo correcto cuando lo otro es filtrar.
 */
const RE_CLAVE = /^[A-Za-z0-9-]{3,14}$/;

export function claveDe(texto) {
  const primero = String(texto ?? "").split("/")[0].trim();
  return RE_CLAVE.test(primero) ? primero : "";
}

/** Índice 0-based de una columna por nombre. Lanza si no existe. */
export function indiceVenta(nombre) {
  const i = COLUMNAS_VENTA.indexOf(nombre);
  if (i === -1) throw new Error(`La pestaña Ventas no tiene la columna "${nombre}"`);
  return i;
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function letraVenta(indice) {
  let n = indice;
  let letra = "";
  do {
    letra = String.fromCharCode(65 + (n % 26)) + letra;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letra;
}

/** "A1:M1" — el rango que ocupan los encabezados de Ventas. */
export const RANGO_ENCABEZADOS_VENTA = `A1:${letraVenta(COLUMNAS_VENTA.length - 1)}1`;

/** El rango de datos completo, sin encabezado: "A2:M". */
export const RANGO_DATOS_VENTA = `A2:${letraVenta(COLUMNAS_VENTA.length - 1)}`;

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

/**
 * Catálogo y esquema de la hoja del Cable con Soporte 2 en 1 (landing /cable/).
 *
 * Igual que en pedido.js: los precios viven SOLO aquí. El navegador manda qué
 * pack eligió el cliente, nunca cuánto cuesta. Si cambias un precio, cámbialo
 * acá y en la constante PACKS de public/cable/index.html (`npm run check` falla
 * si dejan de coincidir).
 */

export const PRODUCTO_CABLE = "cable-soporte";

/** Cada pack lleva su bolsa de regalo: una por cable. `viejo` es el precio "antes". */
export const PACKS = {
  x1: { etiqueta: "1 Cable 2 en 1 + bolsa", cantidad: 1, precio: 39, viejo: 79 },
  x2: { etiqueta: "Pack Dúo: 2 Cables 2 en 1 + 2 bolsas", cantidad: 2, precio: 69, viejo: 158 },
  x3: { etiqueta: "Pack Regalo: 3 Cables 2 en 1 + 3 bolsas", cantidad: 3, precio: 89, viejo: 237 }
};

/** El primero de cada lista es el que se usa si el navegador manda algo raro. */
export const CONECTORES = ["USB-C", "Lightning"];
export const COLORES = ["Naranja", "Negro"];

/**
 * Columnas de la pestaña «Cable». El orden de este array ES el orden en que se
 * escribe cada fila (ver filaDePedidoCable en ../api/order-cable.js).
 * A–K es lo que ve y edita el vendedor; L–P quedan ocultas, para la Conversions API.
 */
export const COLUMNAS_CABLE = [
  "Fecha",
  "Nombre",
  "WhatsApp",
  "Distrito",
  "Dirección",
  "Referencia",
  "Pack",
  "Detalle",
  "Cantidad",
  "Total",
  "Estado",
  "FBP",
  "FBC",
  "Event ID",
  "User Agent",
  "IP"
];

/** Distritos de Lima Metropolitana y Callao: la lista que sugiere el formulario. */
export const DISTRITOS_LIMA = [
  "Ancón", "Ate", "Barranco", "Breña", "Carabayllo", "Chaclacayo", "Chorrillos", "Cieneguilla",
  "Comas", "El Agustino", "Independencia", "Jesús María", "La Molina", "La Victoria", "Lima Cercado",
  "Lince", "Los Olivos", "Lurigancho-Chosica", "Lurín", "Magdalena del Mar", "Miraflores",
  "Pachacámac", "Pucusana", "Pueblo Libre", "Puente Piedra", "Punta Hermosa", "Punta Negra",
  "Rímac", "San Bartolo", "San Borja", "San Isidro", "San Juan de Lurigancho",
  "San Juan de Miraflores", "San Luis", "San Martín de Porres", "San Miguel", "Santa Anita",
  "Santa María del Mar", "Santa Rosa", "Santiago de Surco", "Surquillo", "Villa El Salvador",
  "Villa María del Triunfo", "Callao", "Bellavista", "La Perla", "La Punta", "Carmen de la Legua",
  "Ventanilla", "Mi Perú"
];

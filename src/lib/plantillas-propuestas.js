/**
 * Plantillas que el CRM propone mandar a Meta, por marca (Tarot Store y URO
 * no se mezclan: cada una va a la WABA de su número). Nada se manda solo: el
 * admin ve el texto exacto en CRM → Herramientas → Plantillas para Meta y
 * toca "Mandar a Meta"; Meta las aprueba (suele tardar minutos) y recién ahí
 * los planes y los toques las usan.
 *
 * Orden de prioridad: aviso de envío (abre la ventana para la boleta), recojo en Shalom, rescate de interesado, toques a quien
 * no compró y toques a clientes.
 */

import { listarLineas, envDeLinea } from "./lineas.js";
import { obtenerAjuste, guardarAjuste } from "./crm-db.js";
import { listarTemplates, crearTemplate } from "./whatsapp.js";
import { planesDe, marcaDeLinea, IDIOMA_PLAN, AVISOS_ENVIO } from "./planes-plantilla.js";
import { TOQUES, marcaDeToque } from "./toques.js";

export const MARCAS = { tarot: "Tarot Store", uro: "URO" };

const cuerpo = (text, ejemplo) => ({ type: "BODY", text, example: { body_text: [ejemplo] } });
const botones = (lista) => ({ type: "BUTTONS", buttons: lista.map((text) => ({ type: "QUICK_REPLY", text })) });
const EJEMPLOS = ["María", "el kit de tarot"];
const ejemploDe = (texto, ejemplo) => ejemplo.slice(0, (texto.match(/\{\{\d\}\}/g) || []).length);

/** Todas las propuestas de una marca: { nombre, grupo, titulo, cuando, categoria, texto, botones, componentes }. */
export function propuestasDe(marca, cambios = {}) {
  const lista = [];
  const aviso = AVISOS_ENVIO[marca];
  lista.push({
    nombre: aviso.nombre, grupo: "Aviso de envío (abre la ventana para mandar la boleta)", titulo: "Aviso de envío", cuando: "al despachar el pedido, la vendedora lo manda desde el chat (botón de plantillas)",
    categoria: aviso.categoria, texto: aviso.texto, botones: aviso.botones,
    componentes: [cuerpo(aviso.texto, ejemploDe(aviso.texto, aviso.ejemplo)), botones(aviso.botones)]
  });
  const planes = planesDe(marca);
  for (const [clave, p] of Object.entries(planes)) {
    for (const [i, paso] of p.pasos.entries()) {
      lista.push({
        nombre: paso.nombre, grupo: clave === "shalom" ? "Recojo en Shalom (prioridad)" : "Rescate de interesado",
        titulo: `${p.titulo} · mensaje ${i + 1}`, cuando: `${paso.dias} días después de su último mensaje`,
        categoria: p.categoria, texto: paso.texto, botones: p.botones,
        componentes: [cuerpo(paso.texto, ejemploDe(paso.texto, p.ejemplo)), botones(p.botones)]
      });
    }
  }
  for (const [id, def] of Object.entries(TOQUES)) {
    if (marcaDeToque(def) !== marca) continue;
    for (const variante of ["general", "lima", "provincia"]) {
      const comps = def[variante];
      if (!comps) continue;
      const texto = comps[0].text;
      const btns = comps[1].buttons.map((b) => b.text);
      const sufijo = variante === "general" ? "" : ` (${variante})`;
      lista.push({
        nombre: variante === "general" ? `toque_${id}` : `toque_${id}_${variante}`,
        grupo: def.tipo === "lead" ? "Toques a quien no compró" : "Toques a clientes",
        titulo: `Toque día ${def.dias}${sufijo}`, cuando: def.tipo === "lead" ? `${def.dias} días de silencio` : `${def.dias} días después de la compra`,
        categoria: "MARKETING", texto, botones: btns, componentes: comps
      });
    }
  }
  // Lo que el admin cambió en el CRM (texto y botones) manda sobre el texto del código.
  for (const p of lista) {
    const c = cambios[`${marca}:${p.nombre}`];
    if (!c) continue;
    p.editada = true;
    p.texto = c.texto;
    p.botones = c.botones;
    p.componentes = [cuerpo(c.texto, ejemploDe(c.texto, EJEMPLOS)), botones(c.botones)];
  }
  const orden = ["Aviso de envío (abre la ventana para mandar la boleta)", "Recojo en Shalom (prioridad)", "Rescate de interesado", "Toques a quien no compró", "Toques a clientes"];
  return lista.sort((a, b) => orden.indexOf(a.grupo) - orden.indexOf(b.grupo));
}

const CLAVE_CAMBIOS = "plantillas_textos";

/** { "marca:nombre": { texto, botones } } con lo que el admin editó. */
export async function leerCambios(db) {
  try {
    return JSON.parse((await obtenerAjuste(db, CLAVE_CAMBIOS)) || "{}") || {};
  } catch {
    return {};
  }
}

/**
 * Guarda (o con `restablecer`, borra) el texto y los botones de una propuesta. Solo mientras no se haya
 * mandado a Meta: una plantilla ya enviada no se puede cambiar con el mismo nombre.
 * Reglas de Meta que se revisan aquí: mismas variables {{n}} que el texto original, que el cuerpo no
 * empiece ni termine con una variable, máximo 1024 caracteres y botones de hasta 25 caracteres.
 */
export async function guardarCambio(env, marca, nombre, { texto, botones: btns, restablecer }) {
  const original = propuestasDe(marca).find((p) => p.nombre === nombre);
  if (!original) throw new Error("No es una propuesta de esta marca.");
  const cambios = await leerCambios(env.CRM_DB);
  const clave = `${marca}:${nombre}`;
  if (restablecer) {
    delete cambios[clave];
  } else {
    texto = String(texto || "").trim();
    btns = (Array.isArray(btns) ? btns : []).map((b) => String(b || "").trim());
    const vars = (t) => [...new Set(t.match(/\{\{\d\}\}/g) || [])].sort().join(",");
    if (!texto || texto.length > 1024) throw new Error("El texto no puede estar vacío ni pasar de 1024 caracteres.");
    if (vars(texto) !== vars(original.texto)) throw new Error(`Debe llevar las mismas variables que el original: ${vars(original.texto) || "ninguna"}. {{1}} es el primer nombre del cliente.`);
    if (/^\s*\{\{|\}\}\s*$/.test(texto)) throw new Error("Meta no acepta que el texto empiece o termine con una variable.");
    if (btns.length !== original.botones.length || btns.some((b) => !b || b.length > 25)) throw new Error(`Pon ${original.botones.length} botones de hasta 25 caracteres.`);
    cambios[clave] = { texto, botones: btns };
  }
  await guardarAjuste(env.CRM_DB, CLAVE_CAMBIOS, JSON.stringify(cambios));
}

/** El env de esa marca (su número y su WABA), o null si no hay línea con WABA. */
export async function envDeMarca(env, marca) {
  if (marca === "tarot") return env.WHATSAPP_BUSINESS_ACCOUNT_ID ? env : null;
  const linea = (await listarLineas(env.CRM_DB)).find((l) => l.activa !== 0 && marcaDeLinea(l) === marca);
  return linea?.waba_id ? envDeLinea(env, linea) : null;
}

/** Para la pantalla: cada marca con sus propuestas y cómo está cada una en Meta. */
export async function estadoDePropuestas(env) {
  const marcas = [];
  const cambios = await leerCambios(env.CRM_DB);
  for (const [marca, nombre] of Object.entries(MARCAS)) {
    const envM = await envDeMarca(env, marca);
    let porNombre = {};
    let aviso = envM ? null : `Falta conectar el número de ${nombre} (CRM → Productos y números, con su WABA).`;
    if (envM) {
      try {
        for (const t of await listarTemplates(envM)) {
          // Si hay varias del mismo nombre (otro idioma), gana la aprobada.
          if (!porNombre[t.name] || t.status === "APPROVED") porNombre[t.name] = t.status;
        }
      } catch (err) {
        aviso = `No pude leer el estado en Meta: ${err.message}`;
      }
    }
    marcas.push({
      marca, nombre, aviso, conectada: Boolean(envM),
      propuestas: propuestasDe(marca, cambios).map((p) => ({ ...p, componentes: undefined, estado: aviso && !envM ? "SIN_NUMERO" : porNombre[p.nombre] || (aviso ? "DESCONOCIDO" : "SIN_ENVIAR") }))
    });
  }
  return marcas;
}

/** Manda a revisión de Meta las propuestas elegidas (por nombre) de una marca. Una por una: si una falla, las demás siguen. */
export async function mandarPropuestas(env, marca, nombres) {
  const envM = await envDeMarca(env, marca);
  if (!envM) throw new Error(`Falta conectar el número de ${MARCAS[marca] || marca}.`);
  const propuestas = propuestasDe(marca, await leerCambios(env.CRM_DB));
  const existentes = new Set((await listarTemplates(envM)).map((t) => t.name));
  const resultados = [];
  for (const nombre of nombres) {
    const p = propuestas.find((x) => x.nombre === nombre);
    if (!p) { resultados.push({ nombre, ok: false, error: "No es una propuesta de esta marca." }); continue; }
    if (existentes.has(nombre)) { resultados.push({ nombre, ok: false, error: "Ya existe en Meta." }); continue; }
    try {
      await crearTemplate(envM, { nombre, categoria: p.categoria, idioma: IDIOMA_PLAN, componentes: p.componentes });
      resultados.push({ nombre, ok: true });
    } catch (err) {
      resultados.push({ nombre, ok: false, error: err.message });
    }
  }
  return resultados;
}

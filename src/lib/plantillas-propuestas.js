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
import { notificarTelegram } from "./telegram.js";
import { primerNombre } from "./plantillas.js";
import { listarTemplates, crearTemplate, editarTemplate } from "./whatsapp.js";
import { planesDe, marcaDeLinea, IDIOMA_PLAN, AVISOS_ENVIO } from "./planes-plantilla.js";
import { TOQUES, marcaDeToque } from "./toques.js";

export const MARCAS = { tarot: "Tarot Store", uro: "URO" };

const cuerpo = (text, ejemplo) => ({ type: "BODY", text, example: { body_text: [ejemplo] } });
const botones = (lista) => (lista.length ? [{ type: "BUTTONS", buttons: lista.map((text) => ({ type: "QUICK_REPLY", text })) }] : []);
const EJEMPLOS = ["María", "el kit de tarot"];
const ejemploDe = (texto, ejemplo) => ejemplo.slice(0, (texto.match(/\{\{\d\}\}/g) || []).length);

/** Todas las propuestas de una marca: { nombre, grupo, titulo, cuando, categoria, texto, botones, componentes }. */
export function propuestasDe(marca, cambios = {}) {
  const lista = [];
  const aviso = AVISOS_ENVIO[marca];
  lista.push({
    nombre: aviso.nombre, grupo: "Aviso de envío (abre la ventana para mandar la boleta)", titulo: "Aviso de envío", cuando: "al despachar el pedido, la vendedora lo manda desde el chat (botón de plantillas)",
    categoria: aviso.categoria, texto: aviso.texto, botones: aviso.botones,
    componentes: [cuerpo(aviso.texto, ejemploDe(aviso.texto, aviso.ejemplo)), ...botones(aviso.botones)]
  });
  const planes = planesDe(marca);
  for (const [clave, p] of Object.entries(planes)) {
    for (const [i, paso] of p.pasos.entries()) {
      lista.push({
        nombre: paso.nombre, grupo: clave === "shalom" ? "Recojo en Shalom (prioridad)" : "Rescate de interesado",
        titulo: `${p.titulo} · mensaje ${i + 1}`, cuando: clave === "shalom" ? `${paso.dias} días después de despachar el pedido` : `${paso.dias} días después de su último mensaje`,
        categoria: p.categoria, texto: paso.texto, botones: p.botones,
        componentes: [cuerpo(paso.texto, ejemploDe(paso.texto, p.ejemplo)), ...botones(p.botones)]
      });
    }
  }
  for (const [id, def] of Object.entries(TOQUES)) {
    if (marcaDeToque(def) !== marca) continue;
    for (const variante of ["general", "lima", "provincia"]) {
      const comps = def[variante];
      if (!comps) continue;
      const texto = comps[0].text;
      const btns = (comps[1]?.buttons || []).map((b) => b.text);
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
    p.componentes = [cuerpo(c.texto, ejemploDe(c.texto, EJEMPLOS)), ...botones(c.botones)];
    if (c.categoria) p.categoria = c.categoria;
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
 * Guarda (o con `restablecer`, borra) el texto y los botones de una propuesta. Si ya está en Meta, hay
 * que reenviarla (mandarPropuestas con `reenviar`) para que Meta la edite y la vuelva a revisar.
 * Reglas de Meta que se revisan aquí: mismas variables {{n}} que el texto original, que el cuerpo no
 * empiece ni termine con una variable, máximo 1024 caracteres y botones de hasta 25 caracteres.
 */
export const CATEGORIAS = ["MARKETING", "UTILITY"];
// Meta pide botones solo con letras, números y signos simples: nada de emojis ni saltos de línea.
const RE_BOTON = /^[\p{L}\p{N} ¿?¡!.,:;'()%\-+/&]+$/u;

export async function guardarCambio(env, marca, nombre, { texto, botones: btns, categoria, restablecer }) {
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
    if (!CATEGORIAS.includes(categoria)) throw new Error("La categoría es Marketing o Utilidad.");
    if (!texto || texto.length > 1024) throw new Error("El texto no puede estar vacío ni pasar de 1024 caracteres.");
    const permitidas = new Set(original.texto.match(/\{\{\d\}\}/g) || []);
    if ((texto.match(/\{\{\d\}\}/g) || []).some((v) => !permitidas.has(v))) throw new Error(`Solo puede llevar las variables del original: ${vars(original.texto) || "ninguna"} ({{1}} es el primer nombre del cliente); puedes quitarlas y escribir, por ejemplo, «estimad@».`);
    if (/^\s*\{\{|\}\}\s*$/.test(texto)) throw new Error("Meta no acepta que el texto empiece o termine con una variable.");
    if (btns.length > 3) throw new Error("Máximo 3 botones.");
    const mala = btns.find((b) => !b || b.length > 25 || !RE_BOTON.test(b));
    if (mala !== undefined || btns.some((b) => !b)) throw new Error("Cada botón: hasta 25 caracteres, solo letras, números y signos simples (sin emojis).");
    if (new Set(btns.map((b) => b.toLowerCase())).size !== btns.length) throw new Error("Los botones no pueden repetirse.");
    cambios[clave] = { texto, botones: btns, categoria };
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
    let catMeta = {};
    let aviso = envM ? null : `Falta conectar el número de ${nombre} (CRM → Productos y números, con su WABA).`;
    if (envM) {
      try {
        for (const t of await listarTemplates(envM)) {
          // Si hay varias del mismo nombre (otro idioma), gana la aprobada.
          if (!porNombre[t.name] || t.status === "APPROVED") { porNombre[t.name] = t.status; catMeta[t.name] = t.category; }
        }
      } catch (err) {
        aviso = `No pude leer el estado en Meta: ${err.message}`;
      }
    }
    marcas.push({
      marca, nombre, aviso, conectada: Boolean(envM),
      propuestas: propuestasDe(marca, cambios).map((p) => ({ ...p, componentes: undefined, categoriaMeta: catMeta[p.nombre] || null, estado: aviso && !envM ? "SIN_NUMERO" : porNombre[p.nombre] || (aviso ? "DESCONOCIDO" : "SIN_ENVIAR") }))
    });
  }
  return marcas;
}

/** Manda a revisión de Meta las propuestas elegidas (por nombre) de una marca. Una por una: si una falla, las demás siguen. */
export async function mandarPropuestas(env, marca, nombres, reenviar = false) {
  const envM = await envDeMarca(env, marca);
  if (!envM) throw new Error(`Falta conectar el número de ${MARCAS[marca] || marca}.`);
  const propuestas = propuestasDe(marca, await leerCambios(env.CRM_DB));
  const existentes = new Map();
  for (const t of await listarTemplates(envM)) if (!existentes.has(t.name) || t.status === "APPROVED") existentes.set(t.name, t);
  const resultados = [];
  for (const nombre of nombres) {
    const p = propuestas.find((x) => x.nombre === nombre);
    if (!p) { resultados.push({ nombre, ok: false, error: "No es una propuesta de esta marca." }); continue; }
    const ya = existentes.get(nombre);
    if (ya && !reenviar) { resultados.push({ nombre, ok: false, error: "Ya existe en Meta." }); continue; }
    try {
      if (ya) {
        if (!["APPROVED", "REJECTED", "PAUSED"].includes(ya.status)) throw new Error(`Meta no deja editarla mientras está ${ya.status}.`);
        await editarTemplate(envM, ya.id, p.componentes);
        resultados.push({ nombre, ok: true });
        continue;
      }
      await crearTemplate(envM, { nombre, categoria: p.categoria, idioma: IDIOMA_PLAN, componentes: p.componentes });
      resultados.push({ nombre, ok: true });
    } catch (err) {
      resultados.push({ nombre, ok: false, error: err.message });
    }
  }
  return resultados;
}

/**
 * Cron de 15 min: ¿Meta aprobó o rechazó alguna plantilla propuesta? Compara con el último estado
 * guardado (`plantillas_estados`) y avisa por Telegram al dueño solo de lo que CAMBIÓ. La primera
 * pasada solo toma la foto, sin avisar. De paso deja el estado en el caché de plantillaAprobada, así
 * los planes y toques la usan al instante (si no, tardaban hasta 10 min en enterarse).
 */
export async function vigilarPlantillas(env) {
  const db = env.CRM_DB;
  if (!db) return { avisos: 0 };
  const antes = JSON.parse((await obtenerAjuste(db, "plantillas_estados").catch(() => null)) || "null");
  const ahora = {};
  const avisos = [];
  for (const [marca, nombre] of Object.entries(MARCAS)) {
    const envM = await envDeMarca(env, marca);
    if (!envM) continue;
    let existentes;
    try {
      existentes = await listarTemplates(envM);
    } catch (err) {
      console.error(`Vigilar plantillas (${nombre}):`, err.message);
      if (antes) for (const k of Object.keys(antes)) if (k.startsWith(`${marca}:`)) ahora[k] = antes[k]; // no perder el último estado
      continue;
    }
    for (const p of propuestasDe(marca)) {
      const lista = existentes.filter((t) => t.name === p.nombre);
      const t = lista.find((x) => x.status === "APPROVED") || lista[0];
      if (!t) continue;
      const clave = `${marca}:${p.nombre}`;
      ahora[clave] = t.status;
      const cuerpoTxt = (t.components || []).find((c) => String(c.type).toUpperCase() === "BODY")?.text || "";
      const cache = envM.LINEA_ID ? `plantilla_estado:${envM.WHATSAPP_BUSINESS_ACCOUNT_ID}:${p.nombre}` : `plantilla_estado:${p.nombre}`;
      await guardarAjuste(db, cache, `${t.status}|${Date.now()}|${t.language || ""}|${cuerpoTxt.includes("{{1}}") ? 1 : 0}`).catch(() => {});
      if (antes && antes[clave] !== t.status && ["APPROVED", "REJECTED", "PAUSED", "DISABLED"].includes(t.status)) {
        const icono = t.status === "APPROVED" ? "✅ aprobó" : "❌ " + (t.status === "REJECTED" ? "rechazó" : "dejó " + t.status.toLowerCase());
        avisos.push(`${icono}: ${nombre} · ${p.titulo} (\`${p.nombre}\`)${t.rejected_reason && t.rejected_reason !== "NONE" ? ` — motivo: \`${t.rejected_reason}\`` : ""}`);
      }
    }
  }
  await guardarAjuste(db, "plantillas_estados", JSON.stringify(ahora));
  if (avisos.length) await notificarTelegram(env, `📋 *Meta respondió sobre tus plantillas*\n\n${avisos.join("\n")}`);
  return { avisos: avisos.length };
}

/**
 * El texto con el que se ve una plantilla enviada en el chat: lo que dice (con las variables puestas),
 * sus botones y el nombre al pie. Sale de las propuestas (con lo que el admin editó) o, si es otra
 * plantilla, del texto aprobado en Meta. Nunca falla: sin texto devuelve solo el nombre.
 */
export async function textoParaChat(env, nombre, parametros = []) {
  let texto = null;
  let btns = [];
  const cambios = await leerCambios(env.CRM_DB);
  for (const marca of Object.keys(MARCAS)) {
    const p = propuestasDe(marca, cambios).find((x) => x.nombre === nombre);
    if (p) { texto = p.texto; btns = p.botones; break; }
  }
  if (!texto) {
    try {
      const t = (await listarTemplates(env)).find((x) => x.name === nombre && x.status === "APPROVED");
      texto = (t?.components || []).find((c) => String(c.type).toUpperCase() === "BODY")?.text || null;
      btns = ((t?.components || []).find((c) => String(c.type).toUpperCase() === "BUTTONS")?.buttons || []).map((b) => b.text);
    } catch { /* sin texto: queda el nombre */ }
  }
  if (!texto) return `Plantilla: ${nombre}`;
  const lleno = texto.replace(/\{\{(\d)\}\}/g, (m, n) => parametros[Number(n) - 1] ?? m);
  return `${lleno}${btns.length ? `\n\n${btns.map((b) => `[ ${b} ]`).join("  ")}` : ""}\n\nPlantilla: ${nombre}`;
}

/** Las variables de una plantilla programada solo con su nombre: {{1}} = primer nombre; {{2}} = el producto (solo las de Tarot). */
export async function parametrosDePlantilla(env, nombre, nombreCliente) {
  let texto = null;
  const cambios = await leerCambios(env.CRM_DB);
  for (const marca of Object.keys(MARCAS)) {
    texto = propuestasDe(marca, cambios).find((x) => x.nombre === nombre)?.texto || texto;
  }
  if (!texto) {
    const t = (await listarTemplates(env)).find((x) => x.name === nombre && x.status === "APPROVED");
    texto = (t?.components || []).find((c) => String(c.type).toUpperCase() === "BODY")?.text || "";
  }
  const n = Math.max(0, ...(texto.match(/\{\{(\d)\}\}/g) || []).map((v) => Number(v[2])));
  return [primerNombre(nombreCliente), "el kit de tarot"].slice(0, n);
}

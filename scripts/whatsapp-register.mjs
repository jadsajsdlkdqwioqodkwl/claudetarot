/**
 * Registra el número en WhatsApp Cloud API sin pasar por el PIN roto del
 * WhatsApp Manager. Son los mismos tres pasos que hace esa pantalla, pero
 * llamados uno por uno contra la Graph API — por eso hace falta correrlos
 * en orden y no todos de una:
 *
 *   1. node scripts/whatsapp-register.mjs pedir-codigo [voz]
 *      Manda el OTP por SMS al número (o por llamada, con el argumento "voz").
 *
 *   2. node scripts/whatsapp-register.mjs verificar 123456
 *      El código de 6 dígitos que llegó al celular.
 *
 *   3. node scripts/whatsapp-register.mjs registrar 654321
 *      Un PIN NUEVO de 6 dígitos, inventado acá — no el que llegó por SMS.
 *      Es el que va a pedir Meta de ahí en adelante para 2FA del número.
 *      Anótalo.
 *
 * Necesita WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID en .dev.vars o en el
 * entorno. El token es un System User token con permiso
 * whatsapp_business_management, generado en Meta Business Settings.
 *
 * En Node hace falta que fetch respete el proxy y la CA del entorno:
 *   NODE_USE_ENV_PROXY=1 node scripts/whatsapp-register.mjs pedir-codigo
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { pedirCodigo, verificarCodigo, registrarNumero } from "../src/lib/whatsapp.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadDevVars() {
  const file = join(root, ".dev.vars");
  if (!existsSync(file)) return {};
  const vars = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    vars[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return vars;
}

const env = { ...loadDevVars(), ...process.env };

for (const key of ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]) {
  if (!env[key]) {
    console.error(`Falta ${key}. Complétalo en .dev.vars o pásalo como variable de entorno.`);
    process.exit(1);
  }
}

const [accion, arg] = process.argv.slice(2);

function esSeisDigitos(valor) {
  return /^\d{6}$/.test(String(valor ?? ""));
}

try {
  if (accion === "pedir-codigo") {
    const metodo = arg === "voz" ? "VOICE" : "SMS";
    await pedirCodigo(env, { metodo });
    console.log(`Código pedido por ${metodo === "VOICE" ? "llamada" : "SMS"}. Revisa el celular del número.`);
  } else if (accion === "verificar") {
    if (!esSeisDigitos(arg)) {
      console.error("Pasa el código de 6 dígitos que llegó por SMS/voz: verificar 123456");
      process.exit(1);
    }
    await verificarCodigo(env, arg);
    console.log("Código verificado. Ahora corre: registrar <PIN nuevo de 6 dígitos>");
  } else if (accion === "registrar") {
    if (!esSeisDigitos(arg)) {
      console.error("Elige un PIN nuevo de 6 dígitos (no el del SMS) y pásalo: registrar 654321");
      process.exit(1);
    }
    await registrarNumero(env, arg);
    console.log("Número registrado en la Cloud API. Guarda ese PIN, Meta lo vuelve a pedir si hay que re-registrar.");
  } else {
    console.error("Uso: node scripts/whatsapp-register.mjs <pedir-codigo|verificar|registrar> [argumento]");
    process.exit(1);
  }
} catch (err) {
  console.error("\nFalló:", err.message);
  process.exit(1);
}

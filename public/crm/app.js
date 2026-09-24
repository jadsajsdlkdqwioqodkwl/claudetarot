/**
 * CRM de WhatsApp — sin build, sin dependencias. Todo el estado vive en
 * memoria del navegador; el servidor es la fuente de verdad y se repregunta
 * por polling (no hay WebSockets en este Worker).
 */

const $ = (sel) => document.querySelector(sel);

// ☺️✨🫶🙌 fijos primero — los cuatro que se piden siempre a la vista, sin scrollear.
const EMOJIS = "☺️ ✨ 🫶 🙌 😀 😁 😂 🤣 😊 😉 😍 😘 🥰 😎 🤔 🙄 😴 😢 😭 😅 🙏 👍 👎 👏 💪 🎉 🔥 ⭐ ❤️ 💚 💙 💛 ☕ 🎁 📦 🚚 ✅ ❌ ⏰ 📍 💰 🃏".split(" ");
const PAGINA_MENSAJES = 50;

// Cuánto se espacían los polls — el plan gratis de Cloudflare tiene un tope
// de requests por día, y con el CRM abierto toda la jornada entre varias
// vendedoras, sondear muy seguido lo agota rápido. Se complementa con pausar
// todo cuando la pestaña está de fondo (ver visibilitychange) y, sobre todo,
// con las notificaciones push: cada mensaje/llamada nueva ya empuja un
// refresco inmediato (ver el "mensaje-nuevo" del service worker), así que
// este poll de acá es solo la red de seguridad — por eso puede ser bien
// espaciado sin que se sienta lento.
// Un solo request por ciclo trae la lista Y el chat abierto (antes eran 3-4:
// lista, mensajes, pedidos y seguimientos). El ritmo se adapta: rápido si la
// vendedora está usando el CRM, lento si no toca nada o si las
// notificaciones push ya empujan cada mensaje nuevo al toque.
const RITMO_ACTIVO = 20000;
const RITMO_CON_PUSH = 60000;           // el push avisa de lo nuevo; esto es solo red de seguridad
const RITMO_INACTIVO = 60000;           // 3+ minutos sin tocar nada
const RITMO_MUY_INACTIVO = 180000;      // 15+ minutos sin tocar nada
const RITMO_FONDO_NOTIF_LOCAL = 120000; // pestaña oculta: solo si hacen falta las notificaciones locales (Brave)

const estado = {
  conversaciones: [],
  conversacionActivaId: null,
  filtroMias: false,
  filtroTexto: "",
  archivoAdjunto: null,
  rapidaPendiente: null,
  segRapidaMedia: null,
  segModo: "mensaje",
  editandoRapidaId: null,
  editandoPasoId: null,
  editandoSeguimientoId: null,
  quickReplies: [],
  login: { mode: "legacy", challengeId: null },
  olvide: { resetId: null },
  templateElegido: null,
  miRol: null,
  miNombre: null,
  filtroRapidas: "",
  rapidasPorSlash: false,
  mensajesCargados: [],
  firmaMensajesPintados: null,
  hayMasAntiguos: false,
  syncTimer: null,
  respondiendoA: null,
  modoSeleccion: false,
  seleccionados: new Set()
};

function pedir(url, opciones = {}) {
  return fetch(url, { credentials: "same-origin", ...opciones }).then(async (res) => {
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(datos.error || `HTTP ${res.status}`);
    return datos;
  });
}

const iniciales = (nombre) => (nombre || "?").trim().slice(0, 2).toUpperCase();

/** Un color estable por contacto (mismo truco que WhatsApp/Slack) en vez de un solo verde para todos los avatares. */
const COLORES_AVATAR = ["#128C7E", "#7c5cff", "#e17055", "#0984e3", "#d63384", "#00838f", "#6c5ce7", "#c2410c"];
function colorAvatar(nombre) {
  let hash = 0;
  for (const c of String(nombre || "")) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES_AVATAR[hash % COLORES_AVATAR.length];
}
function avatarHtml(nombre) {
  return `<div class="avatar" style="background:${colorAvatar(nombre)}">${iniciales(nombre)}</div>`;
}

function horaCorta(iso) {
  if (!iso) return "";
  const d = new Date(iso.includes("Z") || iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function fechaCorta(iso) {
  if (!iso) return "";
  const d = new Date(iso.includes("Z") || iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Los mismos estilos que WhatsApp ya renderiza en el celular del cliente (negrita, cursiva, tachado, monoespaciado) — acá se ven igual en vez de con los símbolos sueltos. Escapa primero para que no sea una puerta de HTML. */
function formatearTextoWA(s) {
  return escapar(s)
    .replace(/```([^`]+)```/g, (_, c) => `<code>${c}</code>`)
    // Como WhatsApp: el símbolo no puede ir pegado a una letra/número por
    // fuera (si no, "utm_source_x" o un link con _ quedaban en cursiva).
    .replace(/(?<![\p{L}\p{N}_*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\p{L}\p{N}_*])/gu, "<strong>$1</strong>")
    .replace(/(?<![\p{L}\p{N}_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\p{L}\p{N}_])/gu, "<em>$1</em>")
    .replace(/(?<![\p{L}\p{N}_~])~(?=\S)([^~\n]+?)(?<=\S)~(?![\p{L}\p{N}_~])/gu, "<s>$1</s>")
    .replace(/\n/g, "<br>");
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function iconizar() {
  $("#btn-nuevo-contacto").innerHTML = icon("plus");
  $("#btn-mi-password").innerHTML = icon("key");
  $("#btn-admin").innerHTML = icon("broadcast");
  $("#btn-menu-lista").innerHTML = icon("more");
  $("#btn-equipo").innerHTML = icon("users");
  $("#btn-notificaciones").innerHTML = icon("bell");
  $("#btn-salir").innerHTML = icon("logout");
  $(".icono-buscar").innerHTML = icon("search");
  $("#btn-filtro-mias").innerHTML = icon("star") + " Mis chats";
  $("#vacio-icono").innerHTML = icon("chat");
}
iconizar();

/* ---------- Login ---------- */

async function revisarSesion() {
  const { authenticated, role } = await pedir("/api/crm/session");
  estado.miRol = role;
  if (authenticated) return mostrarApp();
  mostrarLogin();
}

async function mostrarLogin() {
  $("#login").style.display = "flex";
  $("#app").classList.remove("activo");
  mostrarFormularioLogin();
  estado.login = { mode: "legacy", challengeId: null };
  try {
    const info = await pedir("/api/crm/login-info");
    estado.login.mode = info.modoAgentes ? "agents" : "legacy";
    $("#username").style.display = info.modoAgentes ? "block" : "none";
    $("#code").style.display = info.modoAgentes ? "none" : (info.requiere2FA ? "block" : "none");
    $("#ayuda-2fa").style.display = "none";
    $("#password").style.display = "block";
    $("#password").placeholder = "Contraseña";
    $("#btn-login").textContent = "Entrar";
    // "Olvidé mi contraseña" solo tiene sentido con cuentas de vendedor — en
    // modo de contraseña única no hay una cuenta propia que recuperar.
    $("#link-olvide").style.display = info.modoAgentes ? "block" : "none";
  } catch { /* si falla, se pide solo la contraseña */ }
}

function mostrarFormularioLogin() {
  $("#form-login").style.display = "flex";
  $("#form-olvide").style.display = "none";
  $("#login-error").textContent = "";
}

function mostrarFormularioOlvide() {
  $("#form-login").style.display = "none";
  $("#form-olvide").style.display = "flex";
  $("#olvide-error").textContent = "";
  estado.olvide = { resetId: null };
  $("#olvide-usuario").disabled = false;
  $("#olvide-paso2").style.display = "none";
  $("#olvide-paso1-ayuda").style.display = "block";
  $("#olvide-codigo").value = "";
  $("#olvide-nueva").value = "";
  $("#btn-olvide").textContent = "Mandar código";
}

function mostrarPasoCodigo(metodo2FA) {
  $("#username").style.display = "none";
  $("#password").style.display = "none";
  $("#code").style.display = "block";
  $("#ayuda-2fa").textContent = metodo2FA === "totp"
    ? "Escribe el código de tu app authenticator"
    : "Te llegó un código de 6 dígitos por WhatsApp";
  $("#ayuda-2fa").style.display = "block";
  $("#btn-login").textContent = "Verificar código";
  $("#code").focus();
}

async function mostrarApp() {
  $("#login").style.display = "none";
  $("#app").classList.add("activo");
  const { role, displayName, esCuentaDeVendedor } = await pedir("/api/crm/session");
  estado.miRol = role;
  estado.miNombre = displayName || null;
  // Para que quede clarísimo con qué cuenta estás — el panel de admin
  // (bienvenida, mensaje masivo, etc) y de Equipo solo salen con role
  // "admin", y esto evita preguntarse por qué no aparecen si entraste
  // con otra cuenta.
  $("#sesion-actual").textContent = `${displayName || "Modo administrador"} · ${role === "admin" ? "admin" : "vendedor"}`;
  $("#sesion-actual").title = $("#sesion-actual").textContent;
  $("#btn-mi-password").style.display = esCuentaDeVendedor ? "" : "none";
  $("#btn-admin").style.display = role === "admin" ? "" : "none";
  cargarConversaciones();
  cargarQuickReplies();
  configurarNotificaciones();
  configurarInstalacion();
  programarSync();
}

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  try {
    if (estado.login.mode === "agents" && estado.login.challengeId) {
      await pedir("/api/crm/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_id: estado.login.challengeId, code: $("#code").value.trim() })
      });
      mostrarApp();
      return;
    }

    if (estado.login.mode === "agents") {
      const r = await pedir("/api/crm/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: $("#username").value.trim(), password: $("#password").value })
      });
      estado.login.challengeId = r.challenge_id;
      mostrarPasoCodigo(r.metodo2FA);
      return;
    }

    await pedir("/api/crm/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("#password").value, code: $("#code").value })
    });
    mostrarApp();
  } catch (err) {
    $("#login-error").textContent = err.message;
  }
});

$("#link-olvide").addEventListener("click", mostrarFormularioOlvide);
$("#link-volver-login").addEventListener("click", mostrarFormularioLogin);

$("#form-olvide").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#olvide-error").textContent = "";
  try {
    if (!estado.olvide.resetId) {
      const username = $("#olvide-usuario").value.trim();
      if (!username) return;
      const { reset_id } = await pedir("/api/crm/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      estado.olvide.resetId = reset_id;
      $("#olvide-usuario").disabled = true;
      $("#olvide-paso1-ayuda").style.display = "none";
      $("#olvide-paso2").style.display = "block";
      $("#btn-olvide").textContent = "Cambiar contraseña";
      $("#olvide-codigo").focus();
      return;
    }

    await pedir("/api/crm/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reset_id: estado.olvide.resetId,
        code: $("#olvide-codigo").value.trim(),
        new_password: $("#olvide-nueva").value
      })
    });
    alert("Contraseña cambiada. Ya puedes entrar con la nueva.");
    mostrarFormularioLogin();
  } catch (err) {
    $("#olvide-error").textContent = err.message;
  }
});

$("#btn-salir").addEventListener("click", async () => {
  await pedir("/api/crm/logout", { method: "POST" });
  clearTimeout(estado.syncTimer);
  mostrarLogin();
});

$("#btn-mi-password").addEventListener("click", () => {
  $("#password-error").textContent = "";
  $("#pwd-actual").value = "";
  $("#pwd-nueva").value = "";
  $("#pwd-confirmar").value = "";
  $("#modal-password-fondo").classList.add("abierto");
  $("#pwd-actual").focus();
  $("#totp-password").value = "";
  pintarEstadoTotp();
});

$("#pwd-cancelar").addEventListener("click", () => $("#modal-password-fondo").classList.remove("abierto"));

$("#pwd-guardar").addEventListener("click", async () => {
  const actual = $("#pwd-actual").value;
  const nueva = $("#pwd-nueva").value;
  const confirmar = $("#pwd-confirmar").value;
  $("#password-error").textContent = "";
  if (!actual || !nueva) { $("#password-error").textContent = "Completa ambos campos."; return; }
  if (nueva !== confirmar) { $("#password-error").textContent = "Las contraseñas nuevas no coinciden."; return; }

  const btn = $("#pwd-guardar");
  btn.disabled = true;
  try {
    await pedir("/api/crm/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: actual, new_password: nueva })
    });
    $("#modal-password-fondo").classList.remove("abierto");
    alert("Contraseña cambiada. La próxima vez que entres, usa la nueva.");
  } catch (err) {
    $("#password-error").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

/* ---------- 2FA con app authenticator (TOTP) ---------- */

async function pintarEstadoTotp() {
  $("#totp-setup-area").style.display = "none";
  $("#totp-ayuda").textContent = "Cargando…";
  try {
    const { active } = await pedir("/api/crm/totp-setup");
    $("#totp-ayuda").textContent = active
      ? "Activado — el login te pide el código de tu app en vez de mandarte uno por WhatsApp."
      : "Desactivado — el login te manda el código por WhatsApp, como siempre.";
    $("#totp-activar-btn").style.display = active ? "none" : "";
    $("#totp-desactivar-btn").style.display = active ? "" : "none";
  } catch {
    $("#totp-ayuda").textContent = "";
  }
}

$("#totp-activar-btn").addEventListener("click", async () => {
  const current_password = $("#totp-password").value;
  if (!current_password) return alert("Escribe tu contraseña actual primero.");
  try {
    const { secret } = await pedir("/api/crm/totp-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password })
    });
    $("#totp-secreto").textContent = secret.match(/.{1,4}/g).join(" ");
    $("#totp-setup-area").style.display = "block";
    $("#totp-codigo").value = "";
    $("#totp-codigo").focus();
  } catch (err) {
    alert(err.message);
  }
});

$("#totp-confirmar-btn").addEventListener("click", async () => {
  const code = $("#totp-codigo").value.trim();
  if (!code) return alert("Escribe el código de 6 dígitos que te muestra la app.");
  try {
    await pedir("/api/crm/totp-setup", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    alert("Listo — la próxima vez que entres, el login te va a pedir el código de la app en vez de mandarte uno por WhatsApp.");
    await pintarEstadoTotp();
  } catch (err) {
    alert(err.message);
  }
});

$("#totp-desactivar-btn").addEventListener("click", async () => {
  const current_password = $("#totp-password").value;
  if (!current_password) return alert("Escribe tu contraseña actual primero.");
  if (!confirm("¿Desactivar el 2FA con app? Volverás a recibir el código por WhatsApp la próxima vez que entres.")) return;
  try {
    await pedir("/api/crm/totp-setup", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password })
    });
    await pintarEstadoTotp();
  } catch (err) {
    alert(err.message);
  }
});

/* ---------- Ojito para mostrar/ocultar contraseñas ---------- */

function activarOjito(id) {
  const input = document.getElementById(id);
  if (!input || input.dataset.ojito) return;
  input.dataset.ojito = "1";

  const wrapper = document.createElement("div");
  wrapper.className = "campo-password";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ojito";
  btn.tabIndex = -1;
  btn.title = "Mostrar contraseña";
  btn.innerHTML = icon("eye");
  wrapper.appendChild(btn);

  btn.addEventListener("click", () => {
    const mostrar = input.type === "password";
    input.type = mostrar ? "text" : "password";
    btn.innerHTML = icon(mostrar ? "eyeOff" : "eye");
    btn.title = mostrar ? "Ocultar contraseña" : "Mostrar contraseña";
  });
}

["password", "olvide-nueva", "pwd-actual", "pwd-nueva", "pwd-confirmar", "totp-password", "eq-password"].forEach(activarOjito);

/* ---------- Bienvenida de anuncios: secuencia + simulación ---------- */

$("#btn-abrir-bienvenida").addEventListener("click", async () => {
  $("#modal-bienvenida-fondo").classList.add("abierto");
  await pintarSecuenciaBienvenida();
});
$("#bienvenida-cerrar").addEventListener("click", () => {
  $("#modal-bienvenida-fondo").classList.remove("abierto");
  cancelarEdicionPaso();
  refrescarVistasLead();
});

async function pintarSecuenciaBienvenida() {
  const { steps } = await pedir("/api/crm/welcome-sequence");

  const cont = $("#lista-secuencia");
  cont.innerHTML = steps.length ? steps.map((s, i) => `
    <div class="fila-seguimiento">
      <div>
        <div class="nombre">${i + 1}. ${s.media.length ? icon(s.media.length > 1 ? "image" : (s.media[0].media_type === "video" ? "video" : "image")) + (s.media.length > 1 ? ` ×${s.media.length}` : "") + " " : ""}${escapar(s.title)}</div>
        ${s.body ? `<div class="sub">${escapar(s.body)}</div>` : ""}
      </div>
      <div style="display:flex;gap:4px">
        <button class="mover-arriba" data-id="${s.id}" title="Subir" ${i === 0 ? "disabled" : ""}>${icon("arrowLeft", "")}</button>
        <button class="mover-abajo" data-id="${s.id}" title="Bajar" ${i === steps.length - 1 ? "disabled" : ""}>${icon("arrowLeft", "")}</button>
        <button class="editar-paso" data-id="${s.id}" title="Editar">${icon("pencil")}</button>
        <button class="trash quitar-paso" data-id="${s.id}" title="Borrar paso">${icon("trash")}</button>
      </div>
    </div>`).join("") : `<p class="ayuda-modal">Todavía no hay ningún paso — agrégalo abajo.</p>`;

  // Rota las flechas de "arrowLeft" para que apunten arriba/abajo sin pedir dos íconos nuevos.
  cont.querySelectorAll(".mover-arriba .icono-svg svg").forEach((s) => s.style.transform = "rotate(90deg)");
  cont.querySelectorAll(".mover-abajo .icono-svg svg").forEach((s) => s.style.transform = "rotate(-90deg)");

  cont.querySelectorAll(".mover-arriba, .mover-abajo").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await pedir("/api/crm/welcome-sequence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(btn.dataset.id), direction: btn.classList.contains("mover-arriba") ? "up" : "down" })
      });
      await pintarSecuenciaBienvenida();
    });
  });
  cont.querySelectorAll(".quitar-paso").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Borrar este paso de la bienvenida? No se puede deshacer.")) return;
      await pedir("/api/crm/welcome-sequence", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(btn.dataset.id) })
      });
      await pintarSecuenciaBienvenida();
    });
  });
  cont.querySelectorAll(".editar-paso").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = steps.find((x) => x.id === Number(btn.dataset.id));
      if (s) editarPasoBienvenida(s);
    });
  });
}

function editarPasoBienvenida(s) {
  estado.editandoPasoId = s.id;
  $("#seq-form-titulo").textContent = "Editar paso";
  $("#seq-titulo").value = s.title;
  $("#seq-texto").value = s.body || "";
  $("#seq-archivo").value = "";
  $("#seq-archivo-ayuda").textContent = s.media.length
    ? `Ya tiene ${s.media.length} archivo(s) — déjalo vacío para conservarlos, o elige nuevos para reemplazarlos todos.`
    : "Puedes elegir varias fotos/videos a la vez — se mandan uno tras otro. Este contenido es solo para la bienvenida — no aparece en las respuestas rápidas del chat.";
  $("#seq-agregar-btn").textContent = "Guardar cambios";
  $("#seq-cancelar-edicion").style.display = "";
  $("#seq-titulo").scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelarEdicionPaso() {
  estado.editandoPasoId = null;
  $("#seq-form-titulo").textContent = "Agregar un paso nuevo";
  $("#seq-titulo").value = "";
  $("#seq-texto").value = "";
  $("#seq-archivo").value = "";
  $("#seq-archivo-ayuda").textContent = "Puedes elegir varias fotos/videos a la vez — se mandan uno tras otro. Este contenido es solo para la bienvenida — no aparece en las respuestas rápidas del chat.";
  $("#seq-agregar-btn").textContent = "Agregar paso";
  $("#seq-cancelar-edicion").style.display = "none";
}
$("#seq-cancelar-edicion").addEventListener("click", cancelarEdicionPaso);

$("#seq-agregar-btn").addEventListener("click", async () => {
  const title = $("#seq-titulo").value.trim();
  const body = $("#seq-texto").value.trim();
  const files = [...$("#seq-archivo").files];
  const editandoId = estado.editandoPasoId;
  if (!title) return alert("Ponle un título.");
  if (!body && !files.length && !editandoId) return alert("Necesita texto o al menos un archivo.");

  const btn = $("#seq-agregar-btn");
  btn.disabled = true;
  btn.textContent = files.length ? "Subiendo…" : "Guardando…";
  try {
    let media_keys;
    if (files.length) {
      media_keys = [];
      for (const file of files) {
        const subida = await subirArchivo(file);
        media_keys.push({ media_key: subida.media_key, media_type: subida.type, media_mime: subida.mime });
      }
    }
    if (editandoId) {
      await pedir("/api/crm/welcome-sequence", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editandoId, title, body, media_keys })
      });
    } else {
      await pedir("/api/crm/welcome-sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, media_keys: media_keys || [] })
      });
    }
    await pintarSecuenciaBienvenida();
    cancelarEdicionPaso();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = estado.editandoPasoId ? "Guardar cambios" : "Agregar paso";
  }
});

$("#sim-enviar").addEventListener("click", async () => {
  const wa = $("#sim-wa").value.trim();
  if (!wa) return alert("Escribe un WhatsApp.");
  const btn = $("#sim-enviar");
  btn.disabled = true;
  btn.textContent = "Mandando…";
  try {
    const { pasos_mandados } = await pedir("/api/crm/test-welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wa_id: wa.replace(/\D/g, "") })
    });
    alert(`Listo — se marcó el chat como venido de un anuncio y se mandaron ${pasos_mandados} paso(s). Revisa ese WhatsApp.`);
    $("#sim-wa").value = "";
    await cargarConversaciones();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Simular y mandar la secuencia";
  }
});

/* ---------- Panel de admin: mensaje masivo, costos, exportación ---------- */

let bulkTemplateElegida = null;

$("#btn-admin").addEventListener("click", () => {
  $("#modal-admin-fondo").classList.add("abierto");
  $("#bulk-numeros").value = "";
  $("#bulk-resultado").textContent = "";
  cargarPlantillasBulk();
  cargarBatchesBulk();
  pintarResumenLeadsAdmin();
});

/* ---------- Bienvenida + seguimiento para leads: datos compartidos ---------- */

// Lo que usan el modal de "Seguimiento para leads", el resumen del panel de
// admin y las dos secciones del panel derecho de cada chat. Cambia poco
// (solo cuando el admin lo edita), así que se cachea un minuto para no
// pedirlo de nuevo en cada chat que se abre.
let datosLead = null;

async function cargarDatosLead(forzar) {
  if (!forzar && datosLead && Date.now() - datosLead.at < 60000) return datosLead;
  const [{ steps }, { sequences }, settings] = await Promise.all([
    pedir("/api/crm/welcome-sequence"),
    pedir("/api/crm/followup-sequences"),
    pedir("/api/crm/settings")
  ]);
  datosLead = { at: Date.now(), welcomeSteps: steps, sequences, settings };
  return datosLead;
}

function secuenciaDeLeads(d) {
  return d.sequences.find((s) => s.id === d.settings.ad_followup_sequence_id) || null;
}

/** Tiempo total desde que se aplica, ej. 1500 → "1 día 1 h". */
function formatearMomento(minutos) {
  const d = Math.floor(minutos / 1440);
  const h = Math.floor((minutos % 1440) / 60);
  const m = minutos % 60;
  return [d && `${d} día${d === 1 ? "" : "s"}`, h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ") || "0 min";
}

const recortarTexto = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

/** Cambió algo del lead (lo editó el admin): refresca lo que esté a la vista. */
function refrescarVistasLead() {
  datosLead = null;
  if ($("#modal-admin-fondo").classList.contains("abierto")) pintarResumenLeadsAdmin();
  const c = estado.conversaciones.find((x) => x.conversation_id === estado.conversacionActivaId);
  if (c && $("#detalle-leads")) pintarLeadDetalle(c);
}

async function pintarResumenLeadsAdmin() {
  const cont = $("#admin-leads-resumen");
  try {
    const d = await cargarDatosLead(true);
    const seq = secuenciaDeLeads(d);
    if (!seq) {
      cont.innerHTML = `<div class="sin-ad">Todavía no configurado.</div>`;
      return;
    }
    let acum = 0;
    cont.innerHTML = `
      <div class="titulo">${icon("clock")} ${escapar(seq.title)} · ${d.settings.ad_followup_auto ? "automático en leads nuevos" : "solo a mano"}</div>
      ${seq.steps.length ? seq.steps.map((p) => { acum += p.delay_minutes; return `<div>En ${formatearMomento(acum)}: ${escapar(recortarTexto(p.body || "Foto/video", 50))}</div>`; }).join("") : "<div>Sin mensajes todavía.</div>"}`;
  } catch (err) {
    cont.textContent = err.message;
  }
}

/* ---------- Modal "Seguimiento para leads" (admin) ---------- */

let leadsEditandoPasoId = null;

$("#btn-abrir-leads").addEventListener("click", abrirModalLeads);

async function abrirModalLeads() {
  $("#modal-leads-fondo").classList.add("abierto");
  $("#leads-estado").textContent = "";
  cancelarEdicionPasoLead();
  await pintarModalLeads(true);
}

$("#leads-cerrar").addEventListener("click", () => {
  $("#modal-leads-fondo").classList.remove("abierto");
  cancelarEdicionPasoLead();
  refrescarVistasLead();
});

function avisoLeads(texto) {
  const el = $("#leads-estado");
  el.textContent = texto;
  if (texto === "Guardado ✓") setTimeout(() => { if (el.textContent === texto) el.textContent = ""; }, 2000);
}

function cancelarEdicionPasoLead() {
  leadsEditandoPasoId = null;
  $("#leads-texto").value = "";
  $("#leads-archivo").value = "";
  $("#leads-delay-valor").value = "1";
  $("#leads-delay-unidad").value = "1440";
  $("#leads-agregar").textContent = "Agregar mensaje";
  $("#leads-cancelar-edicion").style.display = "none";
  document.querySelectorAll("#leads-pasos .leads-paso.editando").forEach((el) => el.classList.remove("editando"));
  actualizarReferenciaDelayLead();
}

/** "después de aplicarlo" para el primer mensaje, "después del anterior" para el resto. */
function actualizarReferenciaDelayLead() {
  const seq = datosLead && secuenciaDeLeads(datosLead);
  const pasos = seq?.steps || [];
  const esPrimero = leadsEditandoPasoId ? pasos[0]?.id === leadsEditandoPasoId : !pasos.length;
  $("#leads-delay-ref").textContent = esPrimero ? "después de aplicarlo" : "después del mensaje anterior";
}

async function pintarModalLeads(forzar) {
  let d;
  try {
    d = await cargarDatosLead(forzar);
  } catch (err) {
    avisoLeads(err.message);
    return;
  }
  const sel = $("#leads-secuencia");
  sel.innerHTML = `<option value="">— Elige una secuencia —</option>` +
    d.sequences.map((s) => `<option value="${s.id}">${escapar(s.title)} (${s.steps.length} mensaje${s.steps.length === 1 ? "" : "s"})</option>`).join("");
  const seq = secuenciaDeLeads(d);
  sel.value = seq ? String(seq.id) : "";
  $("#leads-auto").checked = Boolean(seq) && d.settings.ad_followup_auto;
  $("#leads-auto").disabled = !seq;
  $("#leads-form").style.display = seq ? "" : "none";

  const cont = $("#leads-pasos");
  if (!seq) {
    cont.innerHTML = `<p class="ayuda-modal">Elige una secuencia arriba, o crea una con "Nueva".</p>`;
    return;
  }
  let acum = 0;
  cont.innerHTML = seq.steps.length ? seq.steps.map((p, i) => {
    acum += p.delay_minutes;
    return `
    <div class="leads-paso${leadsEditandoPasoId === p.id ? " editando" : ""}" data-id="${p.id}">
      <div class="leads-paso-info">
        <div class="leads-paso-cuando">${icon("clock")} <strong>En ${formatearMomento(acum)}</strong><span class="sub"> · ${formatearDelay(p.delay_minutes)} ${i === 0 ? "después de aplicarlo" : "después del anterior"}</span></div>
        <div class="leads-paso-cuerpo">${p.media_key ? icon(p.media_type === "video" ? "video" : "image") + " " : ""}${escapar(p.body || (p.media_key ? "Foto/video" : ""))}</div>
      </div>
      <div class="leads-paso-acciones">
        <button class="mover-arriba" data-id="${p.id}" title="Subir" ${i === 0 ? "disabled" : ""}>${icon("arrowLeft")}</button>
        <button class="mover-abajo" data-id="${p.id}" title="Bajar" ${i === seq.steps.length - 1 ? "disabled" : ""}>${icon("arrowLeft")}</button>
        <button class="editar-paso" data-id="${p.id}" title="Editar">${icon("pencil")}</button>
        <button class="trash quitar-paso" data-id="${p.id}" title="Borrar">${icon("trash")}</button>
      </div>
    </div>`;
  }).join("") : `<p class="ayuda-modal">Sin mensajes todavía — agrega el primero abajo.</p>`;

  cont.querySelectorAll(".mover-arriba .icono-svg svg").forEach((s) => s.style.transform = "rotate(90deg)");
  cont.querySelectorAll(".mover-abajo .icono-svg svg").forEach((s) => s.style.transform = "rotate(-90deg)");

  cont.querySelectorAll(".mover-arriba, .mover-abajo").forEach((btn) => btn.addEventListener("click", async () => {
    try {
      await pedir("/api/crm/followup-sequences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_id: Number(btn.dataset.id), direction: btn.classList.contains("mover-arriba") ? "up" : "down" })
      });
      await pintarModalLeads(true);
    } catch (err) { avisoLeads(err.message); }
  }));
  cont.querySelectorAll(".quitar-paso").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm("¿Borrar este mensaje del seguimiento? Los que ya estén programados en chats no se tocan.")) return;
    try {
      await pedir("/api/crm/followup-sequences", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_id: Number(btn.dataset.id) })
      });
      if (leadsEditandoPasoId === Number(btn.dataset.id)) cancelarEdicionPasoLead();
      await pintarModalLeads(true);
    } catch (err) { avisoLeads(err.message); }
  }));
  cont.querySelectorAll(".editar-paso").forEach((btn) => btn.addEventListener("click", () => {
    const p = seq.steps.find((x) => x.id === Number(btn.dataset.id));
    if (!p) return;
    leadsEditandoPasoId = p.id;
    const unidad = p.delay_minutes % 1440 === 0 ? 1440 : p.delay_minutes % 60 === 0 ? 60 : 1;
    $("#leads-delay-valor").value = p.delay_minutes / unidad;
    $("#leads-delay-unidad").value = String(unidad);
    $("#leads-texto").value = p.body || "";
    $("#leads-archivo").value = "";
    $("#leads-agregar").textContent = "Guardar cambios";
    $("#leads-cancelar-edicion").style.display = "";
    cont.querySelectorAll(".leads-paso").forEach((el) => el.classList.toggle("editando", Number(el.dataset.id) === p.id));
    actualizarReferenciaDelayLead();
    $("#leads-texto").focus();
  }));
  actualizarReferenciaDelayLead();
}

$("#leads-cancelar-edicion").addEventListener("click", cancelarEdicionPasoLead);

$("#leads-secuencia").addEventListener("change", async (e) => {
  const id = e.target.value ? Number(e.target.value) : null;
  try {
    await pedir("/api/crm/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ad_followup_sequence_id: id })
    });
    cancelarEdicionPasoLead();
    await pintarModalLeads(true);
    avisoLeads("Guardado ✓");
  } catch (err) { avisoLeads(err.message); }
});

$("#leads-nueva").addEventListener("click", async () => {
  const title = prompt("Nombre de la secuencia:", "Seguimiento leads");
  if (!title || !title.trim()) return;
  try {
    const { sequence } = await pedir("/api/crm/followup-sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() })
    });
    await pedir("/api/crm/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ad_followup_sequence_id: sequence.id })
    });
    cancelarEdicionPasoLead();
    await pintarModalLeads(true);
    $("#leads-texto").focus();
  } catch (err) { avisoLeads(err.message); }
});

$("#leads-auto").addEventListener("change", async (e) => {
  try {
    await pedir("/api/crm/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ad_followup_auto: e.target.checked })
    });
    if (datosLead) datosLead.settings.ad_followup_auto = e.target.checked;
    avisoLeads("Guardado ✓");
  } catch (err) {
    e.target.checked = !e.target.checked;
    avisoLeads(err.message);
  }
});

$("#leads-agregar").addEventListener("click", async () => {
  const seq = datosLead && secuenciaDeLeads(datosLead);
  if (!seq) return;
  const valor = Number($("#leads-delay-valor").value);
  const unidad = Number($("#leads-delay-unidad").value);
  const texto = $("#leads-texto").value.trim();
  const archivo = $("#leads-archivo").files[0];
  const editandoId = leadsEditandoPasoId;
  const pasoEditado = editandoId ? seq.steps.find((x) => x.id === editandoId) : null;
  if (!valor || valor < 1) return alert("Pon cuánto tiempo esperar (1 o más).");
  if (!texto && !archivo && !pasoEditado?.media_key) return alert("Escribe un texto o adjunta una foto/video.");

  const btn = $("#leads-agregar");
  btn.disabled = true;
  try {
    const cuerpo = { body: texto || null, delay_minutes: valor * unidad };
    if (archivo) {
      const subida = await subirArchivo(archivo);
      Object.assign(cuerpo, { media_key: subida.media_key, media_type: subida.type, media_mime: subida.mime });
    }
    await pedir("/api/crm/followup-sequences", {
      method: editandoId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editandoId ? { step_id: editandoId, ...cuerpo } : { sequence_id: seq.id, ...cuerpo })
    });
    cancelarEdicionPasoLead();
    await pintarModalLeads(true);
    avisoLeads("Guardado ✓");
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
});

$("#admin-cerrar").addEventListener("click", () => $("#modal-admin-fondo").classList.remove("abierto"));

$("#bulk-modo").addEventListener("change", () => {
  const esPlantilla = $("#bulk-modo").value === "template";
  $("#bulk-modo-plantilla").style.display = esPlantilla ? "block" : "none";
  $("#bulk-texto").style.display = esPlantilla ? "none" : "block";
});

async function cargarPlantillasBulk() {
  const sel = $("#bulk-template");
  sel.innerHTML = `<option value="">Cargando…</option>`;
  $("#bulk-template-aviso").textContent = "";
  try {
    const { templates } = await pedir("/api/crm/templates");
    const aprobadas = templates.filter((t) => t.status === "APPROVED");
    const noAprobadas = templates.length - aprobadas.length;

    if (!aprobadas.length) {
      sel.innerHTML = `<option value="">Sin plantillas aprobadas todavía</option>`;
      $("#bulk-template-aviso").textContent = templates.length
        ? `Tienes ${templates.length} plantilla(s) creada(s), pero ninguna está "Aprobada" todavía — revisa el estado en WhatsApp Manager → Message Templates (Meta tarda de minutos a ~24h en aprobarlas).`
        : "Todavía no creaste ninguna plantilla — créala en WhatsApp Manager → Message Templates.";
      pintarParametrosBulk(null);
      return;
    }
    sel.innerHTML = aprobadas.map((t, i) => `<option value="${i}">${escapar(t.name)} (${escapar(t.language)})</option>`).join("");
    if (noAprobadas) $("#bulk-template-aviso").textContent = `(${noAprobadas} plantilla(s) más está(n) en revisión o rechazada — no aparecen acá hasta que Meta las apruebe.)`;
    sel.onchange = () => pintarParametrosBulk(aprobadas[Number(sel.value)]);
    pintarParametrosBulk(aprobadas[0]);
  } catch (err) {
    sel.innerHTML = `<option value="">${escapar(err.message)}</option>`;
  }
}

function pintarParametrosBulk(t) {
  bulkTemplateElegida = t;
  const cont = $("#bulk-template-params");
  if (!t) { cont.innerHTML = ""; return; }
  const body = (t.components || []).find((c) => c.type === "BODY");
  const nParams = body?.text ? (body.text.match(/{{\d+}}/g) || []).length : 0;
  cont.innerHTML = `
    ${body ? `<p class="ayuda-modal">${escapar(body.text)}</p>` : ""}
    ${Array.from({ length: nParams }, (_, i) => `<input type="text" class="bulk-param" placeholder="Variable {{${i + 1}}}" />`).join("")}`;
}

$("#bulk-enviar-btn").addEventListener("click", async () => {
  const numbers = $("#bulk-numeros").value.trim();
  const modo = $("#bulk-modo").value;
  if (!numbers) return alert("Pega al menos un número.");

  const payload = { numbers, mode: modo };
  if (modo === "template") {
    if (!bulkTemplateElegida) return alert("Elige una plantilla.");
    payload.template_name = bulkTemplateElegida.name;
    payload.template_language = bulkTemplateElegida.language;
    payload.template_params = [...document.querySelectorAll(".bulk-param")].map((i) => i.value);
  } else {
    const texto = $("#bulk-texto").value.trim();
    if (!texto) return alert("Escribe el texto del mensaje.");
    payload.body = texto;
  }

  if (!confirm(`¿Programar este mensaje para todos los números de la lista? Van a salir a los pocos minutos, de a poco.`)) return;

  const btn = $("#bulk-enviar-btn");
  btn.disabled = true;
  try {
    const { total, invalidos, batch_id } = await pedir("/api/crm/bulk-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    $("#bulk-resultado").textContent = `Listo — ${total} número(s) programado(s)${invalidos.length ? `, ${invalidos.length} inválido(s) ignorado(s)` : ""}. Se van mandando solos en los próximos minutos.`;
    $("#bulk-numeros").value = "";
    await cargarBatchesBulk();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
});

async function cargarBatchesBulk() {
  const cont = $("#lista-bulk-batches");
  try {
    const { batches } = await pedir("/api/crm/bulk-send");
    cont.innerHTML = batches.length ? batches.map((b) => `
      <div class="fila-seguimiento">
        <div>
          <div class="nombre">${fechaCorta(b.created_at)} — ${escapar(b.template_name || b.body || "")}</div>
          <div class="sub">${b.total} en total · ${b.enviados} enviado(s) · ${b.pendientes} pendiente(s)${b.fallidos ? ` · ${b.fallidos} fallido(s)` : ""}</div>
        </div>
      </div>`).join("") : `<p class="ayuda-modal">Todavía no hiciste ningún envío masivo.</p>`;
  } catch {
    cont.innerHTML = "";
  }
}

$("#export-reset-btn").addEventListener("click", async () => {
  if (!confirm("¿Reiniciar la exportación a Sheets? Va a volver a mandar todo el historial desde el principio — si la pestaña de algún día ya tiene datos, van a quedar duplicados ahí.")) return;
  try {
    await pedir("/api/crm/export-reset", { method: "POST" });
    alert("Listo — el próximo export (dentro de los próximos 10 minutos) va a arrancar desde el principio.");
  } catch (err) {
    alert(err.message);
  }
});

/* ---------- Lista de conversaciones ---------- */

/**
 * Lista + chat abierto en un solo request. Llamadas seguidas se juntan: si ya
 * hay una en vuelo se reusa, y si una idéntica terminó hace menos de 1,5 s
 * (ej. "cargarMensajes(); cargarConversaciones();" después de mandar algo)
 * no se repite.
 */
let syncEnVuelo = null;
let ultimoSync = { clave: "", t: 0 };

/**
 * Reclamar/liberar/reasignar es un PATCH liviano
 * que suele volver antes que el GET de la lista que ya estaba en vuelo — si
 * ese GET se lanzó ANTES del click, trae una foto vieja y, al aplicarla,
 * pisaba la estrella/etiqueta recién puesta con el estado de antes (el
 * "glitch": reclamás y por un toque parece que no pasó nada, o vuelve a
 * aparecer "libre"). Acá se recuerda la última asignación local con su hora
 * para no dejar que un GET más viejo la pise.
 */
const asignacionesLocales = new Map(); // conversation_id -> { assigned_agent, shared_with, t }
function marcarAsignacionLocal(conversationId, assignedAgent, sharedWith) {
  asignacionesLocales.set(conversationId, { assigned_agent: assignedAgent, shared_with: sharedWith ?? null, t: Date.now() });
}

// Igual que asignacionesLocales, para la etiqueta de "Seguimiento" de la
// lista: al programar/cancelar en el chat abierto se actualiza al toque, y
// un GET que ya iba en camino con el dato viejo no la pisa.
const seguimientosLocales = new Map(); // conversation_id -> { seg_pendientes, seg_proximo, t }
// Igual que en crm-db.js: "tras no respuesta" (secuencia de leads, automática
// o aplicada a mano) vs. manual. Ver cancelarSeguimientosDeLead.
const ORIGEN_SEGUIMIENTO_AUTO = "Seguimiento automático (anuncio)";
const PREFIJO_SEGUIMIENTO_LEAD = "Seguimiento de leads";

function esSeguimientoLead(s) {
  return s.created_by === ORIGEN_SEGUIMIENTO_AUTO || (s.created_by || "").startsWith(PREFIJO_SEGUIMIENTO_LEAD);
}

function esSeguimientoManual(s) {
  return !s.batch_id && !esSeguimientoLead(s);
}

/** Tipo de un seguimiento, para mostrarlo en el panel derecho. */
function etiquetaTipoSeguimiento(s) {
  if (s.batch_id) return `<span class="tipo-seg masivo">Envío masivo</span>`;
  if (esSeguimientoLead(s)) return `<span class="tipo-seg lead">Tras no respuesta${s.created_by === ORIGEN_SEGUIMIENTO_AUTO ? " · automático" : ""}</span>`;
  return `<span class="tipo-seg manual">Manual</span>`;
}

/** Recalcula la etiqueta de la lista para un chat a partir de sus pendientes. */
function actualizarEtiquetaSeguimiento(conversationId, scheduled) {
  const manuales = scheduled.filter(esSeguimientoManual);
  const seg = {
    seg_pendientes: manuales.length || null,
    seg_proximo: manuales.length ? manuales.map((x) => x.send_at).sort()[0] : null
  };
  const conv = estado.conversaciones.find((x) => x.conversation_id === conversationId);
  seguimientosLocales.set(conversationId, { ...seg, t: Date.now() });
  if (conv && (conv.seg_pendientes !== seg.seg_pendientes || conv.seg_proximo !== seg.seg_proximo)) {
    Object.assign(conv, seg);
    pintarLista();
  }
}

function sincronizar() {
  const params = new URLSearchParams();
  if (estado.filtroMias) params.set("mine", "1");
  if (estado.filtroTexto) params.set("q", estado.filtroTexto);
  // Con la pestaña oculta no se pide el chat: eso lo marcaría leído sin que nadie lo vea.
  const chatId = document.hidden ? null : estado.conversacionActivaId;
  if (chatId) params.set("chat", chatId);
  const clave = params.toString();

  if (syncEnVuelo?.clave === clave) return syncEnVuelo.promesa;
  if (ultimoSync.clave === clave && Date.now() - ultimoSync.t < 1500) return Promise.resolve();

  const inicio = Date.now();
  const promesa = (async () => {
    const data = await pedir(`/api/crm/conversations?${clave}`);
    estado.conversaciones = data.conversations;
    for (const [id, local] of asignacionesLocales) {
      if (local.t <= inicio) { asignacionesLocales.delete(id); continue; } // este GET ya salió después — confiamos en el servidor
      const conv = estado.conversaciones.find((x) => x.conversation_id === id);
      if (conv) { conv.assigned_agent = local.assigned_agent; conv.shared_with = local.shared_with; }
    }
    for (const [id, local] of seguimientosLocales) {
      if (local.t <= inicio) { seguimientosLocales.delete(id); continue; }
      const conv = estado.conversaciones.find((x) => x.conversation_id === id);
      if (conv) { conv.seg_pendientes = local.seg_pendientes; conv.seg_proximo = local.seg_proximo; }
    }
    if (data.chat && data.chat.conversation_id === estado.conversacionActivaId) aplicarMensajes(data.chat.conversation_id, data.chat);
    pintarLista();
    actualizarAvisosNoLeidos();
    ultimoSync = { clave, t: Date.now() };
  })().finally(() => { if (syncEnVuelo?.promesa === promesa) syncEnVuelo = null; });
  syncEnVuelo = { clave, promesa };
  return promesa;
}

function cargarConversaciones() { return sincronizar(); }

/* ---------- Ritmo del poll ---------- */

let ultimaInteraccion = Date.now();
let pushRealActivo = false;

function siguienteRitmo() {
  if (document.hidden) {
    return notifLocalActiva() && Notification.permission === "granted" ? RITMO_FONDO_NOTIF_LOCAL : null;
  }
  const inactivo = Date.now() - ultimaInteraccion;
  if (inactivo > 15 * 60000) return RITMO_MUY_INACTIVO;
  if (inactivo > 3 * 60000 || pushRealActivo) return RITMO_INACTIVO;
  return RITMO_ACTIVO;
}

function programarSync(demora) {
  clearTimeout(estado.syncTimer);
  const d = demora ?? siguienteRitmo();
  if (d == null || !estado.miRol) return;
  estado.syncTimer = setTimeout(async () => {
    try { await sincronizar(); } catch { /* red caída: el próximo ciclo reintenta */ }
    programarSync();
  }, d);
}

// Volver a tocar la pantalla después de un rato quieto refresca al toque.
["pointerdown", "keydown", "wheel", "touchstart"].forEach((ev) => document.addEventListener(ev, () => {
  const estabaInactivo = Date.now() - ultimaInteraccion > 3 * 60000;
  ultimaInteraccion = Date.now();
  if (estabaInactivo && !document.hidden) programarSync(0);
}, { passive: true, capture: true }));

/* ---------- Aviso de mensajes nuevos: sonido + contador en el título/favicon, como la app real ---------- */

const TITULO_BASE = document.title;
let totalNoLeidosPrevio = null; // null = todavía no se estableció la base (recién carga la página, no se debe sonar)
let audioCtx = null;

function reproducirSonidoNuevoMensaje() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t0 = audioCtx.currentTime;
    // Dos tonos cortos ascendentes — un "ping" simple, sin depender de ningún archivo de audio.
    [[880, t0], [1175, t0 + 0.11]].forEach(([freq, inicio]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, inicio);
      gain.gain.exponentialRampToValueAtTime(0.22, inicio + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.17);
    });
  } catch { /* si el navegador bloquea audio sin interacción previa, no pasa nada grave */ }
}

let faviconBase = null;
function dibujarFavicon(contador) {
  const link = $("#favicon");
  if (!link) return;
  if (!contador) { if (faviconBase) link.href = faviconBase.src; return; }

  if (!faviconBase) {
    faviconBase = new Image();
    faviconBase.src = link.href;
    faviconBase.onload = () => dibujarFavicon(contador);
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(faviconBase, 0, 0, 64, 64);

  const texto = contador > 99 ? "99+" : String(contador);
  const radio = texto.length > 2 ? 20 : 16;
  ctx.beginPath();
  ctx.arc(64 - radio + 4, radio - 4, radio, 0, Math.PI * 2);
  ctx.fillStyle = "#e63946";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = `bold ${texto.length > 2 ? 20 : 24}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, 64 - radio + 4, radio - 4 + 1);

  link.href = canvas.toDataURL("image/png");
}

/**
 * Cuántos mensajes del cliente hay sin leer — solo si el último mensaje del
 * chat es SUYO. Si lo último lo mandamos nosotros (a mano, la bienvenida o
 * un seguimiento), ya está respondido y no cuenta.
 */
function sinLeer(c) {
  return c.last_direction === "in" ? (c.unread_count || 0) : 0;
}

function actualizarAvisosNoLeidos() {
  const total = estado.conversaciones.reduce((s, c) => s + sinLeer(c), 0);

  document.title = total > 0 ? `(${total > 99 ? "99+" : total}) ${TITULO_BASE}` : TITULO_BASE;
  dibujarFavicon(total);

  // No suena en la primerísima carga de la página (evita el "ping" apenas
  // entras si ya había chats sin leer) — solo cuando el total sube desde ahí.
  if (totalNoLeidosPrevio !== null && total > totalNoLeidosPrevio) reproducirSonidoNuevoMensaje();
  totalNoLeidosPrevio = total;
  avisarLocalmente();
}

/* Plan B cuando el navegador no tiene servicio push (Brave suele fallar con
   "push service error"): con el permiso de notificaciones concedido, el
   propio CRM muestra el aviso al detectar mensajes nuevos en el poll. Solo
   funciona mientras el CRM esté abierto (aunque sea de fondo/minimizado). */
const NOTIF_LOCAL_KEY = "crm-notif-local";
let noLeidosPorChat = null;

function notifLocalActiva() {
  try { return localStorage.getItem(NOTIF_LOCAL_KEY) === "1"; } catch { return false; }
}

function avisarLocalmente() {
  const actuales = new Map(estado.conversaciones.map((c) => [c.conversation_id, c.unread_count || 0]));
  const previos = noLeidosPorChat;
  noLeidosPorChat = actuales;
  if (!previos || !notifLocalActiva() || Notification.permission !== "granted") return;

  for (const c of estado.conversaciones) {
    if ((c.unread_count || 0) <= (previos.get(c.conversation_id) || 0)) continue;
    if (!document.hidden && c.conversation_id === estado.conversacionActivaId) continue;
    const cuerpo = c.last_type === "text" || !c.last_type ? (c.last_body || "Mensaje nuevo") : ({ image: "📷 Foto", video: "🎥 Video", audio: "🎵 Audio", document: "📄 Documento", sticker: "Sticker" }[c.last_type] || "Mensaje nuevo");
    navigator.serviceWorker?.getRegistration("/crm/").then((reg) => reg?.showNotification(c.profile_name || `+${c.wa_id}`, {
      body: cuerpo.length > 120 ? cuerpo.slice(0, 120) + "…" : cuerpo,
      tag: `chat-${c.conversation_id}`,
      renotify: true,
      icon: "/crm/icons/icon-192.png",
      data: { conversation_id: c.conversation_id }
    })).catch(() => {});
  }
}

function pintarLista() {
  const cont = $("#conversaciones");
  cont.innerHTML = "";
  for (const c of estado.conversaciones) {
    const nombre = c.profile_name || c.wa_id;
    const div = document.createElement("div");
    const seleccionado = estado.seleccionados.has(c.conversation_id);
    const noLeidos = sinLeer(c);
    div.className = "conv-item" + (c.conversation_id === estado.conversacionActivaId ? " activo" : "") + (seleccionado ? " seleccionado" : "") + (noLeidos ? " no-leido" : "");

    const previewTexto = c.last_type === "text" || !c.last_type ? (c.last_body || "") : `[${c.last_type}]`;
    const prefijoYo = c.last_direction === "out" ? "Tú: " : "";

    div.innerHTML = `
      <input type="checkbox" class="conv-check" ${seleccionado ? "checked" : ""} />
      ${avatarHtml(nombre)}
      <div class="conv-info">
        <div class="fila1">
          <span class="nombre">${escapar(nombre)}</span>
          <span class="hora">${horaCorta(c.last_message_at)}</span>
        </div>
        <div class="fila2">
          <span class="preview">${escapar(prefijoYo + previewTexto)}</span>
          ${noLeidos ? `<span class="badge">${noLeidos}</span>` : ""}
          <button class="btn-star ${c.assigned_agent ? "marcada" : ""}" title="${escapar(tituloEstrella(c))}">${icon(c.assigned_agent ? "star" : "starOutline")}</button>
        </div>
        ${c.ctwa_clid ? `<span class="badge-ad">${icon("megaphone")} ${escapar(c.ad_source_type || "Anuncio")}</span>` : ""}
        ${c.assigned_agent ? `<span class="badge-asignado">${icon("star")} ${[c.assigned_agent, ...compartidosDe(c)].map(escapar).join(" + ")}</span>` : ""}
        ${c.seg_pendientes ? `<span class="badge-seguimiento" title="${c.seg_pendientes} seguimiento${c.seg_pendientes === 1 ? "" : "s"} programado${c.seg_pendientes === 1 ? "" : "s"} a mano — el próximo sale el ${escapar(fechaCorta(c.seg_proximo))}">${icon("clock")} Seguimiento${c.seg_pendientes > 1 ? ` ×${c.seg_pendientes}` : ""} · ${escapar(fechaCorta(c.seg_proximo))}</span>` : ""}
      </div>`;
    div.querySelector(".conv-check").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSeleccionChat(c.conversation_id);
    });
    div.querySelector(".conv-info").addEventListener("click", (e) => {
      if (e.target.closest(".btn-star")) return;
      if (estado.modoSeleccion) return toggleSeleccionChat(c.conversation_id);
      abrirConversacion(c);
    });
    div.querySelector(".btn-star").addEventListener("click", (e) => {
      e.stopPropagation();
      clicEstrella(c);
    });
    cont.appendChild(div);
  }
}

/* ---------- Selección múltiple de chats (para aplicarles una secuencia en bulk) ---------- */

function toggleSeleccionChat(conversationId) {
  if (estado.seleccionados.has(conversationId)) estado.seleccionados.delete(conversationId);
  else estado.seleccionados.add(conversationId);
  pintarLista();
  actualizarBarraSeleccion();
}

function actualizarBarraSeleccion() {
  const barra = $("#barra-seleccion");
  if (!barra) return;
  const n = estado.seleccionados.size;
  barra.style.display = estado.modoSeleccion && n > 0 ? "flex" : "none";
  $("#barra-seleccion-cuenta").textContent = `${n} chat${n === 1 ? "" : "s"} seleccionado${n === 1 ? "" : "s"}`;
}

function salirModoSeleccion() {
  estado.modoSeleccion = false;
  estado.seleccionados.clear();
  document.body.classList.remove("modo-seleccion");
  $("#btn-seleccionar-chats").classList.remove("activo");
  actualizarBarraSeleccion();
  pintarLista();
}

$("#btn-seleccionar-chats").addEventListener("click", () => {
  estado.modoSeleccion = !estado.modoSeleccion;
  document.body.classList.toggle("modo-seleccion", estado.modoSeleccion);
  $("#btn-seleccionar-chats").classList.toggle("activo", estado.modoSeleccion);
  if (!estado.modoSeleccion) estado.seleccionados.clear();
  actualizarBarraSeleccion();
  pintarLista();
});
$("#seleccion-cancelar").addEventListener("click", salirModoSeleccion);
$("#seleccion-aplicar-secuencia").addEventListener("click", () => {
  if (!estado.seleccionados.size) return;
  abrirModalSecuencias([...estado.seleccionados]);
});

/**
 * Título de la estrella (lista y header comparten el mismo texto): reclamar
 * si está libre o es de otro y todavía nadie lo comparte, liberar/dejar de
 * compartir si es tuyo de alguna forma, y sin acción si ya lo tienen dos.
 */
/** Quienes comparten la comisión además del dueño — `shared_with` los guarda uno por línea. */
function compartidosDe(c) {
  return c.shared_with ? c.shared_with.split("\n").filter(Boolean) : [];
}

/** "A", "A y B", "A, B y C". */
function unirNombres(nombres) {
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}` : (nombres[0] || "");
}

function tituloEstrella(c) {
  const miNombre = estado.miNombre;
  const otros = compartidosDe(c);
  if (!c.assigned_agent) return "Reclamar este chat";
  if (c.assigned_agent === miNombre) return otros.length ? `Es tuyo, compartido con ${unirNombres(otros)} — clic para liberar` : "Es tuyo — clic para liberar";
  if (otros.includes(miNombre)) return `Lo tiene ${c.assigned_agent}, lo compartís vos — clic para dejar de compartir`;
  if (!otros.length) return `Lo tiene ${c.assigned_agent} — clic para reclamar la comisión compartida`;
  return `Lo tienen ${unirNombres([c.assigned_agent, ...otros])}`;
}

/** Clic en la estrella (lista, header, o el botón del sidebar) — reclama o se saca (nunca le quita el lugar al otro). */
function clicEstrella(c) {
  const yo = estado.miNombre;
  const tengoParte = Boolean(yo) && (c.assigned_agent === yo || compartidosDe(c).includes(yo));
  cambiarAsignacion(c, tengoParte ? "liberar" : "reclamar");
}

/** Actualiza solo el ícono/título de la estrella del header, sin repintar todo el chat. */
function pintarEstrellaHeader(c) {
  const btn = $("#star-header");
  if (!btn || estado.conversacionActivaId !== c.conversation_id) return;
  btn.innerHTML = icon(c.assigned_agent ? "star" : "starOutline");
  btn.classList.toggle("marcada", Boolean(c.assigned_agent));
  btn.title = tituloEstrella(c);
}

$("#buscar").addEventListener("input", debounce((e) => {
  estado.filtroTexto = e.target.value.trim();
  cargarConversaciones();
}, 300));

$("#filtros").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-mine]");
  if (!btn) return;
  document.querySelectorAll("#filtros button").forEach((b) => b.classList.remove("activo"));
  btn.classList.add("activo");
  estado.filtroMias = btn.dataset.mine === "1";
  cargarConversaciones();
});

/* ---------- Conversación abierta ---------- */

/*
 * Borrador por chat, como en WhatsApp: lo escrito, la foto/video adjunta,
 * la respuesta rápida elegida y el "respondiendo a" se guardan al salir
 * de un chat y vuelven al entrar de nuevo — nunca pasan a otro chat.
 */
const borradores = new Map(); // conversation_id -> { texto, adjunto, rapida, respondiendoA }

function guardarBorrador() {
  const id = estado.conversacionActivaId;
  if (!id) return;
  const b = {
    texto: $("#texto-envio")?.value || "",
    adjunto: estado.archivoAdjunto,
    rapida: estado.rapidaPendiente,
    respondiendoA: estado.respondiendoA
  };
  if (b.texto.trim() || b.adjunto || b.rapida || b.respondiendoA) borradores.set(id, b);
  else borradores.delete(id);
}

function restaurarBorrador(id) {
  const b = borradores.get(id);
  borradores.delete(id);
  if (!b) return;
  const input = $("#texto-envio");
  if (input && b.texto) {
    input.value = b.texto;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }
  estado.archivoAdjunto = b.adjunto;
  estado.rapidaPendiente = b.rapida;
  estado.respondiendoA = b.respondiendoA;
  pintarPreviewArchivo();
  pintarPreviewRespuesta();
}

async function abrirConversacion(c) {
  guardarBorrador();
  estado.conversacionActivaId = c.conversation_id;
  estado.mensajesCargados = [];
  estado.firmaMensajesPintados = null;
  estado.hayMasAntiguos = false;
  // Sin revocar la vista previa del adjunto: puede haber quedado en el borrador del chat anterior.
  estado.respondiendoA = null;
  estado.rapidaPendiente = null;
  estado.archivoAdjunto = null;
  // En móvil, el botón/gesto de "atrás" del teléfono debe volver a la lista
  // de chats, no salir del sitio — se logra metiendo un estado en el
  // historial al entrar a un chat, así el "atrás" del navegador lo consume
  // a él primero (ver el "popstate" más abajo) en vez de navegar afuera.
  if (!document.body.classList.contains("chat-abierto")) {
    history.pushState({ crmChat: true }, "", location.href);
  }
  document.body.classList.add("chat-abierto"); // en móvil: pantalla completa del chat, no la lista
  document.body.classList.remove("detalle-abierto");
  pintarLista();
  pintarChatBase(c);
  restaurarBorrador(c.conversation_id);
  pintarDetalle(c);
  await cargarMensajes();
  programarSync();
}

function volverALaLista() {
  document.body.classList.remove("chat-abierto");
  document.body.classList.remove("detalle-abierto");
}

// Mismo truco que con el chat/detalle, pero genérico para los modales
// (admin, equipo, plantillas, secuencias, respuestas rápidas, seguimiento,
// contacto, contraseña, bienvenida): al abrirse cualquiera se mete un
// estado en el historial, así el "atrás" físico del teléfono lo cierra en
// vez de salir del sitio. Se engancha una sola vez acá, sin tocar cada
// abrirModalX/botón "cerrar" por separado.
//
// Algunos modales abren otro encima sin cerrarse (ej. "Configurar
// bienvenida de anuncios" desde dentro de Admin), así que puede haber más
// de uno con `.abierto` a la vez — por eso se lleva una pila con el orden
// real de apertura, y un z-index creciente para que el último abierto
// siempre se vea (y se pueda clickear) por encima de los de abajo.
let sincronizandoModalHistorial = false;
let zIndexModalSiguiente = 100;
const pilaModales = [];
document.querySelectorAll(".modal-fondo").forEach((el) => {
  let estabaAbierto = el.classList.contains("abierto");
  new MutationObserver(() => {
    const abierto = el.classList.contains("abierto");
    if (abierto === estabaAbierto) return;
    estabaAbierto = abierto;
    if (abierto) {
      el.style.zIndex = String(++zIndexModalSiguiente);
      pilaModales.push(el);
      if (!sincronizandoModalHistorial) history.pushState({ crmModal: el.id }, "", location.href);
      return;
    }
    const i = pilaModales.indexOf(el);
    if (i !== -1) pilaModales.splice(i, 1);
    if (sincronizandoModalHistorial) {
      // Se cerró porque el "atrás" ya consumió el estado — nada más que hacer.
      sincronizandoModalHistorial = false;
    } else {
      // Se cerró con su botón/click afuera — hay que consumir el estado pendiente.
      // Este history.back() dispara un popstate propio, que el handler de abajo
      // debe ignorar (con la bandera) para no cerrar además el modal de abajo
      // en la pila, si había uno abierto detrás de este.
      sincronizandoModalHistorial = true;
      history.back();
    }
  }).observe(el, { attributes: true, attributeFilter: ["class"] });
});

// El "atrás" del teléfono (o el del navegador) dispara esto en vez de salir
// del sitio cuando hay algo abierto — ver los pushState en abrirConversacion,
// al abrir "Detalle" y en el observer de modales de más arriba. Cierra lo de
// más arriba primero (el modal por encima de la pila, luego detalle, luego
// el chat), igual que la app real.
window.addEventListener("popstate", () => {
  if (sincronizandoModalHistorial) {
    // Este popstate es el resultado de nuestro propio history.back() al
    // cerrar un modal con su botón/click afuera — el estado ya se consumió,
    // no hay que cerrar nada más (en particular, no el modal de abajo).
    sincronizandoModalHistorial = false;
    return;
  }
  const ultimo = pilaModales[pilaModales.length - 1];
  if (ultimo) {
    sincronizandoModalHistorial = true;
    ultimo.classList.remove("abierto");
    return;
  }
  if (document.body.classList.contains("detalle-abierto")) {
    document.body.classList.remove("detalle-abierto");
  } else if (document.body.classList.contains("chat-abierto")) {
    volverALaLista();
  }
});

// Pausar el polling con la pestaña de fondo: son el grueso de los requests
// del día (varias vendedoras con el CRM abierto todo el turno, aunque estén
// mirando otra pestaña o el celular bloqueado) y de fondo no hace falta
// tenerlos corriendo — las notificaciones push ya avisan de lo urgente. Al
// volver, se refresca una vez al toque y se retoma el ritmo normal.
document.addEventListener("visibilitychange", () => {
  if (!estado.miRol) return; // todavía no inició sesión
  if (document.hidden) { programarSync(); return; } // se detiene, salvo notificaciones locales
  ultimaInteraccion = Date.now();
  programarSync(0);
});

/* ---------- Menú "⋯" del encabezado: en pantallas angostas junta las acciones secundarias ---------- */

const ETIQUETAS_MENU_LISTA = {
  "btn-instalar": "Instalar como app",
  "btn-mi-password": "Cambiar mi contraseña",
  "btn-admin": "Mensaje masivo y herramientas",
  "btn-equipo": "Equipo",
  "btn-salir": "Salir"
};

$("#btn-menu-lista").addEventListener("click", (e) => {
  e.stopPropagation();
  const menu = $("#menu-lista");
  if (menu.classList.toggle("abierto")) {
    // Solo las que están habilitadas para este usuario (las que el rol oculta traen display:none inline).
    const botones = [...document.querySelectorAll("#lista header .accion-secundaria")].filter((b) => b.style.display !== "none");
    menu.innerHTML = botones.map((b) => `<button type="button" data-para="${b.id}">${b.innerHTML}<span>${escapar(ETIQUETAS_MENU_LISTA[b.id] || b.title)}</span></button>`).join("");
    menu.querySelectorAll("button").forEach((item) => item.addEventListener("click", () => {
      menu.classList.remove("abierto");
      document.getElementById(item.dataset.para).click();
    }));
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#menu-lista, #btn-menu-lista")) $("#menu-lista")?.classList.remove("abierto");
});

/* ---------- Instalar como app (PWA) ---------- */

// Instalada igual se actualiza sola: no cachea nada (no-store + el service
// worker no intercepta fetch), así que cada apertura trae la última versión.
let promptInstalacion = null;
const appInstalada = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  promptInstalacion = e;
});
window.addEventListener("appinstalled", () => {
  promptInstalacion = null;
  const btn = $("#btn-instalar");
  if (btn) btn.style.display = "none";
});

function configurarInstalacion() {
  const btn = $("#btn-instalar");
  if (!btn || appInstalada()) return;
  btn.innerHTML = icon("install");
  btn.style.display = "";
  btn.onclick = async () => {
    if (promptInstalacion) {
      promptInstalacion.prompt();
      await promptInstalacion.userChoice.catch(() => {});
      promptInstalacion = null;
      return;
    }
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) {
      alert("Para instalarla en iPhone: abre el CRM en Safari → botón Compartir (cuadrado con flecha) → \"Agregar a pantalla de inicio\". Después ábrela siempre desde ese ícono.");
    } else if (/Android/i.test(ua)) {
      alert("Para instalarla: toca el menú ⋮ del navegador → \"Instalar app\" o \"Agregar a pantalla de inicio\". Después ábrela desde el ícono en tu pantalla.");
    } else {
      alert("Para instalarla: busca el ícono de instalar (monitor con flecha) al final de la barra de direcciones, o menú ⋮ → \"Guardar y compartir\" / \"Instalar CRM WhatsApp\".");
    }
  };
}

/* ---------- Notificaciones push (mensaje nuevo, con la pestaña de fondo o el celular bloqueado) ---------- */

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Normalizado = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Normalizado);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function configurarNotificaciones() {
  const btn = $("#btn-notificaciones");
  if (!btn) return;

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    btn.style.display = "none"; // navegador viejo o Safari sin soporte — mejor ni mostrar el botón que uno que nunca funciona
    return;
  }

  let registro;
  try {
    registro = await navigator.serviceWorker.register("/crm/sw.js");
  } catch {
    btn.style.display = "none";
    return;
  }

  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.tipo === "abrir-conversacion" && e.data.conversation_id) {
      cargarConversaciones().then(() => {
        const c = estado.conversaciones.find((x) => x.conversation_id === e.data.conversation_id);
        if (c) abrirConversacion(c);
      });
      return;
    }
    // Llega uno de estos por cada mensaje/llamada nueva, con o sin la
    // pestaña en foco — el poll de fondo es solo la red de seguridad
    // (reacciones, checks de leído, y por si el push no llegó), así que
    // puede ser bien espaciado; esto es lo que de verdad mantiene la
    // sensación de tiempo real.
    if (e.data?.tipo === "mensaje-nuevo" && !document.hidden) {
      // Varios mensajes seguidos = un solo refresco.
      clearTimeout(estado.syncPorPush);
      estado.syncPorPush = setTimeout(() => sincronizar().catch(() => {}), 400);
    }
  });

  let activo = false;
  const pintarEstadoBoton = (a) => {
    activo = a;
    btn.innerHTML = icon(a ? "bell" : "bellOff");
    btn.title = a ? "Notificaciones activadas — clic para desactivar" : "Activar notificaciones";
    btn.classList.toggle("notif-activa", a);
  };

  const suscripcionActual = await registro.pushManager.getSubscription();
  pushRealActivo = Boolean(suscripcionActual) && !notifLocalActiva() && Notification.permission === "granted";
  pintarEstadoBoton((Boolean(suscripcionActual) || notifLocalActiva()) && Notification.permission === "granted");

  // La clave se pide de antemano: entre el clic y el permiso/subscribe no
  // puede haber un fetch, o el navegador deja de considerarlo "gesto del
  // usuario" y rechaza con "permission denied" sin mostrar el aviso.
  let vapidKey = null;
  pedir("/api/crm/push-subscribe").then(({ key }) => { vapidKey = String(key || "").trim(); }).catch(() => {});

  btn.onclick = async () => {
    if (activo) {
      try { localStorage.removeItem(NOTIF_LOCAL_KEY); } catch {}
      pushRealActivo = false;
      const suscripcion = await registro.pushManager.getSubscription();
      if (suscripcion) {
        await pedir("/api/crm/push-subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: suscripcion.endpoint })
        }).catch(() => {});
        await suscripcion.unsubscribe();
      }
      pintarEstadoBoton(false);
      return;
    }

    // Primero el permiso, pedido directo desde el clic.
    let permiso = Notification.permission;
    if (permiso !== "granted") {
      try {
        permiso = await Notification.requestPermission();
      } catch {
        permiso = await new Promise((r) => Notification.requestPermission(r)); // Safari viejo: solo callback
      }
    }
    if (permiso !== "granted") {
      alert(ayudaPermisoNotificaciones(permiso));
      return;
    }

    try {
      if (!vapidKey) vapidKey = String((await pedir("/api/crm/push-subscribe")).key || "").trim();
      // Si el servicio push del navegador no responde (Brave sin servicios de
      // Google, red que bloquea a Google), subscribe() se cuelga para siempre.
      const suscribir = () => Promise.race([
        registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) }),
        new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("El servicio push del navegador no respondió en 20 s."), { name: "TimeoutError" })), 20000))
      ]);
      let nueva;
      try {
        nueva = await suscribir();
      } catch (err) {
        // Una suscripción vieja hecha con otra clave VAPID bloquea la nueva.
        const vieja = await registro.pushManager.getSubscription();
        if (!vieja) throw err;
        await vieja.unsubscribe();
        nueva = await suscribir();
      }
      await pedir("/api/crm/push-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: nueva })
      });
      try { localStorage.removeItem(NOTIF_LOCAL_KEY); } catch {} // con push real, el modo local duplicaría los avisos
      pushRealActivo = true;
      pintarEstadoBoton(true);
      registro.showNotification("CRM WhatsApp", {
        body: "Listo — las notificaciones quedaron activadas en este dispositivo.",
        icon: "/kittarotcod/favicon-180.png"
      }).catch(() => {});
    } catch (err) {
      const detalle = `\n\n(Detalle técnico: ${err?.name || "Error"} — ${err?.message || ""} · permiso=${Notification.permission})`;
      const esPermiso = err?.name === "NotAllowedError" || /permission/i.test(err?.message || "");
      if (esPermiso) return alert(ayudaPermisoNotificaciones("bloqueado") + detalle);

      // "push service error" = el servicio push (Google) rechazó la suscripción.
      // La causa más común es una clave VAPID mal armada en el servidor.
      const problemaClave = await validarClaveVapid(vapidKey);
      if (problemaClave) {
        return alert(`La clave VAPID_PUBLIC_KEY configurada en el servidor no es válida (${problemaClave}). Hay que regenerar el par de claves VAPID y cargarlo en Cloudflare.` + detalle);
      }
      // Sin servicio push, pero con permiso: se activa el plan B local.
      try { localStorage.setItem(NOTIF_LOCAL_KEY, "1"); } catch {}
      pintarEstadoBoton(true);
      registro.showNotification("CRM WhatsApp", {
        body: "Notificaciones activadas (mientras el CRM esté abierto).",
        icon: "/crm/icons/icon-192.png"
      }).catch(() => {});
      const brave = Boolean(navigator.brave);
      alert("Activé las notificaciones en modo local: te van a llegar mientras el CRM esté abierto (aunque sea minimizado o en otra pestaña), pero no con el CRM cerrado.\n\n" +
        (brave
          ? "Para que lleguen incluso con todo cerrado, Brave necesita su servicio push, que ahora está fallando. Opciones: asegúrate de tener activado \"Usar los servicios de Google para la mensajería push\" y reinicia Brave; o usa el CRM en Chrome, donde funciona sin configurar nada."
          : "Para que lleguen con el CRM cerrado, el navegador necesita su servicio push, que está fallando (puede ser un bloqueador, VPN o antivirus cortando la conexión a Google).") + detalle);
    }
  };
}

/** null si la clave pública VAPID es un punto P-256 válido; si no, una descripción corta del problema. */
async function validarClaveVapid(key) {
  if (!key) return "está vacía";
  let bytes;
  try { bytes = urlBase64ToUint8Array(String(key).trim()); } catch { return "no es base64url"; }
  if (bytes.length !== 65 || bytes[0] !== 4) return `mide ${bytes.length} bytes y empieza con 0x${(bytes[0] ?? 0).toString(16)}; debe medir 65 y empezar con 0x04`;
  try {
    await crypto.subtle.importKey("raw", bytes, { name: "ECDH", namedCurve: "P-256" }, false, []);
  } catch {
    return "no es un punto válido de la curva P-256";
  }
  return null;
}

/** Instrucciones según el dispositivo — casi siempre el bloqueo está en la configuración del sitio o del sistema, no en el CRM. */
function ayudaPermisoNotificaciones(permiso) {
  const ua = navigator.userAgent;
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const brave = Boolean(navigator.brave);
  const firefox = /Firefox/i.test(ua);
  const edge = /Edg\//.test(ua);
  const mac = /Macintosh/.test(ua);

  const intro = permiso === "default"
    ? "No se aceptó el aviso de notificaciones."
    : "El navegador tiene bloqueadas las notificaciones para este sitio.";

  let pasos;
  if (ios) {
    pasos = "En iPhone solo funcionan si el CRM está instalado: en Safari toca Compartir → \"Agregar a pantalla de inicio\", ábrelo desde ese ícono y vuelve a tocar la campana (necesita iOS 16.4 o más nuevo).";
  } else if (android) {
    pasos = "1. Toca el candado (o los 3 puntos → ⓘ Información del sitio) al lado de la dirección → Permisos → Notificaciones → Permitir.\n" +
      "2. Si ya decía Permitir: Ajustes del teléfono → Aplicaciones → " + (brave ? "Brave" : edge ? "Edge" : firefox ? "Firefox" : "Chrome") + " → Notificaciones → activadas.\n" +
      "3. Recarga la página y toca la campana otra vez.";
  } else {
    const nav = brave ? "Brave" : edge ? "Edge" : firefox ? "Firefox" : "Chrome";
    pasos = "1. Clic en el ícono a la izquierda de la dirección (candado/ajustes) → Notificaciones → Permitir (o \"Restablecer permisos\").\n" +
      (mac
        ? `2. Si sigue igual: Ajustes del Sistema del Mac → Notificaciones → ${nav} → Permitir notificaciones.\n`
        : `2. Si sigue igual: Configuración de Windows → Sistema → Notificaciones → activadas, y ${nav} activado en la lista.\n`) +
      "3. Recarga la página y toca la campana otra vez.";
  }
  if (!ios) pasos += "\n\nOjo: en modo incógnito o en un perfil de invitado las notificaciones push nunca funcionan — abre el CRM en una ventana normal.";

  if (brave) {
    // Brave trae apagado el servicio push de Google: con eso apagado falla
    // siempre con "permission denied", aunque el permiso del sitio esté bien.
    const braveFix = android
      ? "BRAVE (esto es casi seguro lo que falla): abre Brave → ⋮ → Configuración → Privacidad y seguridad → activa \"Usar los servicios de Google para la mensajería push\". Cierra Brave por completo (quítalo de las apps recientes), ábrelo y toca la campana otra vez."
      : "BRAVE (esto es casi seguro lo que falla): escribe brave://settings/privacy en la barra de direcciones → activa \"Usar los servicios de Google para la mensajería push\" → clic en \"Reiniciar\". Después toca la campana otra vez.";
    return `${braveFix}\n\nSi después de eso sigue igual:\n${pasos}`;
  }

  return `${intro}\n\n${pasos}`;
}

function pintarChatBase(c) {
  const nombre = c.profile_name || c.wa_id;
  $("#chat").innerHTML = `
    <header>
      <button id="btn-volver" title="Volver a la lista">${icon("arrowLeft")}</button>
      <div id="chat-contacto" title="Ver datos del contacto">
        ${avatarHtml(nombre)}
        <div>
          <div class="nombre">${escapar(nombre)}</div>
          <div class="tel">+${escapar(c.wa_id)}</div>
        </div>
      </div>
      <div class="acciones-chat">
        <button class="btn-meta ${eventosMetaDe(c.conversation_id).intencion ? "enviado" : ""}" id="btn-intencion" type="button" title="Intención de compra (avisa a Meta)">${icon("cart")}</button>
        <button class="btn-meta btn-venta ${eventosMetaDe(c.conversation_id).venta ? "enviado" : ""}" id="btn-venta" type="button" title="Reportar venta a Meta">${icon("bag")}<span>89</span></button>
        <button class="btn-star ${c.assigned_agent ? "marcada" : ""}" id="star-header">${icon(c.assigned_agent ? "star" : "starOutline")}</button>
        <button class="icono" id="btn-detalle" title="Datos del contacto">${icon("more")}</button>
      </div>
    </header>
    <div id="mensajes"></div>
    <div id="zona-arrastre">Suelta la foto o el video acá</div>
    <div id="preview-respuesta" style="display:none"></div>
    <div id="preview-archivo" style="display:none"></div>
    <form id="form-envio">
      <button type="button" class="icono" id="btn-mas" title="Más opciones">${icon("more")}</button>
      <button type="button" class="icono" id="btn-plantillas" title="Mandar plantilla">${icon("doc")}</button>
      <button type="button" class="icono" id="btn-catalogo" title="Mandar catálogo">${icon("bag")}</button>
      <button type="button" class="icono" id="btn-seguimiento" title="Seguimientos programados">${icon("clock")}</button>
      <button type="button" class="icono" id="btn-rapidas" title="Respuestas rápidas">${icon("bolt")}</button>
      <button type="button" class="icono" id="btn-stickers" title="Stickers">${icon("sticker")}</button>
      <button type="button" class="icono" id="btn-adjuntar" title="Adjuntar foto o video">${icon("paperclip")}</button>
      <input type="file" id="input-archivo" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" style="display:none" />
      <input type="file" id="input-sticker" accept="image/webp" style="display:none" />
      <textarea id="texto-envio" placeholder="${window.matchMedia("(max-width: 600px)").matches ? "Mensaje…" : "Escribe un mensaje…"}" title="Enter manda, Shift+Enter hace un salto de línea" rows="1" autocomplete="off"></textarea>
      <button type="button" class="icono" id="btn-emoji" title="Emojis">${icon("smile")}</button>
      <button type="submit" class="enviar" title="Enviar">${icon("send")}</button>
      <div id="panel-mas"></div>
      <div id="panel-rapidas"></div>
      <div id="panel-seguimientos"></div>
      <div id="panel-emojis"></div>
      <div id="panel-catalogo"></div>
      <div id="panel-stickers"></div>
    </form>`;
  $("#form-envio").addEventListener("submit", enviarMensaje);
  // Enter en un buscador de un panel (catálogo, respuestas rápidas) no debe
  // enviar el form: el navegador lo convierte en un "clic" en Enviar, que
  // además cerraba el panel.
  $("#form-envio").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("input") && e.target.closest('[id^="panel-"]')) e.preventDefault();
  });
  // Consume el estado que se metió al abrir el chat, para que el botón en
  // pantalla y el "atrás" físico del teléfono hagan exactamente lo mismo.
  $("#btn-volver").addEventListener("click", () => history.back());
  const abrirDetalle = () => {
    if (document.body.classList.contains("detalle-abierto")) return;
    history.pushState({ crmDetalle: true }, "", location.href);
    document.body.classList.add("detalle-abierto");
  };
  $("#btn-detalle").addEventListener("click", abrirDetalle);
  // Como en WhatsApp: tocar la foto o el nombre/número abre los datos del
  // contacto. Solo en celular — en escritorio el panel ya está siempre a la vista.
  $("#chat-contacto").addEventListener("click", () => {
    if (getComputedStyle($("#btn-detalle")).display !== "none") abrirDetalle();
  });
  $("#star-header").addEventListener("click", () => {
    const c2 = estado.conversaciones.find((x) => x.conversation_id === estado.conversacionActivaId);
    if (c2) clicEstrella(c2);
  });
  pintarEstrellaHeader(c);
  $("#btn-intencion").addEventListener("click", (e) => { e.stopPropagation(); abrirPopoverMeta(c, "intencion"); });
  $("#btn-venta").addEventListener("click", (e) => { e.stopPropagation(); abrirPopoverMeta(c, "venta"); });
  $("#btn-adjuntar").addEventListener("click", () => $("#input-archivo").click());
  $("#input-archivo").addEventListener("change", onArchivoElegido);
  $("#texto-envio").addEventListener("paste", onPegarImagen);
  $("#texto-envio").addEventListener("beforeinput", onImagenDelTeclado);
  configurarAccionesMensajes();

  const textoEnvio = $("#texto-envio");
  textoEnvio.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      $("#form-envio").requestSubmit();
    }
  });
  textoEnvio.addEventListener("input", (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";

    const v = e.target.value;
    if (v.startsWith("/")) {
      estado.rapidasPorSlash = true;
      estado.filtroRapidas = v.slice(1);
      if (!$("#panel-rapidas").classList.contains("abierto")) {
        cerrarPaneles(["#panel-rapidas"]);
        $("#panel-rapidas").classList.add("abierto");
      }
      cargarQuickReplies().then(pintarQuickPanel);
    } else if (estado.rapidasPorSlash) {
      estado.rapidasPorSlash = false;
      $("#panel-rapidas").classList.remove("abierto");
    }
  });
  $("#btn-rapidas").addEventListener("click", (e) => { e.stopPropagation(); cerrarPaneles(["#panel-rapidas"]); toggleQuickPanel(); });

  // Arrastrar y soltar una foto/video directo sobre el chat.
  const chat = $("#chat");
  let dragCounter = 0;
  chat.addEventListener("dragenter", (e) => {
    e.preventDefault();
    if (![...e.dataTransfer.items].some((i) => i.kind === "file")) return;
    dragCounter++;
    $("#zona-arrastre").classList.add("visible");
  });
  chat.addEventListener("dragover", (e) => e.preventDefault());
  chat.addEventListener("dragleave", () => {
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) $("#zona-arrastre").classList.remove("visible");
  });
  chat.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCounter = 0;
    $("#zona-arrastre").classList.remove("visible");
    const file = e.dataTransfer.files?.[0];
    if (file) onArchivoElegido({ target: { files: [file] } });
  });
  $("#btn-seguimiento").addEventListener("click", (e) => { e.stopPropagation(); cerrarPaneles(["#panel-seguimientos"]); toggleSeguimientosPanel(); });
  $("#btn-mas").addEventListener("click", (e) => { e.stopPropagation(); cerrarPaneles(["#panel-mas"]); toggleMasPanel(); });
  $("#btn-emoji").addEventListener("click", (e) => { e.stopPropagation(); cerrarPaneles(["#panel-emojis"]); toggleEmojiPanel(); });
  $("#btn-plantillas").addEventListener("click", () => abrirModalTemplates());
  $("#btn-catalogo").addEventListener("click", (e) => { e.stopPropagation(); cerrarPaneles(["#panel-catalogo"]); toggleCatalogoPanel(); });
  $("#btn-stickers").addEventListener("click", (e) => { e.stopPropagation(); cerrarPaneles(["#panel-stickers"]); toggleStickersPanel(); });
  $("#input-sticker").addEventListener("change", onStickerElegido);
}

/* ---------- Stickers ---------- */

let cacheStickers = null;

async function toggleStickersPanel() {
  const panel = $("#panel-stickers");
  if (!panel) return;
  panel.classList.toggle("abierto");
  if (!panel.classList.contains("abierto")) return;

  try {
    const { stickers } = await pedir("/api/crm/stickers");
    cacheStickers = stickers;
    pintarStickersPanel();
  } catch (err) {
    panel.innerHTML = `<div class="item"><div class="cuerpo">${escapar(err.message)}</div></div>`;
  }
}

function pintarStickersPanel() {
  const panel = $("#panel-stickers");
  if (!panel) return;
  panel.innerHTML = `
    <div class="stickers-grid">
      ${(cacheStickers || []).map((s) => `
        <div class="sticker-item" data-id="${s.id}">
          <img src="/api/crm/media?key=${encodeURIComponent(s.media_key)}" alt="sticker" loading="lazy" />
          <button type="button" class="sticker-borrar" data-id="${s.id}" title="Borrar sticker">${icon("trash")}</button>
        </div>`).join("")}
      <div class="sticker-item sticker-agregar" id="sticker-agregar" title="Agregar sticker">${icon("plus")}</div>
    </div>`;
  panel.querySelectorAll(".sticker-item:not(.sticker-agregar)").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".sticker-borrar")) return;
      enviarSticker(Number(el.dataset.id));
    });
  });
  panel.querySelectorAll(".sticker-borrar").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); borrarSticker(Number(btn.dataset.id)); });
  });
  $("#sticker-agregar").addEventListener("click", () => $("#input-sticker").click());
}

async function enviarSticker(id) {
  const sticker = (cacheStickers || []).find((s) => s.id === id);
  if (!sticker) return;
  $("#panel-stickers").classList.remove("abierto");
  const conversationId = estado.conversacionActivaId;
  encolarEnvio(conversationId, [{ type: "sticker", mediaKey: sticker.media_key }], () =>
    pedir("/api/crm/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, media_key: sticker.media_key, media_type: "sticker" })
    }), (err) => alert(err.message));
}

async function borrarSticker(id) {
  if (!confirm("¿Borrar este sticker de la biblioteca?")) return;
  try {
    await pedir("/api/crm/stickers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    cacheStickers = (cacheStickers || []).filter((s) => s.id !== id);
    pintarStickersPanel();
  } catch (err) {
    alert(err.message);
  }
}

async function onStickerElegido(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = "";
  try {
    const { media_key, mime, type } = await subirArchivo(file);
    if (type !== "sticker") { alert("El archivo debe ser un webp (formato de sticker)."); return; }
    const { sticker } = await pedir("/api/crm/stickers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_key, media_mime: mime })
    });
    cacheStickers = [...(cacheStickers || []), sticker];
    pintarStickersPanel();
  } catch (err) {
    alert(err.message);
  }
}

async function enviarCatalogoCompleto() {
  $("#panel-catalogo").classList.remove("abierto");
  const conversationId = estado.conversacionActivaId;
  encolarEnvio(conversationId, [{ type: "text", body: "[Catálogo]" }], () =>
    pedir("/api/crm/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId })
    }), (err) => alert(err.message));
}

async function enviarProductoElegido(retailerId) {
  $("#panel-catalogo").classList.remove("abierto");
  const nombre = cacheProductosCatalogo?.find((p) => p.retailer_id === retailerId)?.name;
  const conversationId = estado.conversacionActivaId;
  encolarEnvio(conversationId, [{ type: "text", body: `🛍️ ${nombre || "Producto del catálogo"}` }], () =>
    pedir("/api/crm/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, product_retailer_id: retailerId, product_name: nombre })
    }), (err) => alert(err.message));
}

let cacheProductosCatalogo = null;

async function toggleCatalogoPanel() {
  const panel = $("#panel-catalogo");
  if (!panel) return;
  panel.classList.toggle("abierto");
  if (!panel.classList.contains("abierto")) return;

  panel.innerHTML = `
    <div class="item" id="cat-completo"><div class="titulo">${icon("bag")} Mandar catálogo completo</div></div>
    <div style="padding:8px 10px"><input type="text" id="cat-buscar" placeholder="Buscar producto…" /></div>
    <div id="cat-lista">Cargando…</div>`;
  $("#cat-completo").addEventListener("click", enviarCatalogoCompleto);
  $("#cat-buscar").addEventListener("input", (e) => pintarListaProductos(e.target.value.trim().toLowerCase()));

  try {
    if (!cacheProductosCatalogo) {
      const { products } = await pedir("/api/crm/catalog-products");
      cacheProductosCatalogo = products;
    }
    pintarListaProductos("");
  } catch (err) {
    $("#cat-lista").innerHTML = `<div class="item"><div class="cuerpo">${escapar(err.message)}</div></div>`;
  }
}

function pintarListaProductos(filtro) {
  const cont = $("#cat-lista");
  if (!cont) return;
  const productos = (cacheProductosCatalogo || []).filter((p) => !filtro || p.name?.toLowerCase().includes(filtro));
  cont.innerHTML = productos.length
    ? productos.map((p) => `
      <div class="item" data-id="${escapar(p.retailer_id)}">
        ${p.image_url ? `<img class="miniatura" src="${escapar(p.image_url)}" alt="" />` : `<div class="miniatura">${icon("tag")}</div>`}
        <div><div class="titulo">${escapar(p.name || p.retailer_id)}</div></div>
      </div>`).join("")
    : `<div class="item"><div class="cuerpo">Sin productos.</div></div>`;
  cont.querySelectorAll(".item").forEach((el) => el.addEventListener("click", () => enviarProductoElegido(el.dataset.id)));
}

function cerrarPaneles(excepto = []) {
  ["#panel-rapidas", "#panel-seguimientos", "#panel-emojis", "#panel-catalogo", "#panel-mas", "#panel-stickers"].forEach((sel) => {
    if (!excepto.includes(sel)) $(sel)?.classList.remove("abierto");
  });
}

/** Menú "⋯" que en el celular junta plantilla/catálogo/seguimiento — en pantallas angostas no entran los 5 íconos junto al textarea. */
function toggleMasPanel() {
  const panel = $("#panel-mas");
  if (!panel) return;
  panel.classList.toggle("abierto");
  if (!panel.classList.contains("abierto")) return;
  panel.innerHTML = `
    <div class="item" id="mas-plantillas"><div class="titulo">${icon("doc")} Mandar plantilla</div></div>
    <div class="item" id="mas-catalogo"><div class="titulo">${icon("bag")} Mandar catálogo</div></div>
    <div class="item" id="mas-seguimiento"><div class="titulo">${icon("clock")} Seguimientos programados</div></div>
    <div class="item" id="mas-stickers"><div class="titulo">${icon("sticker")} Stickers</div></div>
    <div class="item" id="mas-pegar-imagen"><div class="titulo">${icon("image")} Pegar imagen copiada</div></div>
    <div class="item mas-solo-angosto" id="mas-adjuntar"><div class="titulo">${icon("paperclip")} Adjuntar foto, video o archivo</div></div>
    <div class="item mas-solo-angosto" id="mas-emojis"><div class="titulo">${icon("smile")} Emojis</div></div>`;
  $("#mas-pegar-imagen").addEventListener("click", () => { panel.classList.remove("abierto"); pegarImagenDelPortapapeles(); });
  $("#mas-adjuntar").addEventListener("click", () => { panel.classList.remove("abierto"); $("#input-archivo").click(); });
  $("#mas-emojis").addEventListener("click", (e) => { e.stopPropagation(); panel.classList.remove("abierto"); toggleEmojiPanel(); });
  $("#mas-plantillas").addEventListener("click", () => { panel.classList.remove("abierto"); abrirModalTemplates(); });
  $("#mas-catalogo").addEventListener("click", () => { panel.classList.remove("abierto"); toggleCatalogoPanel(); });
  $("#mas-seguimiento").addEventListener("click", () => { panel.classList.remove("abierto"); toggleSeguimientosPanel(); });
  $("#mas-stickers").addEventListener("click", () => { panel.classList.remove("abierto"); toggleStickersPanel(); });
}

async function cargarMensajes() {
  if (!estado.conversacionActivaId) return;
  await sincronizar();
}

function aplicarMensajes(conversationId, { messages, hay_mas }) {
  // Si mientras se esperaba la respuesta el vendedor ya se cambió a otro
  // chat, estos mensajes son de la conversación vieja — pintarlos ahora
  // metería mensajes de un chat en otro (el glitch del "Hola" que aparecía
  // en el chat equivocado y desaparecía solo con el siguiente refresco).
  if (estado.conversacionActivaId !== conversationId) return;
  const yaPagino = estado.mensajesCargados.length > PAGINA_MENSAJES;

  // Se mezcla con lo ya cargado (en vez de reemplazar) para no perder los
  // mensajes antiguos que el vendedor ya pidió con "Cargar anteriores".
  const mapa = new Map(estado.mensajesCargados.map((m) => [m.id, m]));
  for (const m of messages) mapa.set(m.id, m);
  estado.mensajesCargados = [...mapa.values()].sort((a, b) => a.id - b.id);
  if (!yaPagino) estado.hayMasAntiguos = hay_mas;

  // El poll pide esto cada 3s aunque no haya nada nuevo — repintar SIEMPRE
  // rehace todo el innerHTML de #mensajes, lo que recrea el <audio>/<video>
  // que el cliente esté escuchando/viendo y lo reinicia desde cero (el bug
  // de "el audio se corta a los 2 segundos"). Si la firma del contenido no
  // cambió, no hay nada que repintar.
  const firma = JSON.stringify(estado.mensajesCargados);
  const cambio = firma !== estado.firmaMensajesPintados;
  if (cambio) {
    estado.firmaMensajesPintados = firma;
    pintarMensajes();
  }

  const c = estado.conversaciones.find((x) => x.conversation_id === conversationId);
  if (c) c.unread_count = 0;
  // Pedidos y seguimientos solo cambian cuando pasa algo en el chat: se
  // piden al abrirlo y cuando llegan mensajes, no en cada ciclo del poll.
  if (cambio || estado.panelesCargadosPara !== conversationId) {
    estado.panelesCargadosPara = conversationId;
    actualizarPedidosPanel();
    actualizarSeguimientosDetalle();
  }
}

async function cargarMensajesAnteriores() {
  const conversationId = estado.conversacionActivaId;
  if (!conversationId || !estado.mensajesCargados.length) return;
  const btn = $("#cargar-anteriores button");
  if (btn) { btn.disabled = true; btn.textContent = "Cargando…"; }

  const primerId = estado.mensajesCargados[0].id;
  const cont = $("#mensajes");
  const alturaPrevia = cont.scrollHeight;

  const { messages, hay_mas } = await pedir(`/api/crm/messages?conversation_id=${conversationId}&before_id=${primerId}`);
  if (estado.conversacionActivaId !== conversationId) return;
  estado.mensajesCargados = [...messages, ...estado.mensajesCargados];
  estado.hayMasAntiguos = hay_mas;
  estado.firmaMensajesPintados = JSON.stringify(estado.mensajesCargados);
  pintarMensajes();
  cont.scrollTop = cont.scrollHeight - alturaPrevia;
}

/** Actualiza solo el contenido de "Pedidos del catálogo", sin re-pintar el resto del panel (evita el parpadeo). */
async function actualizarPedidosPanel() {
  const cont = $("#detalle-pedidos");
  if (!cont || !estado.conversacionActivaId) return;
  try {
    const { orders } = await pedir(`/api/crm/catalog?conversation_id=${estado.conversacionActivaId}`);
    const html = orders.length ? orders.map((o) => `
      <div class="ad-card" style="margin-bottom:8px">
        <div class="titulo">${icon("bag")} ${fechaCorta(o.created_at)}</div>
        ${o.items.map((i) => `<div>${i.quantity}× ${escapar(i.name || i.product_retailer_id)} — ${i.item_price ?? ""} ${escapar(o.currency || "")}</div>`).join("")}
        ${o.total_amount ? `<div><strong>Total: ${o.total_amount} ${escapar(o.currency || "")}</strong></div>` : ""}
      </div>`).join("") : `<div class="sin-ad">Sin pedidos de catálogo todavía.</div>`;
    if (cont.innerHTML !== html) cont.innerHTML = html;
  } catch { /* silencioso */ }
}

/* ---------- Botones de Meta del header (intención de compra / venta) ---------- */

const KIT_DEFAULT = { nombre: "Kit Tarot Rider-Waite de aprendizaje", precio: 89 };
const precioProducto = (p) => parseFloat(String(p.price ?? "").match(/[\d.]+/)?.[0] || "0");
const eventosMetaEnviados = {};
const eventosMetaDe = (conversationId) => eventosMetaEnviados[conversationId] || {};

async function productosDelCatalogo() {
  if (!cacheProductosCatalogo) {
    const { products } = await pedir("/api/crm/catalog-products");
    cacheProductosCatalogo = products;
  }
  return cacheProductosCatalogo || [];
}

function cerrarPopoverMeta() {
  $("#popover-meta")?.remove();
  document.removeEventListener("pointerdown", cerrarPopoverMetaAfuera, true);
}

function cerrarPopoverMetaAfuera(e) {
  if (!e.target.closest("#popover-meta, #btn-intencion, #btn-venta")) cerrarPopoverMeta();
}

function abrirPopoverMeta(c, tipo) {
  const mismo = $("#popover-meta")?.dataset.tipo === tipo;
  cerrarPopoverMeta();
  if (mismo) return;

  const pop = document.createElement("div");
  pop.id = "popover-meta";
  pop.dataset.tipo = tipo;
  const items = [{ ...KIT_DEFAULT }];

  if (tipo === "intencion") {
    pop.innerHTML = `
      <div class="pm-titulo">${icon("cart")} Intención de compra</div>
      <p class="pm-ayuda">Avisa a Meta que este cliente está por comprar, para que busque más gente así. Al cliente no le llega nada.</p>
      <button type="button" class="pm-confirmar">Marcar intención</button>
      <div class="pm-estado"></div>`;
  } else {
    pop.innerHTML = `
      <div class="pm-titulo">${icon("bag")} Reportar venta</div>
      <div class="pm-items"></div>
      <select class="pm-agregar"><option value="">+ ¿Compró algo más?</option></select>
      <label class="pm-total">Total S/ <input type="number" class="pm-valor" min="0" step="0.01" /></label>
      <button type="button" class="pm-confirmar">Reportar venta</button>
      <div class="pm-estado"></div>`;

    const pintarItems = () => {
      pop.querySelector(".pm-items").innerHTML = items.map((it, i) => `
        <div class="pm-item"><span>${escapar(it.nombre)}</span><span class="pm-precio">${it.precio}</span><button type="button" data-i="${i}" title="Quitar">${icon("close")}</button></div>`).join("")
        || `<div class="pm-ayuda">Sin productos — escribe el total.</div>`;
      pop.querySelector(".pm-valor").value = items.reduce((s, it) => s + it.precio, 0) || "";
    };
    pintarItems();
    pop.querySelector(".pm-items").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-i]");
      if (!b) return;
      items.splice(Number(b.dataset.i), 1);
      pintarItems();
    });
    const select = pop.querySelector(".pm-agregar");
    productosDelCatalogo().then((productos) => {
      productos.forEach((p, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = `${p.name || p.retailer_id}${precioProducto(p) ? ` — ${precioProducto(p)}` : ""}`;
        select.appendChild(opt);
      });
    }).catch(() => {});
    select.addEventListener("change", () => {
      const p = cacheProductosCatalogo?.[Number(select.value)];
      select.value = "";
      if (!p) return;
      items.push({ nombre: p.name || p.retailer_id, precio: precioProducto(p) });
      pintarItems();
    });
  }

  pop.querySelector(".pm-confirmar").addEventListener("click", async () => {
    const btn = pop.querySelector(".pm-confirmar");
    const estadoEl = pop.querySelector(".pm-estado");
    const valor = tipo === "venta" ? Number(pop.querySelector(".pm-valor").value) : KIT_DEFAULT.precio;
    if (tipo === "venta" && !(valor > 0)) return alert("Escribe un monto válido.");
    const producto = tipo === "venta" ? items.map((it) => it.nombre).join(", ") : KIT_DEFAULT.nombre;
    btn.disabled = true;
    estadoEl.className = "pm-estado";
    estadoEl.textContent = "Enviando…";
    try {
      const r = await pedir("/api/crm/capi-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: c.conversation_id, tipo, value: valor, currency: "PEN", product_label: producto || undefined })
      });
      eventosMetaEnviados[c.conversation_id] = { ...eventosMetaDe(c.conversation_id), [tipo]: true };
      $(tipo === "venta" ? "#btn-venta" : "#btn-intencion")?.classList.add("enviado");
      estadoEl.className = "pm-estado ok";
      estadoEl.textContent = r.modo === "anuncio" ? "✓ Enviado a Meta (vinculado al anuncio)" : "✓ Enviado a Meta";
      if (estado.miRol === "admin") actualizarHistorialCapi(c.conversation_id);
      setTimeout(() => { if ($("#popover-meta") === pop) cerrarPopoverMeta(); }, 1600);
    } catch (err) {
      estadoEl.className = "pm-estado error";
      estadoEl.textContent = err.message;
      btn.disabled = false;
    }
  });

  $("#chat").appendChild(pop);
  document.addEventListener("pointerdown", cerrarPopoverMetaAfuera, true);
}

document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarPopoverMeta(); });

const NOMBRE_EVENTO_META = { Purchase: "Venta", InitiateCheckout: "Intención", LeadSubmitted: "Conversación", Contact: "Conversación" };

/** Historial de eventos CAPI mandados en este chat (con o sin pedido del catálogo detrás). */
async function actualizarHistorialCapi(conversationId) {
  const cont = $("#detalle-capi-historial");
  if (!cont) return;
  try {
    const { events } = await pedir(`/api/crm/capi-send?conversation_id=${conversationId}`);
    cont.innerHTML = events.length
      ? `<div class="ayuda-modal" style="margin-bottom:4px">Enviados antes:</div>` + events.map((e) => `
        <div style="font-size:11px;color:var(--gris);display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--borde)">
          <span>${fechaCorta(e.created_at)} · ${escapar(NOMBRE_EVENTO_META[e.event_name] || e.event_name || "Venta")}${e.mode === "anuncio" ? " (anuncio)" : ""}${e.product_label ? ` · ${escapar(e.product_label)}` : ""}</span>
          <span style="color:${e.status === "enviado" ? "var(--verde-osc)" : "var(--peligro)"}" title="${escapar(e.error || "")}">${e.value ? `${e.value} ${escapar(e.currency)} ` : ""}${e.status === "enviado" ? "✓" : "✗"}</span>
        </div>`).join("")
      : "";
  } catch { /* silencioso */ }
}

/** Igual que arriba pero con la lista de seguimientos programados, para verla en el panel lateral sin abrir el chat. */
/** El texto a mostrar de un seguimiento programado — cubre los tres orígenes posibles: texto propio, respuesta rápida, o plantilla (envío masivo). */
function textoSeguimiento(s) {
  if (s.body) return s.body;
  if (s.quick_reply_title) return s.quick_reply_title;
  if (s.template_name) return `Plantilla: ${s.template_name}`;
  if (s.media_key) return "Foto/video";
  return "";
}

async function actualizarSeguimientosDetalle() {
  const cont = $("#detalle-seguimientos");
  const conversationId = estado.conversacionActivaId;
  if (!cont || !conversationId) return;
  try {
    const { scheduled } = await pedir(`/api/crm/scheduled?conversation_id=${conversationId}`);
    actualizarEtiquetaSeguimiento(conversationId, scheduled);
    if (estado.conversacionActivaId !== conversationId) return;
    estado.seguimientosDelChat = { conversationId, scheduled };
    pintarEstadoLead();
    const html = (scheduled.length ? scheduled.map((s) => `
      <div class="ad-card seguimiento-detalle" data-id="${s.id}" style="margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div>
          <div class="titulo">${icon(s.batch_id ? "broadcast" : "clock")} ${fechaCorta(s.send_at)} ${etiquetaTipoSeguimiento(s)}</div>
          <div>${escapar(textoSeguimiento(s))}</div>
        </div>
        <div style="display:flex;gap:4px">
          ${seguimientoEditable(s) ? `<button class="editar-seguimiento-detalle" data-id="${s.id}" title="Editar">${icon("pencil")}</button>` : ""}
          <button class="borrar-seguimiento-detalle" data-id="${s.id}" title="Cancelar">${icon("close")}</button>
        </div>
      </div>`).join("") + `<div class="ayuda-modal" style="margin:0 0 8px">"Tras no respuesta" se cancela si el cliente escribe o si le escribes. "Manual" se cancela solo si el cliente escribe.</div>` : `<div class="sin-ad">Sin seguimientos activos.</div>`)
      + (scheduled.length > 1 ? `<button class="cancelar" id="detalle-cancelar-todos" type="button" style="width:100%;font-size:12px">${icon("close")} Cancelar los ${scheduled.length}</button>` : "");
    if (cont.innerHTML !== html) {
      cont.innerHTML = html;
      $("#detalle-cancelar-todos")?.addEventListener("click", async () => {
        if (!confirm(`¿Cancelar los ${scheduled.length} seguimientos programados de este chat?`)) return;
        try {
          await pedir("/api/crm/scheduled", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversation_id: conversationId, all: true })
          });
        } catch (err) {
          alert(err.message);
        }
        await actualizarSeguimientosDetalle();
      });
      cont.querySelectorAll(".editar-seguimiento-detalle").forEach((btn) => {
        btn.addEventListener("click", () => {
          const s = scheduled.find((x) => x.id === Number(btn.dataset.id));
          if (s) abrirModalEditarSeguimiento(s);
        });
      });
      cont.querySelectorAll(".borrar-seguimiento-detalle").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await pedir("/api/crm/scheduled", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: Number(btn.dataset.id) })
          });
          await actualizarSeguimientosDetalle();
        });
      });
    }
  } catch { /* silencioso */ }
}

/** El aviso "de una sola vista" — como en la app real, se muestra encima del contenido, no lo reemplaza (el medio igual queda guardado en R2/Meta para el equipo). */
function vistaUnicaHtml(m) {
  return m.view_once ? `<div class="aviso-vista-unica">${icon("eye")} Una sola vista</div>` : "";
}

function contenidoMensaje(m) {
  if (m.type === "sticker" && (m.media_key || m.media_id)) {
    return `<img class="sticker" src="/api/crm/media?message_id=${m.id}" loading="lazy" alt="sticker" />`;
  }
  if (m.type === "image" && (m.media_key || m.media_id)) {
    return `${vistaUnicaHtml(m)}<img src="/api/crm/media?message_id=${m.id}" loading="lazy" alt="foto" />${m.body ? `<div class="caption">${formatearTextoWA(m.body)}</div>` : ""}`;
  }
  if (m.type === "video" && (m.media_key || m.media_id)) {
    return `${vistaUnicaHtml(m)}<video src="/api/crm/media?message_id=${m.id}" controls></video>${m.body ? `<div class="caption">${formatearTextoWA(m.body)}</div>` : ""}`;
  }
  if (m.type === "audio" && (m.media_key || m.media_id)) {
    return `<audio src="/api/crm/media?message_id=${m.id}" controls preload="none"></audio>`;
  }
  if (m.type === "document" && (m.media_key || m.media_id)) {
    const nombre = m.file_name || m.body || "Documento";
    return `<a class="tarjeta-especial tarjeta-documento" href="/api/crm/media?message_id=${m.id}" target="_blank" rel="noopener">${icon("doc")} ${escapar(nombre)}</a>`;
  }
  if (!m.type || m.type === "text") return formatearTextoWA(m.body || "");
  if (m.type === "call") return `<div class="tarjeta-especial tarjeta-llamada">${icon("alertCircle")} ${escapar(m.body || "Llamada")}</div>`;
  if (m.type === "order") return `<div class="tarjeta-especial tarjeta-pedido">${icon("bag")} <strong>Pedido del catálogo</strong><div>${escapar(m.body || "")}</div></div>`;
  if (m.type === "catalog") return `<div class="tarjeta-especial tarjeta-catalogo">${icon("bag")} Catálogo enviado</div>`;
  if (m.type === "product") return `<div class="tarjeta-especial tarjeta-catalogo">${icon("tag")} ${escapar(m.body || "Producto enviado")}</div>`;
  if (m.type === "location") return ubicacionHtml(m.body);
  return `<span class="tipo">[${escapar(m.type)}]${m.body ? " " + escapar(m.body) : ""}</span>`;
}

/** Tarjeta de ubicación — body es "lat|lng|nombre|dirección" (nombre/dirección solo si el cliente compartió un lugar guardado). */
function ubicacionHtml(body) {
  const [lat, lng, nombre, direccion] = (body || "").split("|");
  if (!lat || !lng) return `<div class="tarjeta-especial tarjeta-ubicacion">${icon("map")} Ubicación (sin coordenadas)</div>`;
  const url = `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
  return `<a class="tarjeta-especial tarjeta-ubicacion" href="${escapar(url)}" target="_blank" rel="noopener">
    ${icon("map")}
    <div>
      <strong>${escapar(nombre || "Ubicación compartida")}</strong>
      ${direccion ? `<div class="sub">${escapar(direccion)}</div>` : ""}
      <div class="sub">Ver en Google Maps</div>
    </div>
  </a>`;
}

/** Un extracto corto de un mensaje, para citarlo en la respuesta o en el "responde a" arriba de una burbuja. */
function extractoMensaje(tipo, body) {
  if (tipo === "location") {
    const nombre = (body || "").split("|")[2];
    return nombre ? `📍 ${nombre}` : "📍 Ubicación";
  }
  if (body) return body.length > 80 ? body.slice(0, 80) + "…" : body;
  const nombres = { image: "📷 Foto", video: "🎥 Video", sticker: "Sticker", document: "📄 Documento", audio: "🎵 Audio", catalog: "Catálogo", product: "Producto", order: "Pedido", call: "📞 Llamada" };
  return nombres[tipo] || "Mensaje";
}

/** La cajita citada arriba del mensaje, cuando es una respuesta a otro — como WhatsApp. */
function quoteHtml(m) {
  if (!m.reply_to_message_id) return "";
  const quien = m.reply_direction === "out" ? (m.reply_sent_by || "Tú") : "Cliente";
  return `<div class="msg-quote">
    <div class="msg-quote-quien">${escapar(quien)}</div>
    <div class="msg-quote-texto">${escapar(extractoMensaje(m.reply_type, m.reply_body))}</div>
  </div>`;
}

/** Chips de reacción (una por lado como mucho, igual que WhatsApp) debajo/al costado de la burbuja. */
function reaccionesHtml(m) {
  if (!m.client_reaction && !m.agent_reaction) return "";
  const chips = [m.client_reaction, m.agent_reaction].filter(Boolean).map((e) => `<span class="reaccion-chip">${escapar(e)}</span>`).join("");
  return `<div class="msg-reacciones">${chips}</div>`;
}

/** "Hoy", "Ayer" o la fecha — para separar los mensajes por día, como WhatsApp. */
function etiquetaDia(iso) {
  const d = new Date(iso.includes("Z") || iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a, b) => a.toDateString() === b.toDateString();
  if (mismoDia(d, hoy)) return "Hoy";
  if (mismoDia(d, ayer)) return "Ayer";
  return d.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: d.getFullYear() !== hoy.getFullYear() ? "numeric" : undefined });
}

/** Los dos palitos de "entregado/leído" — solo tiene sentido en lo que nosotros mandamos. */
function estadoMensaje(m) {
  if (m.direction !== "out") return "";
  if (m.status === "failed") return `<span class="estado-msg fallido" title="No se pudo enviar${m.error_detail ? `: ${escapar(m.error_detail)}` : ""}">${icon("alertCircle")}</span>`;
  if (m.status === "read") return `<span class="estado-msg leido" title="Leído">${icon("checkDouble")}</span>`;
  if (m.status === "delivered") return `<span class="estado-msg" title="Entregado">${icon("checkDouble")}</span>`;
  return `<span class="estado-msg" title="Enviado">${icon("check")}</span>`;
}

function pintarMensajes({ alFinal = false } = {}) {
  const cont = $("#mensajes");
  if (!cont) return;
  const mensajes = estado.mensajesCargados;
  const abajo = cont.scrollTop + cont.clientHeight >= cont.scrollHeight - 40;

  let diaAnterior = null;
  const filas = mensajes.map((m) => {
    const dia = etiquetaDia(m.created_at);
    const separador = dia !== diaAnterior ? `<div class="separador-fecha"><span>${dia}</span></div>` : "";
    diaAnterior = dia;
    return `${separador}
    <div class="msg-fila ${m.direction}" data-id="${m.id}">
      <div class="msg-acciones">
        <button type="button" class="msg-reaccionar" title="Reaccionar">${icon("smile")}</button>
        <button type="button" class="msg-responder" title="Responder">${icon("reply")}</button>
      </div>
      <div class="msg ${m.direction}">
        ${quoteHtml(m)}
        ${contenidoMensaje(m)}
        <span class="hora">${m.sent_by ? escapar(m.sent_by) + " · " : ""}${horaCorta(m.created_at)}${estadoMensaje(m)}</span>
        ${reaccionesHtml(m)}
      </div>
    </div>`;
  }).join("");

  const pendientes = estado.enviosPendientes
    .filter((p) => p.conversationId === estado.conversacionActivaId)
    .map((p) => `
    <div class="msg-fila out pendiente" data-temp="${p.tempId}">
      <div class="msg out">
        ${contenidoPendiente(p)}
        <span class="hora">Enviando… <span class="estado-msg" title="Enviando">${icon("clock")}</span></span>
      </div>
    </div>`).join("");

  cont.innerHTML = (estado.hayMasAntiguos
    ? `<div id="cargar-anteriores"><button type="button">Cargar mensajes anteriores</button></div>`
    : "") + filas + pendientes;

  $("#cargar-anteriores button")?.addEventListener("click", cargarMensajesAnteriores);
  if (alFinal || abajo || mensajes.length <= 20) cont.scrollTop = cont.scrollHeight;
}

/* ---------- Responder a un mensaje / reaccionar ---------- */

const EMOJIS_REACCION = ["☺️", "✨", "🫶", "🙌", "❤️"];

function configurarAccionesMensajes() {
  const cont = $("#mensajes");
  if (!cont) return;

  cont.addEventListener("click", (e) => {
    const filaResponder = e.target.closest(".msg-responder");
    if (filaResponder) {
      seleccionarRespuesta(Number(filaResponder.closest(".msg-fila").dataset.id));
      return;
    }
    const filaReaccionar = e.target.closest(".msg-reaccionar");
    if (filaReaccionar) {
      abrirPickerReaccion(filaReaccionar);
      return;
    }
  });

  // Deslizar a la derecha para responder, igual que WhatsApp — solo en touch.
  // Ojo: mantener presionado un mensaje para seleccionar texto y copiarlo
  // también empieza con un touchstart+touchmove ahí adentro, así que hay que
  // esperar a que el gesto sea claramente horizontal (y no un toquecito
  // apenas perceptible) antes de mover la burbuja — si no, le pisa la
  // selección nativa al que solo quería copiar.
  let touchInicio = null;
  let filaActual = null;
  cont.addEventListener("touchstart", (e) => {
    const fila = e.target.closest(".msg-fila");
    if (!fila) return;
    filaActual = fila;
    touchInicio = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  cont.addEventListener("touchmove", (e) => {
    if (!filaActual || touchInicio === null) return;
    const dx = e.touches[0].clientX - touchInicio.x;
    const dy = e.touches[0].clientY - touchInicio.y;
    if (Math.abs(dx) < 10 || Math.abs(dy) > Math.abs(dx)) return;
    const delta = Math.max(0, Math.min(70, dx));
    filaActual.querySelector(".msg").style.transform = `translateX(${delta}px)`;
  }, { passive: true });
  cont.addEventListener("touchend", (e) => {
    if (!filaActual) return;
    const delta = (e.changedTouches[0]?.clientX || 0) - touchInicio.x;
    filaActual.querySelector(".msg").style.transform = "";
    if (delta > 60) seleccionarRespuesta(Number(filaActual.dataset.id));
    filaActual = null;
    touchInicio = null;
  });
}

function seleccionarRespuesta(id) {
  const m = estado.mensajesCargados.find((x) => x.id === id);
  if (!m) return;
  estado.respondiendoA = { id: m.id, direction: m.direction, sentBy: m.sent_by, type: m.type, body: m.body };
  pintarPreviewRespuesta();
  $("#texto-envio")?.focus();
}

function cancelarRespuesta() {
  estado.respondiendoA = null;
  pintarPreviewRespuesta();
}

function pintarPreviewRespuesta() {
  const cont = $("#preview-respuesta");
  if (!cont) return;
  const r = estado.respondiendoA;
  if (!r) { cont.style.display = "none"; cont.innerHTML = ""; return; }
  cont.style.display = "flex";
  cont.innerHTML = `
    <div class="msg-quote" style="flex:1">
      <div class="msg-quote-quien">${escapar(r.direction === "out" ? (r.sentBy || "Tú") : "Cliente")}</div>
      <div class="msg-quote-texto">${escapar(extractoMensaje(r.type, r.body))}</div>
    </div>
    <button type="button" id="cancelar-respuesta">${icon("close")}</button>`;
  $("#cancelar-respuesta").addEventListener("click", cancelarRespuesta);
}

function abrirPickerReaccion(btn) {
  document.querySelectorAll(".picker-reaccion").forEach((el) => el.remove());
  const filaId = Number(btn.closest(".msg-fila").dataset.id);
  const picker = document.createElement("div");
  picker.className = "picker-reaccion";
  picker.innerHTML = EMOJIS_REACCION.map((em) => `<button type="button" data-emoji="${em}">${em}</button>`).join("");
  btn.closest(".msg-acciones").appendChild(picker);

  picker.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      picker.remove();
      await enviarReaccionMsg(filaId, b.dataset.emoji);
    });
  });

  setTimeout(() => {
    document.addEventListener("click", function cerrar(ev) {
      if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener("click", cerrar); }
    });
  }, 0);
}

async function enviarReaccionMsg(messageId, emoji) {
  const m = estado.mensajesCargados.find((x) => x.id === messageId);
  // agent_reaction es siempre "lo que nosotros pusimos" — sin importar si el
  // mensaje en sí es de entrada o de salida. Tocar el mismo emoji la quita,
  // como WhatsApp.
  const emojiFinal = m?.agent_reaction === emoji ? null : emoji;
  try {
    await pedir("/api/crm/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message_id: messageId, emoji: emojiFinal })
    });
    await cargarMensajes();
  } catch (err) {
    alert(err.message);
  }
}

/** Ojo: esto NO borra el mensaje del WhatsApp del cliente — Meta no da esa opción vía API para negocios — solo deja de mostrarse en el CRM. */
/* ---------- Adjuntar y enviar ---------- */

function onArchivoElegido(e) {
  const file = e.target.files[0];
  if (!file) return;
  elegirArchivo(file);
}

/** Adivina el tipo solo para la vista previa local — quién manda de verdad es lo que devuelve el servidor al subirlo (ver enviarMensaje). */
function tipoLocal(file) {
  if (file.type.startsWith("image/") && file.type !== "image/webp") return "image";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

function elegirArchivo(file) {
  const tipo = tipoLocal(file);
  const previewUrl = tipo === "document" ? null : URL.createObjectURL(file);
  estado.archivoAdjunto = { file, tipo, previewUrl };
  pintarPreviewArchivo();
}

/** Pegar una captura de pantalla o una imagen copiada directo en el mensaje — como en WhatsApp Web, sin tener que guardarla y luego adjuntarla con el clip. */
function onPegarImagen(e) {
  // Algunos navegadores de celular solo la exponen en `files`, no en `items`.
  const file = [...(e.clipboardData?.items || [])].find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile()
    || [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
  if (!file) return;
  e.preventDefault();
  elegirArchivo(file);
}

/** Imagen que mete el teclado del celular (Gboard/Samsung: portapapeles, stickers, GIFs) — llega como beforeinput, no como paste. */
function onImagenDelTeclado(e) {
  const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith("image/"));
  if (!file) return;
  e.preventDefault();
  elegirArchivo(file);
}

/**
 * En el celular no hay Ctrl+V, y el menú "Pegar" del teclado casi nunca
 * ofrece imágenes en un campo de texto: esto lee el portapapeles directo.
 * Tiene que llamarse desde un toque (el navegador puede pedir permiso).
 */
async function pegarImagenDelPortapapeles() {
  if (!navigator.clipboard?.read) {
    alert("Este navegador no deja leer imágenes del portapapeles. Usa \"Adjuntar\" y elige la imagen de tu galería.");
    return;
  }
  try {
    for (const item of await navigator.clipboard.read()) {
      const tipo = item.types.find((t) => t.startsWith("image/"));
      if (!tipo) continue;
      const blob = await item.getType(tipo);
      elegirArchivo(new File([blob], `imagen-pegada.${(tipo.split("/")[1] || "png").replace("jpeg", "jpg")}`, { type: tipo }));
      $("#texto-envio")?.focus();
      return;
    }
    alert("No hay ninguna imagen copiada. Mantén presionada la imagen → \"Copiar imagen\" y vuelve a intentar.");
  } catch (err) {
    alert(err?.name === "NotAllowedError"
      ? "El navegador no dio permiso para leer el portapapeles. Toca de nuevo y acepta \"Permitir\" (o \"Pegar\" en iPhone). Si lo bloqueaste: candado de la barra de direcciones → Permisos → Portapapeles → Permitir."
      : "No se pudo leer la imagen copiada: " + (err?.message || err));
  }
}

function pintarPreviewArchivo() {
  const cont = $("#preview-archivo");
  const a = estado.archivoAdjunto;
  const r = estado.rapidaPendiente;
  if (!a && !r) { cont.style.display = "none"; cont.innerHTML = ""; return; }
  cont.style.display = "flex";

  if (a) {
    const previa = a.tipo === "video" ? `<video src="${a.previewUrl}"></video>`
      : a.tipo === "image" ? `<img src="${a.previewUrl}" />`
      : `<span class="miniatura">${icon("doc")}</span>`;
    cont.innerHTML = `
      ${previa}
      <span>${escapar(a.file.name)}</span>
      <button type="button" id="quitar-archivo">Quitar</button>`;
    $("#quitar-archivo").addEventListener("click", cancelarAdjunto);
    return;
  }

  const primero = r.media[0];
  const previa = primero.media_type === "video"
    ? `<video src="/api/crm/media?key=${encodeURIComponent(primero.media_key)}"></video>`
    : `<img src="/api/crm/media?key=${encodeURIComponent(primero.media_key)}" />`;
  cont.innerHTML = `
    ${previa}
    <span>${r.media.length > 1 ? `${r.media.length} archivos de la respuesta rápida` : "Archivo de la respuesta rápida"}</span>
    <button type="button" id="quitar-archivo">Quitar</button>`;
  $("#quitar-archivo").addEventListener("click", () => { estado.rapidaPendiente = null; pintarPreviewArchivo(); });
}

function cancelarAdjunto() {
  if (estado.archivoAdjunto?.previewUrl) URL.revokeObjectURL(estado.archivoAdjunto.previewUrl);
  estado.archivoAdjunto = null;
  const cont = $("#preview-archivo");
  if (cont) { cont.style.display = "none"; cont.innerHTML = ""; }
  const input = $("#input-archivo");
  if (input) input.value = "";
}

async function subirArchivo(file) {
  const form = new FormData();
  form.append("file", file);
  return pedir("/api/crm/upload-media", { method: "POST", body: form });
}

/*
 * Envío en segundo plano: el mensaje aparece en el chat como "enviando" y el
 * cuadro queda libre al instante; la pausa de 2 s con "escribiendo…" (ver
 * pausaEnvio en el servidor) la ve solo el cliente. Una cola por chat para
 * que varios envíos seguidos lleguen en el mismo orden en que se mandaron.
 */
const colasEnvio = new Map(); // conversation_id -> promesa del último envío en cola
let siguienteIdPendiente = 1;
estado.enviosPendientes = [];

function encolarEnvio(conversationId, burbujas, trabajo, alFallar) {
  const items = burbujas.map((b) => ({ ...b, tempId: siguienteIdPendiente++, conversationId }));
  estado.enviosPendientes.push(...items);
  if (conversationId === estado.conversacionActivaId) pintarMensajes({ alFinal: true });

  const quitar = () => {
    estado.enviosPendientes = estado.enviosPendientes.filter((p) => !items.includes(p));
    if (conversationId === estado.conversacionActivaId) pintarMensajes();
  };
  const anterior = colasEnvio.get(conversationId) || Promise.resolve();
  const promesa = anterior.then(async () => {
    try {
      await trabajo();
      // Primero se trae el mensaje real y después se quita la burbuja, en el
      // mismo tick: no parpadea ni queda duplicado.
      if (conversationId === estado.conversacionActivaId) await cargarMensajes().catch(() => {});
      quitar();
      cargarConversaciones().catch(() => {});
    } catch (err) {
      quitar();
      alFallar?.(err);
    }
  });
  colasEnvio.set(conversationId, promesa);
  promesa.finally(() => { if (colasEnvio.get(conversationId) === promesa) colasEnvio.delete(conversationId); });
  return promesa;
}

// Cerrar/recargar la pestaña con envíos en cola los perdería.
window.addEventListener("beforeunload", (e) => {
  if (estado.enviosPendientes.length) { e.preventDefault(); e.returnValue = ""; }
});

function contenidoPendiente(p) {
  const src = p.previewUrl || (p.mediaKey ? `/api/crm/media?key=${encodeURIComponent(p.mediaKey)}` : null);
  const pie = p.body && p.type !== "text" ? `<div class="caption">${formatearTextoWA(p.body)}</div>` : "";
  if ((p.type === "image" || p.type === "sticker") && src) return `<img ${p.type === "sticker" ? 'class="sticker" ' : ""}src="${escapar(src)}" alt="" />${pie}`;
  if (p.type === "video" && src) return `<video src="${escapar(src)}" muted></video>${pie}`;
  if (p.type === "text") return `<div>${formatearTextoWA(p.body || "")}</div>`;
  return `<div>${icon("doc")} ${escapar(p.fileName || p.body || "Archivo")}</div>${pie}`;
}

async function enviarMensaje(e) {
  e.preventDefault();
  // Los paneles (respuestas rápidas, seguimientos, catálogo, etc.) viven
  // dentro de este <form>, y un <button> sin type="button" lo envía: tocar
  // "editar" una respuesta rápida mandaba lo que hubiera escrito (ej. "/").
  // Solo manda el botón de enviar o Enter (requestSubmit, sin submitter).
  if (e.submitter && !e.submitter.classList.contains("enviar")) return;
  // Enter en un buscador de un panel (ej. el de respuestas rápidas) también envía el form.
  if (document.activeElement?.closest("#panel-mas, #panel-rapidas, #panel-seguimientos, #panel-emojis, #panel-catalogo, #panel-stickers")) return;
  const input = $("#texto-envio");
  const texto = input.value.trim();
  const adjunto = estado.archivoAdjunto;
  const rapida = estado.rapidaPendiente;
  if (!texto && !adjunto && !rapida) return;
  // El chat se fija acá: el envío corre en segundo plano y tiene que ir al
  // MISMO cliente aunque la asesora ya esté en otro chat.
  const conversationId = estado.conversacionActivaId;
  const respondiendoA = estado.respondiendoA;
  const replyToId = respondiendoA?.id || undefined;

  // El cuadro queda libre al toque: la pausa con "escribiendo…" la ve el
  // cliente, no la asesora (el mensaje aparece en el chat como "enviando").
  input.value = "";
  input.style.height = "auto";
  estado.archivoAdjunto = null; // sin revocar la vista previa: la usa la burbuja "enviando"
  estado.rapidaPendiente = null;
  if ($("#input-archivo")) $("#input-archivo").value = "";
  pintarPreviewArchivo();
  cancelarRespuesta();
  input.focus();

  const burbujas = adjunto
    ? [{ type: adjunto.tipo, previewUrl: adjunto.previewUrl, fileName: adjunto.file.name, body: texto }]
    : rapida
      ? [...rapida.media.map((m) => ({ type: m.media_type, mediaKey: m.media_key })), ...(texto ? [{ type: "text", body: texto }] : [])]
      : [{ type: "text", body: texto }];

  encolarEnvio(conversationId, burbujas, async () => {
    if (adjunto) {
      const { media_key, type, original_name } = await subirArchivo(adjunto.file);
      await pedir("/api/crm/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `caption` es el pie de foto/video/documento. `file_name` queda en
        // el registro interno y, si es un documento, el cliente SÍ lo ve
        // como el nombre del archivo (ver enviarMedia en whatsapp.js).
        body: JSON.stringify({ conversation_id: conversationId, media_key, media_type: type, caption: texto || undefined, file_name: original_name, reply_to_id: replyToId })
      });
      if (adjunto.previewUrl) URL.revokeObjectURL(adjunto.previewUrl);
    } else if (rapida) {
      // Todas a la vez: la API las procesa en paralelo y llegan casi juntas.
      const resultados = await Promise.allSettled(rapida.media.map((m) =>
        pedir("/api/crm/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: conversationId, media_key: m.media_key, media_type: m.media_type })
        })
      ));
      const fallidas = resultados.filter((r) => r.status === "rejected");
      if (fallidas.length === rapida.media.length && rapida.media.length) throw fallidas[0].reason;
      if (texto) {
        await pedir("/api/crm/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: conversationId, body: texto, reply_to_id: replyToId })
        });
      }
      if (fallidas.length) {
        alert(`Se mandaron ${rapida.media.length - fallidas.length} de ${rapida.media.length} — falló: ${fallidas[0].reason.message}`);
      }
    } else {
      await pedir("/api/crm/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, body: texto, reply_to_id: replyToId })
      });
    }
  }, (err) => {
    alert(err.message);
    // Lo que no salió vuelve como borrador de SU chat para reintentar.
    const b = { texto, adjunto, rapida, respondiendoA };
    const cuadroLibre = estado.conversacionActivaId === conversationId && !$("#texto-envio")?.value && !estado.archivoAdjunto && !estado.rapidaPendiente;
    if (cuadroLibre) {
      borradores.set(conversationId, b);
      restaurarBorrador(conversationId);
    } else if (!borradores.has(conversationId)) {
      borradores.set(conversationId, b);
    }
  });
}

/* ---------- Emojis ---------- */

function toggleEmojiPanel() {
  const panel = $("#panel-emojis");
  if (!panel) return;
  panel.classList.toggle("abierto");
  if (panel.classList.contains("abierto")) {
    panel.innerHTML = EMOJIS.map((em) => `<button type="button">${em}</button>`).join("");
    panel.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      const input = $("#texto-envio");
      input.value += b.textContent;
      input.focus();
    }));
  }
}

/** Mete texto donde está el cursor (o reemplaza lo seleccionado), no al final. */
function insertarEnCursor(el, texto) {
  const ini = el.selectionStart ?? el.value.length;
  const fin = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, ini) + texto + el.value.slice(fin);
  el.focus();
  el.setSelectionRange(ini + texto.length, ini + texto.length);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Botón "Emojis" debajo de un campo de texto de un modal: despliega la
 * grilla en línea (no flotante, para que no la corte el scroll del modal)
 * y mete el emoji donde está el cursor.
 */
function agregarEmojisA(el) {
  if (!el || el.dataset.conEmojis) return;
  el.dataset.conEmojis = "1";
  const barra = document.createElement("div");
  barra.className = "emoji-barra";
  barra.innerHTML = `<button type="button" class="emoji-toggle">${icon("smile")} Emojis</button>
    <div class="emoji-grid">${EMOJIS.map((em) => `<button type="button">${em}</button>`).join("")}</div>`;
  el.after(barra);
  barra.querySelector(".emoji-toggle").addEventListener("click", () => barra.classList.toggle("abierta"));
  const grid = barra.querySelector(".emoji-grid");
  // Sin esto, tocar un emoji le saca el foco al campo y en el celular se
  // cierra y vuelve a abrir el teclado con cada uno.
  grid.addEventListener("mousedown", (e) => e.preventDefault());
  grid.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => insertarEnCursor(el, b.textContent)));
}

["#seg-texto", "#leads-texto", "#rapida-texto", "#seq-texto"].forEach((sel) => agregarEmojisA($(sel)));

document.addEventListener("click", (e) => {
  if (!e.target.closest("#panel-rapidas, #btn-rapidas, #panel-seguimientos, #btn-seguimiento, #panel-emojis, #btn-emoji, #panel-catalogo, #btn-catalogo, #panel-mas, #btn-mas, #panel-stickers, #btn-stickers")) {
    cerrarPaneles();
  }
});

/* ---------- Respuestas rápidas ---------- */

async function cargarQuickReplies() {
  const { quick_replies } = await pedir("/api/crm/quick-replies");
  estado.quickReplies = quick_replies;
}

async function toggleQuickPanel() {
  const panel = $("#panel-rapidas");
  if (!panel) return;
  const seAbre = !panel.classList.contains("abierto");
  panel.classList.toggle("abierto");
  if (seAbre) {
    estado.filtroRapidas = "";
    pintarQuickPanel();
    // Se refresca del servidor cada vez que se abre, para ver al toque las
    // que haya creado otra vendedora — no solo lo que se cargó al iniciar sesión.
    await cargarQuickReplies();
    if (panel.classList.contains("abierto")) pintarQuickPanel();
  }
}

function pintarQuickPanel() {
  const panel = $("#panel-rapidas");
  if (!panel) return;

  const filtro = estado.filtroRapidas.toLowerCase();
  const lista = estado.quickReplies.filter((q) =>
    !filtro || q.title.toLowerCase().includes(filtro) || (q.body || "").toLowerCase().includes(filtro));
  const esAdmin = estado.miRol === "admin";

  panel.innerHTML = `
    <div class="buscador-rapidas"><input type="text" id="rapidas-buscar" placeholder="Buscar respuesta rápida…" value="${escapar(estado.filtroRapidas)}" /></div>
    ${lista.map((q) => {
      const foto = q.media[0];
      return `
      <div class="item" data-id="${q.id}">
        ${foto ? `<img class="miniatura" src="/api/crm/media?key=${encodeURIComponent(foto.media_key)}" alt="" />`
               : q.media.length === 0 ? "" : `<div class="miniatura">${icon("image")}</div>`}
        <div style="flex:1">
          <div class="titulo">${q.media.length ? icon(q.media.length > 1 ? "image" : (q.media[0].media_type === "video" ? "video" : "image")) + (q.media.length > 1 ? ` ×${q.media.length} ` : " ") : ""}${escapar(q.title)}</div>
          ${q.body ? `<div class="cuerpo">${escapar(q.body)}</div>` : ""}
        </div>
        <button class="editar" data-id="${q.id}" title="Editar">${icon("pencil")}</button>
        <button class="borrar" data-id="${q.id}" title="Borrar">${icon("close")}</button>
      </div>`;
    }).join("") || `<div class="item"><div class="cuerpo">Sin resultados.</div></div>`}
    <footer>
      <button id="nueva-rapida">${icon("plus")} Nueva respuesta rápida</button>
    </footer>`;

  $("#rapidas-buscar").addEventListener("input", (e) => {
    estado.filtroRapidas = e.target.value;
    pintarQuickPanel();
    $("#rapidas-buscar").focus();
    const v = $("#rapidas-buscar").value;
    $("#rapidas-buscar").setSelectionRange(v.length, v.length);
  });

  panel.querySelectorAll(".item[data-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".borrar") || e.target.closest(".editar")) return;
      const q = estado.quickReplies.find((x) => x.id === Number(el.dataset.id));
      if (q) usarQuickReply(q);
    });
  });
  panel.querySelectorAll(".editar").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const q = estado.quickReplies.find((x) => x.id === Number(btn.dataset.id));
      if (q) { panel.classList.remove("abierto"); abrirModalRapidaEdicion(q); }
    });
  });
  panel.querySelectorAll(".borrar").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const q = estado.quickReplies.find((x) => x.id === Number(btn.dataset.id));
      if (!confirm(`¿Borrar la respuesta rápida "${q?.title || ""}"? No se puede deshacer.`)) return;
      await pedir("/api/crm/quick-replies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(btn.dataset.id) })
      });
      await cargarQuickReplies();
      pintarQuickPanel();
    });
  });
  $("#nueva-rapida")?.addEventListener("click", () => {
    panel.classList.remove("abierto");
    abrirModalRapidaNueva();
  });
}

/** Elegir una respuesta rápida ya no la manda al toque — la pone en el escribidor (texto y/o adjunto pendiente) para que el vendedor la revise/edite y mande con Enter o el botón, como cualquier otro mensaje. */
function usarQuickReply(q) {
  $("#panel-rapidas").classList.remove("abierto");
  estado.rapidasPorSlash = false;

  const input = $("#texto-envio");
  if (input) {
    input.value = q.body || "";
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  estado.rapidaPendiente = q.media.length ? { media: q.media } : null;
  pintarPreviewArchivo();
}

function abrirModalRapidaNueva() {
  estado.editandoRapidaId = null;
  $("#rapida-modal-titulo").textContent = "Nueva respuesta rápida";
  $("#rapida-titulo").value = "";
  $("#rapida-texto").value = "";
  $("#rapida-archivo").value = "";
  $("#rapida-archivo-ayuda").textContent = "Puedes elegir varias fotos/videos a la vez — se mandan uno tras otro.";
  $("#modal-rapida-fondo").classList.add("abierto");
}

function abrirModalRapidaEdicion(q) {
  estado.editandoRapidaId = q.id;
  $("#rapida-modal-titulo").textContent = "Editar respuesta rápida";
  $("#rapida-titulo").value = q.title;
  $("#rapida-texto").value = q.body || "";
  $("#rapida-archivo").value = "";
  $("#rapida-archivo-ayuda").textContent = q.media.length
    ? `Ya tiene ${q.media.length} archivo(s) — déjalo vacío para conservarlos, o elige nuevos para reemplazarlos todos.`
    : "Puedes elegir varias fotos/videos a la vez — se mandan uno tras otro.";
  $("#modal-rapida-fondo").classList.add("abierto");
}

$("#rapida-cancelar").addEventListener("click", () => {
  $("#modal-rapida-fondo").classList.remove("abierto");
  estado.editandoRapidaId = null;
  $("#rapida-titulo").value = "";
  $("#rapida-texto").value = "";
  $("#rapida-archivo").value = "";
});

$("#rapida-crear").addEventListener("click", async () => {
  const title = $("#rapida-titulo").value.trim();
  const body = $("#rapida-texto").value.trim();
  const files = [...$("#rapida-archivo").files];
  const editandoId = estado.editandoRapidaId;
  if (!title) return alert("Ponle un título.");
  if (!body && !files.length && !editandoId) return alert("Necesita texto o al menos un archivo.");

  const btn = $("#rapida-crear");
  btn.disabled = true;
  btn.textContent = files.length ? "Subiendo…" : "Guardando…";
  try {
    let media_keys;
    if (files.length) {
      media_keys = [];
      for (const file of files) {
        const subida = await subirArchivo(file);
        media_keys.push({ media_key: subida.media_key, media_type: subida.type, media_mime: subida.mime });
      }
    }
    if (editandoId) {
      await pedir("/api/crm/quick-replies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editandoId, title, body, media_keys })
      });
    } else {
      await pedir("/api/crm/quick-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, media_keys: media_keys || [] })
      });
    }
    await cargarQuickReplies();
    $("#modal-rapida-fondo").classList.remove("abierto");
    estado.editandoRapidaId = null;
    $("#rapida-titulo").value = "";
    $("#rapida-texto").value = "";
    $("#rapida-archivo").value = "";
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
});

/* ---------- Seguimientos programados ---------- */

/** `modo`: "mensaje" (uno suelto) o "secuencia" (varios con su espera). Desde un addEventListener llega el Event, no un string. */
function abrirModalProgramarSeguimiento(modo) {
  limpiarFormSeguimiento();
  estado.segConversacionId = estado.conversacionActivaId;
  $("#seg-modal-titulo").textContent = "Programar seguimiento";
  $("#seg-tabs").style.display = "";
  $("#seg-archivo").style.display = "";
  const sel = $("#seg-rapida");
  sel.style.display = "";
  sel.innerHTML = `<option value="">— Usar una respuesta rápida (opcional) —</option>` +
    estado.quickReplies.map((q) => `<option value="${q.id}">${escapar(q.title)}</option>`).join("");
  elegirCuando($('#seg-chips button[data-manana]'));
  ponerModoSeguimiento(typeof modo === "string" ? modo : "mensaje");
  $("#modal-seguimiento-fondo").classList.add("abierto");
}

/* Cuándo sale: botones rápidos en vez del calendario (queda en "Otra fecha…"). */

function aInputLocal(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** La fecha que representa un botón rápido, calculada contra el momento actual. */
function fechaDeChip(btn) {
  if (btn.dataset.min) return new Date(Date.now() + Number(btn.dataset.min) * 60000);
  if (btn.dataset.manana) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(Number(btn.dataset.manana), 0, 0, 0);
    return d;
  }
  return null;
}

function elegirCuando(btn) {
  if (!btn) return;
  document.querySelectorAll("#seg-chips button").forEach((b) => b.classList.toggle("activo", b === btn));
  const input = $("#seg-fecha");
  const esOtra = btn.dataset.otra !== undefined;
  input.style.display = esOtra ? "" : "none";
  if (esOtra) {
    if (!input.value) input.value = aInputLocal(new Date(Date.now() + 86400000));
    input.focus();
  } else {
    input.value = aInputLocal(fechaDeChip(btn));
  }
  pintarCuando();
}

function pintarCuando() {
  const v = $("#seg-fecha").value;
  const el = $("#seg-cuando");
  if (!v) { el.textContent = "Elige cuándo."; el.classList.remove("error"); return; }
  const d = new Date(v);
  const pasada = d.getTime() <= Date.now();
  el.classList.toggle("error", pasada);
  el.textContent = pasada
    ? "Esa hora ya pasó — elige una futura."
    : `Se manda el ${d.toLocaleString("es-PE", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}`;
}

$("#seg-chips").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (btn) elegirCuando(btn);
});
$("#seg-fecha").addEventListener("input", pintarCuando);

/* Pestañas "Un mensaje" / "Una secuencia". */

/** Recordatorio de cuándo se cancela lo que se está por programar. */
function pintarReglaSeguimiento() {
  const el = $("#seg-regla");
  if (!el) return;
  const leadId = datosLead?.settings?.ad_followup_sequence_id;
  const esLead = estado.segModo === "secuencia" && leadId && String(leadId) === $("#seg-secuencia").value;
  el.textContent = esLead
    ? "Es la secuencia de leads (tras no respuesta): se cancela si el cliente escribe o si le escribes, y reemplaza la que ya esté activa en el chat."
    : "Se cancela solo si el cliente escribe antes — tus propios mensajes no lo borran.";
}

function ponerModoSeguimiento(modo) {
  estado.segModo = modo;
  document.querySelectorAll("#seg-tabs button").forEach((b) => b.classList.toggle("activo", b.dataset.modo === modo));
  $("#seg-modo-mensaje").style.display = modo === "mensaje" ? "" : "none";
  $("#seg-modo-secuencia").style.display = modo === "secuencia" ? "" : "none";
  $("#seg-crear").textContent = modo === "secuencia" ? "Programar secuencia" : (estado.editandoSeguimientoId ? "Guardar cambios" : "Programar");
  if (modo === "secuencia") cargarSecuenciasSeguimiento();
  pintarReglaSeguimiento();
}

$("#seg-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-modo]");
  if (btn) ponerModoSeguimiento(btn.dataset.modo);
});

let secuenciasSeguimiento = [];

async function cargarSecuenciasSeguimiento() {
  const sel = $("#seg-secuencia");
  const previa = sel.value;
  $("#seg-secuencia-preview").innerHTML = `<p class="ayuda-modal">Cargando…</p>`;
  try {
    ({ sequences: secuenciasSeguimiento } = await pedir("/api/crm/followup-sequences"));
  } catch (err) {
    $("#seg-secuencia-preview").innerHTML = `<p class="ayuda-modal">${escapar(err.message)}</p>`;
    return;
  }
  const conPasos = secuenciasSeguimiento.filter((x) => x.steps.length);
  sel.innerHTML = conPasos.length
    ? conPasos.map((x) => `<option value="${x.id}">${escapar(x.title)} (${x.steps.length} mensaje${x.steps.length === 1 ? "" : "s"})</option>`).join("")
    : `<option value="">Todavía no hay secuencias con mensajes</option>`;
  sel.disabled = !conPasos.length;
  if (conPasos.some((x) => String(x.id) === previa)) sel.value = previa;
  pintarPreviewSecuenciaSeg();
  cargarDatosLead().then(pintarReglaSeguimiento).catch(() => {});
}

function pintarPreviewSecuenciaSeg() {
  const cont = $("#seg-secuencia-preview");
  const seq = secuenciasSeguimiento.find((x) => String(x.id) === $("#seg-secuencia").value);
  if (!seq) {
    cont.innerHTML = `<p class="ayuda-modal">Crea una con el botón de abajo: varios mensajes, cada uno con su espera en horas o días.</p>`;
    return;
  }
  const ahora = Date.now();
  let acum = 0;
  cont.innerHTML = `<ol class="lead-timeline seg-timeline">${seq.steps.map((p) => {
    acum += p.delay_minutes;
    const cuando = new Date(ahora + acum * 60000).toLocaleString("es-PE", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return `<li><strong>En ${formatearMomento(acum)}</strong> <span class="sub">(${cuando})</span>${p.media_key ? " " + icon(p.media_type === "video" ? "video" : "image") : ""} — ${escapar(recortarTexto(p.body || "Foto/video", 70))}</li>`;
  }).join("")}</ol>`;
}

$("#seg-secuencia").addEventListener("change", () => { pintarPreviewSecuenciaSeg(); pintarReglaSeguimiento(); });
$("#seg-gestionar-secuencias").addEventListener("click", () => abrirModalSecuencias(null, true));

// Igual que en el chat: elegir una respuesta rápida carga su texto en el
// campo para editarlo antes de programar, y su foto/video queda adjunta
// (se puede quitar). Al programar va el texto editado + el quick_reply_id
// solo si se dejó su archivo — el cron usa `body` antes que el de la rápida.
$("#seg-rapida").addEventListener("change", (e) => {
  const q = estado.quickReplies.find((x) => String(x.id) === e.target.value);
  estado.segRapidaMedia = q?.media?.length ? q.media : null;
  if (q) {
    const txt = $("#seg-texto");
    txt.value = q.body || "";
    txt.focus();
    txt.setSelectionRange(txt.value.length, txt.value.length);
  }
  pintarPreviewSegRapida();
});

function pintarPreviewSegRapida() {
  const cont = $("#seg-rapida-preview");
  const media = estado.segRapidaMedia;
  if (!media) { cont.style.display = "none"; cont.innerHTML = ""; return; }
  const primero = media[0];
  const src = `/api/crm/media?key=${encodeURIComponent(primero.media_key)}`;
  cont.style.display = "flex";
  cont.innerHTML = `
    ${primero.media_type === "video" ? `<video src="${src}"></video>` : `<img src="${src}" alt="" />`}
    <span>${media.length > 1 ? `Incluye la 1ª de sus ${media.length} fotos/videos` : "Incluye la foto/video de la respuesta rápida"}</span>
    <button type="button" id="seg-quitar-rapida-media">Quitar</button>`;
  $("#seg-quitar-rapida-media").addEventListener("click", () => {
    estado.segRapidaMedia = null;
    pintarPreviewSegRapida();
  });
}

function limpiarFormSeguimiento() {
  estado.editandoSeguimientoId = null;
  estado.segRapidaMedia = null;
  document.querySelectorAll("#seg-chips button").forEach((b) => b.classList.remove("activo"));
  $("#seg-fecha").style.display = "none";
  $("#seg-fecha").value = "";
  $("#seg-texto").value = "";
  $("#seg-archivo").value = "";
  $("#seg-rapida").value = "";
  pintarPreviewSegRapida();
}

/** Solo los de texto libre — los que llevan respuesta rápida o foto/video propia se cancelan y se vuelven a programar. */
function abrirModalEditarSeguimiento(s) {
  limpiarFormSeguimiento();
  estado.segConversacionId = estado.conversacionActivaId;
  estado.editandoSeguimientoId = s.id;
  $("#seg-modal-titulo").textContent = "Editar seguimiento";
  $("#seg-tabs").style.display = "none";
  ponerModoSeguimiento("mensaje");
  $("#seg-archivo").style.display = "none";
  $("#seg-rapida").style.display = "none";
  $("#seg-fecha").value = aInputLocal(new Date(s.send_at));
  elegirCuando($("#seg-chips button[data-otra]"));
  $("#seg-texto").value = s.body || "";
  $("#modal-seguimiento-fondo").classList.add("abierto");
}

function seguimientoEditable(s) {
  return !s.media_key && !s.quick_reply_id && !s.template_name;
}

async function toggleSeguimientosPanel() {
  const panel = $("#panel-seguimientos");
  if (!panel) return;
  panel.classList.toggle("abierto");
  if (panel.classList.contains("abierto")) await pintarSeguimientosPanel();
}

async function pintarSeguimientosPanel() {
  const panel = $("#panel-seguimientos");
  const { scheduled } = await pedir(`/api/crm/scheduled?conversation_id=${estado.conversacionActivaId}`);
  panel.innerHTML = (scheduled.length ? scheduled.map((s) => `
    <div class="item" data-id="${s.id}">
      <div>
        <div class="titulo">${icon(s.batch_id ? "broadcast" : "clock")} ${fechaCorta(s.send_at)}${s.media_key ? " " + icon(s.media_type === "video" ? "video" : "image") : ""}${s.batch_id ? ` <span style="font-weight:400;color:var(--ad)">· masivo</span>` : ""}</div>
        <div class="cuerpo">${escapar(textoSeguimiento(s))}</div>
      </div>
      ${seguimientoEditable(s) ? `<button class="editar" data-id="${s.id}" title="Editar">${icon("pencil")}</button>` : ""}
      <button class="borrar" data-id="${s.id}" title="Cancelar">${icon("close")}</button>
    </div>`).join("") : `<div class="item"><div class="cuerpo">Sin seguimientos programados.</div></div>`)
    + `<footer>
        <button id="nuevo-seguimiento">${icon("plus")} Programar seguimiento</button>
        <button id="aplicar-secuencia">${icon("bolt")} Aplicar una secuencia</button>
      </footer>`;

  panel.querySelectorAll(".borrar").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await pedir("/api/crm/scheduled", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(btn.dataset.id) })
      });
      await pintarSeguimientosPanel();
      await actualizarSeguimientosDetalle();
    });
  });
  panel.querySelectorAll(".editar").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const s = scheduled.find((x) => x.id === Number(btn.dataset.id));
      if (!s) return;
      panel.classList.remove("abierto");
      abrirModalEditarSeguimiento(s);
    });
  });
  $("#nuevo-seguimiento")?.addEventListener("click", () => {
    panel.classList.remove("abierto");
    abrirModalProgramarSeguimiento();
  });
  $("#aplicar-secuencia")?.addEventListener("click", () => {
    panel.classList.remove("abierto");
    abrirModalProgramarSeguimiento("secuencia");
  });
}

$("#seg-cancelar").addEventListener("click", () => {
  $("#modal-seguimiento-fondo").classList.remove("abierto");
  limpiarFormSeguimiento();
});

async function programarSecuenciaDesdeModal() {
  const sequenceId = Number($("#seg-secuencia").value);
  if (!sequenceId) return alert("Elige una secuencia (o créala con \"Crear / editar secuencias\").");
  const btn = $("#seg-crear");
  btn.disabled = true;
  try {
    await pedir("/api/crm/followup-apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: estado.segConversacionId, sequence_id: sequenceId })
    });
    $("#modal-seguimiento-fondo").classList.remove("abierto");
    limpiarFormSeguimiento();
    await actualizarSeguimientosDetalle();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
}

$("#seg-crear").addEventListener("click", async () => {
  if (estado.segModo === "secuencia") return programarSecuenciaDesdeModal();
  // Un botón rápido ("En 1 hora") se cuenta desde que se programa, no desde que se tocó.
  const chip = $("#seg-chips button.activo");
  if (chip && chip.dataset.otra === undefined) $("#seg-fecha").value = aInputLocal(fechaDeChip(chip));
  const fecha = $("#seg-fecha").value;
  if (fecha && new Date(fecha).getTime() <= Date.now()) { pintarCuando(); return alert("Esa hora ya pasó — elige una futura."); }
  const texto = $("#seg-texto").value.trim();
  const archivo = $("#seg-archivo").files[0];
  const quickReplyId = !archivo && estado.segRapidaMedia ? $("#seg-rapida").value : "";
  const editandoId = estado.editandoSeguimientoId;
  if (!fecha) return alert("Elige cuándo se manda.");
  if (editandoId && !texto) return alert("Escribe un texto.");
  if (!texto && !quickReplyId && !archivo) return alert("Escribe un texto, adjunta una foto/video o elige una respuesta rápida.");

  const btn = $("#seg-crear");
  btn.disabled = true;
  if (editandoId) {
    try {
      await pedir("/api/crm/scheduled", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editandoId, send_at: new Date(fecha).toISOString(), body: texto })
      });
      $("#modal-seguimiento-fondo").classList.remove("abierto");
      limpiarFormSeguimiento();
      await actualizarSeguimientosDetalle();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
    return;
  }
  try {
    let media_key, media_type, media_mime;
    if (archivo) {
      const subida = await subirArchivo(archivo);
      media_key = subida.media_key;
      media_type = subida.type;
      media_mime = subida.mime;
    }
    await pedir("/api/crm/scheduled", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: estado.segConversacionId,
        send_at: new Date(fecha).toISOString(),
        body: texto || undefined,
        quick_reply_id: quickReplyId || undefined,
        media_key, media_type, media_mime
      })
    });
    $("#modal-seguimiento-fondo").classList.remove("abierto");
    limpiarFormSeguimiento();
    await actualizarSeguimientosDetalle();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Secuencias de seguimiento (varios mensajes con timing, reutilizables) ---------- */

function formatearDelay(minutos) {
  if (minutos % 1440 === 0) { const d = minutos / 1440; return `${d} día${d === 1 ? "" : "s"}`; }
  if (minutos % 60 === 0) { const h = minutos / 60; return `${h} hora${h === 1 ? "" : "s"}`; }
  return `${minutos} min`;
}

let estadoSecuencias = [];
// Si no es null, el modal está en modo "aplicar a varios chats de una" (ver
// barra de selección de la lista) en vez de al chat abierto.
let idsBulkSecuencia = null;

// Abierto desde "Crear / editar secuencias" del modal de programar: solo
// para armarlas — se aplican desde ese modal, así no se programa dos veces.
let secuenciasSoloEditar = false;

function abrirModalSecuencias(idsBulk, soloEditar = false) {
  idsBulkSecuencia = idsBulk || null;
  estado.secuenciasConversacionId = estado.conversacionActivaId;
  secuenciasSoloEditar = soloEditar;
  $("#modal-secuencias-fondo").classList.add("abierto");
  cargarYPintarSecuencias();
}
$("#fs-cerrar").addEventListener("click", () => {
  idsBulkSecuencia = null;
  $("#modal-secuencias-fondo").classList.remove("abierto");
  refrescarVistasLead();
  if ($("#modal-seguimiento-fondo").classList.contains("abierto") && estado.segModo === "secuencia") cargarSecuenciasSeguimiento();
});

async function cargarYPintarSecuencias() {
  const { sequences } = await pedir("/api/crm/followup-sequences");
  estadoSecuencias = sequences;
  pintarListaSecuencias();
}

function pintarListaSecuencias() {
  const cont = $("#lista-secuencias-seg");
  const nBulk = idsBulkSecuencia?.length || 0;
  const puedeAplicar = nBulk > 0 || Boolean(estado.conversacionActivaId);
  cont.innerHTML = (nBulk ? `<p class="ayuda-modal"><strong>Aplicando a ${nBulk} chat${nBulk === 1 ? "" : "s"} seleccionado${nBulk === 1 ? "" : "s"}.</strong></p>` : "")
    + (estadoSecuencias.length ? estadoSecuencias.map((s) => `
    <div class="fila-secuencia" data-id="${s.id}">
      <div class="fila-secuencia-header">
        <div class="nombre">${escapar(s.title)} <span class="sub">(${s.steps.length} paso${s.steps.length === 1 ? "" : "s"})</span></div>
        <div style="display:flex;gap:4px">
          ${secuenciasSoloEditar ? "" : `<button class="fs-aplicar" data-id="${s.id}" title="${puedeAplicar ? (nBulk ? `Aplicar a los ${nBulk} chats seleccionados` : "Aplicar a este chat") : "Abre una conversación primero"}" ${puedeAplicar ? "" : "disabled"}>${icon("send")}</button>`}
          <button class="fs-editar" data-id="${s.id}" title="Ver/editar pasos">${icon("bolt")}</button>
          <button class="fs-renombrar" data-id="${s.id}" title="Renombrar">${icon("pencil")}</button>
          <button class="trash fs-borrar" data-id="${s.id}" title="Borrar secuencia">${icon("trash")}</button>
        </div>
      </div>
      <div class="fs-pasos" data-id="${s.id}" style="display:none">
        ${s.steps.map((p, i) => `
          <div class="fila-seguimiento">
            <div>
              <div class="nombre">${i + 1}. +${formatearDelay(p.delay_minutes)}${p.media_key ? " " + icon(p.media_type === "video" ? "video" : "image") : ""}</div>
              ${p.body ? `<div class="sub">${escapar(p.body)}</div>` : ""}
            </div>
            <div style="display:flex;gap:4px">
              <button class="editar-paso fs-editar-paso" data-id="${p.id}" data-seq="${s.id}" title="Editar">${icon("pencil")}</button>
              <button class="trash fs-borrar-paso" data-id="${p.id}">${icon("trash")}</button>
            </div>
          </div>`).join("") || `<p class="ayuda-modal">Sin pasos todavía.</p>`}
        <div class="fs-agregar-paso">
          <div class="fs-delay-fila">
            <span>Mandar</span>
            <input type="number" min="1" value="1" class="fs-delay-valor" />
            <select class="fs-delay-unidad">
              <option value="1">minuto(s)</option>
              <option value="60">hora(s)</option>
              <option value="1440" selected>día(s)</option>
            </select>
          </div>
          <p class="ayuda-modal" style="margin:0 0 8px">Se cuenta desde el paso anterior (o desde que se aplica, si es el primero).</p>
          <textarea class="fs-paso-texto" placeholder="Texto (opcional si adjuntas foto/video)"></textarea>
          <input type="file" class="fs-paso-archivo" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" />
          <button class="crear fs-agregar-paso-btn" data-id="${s.id}" type="button" style="width:100%;margin-top:8px">Agregar paso</button>
        </div>
      </div>
    </div>`).join("") : `<p class="ayuda-modal">Todavía no armaste ninguna secuencia — créala abajo.</p>`);

  cont.querySelectorAll(".fs-paso-texto").forEach(agregarEmojisA);

  cont.querySelectorAll(".fs-editar").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pasos = cont.querySelector(`.fs-pasos[data-id="${btn.dataset.id}"]`);
      pasos.style.display = pasos.style.display === "none" ? "block" : "none";
    });
  });

  cont.querySelectorAll(".fs-aplicar").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nBulk = idsBulkSecuencia?.length || 0;
      if (!nBulk && !estado.conversacionActivaId) return;
      const mensaje = nBulk
        ? `¿Aplicar esta secuencia a los ${nBulk} chats seleccionados? Se programarán todos sus pasos en cada uno.`
        : "¿Aplicar esta secuencia a la conversación abierta? Se programarán todos sus pasos.";
      if (!confirm(mensaje)) return;
      btn.disabled = true;
      try {
        const body = nBulk
          ? { conversation_ids: idsBulkSecuencia, sequence_id: Number(btn.dataset.id) }
          : { conversation_id: estado.secuenciasConversacionId, sequence_id: Number(btn.dataset.id) };
        const { pasos_programados, chats_aplicados } = await pedir("/api/crm/followup-apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (nBulk) {
          alert(`Listo — se programaron ${pasos_programados} mensaje(s) en ${chats_aplicados} chat(s).`);
          salirModoSeleccion();
          programarSync(0);
        } else {
          await actualizarSeguimientosDetalle();
          alert(`Listo — se programaron ${pasos_programados} mensaje(s).`);
        }
        $("#modal-secuencias-fondo").classList.remove("abierto");
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  });

  cont.querySelectorAll(".fs-borrar").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Borrar esta secuencia entera? No se puede deshacer.")) return;
      await pedir("/api/crm/followup-sequences", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sequence_id: Number(btn.dataset.id) })
      });
      await cargarYPintarSecuencias();
    });
  });

  cont.querySelectorAll(".fs-renombrar").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const s = estadoSecuencias.find((x) => x.id === Number(btn.dataset.id));
      const title = prompt("Nuevo nombre de la secuencia:", s?.title || "");
      if (!title || !title.trim()) return;
      try {
        await pedir("/api/crm/followup-sequences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sequence_id: Number(btn.dataset.id), title: title.trim() })
        });
        await cargarYPintarSecuencias();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  cont.querySelectorAll(".fs-editar-paso").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = estadoSecuencias.find((x) => x.id === Number(btn.dataset.seq));
      const p = s?.steps.find((x) => x.id === Number(btn.dataset.id));
      if (!p) return;
      const fila = cont.querySelector(`.fs-pasos[data-id="${s.id}"]`);
      const unidad = p.delay_minutes % 1440 === 0 ? 1440 : p.delay_minutes % 60 === 0 ? 60 : 1;
      fila.querySelector(".fs-paso-texto").value = p.body || "";
      fila.querySelector(".fs-paso-archivo").value = "";
      fila.querySelector(".fs-delay-valor").value = p.delay_minutes / unidad;
      fila.querySelector(".fs-delay-unidad").value = String(unidad);
      const guardar = fila.querySelector(".fs-agregar-paso-btn");
      guardar.dataset.editando = String(p.id);
      guardar.textContent = "Guardar cambios";
      fila.querySelector(".fs-paso-texto").focus();
    });
  });

  cont.querySelectorAll(".fs-borrar-paso").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await pedir("/api/crm/followup-sequences", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_id: Number(btn.dataset.id) })
      });
      await cargarYPintarSecuencias();
    });
  });

  cont.querySelectorAll(".fs-agregar-paso-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const fila = btn.closest(".fs-pasos");
      const texto = fila.querySelector(".fs-paso-texto").value.trim();
      const archivo = fila.querySelector(".fs-paso-archivo").files[0];
      const valor = Number(fila.querySelector(".fs-delay-valor").value) || 1;
      const unidad = Number(fila.querySelector(".fs-delay-unidad").value);
      const editando = Number(btn.dataset.editando) || null;
      if (!texto && !archivo && !editando) return alert("Escribe un texto o adjunta una foto/video.");

      btn.disabled = true;
      btn.textContent = archivo ? "Subiendo…" : "Guardando…";
      try {
        let media_key, media_type, media_mime;
        if (archivo) {
          const subida = await subirArchivo(archivo);
          media_key = subida.media_key;
          media_type = subida.type;
          media_mime = subida.mime;
        }
        await pedir("/api/crm/followup-sequences", {
          method: editando ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(editando ? { step_id: editando } : { sequence_id: Number(btn.dataset.id) }),
            body: texto || undefined,
            media_key, media_type, media_mime,
            delay_minutes: valor * unidad
          })
        });
        const seqId = btn.dataset.id;
        await cargarYPintarSecuencias();
        // Vuelve a abrir los pasos de esa secuencia, ya con el cambio.
        $("#lista-secuencias-seg").querySelector(`.fs-pasos[data-id="${seqId}"]`).style.display = "block";
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = editando ? "Guardar cambios" : "Agregar paso";
      }
    });
  });
}

$("#fs-crear-btn").addEventListener("click", async () => {
  const title = $("#fs-titulo-nueva").value.trim();
  if (!title) return alert("Ponle un nombre.");
  try {
    await pedir("/api/crm/followup-sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    $("#fs-titulo-nueva").value = "";
    await cargarYPintarSecuencias();
  } catch (err) {
    alert(err.message);
  }
});

/* ---------- Nuevo contacto ---------- */

$("#btn-nuevo-contacto").addEventListener("click", () => {
  $("#modal-contacto-fondo").classList.add("abierto");
  $("#nc-wa").focus();
});
$("#nc-cancelar").addEventListener("click", () => {
  $("#modal-contacto-fondo").classList.remove("abierto");
  $("#nc-nombre").value = "";
  $("#nc-wa").value = "";
});

$("#nc-crear").addEventListener("click", async () => {
  const name = $("#nc-nombre").value.trim();
  const wa_id = $("#nc-wa").value.trim();
  const btn = $("#nc-crear");
  btn.disabled = true;
  try {
    const { conversation_id } = await pedir("/api/crm/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, wa_id })
    });
    $("#modal-contacto-fondo").classList.remove("abierto");
    $("#nc-nombre").value = "";
    $("#nc-wa").value = "";
    await cargarConversaciones();
    const c = estado.conversaciones.find((x) => x.conversation_id === conversation_id);
    if (c) abrirConversacion(c);
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Equipo ---------- */

$("#btn-equipo").addEventListener("click", async () => {
  $("#modal-equipo-fondo").classList.add("abierto");
  await pintarEquipo();
});
$("#eq-cerrar").addEventListener("click", () => $("#modal-equipo-fondo").classList.remove("abierto"));

async function pintarEquipo() {
  const esAdmin = estado.miRol === "admin";
  document.querySelectorAll("#eq-nombre, #eq-usuario, #eq-password, #eq-wa, #eq-rol, #eq-crear").forEach((el) => {
    el.style.display = esAdmin ? "" : "none";
  });
  const { agents } = await pedir("/api/crm/agents");
  const cont = $("#lista-equipo");
  cont.innerHTML = agents.map((a) => `
    <div class="fila-equipo">
      <div>
        <div class="nombre">${a.role === "admin" ? icon("shield") + " " : ""}${escapar(a.display_name)}${!a.active ? '<span class="pill-inactivo">inactivo</span>' : ""}</div>
        <div class="sub">@${escapar(a.username)} · WhatsApp +${escapar(a.wa_id)}</div>
      </div>
      ${esAdmin ? `
      <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
        <button class="eq-reset-password" data-id="${a.id}" title="Poner una contraseña temporal">Restablecer contraseña</button>
        <button class="eq-reset-totp" data-id="${a.id}" title="Apagar su 2FA con app si perdió el celular">Apagar 2FA</button>
        <button class="eq-toggle-active" data-id="${a.id}" data-active="${a.active ? 0 : 1}" class="${a.active ? "" : "inactiva"}">${a.active ? "Desactivar" : "Activar"}</button>
      </div>` : ""}
    </div>`).join("") || `<p class="ayuda-modal">${esAdmin ? "Todavía no hay vendedores — usa el formulario de abajo para crear el primero (puedes crear tu propia cuenta)." : "Todavía no hay vendedores."}</p>`;

  cont.querySelectorAll(".eq-toggle-active").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await pedir("/api/crm/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(btn.dataset.id), active: btn.dataset.active === "1" })
      });
      await pintarEquipo();
    });
  });

  cont.querySelectorAll(".eq-reset-password").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nueva = prompt("Contraseña temporal para este vendedor (mín. 8 caracteres) — dísela para que la cambie apenas entre:");
      if (!nueva) return;
      try {
        await pedir("/api/crm/agents", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: Number(btn.dataset.id), new_password: nueva })
        });
        alert("Contraseña restablecida.");
      } catch (err) {
        alert(err.message);
      }
    });
  });

  cont.querySelectorAll(".eq-reset-totp").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Apagar el 2FA con app de este vendedor? Va a volver a recibir el código por WhatsApp hasta que la reactive.")) return;
      await pedir("/api/crm/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(btn.dataset.id), reset_totp: true })
      });
      alert("2FA con app apagado para ese vendedor.");
    });
  });
}

$("#eq-crear").addEventListener("click", async () => {
  const display_name = $("#eq-nombre").value.trim();
  const username = $("#eq-usuario").value.trim();
  const password = $("#eq-password").value;
  const wa_id = $("#eq-wa").value.trim();
  const role = $("#eq-rol").value;
  try {
    await pedir("/api/crm/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name, username, password, wa_id, role })
    });
    $("#eq-nombre").value = "";
    $("#eq-usuario").value = "";
    $("#eq-password").value = "";
    $("#eq-wa").value = "";
    await pintarEquipo();
    alert("Vendedor creado. Desde ahora el login pide usuario + contraseña + el código que le llega por WhatsApp.");
  } catch (err) {
    alert(err.message);
  }
});

/* ---------- Plantillas (fuera de la ventana de 24h) ---------- */

/** Badge de estado de una plantilla — para que "no aparece" nunca sea un misterio: se ve si está aprobada, en revisión o rechazada. */
function badgeEstadoPlantilla(status) {
  if (status === "APPROVED") return "";
  const texto = status === "PENDING" ? "En revisión de Meta" : status === "REJECTED" ? "Rechazada por Meta" : (status || "Desconocido");
  const color = status === "PENDING" ? "#b8860b" : "var(--peligro)";
  return ` <span style="font-size:11px;color:${color}">· ${escapar(texto)}</span>`;
}

async function abrirModalTemplates() {
  estado.templateConversacionId = estado.conversacionActivaId;
  $("#modal-templates-fondo").classList.add("abierto");
  $("#form-template-params").style.display = "none";
  const cont = $("#lista-templates");
  cont.innerHTML = "Cargando…";
  try {
    const { templates } = await pedir("/api/crm/templates");
    if (!templates.length) {
      cont.innerHTML = `<p class="ayuda-modal">Todavía no creaste ninguna plantilla. Créalas en WhatsApp Manager → Message Templates (Meta tarda de minutos a ~24h en aprobarlas).</p>`;
      return;
    }
    cont.innerHTML = templates.map((t, i) => {
      const body = (t.components || []).find((c) => c.type === "BODY");
      return `
      <div class="fila-template" data-i="${i}" style="${t.status === "APPROVED" ? "cursor:pointer" : "opacity:.55;cursor:default"}">
        <div>
          <div class="nombre">${escapar(t.name)}${badgeEstadoPlantilla(t.status)}</div>
          <div class="sub">${escapar(t.category)} · ${escapar(t.language)}</div>
          ${body?.text ? `<div class="sub">${escapar(body.text)}</div>` : ""}
        </div>
      </div>`;
    }).join("");
    cont.querySelectorAll(".fila-template").forEach((el) => {
      const t = templates[Number(el.dataset.i)];
      if (t.status !== "APPROVED") return;
      el.addEventListener("click", () => elegirTemplate(t));
    });
  } catch (err) {
    cont.innerHTML = `<p class="ayuda-modal">${escapar(err.message)}</p>`;
  }
}

function elegirTemplate(t) {
  estado.templateElegido = t;
  const body = (t.components || []).find((c) => c.type === "BODY");
  const nParams = body?.text ? (body.text.match(/{{\d+}}/g) || []).length : 0;

  $("#lista-templates").style.display = "none";
  $("#form-template-params").style.display = "block";
  $("#template-params").innerHTML = `
    <p class="ayuda-modal">${body ? escapar(body.text) : t.name}</p>
    ${Array.from({ length: nParams }, (_, i) => `<input type="text" class="param-template" placeholder="Variable {{${i + 1}}}" />`).join("")}`;
}

$("#template-volver").addEventListener("click", () => {
  $("#lista-templates").style.display = "block";
  $("#form-template-params").style.display = "none";
});
$("#template-cerrar").addEventListener("click", () => {
  $("#modal-templates-fondo").classList.remove("abierto");
  $("#lista-templates").style.display = "block";
  $("#form-template-params").style.display = "none";
});

$("#template-enviar").addEventListener("click", async () => {
  const t = estado.templateElegido;
  if (!t) return;
  const parameters = [...document.querySelectorAll(".param-template")].map((i) => i.value);
  const conversationId = estado.templateConversacionId;
  $("#modal-templates-fondo").classList.remove("abierto");
  encolarEnvio(conversationId, [{ type: "text", body: `Plantilla: ${t.name}` }], () =>
    pedir("/api/crm/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, name: t.name, language: t.language, parameters })
    }), (err) => alert(err.message));
});

/* ---------- Panel de detalle ---------- */

async function pintarDetalle(c) {
  const nombre = c.profile_name || c.wa_id;
  const tieneAd = Boolean(c.ctwa_clid || c.ad_source_type);
  $("#detalle").innerHTML = `
    <button type="button" id="btn-cerrar-detalle" title="Cerrar">${icon("close")}</button>
    ${avatarHtml(nombre)}
    <div class="nombre-contacto">${escapar(nombre)}</div>
    <div class="tel-contacto">+${escapar(c.wa_id)}</div>

    <h2>Asesora asignada</h2>
    <div id="detalle-asignacion"></div>

    <h2>Pedidos del catálogo</h2>
    <div id="detalle-pedidos">Cargando…</div>

    <h2>Bienvenida de anuncios</h2>
    <div id="detalle-bienvenida">Cargando…</div>

    <h2>Seguimiento para leads</h2>
    <div id="detalle-leads">Cargando…</div>

    <h2>Seguimientos activos</h2>
    <div id="detalle-seguimientos">Cargando…</div>
    <button class="cancelar" id="detalle-nuevo-seguimiento" type="button" style="width:100%;font-size:12px;margin-top:6px">${icon("plus")} Programar seguimiento</button>

    <h2>Notas</h2>
    <textarea id="detalle-notas" placeholder="Ej. Adelanto, separado, talla, modelo de collar específico, otros productos o múltiples unidades, etc." style="width:100%;min-height:70px;padding:8px;border:1px solid var(--borde);border-radius:var(--radio-s);font-size:13px;font-family:inherit;resize:vertical">${escapar(c.notes || "")}</textarea>
    <div class="ayuda-modal" id="detalle-notas-estado" style="margin:2px 0 0"></div>

    ${estado.miRol === "admin" ? `
    <h2>Origen</h2>
    ${tieneAd ? `
      <div class="ad-card">
        <div class="titulo">${icon("megaphone")} Vino de un anuncio</div>
        ${c.ad_headline ? `<div>${escapar(c.ad_headline)}</div>` : ""}
        ${c.ad_source_type ? `<div>Tipo: ${escapar(c.ad_source_type)}</div>` : ""}
        ${c.ctwa_clid ? `<div style="word-break:break-all">ctwa_clid: ${escapar(c.ctwa_clid)}</div>` : ""}
      </div>` : `<div class="sin-ad">Chat directo, sin anuncio detectado.</div>`}
    ${!tieneAd ? `<button class="cancelar" id="detalle-simular-ad" style="width:100%;margin-top:8px;font-size:12px">${icon("megaphone")} Marcar este chat como venido de un anuncio</button>` : ""}
    ` : ""}

    ${estado.miRol === "admin" ? `
    <h2>Meta Ads</h2>
    <p class="ayuda-modal" style="margin:0 0 8px">${tieneAd
      ? "Reportar una venta ayuda a que Meta le muestre tus anuncios a más gente parecida a este cliente — no le manda nada a él, ni hace falta un pedido del catálogo."
      : "Este chat no vino de un anuncio, así que el reporte se manda como venta manual (sin vincular al clic de ningún anuncio) — solo suma al valor total reportado, no ayuda a segmentar este anuncio en particular."}</p>
    <div id="capi-form">
      <input type="text" id="capi-producto" placeholder="Producto (opcional, ej. Kit de tarot x2)" />
      <button class="cancelar" id="capi-elegir-catalogo-btn" type="button" style="width:100%;font-size:12px;margin:6px 0">${icon("bag")} Elegir del catálogo</button>
      <div id="capi-catalogo-lista" style="display:none;max-height:180px;overflow-y:auto;border:1px solid var(--borde);border-radius:var(--radio-s);padding:6px;margin-bottom:8px;font-size:12px"></div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <input type="number" id="capi-valor" value="89" min="0" step="0.01" style="flex:1;min-width:0" />
        <select id="capi-moneda" style="width:80px">
          <option value="PEN" selected>PEN</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <details style="margin-bottom:8px">
        <summary style="cursor:pointer;font-size:12px;color:var(--texto-tenue,#666)">Mejorar match con Meta (opcional)</summary>
        <div style="margin-top:6px;display:flex;flex-direction:column;gap:6px">
          <input type="text" id="capi-nombre" placeholder="Nombre" value="${escapar((c.name || c.profile_name || "").trim().split(/\s+/)[0] || "")}" />
          <input type="text" id="capi-apellido" placeholder="Apellido (opcional)" />
          <input type="email" id="capi-email" placeholder="Email (opcional)" />
        </div>
      </details>
      <button class="crear" id="capi-reportar-btn" type="button" style="width:100%">${tieneAd ? "Reportar venta (mejora tus anuncios)" : "Reportar venta manual"}</button>
    </div>
    <div id="capi-confirmacion" style="display:none"></div>
    <div id="detalle-capi-historial" style="margin-top:8px"></div>
    ` : ""}
  `;

  $("#btn-cerrar-detalle").addEventListener("click", () => history.back());

  $("#detalle-nuevo-seguimiento").addEventListener("click", abrirModalProgramarSeguimiento);

  $("#detalle-notas").addEventListener("input", debounce(async (e) => {
    const estadoEl = $("#detalle-notas-estado");
    estadoEl.textContent = "Guardando…";
    try {
      await pedir("/api/crm/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: c.contact_id, notes: e.target.value })
      });
      c.notes = e.target.value;
      estadoEl.textContent = "Guardado ✓";
      setTimeout(() => { if (estadoEl.textContent === "Guardado ✓") estadoEl.textContent = ""; }, 1500);
    } catch (err) {
      estadoEl.textContent = `No se guardó: ${err.message}`;
    }
  }, 600));

  $("#capi-elegir-catalogo-btn")?.addEventListener("click", async () => {
    const cont = $("#capi-catalogo-lista");
    const seAbre = cont.style.display === "none";
    cont.style.display = seAbre ? "block" : "none";
    if (!seAbre) return;
    cont.innerHTML = "Cargando…";
    try {
      if (!cacheProductosCatalogo) {
        const { products } = await pedir("/api/crm/catalog-products");
        cacheProductosCatalogo = products;
      }
      cont.innerHTML = (cacheProductosCatalogo || []).map((p, i) => {
        const precio = parseFloat(String(p.price ?? "").match(/[\d.]+/)?.[0] || "0");
        return `
        <label style="display:flex;align-items:center;gap:6px;padding:3px 0;cursor:pointer">
          <input type="checkbox" class="capi-check-producto" data-i="${i}" data-nombre="${escapar(p.name || p.retailer_id)}" data-precio="${precio}" />
          ${escapar(p.name || p.retailer_id)}${precio ? ` — ${precio}` : ""}
        </label>`;
      }).join("") || "Sin productos en el catálogo.";
      cont.querySelectorAll(".capi-check-producto").forEach((chk) => chk.addEventListener("change", () => {
        const marcados = [...cont.querySelectorAll(".capi-check-producto:checked")];
        if (!marcados.length) return;
        $("#capi-producto").value = marcados.map((m) => m.dataset.nombre).join(", ");
        const suma = marcados.reduce((s, m) => s + Number(m.dataset.precio || 0), 0);
        if (suma > 0) $("#capi-valor").value = suma;
      }));
    } catch (err) {
      cont.innerHTML = escapar(err.message);
    }
  });

  $("#capi-reportar-btn")?.addEventListener("click", () => {
    const valor = Number($("#capi-valor").value);
    const moneda = $("#capi-moneda").value;
    const producto = $("#capi-producto").value.trim();
    const nombreEmq = $("#capi-nombre").value.trim();
    const apellidoEmq = $("#capi-apellido").value.trim();
    const emailEmq = $("#capi-email").value.trim();
    if (!valor || valor <= 0) return alert("Escribe un monto válido.");

    $("#capi-form").style.display = "none";
    const conf = $("#capi-confirmacion");
    conf.style.display = "block";
    conf.innerHTML = `
      <div class="ad-card" style="margin-bottom:8px">
        <div class="titulo">${icon("send")} Confirmar reporte a Meta</div>
        <div>${producto ? escapar(producto) + " — " : ""}<strong>${valor} ${escapar(moneda)}</strong></div>
        <div class="sub" style="margin-top:4px">Ayuda a que el algoritmo de anuncios encuentre más clientes como este. No le manda nada a él.</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="cancelar" id="capi-cancelar-btn" type="button" style="flex:1">Cancelar</button>
        <button class="crear" id="capi-confirmar-btn" type="button" style="flex:1">Sí, reportar</button>
      </div>`;

    $("#capi-cancelar-btn").addEventListener("click", () => {
      conf.style.display = "none";
      $("#capi-form").style.display = "block";
    });
    $("#capi-confirmar-btn").addEventListener("click", async () => {
      const btn = $("#capi-confirmar-btn");
      btn.disabled = true;
      try {
        await pedir("/api/crm/capi-send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: c.conversation_id,
            value: valor,
            currency: moneda,
            product_label: producto || undefined,
            first_name: nombreEmq || undefined,
            last_name: apellidoEmq || undefined,
            email: emailEmq || undefined
          })
        });
        conf.style.display = "none";
        $("#capi-form").style.display = "block";
        $("#capi-producto").value = "";
        $("#capi-catalogo-lista").style.display = "none";
        await actualizarHistorialCapi(c.conversation_id);
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  });
  if (estado.miRol === "admin") actualizarHistorialCapi(c.conversation_id);

  $("#detalle-simular-ad")?.addEventListener("click", async () => {
    try {
      const { pasos_mandados } = await pedir("/api/crm/test-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wa_id: c.wa_id })
      });
      alert(`Listo — se marcó y se mandaron ${pasos_mandados} paso(s) de la secuencia de bienvenida.`);
      await cargarConversaciones();
      const actualizado = estado.conversaciones.find((x) => x.conversation_id === c.conversation_id);
      if (actualizado) pintarDetalle(actualizado);
    } catch (err) {
      alert(err.message);
    }
  });

  pintarAsignacion(c);
  pintarLeadDetalle(c);

  await actualizarPedidosPanel();
  await actualizarSeguimientosDetalle();
}

/** Si el seguimiento de leads está activo en el chat abierto, y cuándo sale el próximo. */
function pintarEstadoLead() {
  const el = $("#detalle-leads-estado");
  const datos = estado.seguimientosDelChat;
  if (!el || !datos || datos.conversationId !== estado.conversacionActivaId) return;
  const activos = datos.scheduled.filter(esSeguimientoLead).sort((a, b) => a.send_at.localeCompare(b.send_at));
  el.classList.toggle("activo", activos.length > 0);
  el.innerHTML = activos.length
    ? `${icon("check")} Activo en este chat — ${activos.length === 1 ? "sale" : `${activos.length} mensajes, el próximo sale`} el ${escapar(fechaCorta(activos[0].send_at))}`
    : "No activo en este chat.";
  const btn = $("#btn-aplicar-leads");
  if (btn) btn.innerHTML = `${icon("bolt")} ${activos.length ? "Reprogramar seguimiento de leads" : "Programar seguimiento de leads"}`;
}

/**
 * "Bienvenida de anuncios" y "Seguimiento para leads" del panel derecho:
 * lo que armó el admin, listo para que cualquier vendedor lo mande o lo
 * programe en este chat con un botón.
 */
async function pintarLeadDetalle(c) {
  const contB = $("#detalle-bienvenida");
  const contL = $("#detalle-leads");
  if (!contB || !contL) return;
  let d;
  try {
    d = await cargarDatosLead();
  } catch (err) {
    contB.innerHTML = contL.innerHTML = `<div class="sin-ad">${escapar(err.message)}</div>`;
    return;
  }
  if (estado.conversacionActivaId !== c.conversation_id) return;
  const esAdmin = estado.miRol === "admin";
  const nombre = c.profile_name || `+${c.wa_id}`;

  if (!d.welcomeSteps.length) {
    contB.innerHTML = `<div class="sin-ad">${esAdmin ? "Todavía no armaste la bienvenida." : "El admin todavía no armó la bienvenida."}</div>`
      + (esAdmin ? `<button class="cancelar lead-config" id="detalle-config-bienvenida" type="button">${icon("pencil")} Armar bienvenida</button>` : "");
  } else {
    contB.innerHTML = `
      <div class="lead-lista">${d.welcomeSteps.map((p, i) => `
        <label class="lead-check">
          <input type="checkbox" class="bienv-paso" value="${p.id}" checked />
          <span><strong>${i + 1}. ${escapar(p.title)}</strong>${p.media.length ? ` ${icon(p.media.length === 1 && p.media[0].media_type === "video" ? "video" : "image")}${p.media.length > 1 ? ` ×${p.media.length}` : ""}` : ""}
          ${p.body ? `<span class="sub">${escapar(recortarTexto(p.body, 80))}</span>` : ""}</span>
        </label>`).join("")}
      </div>
      <button class="crear" id="btn-mandar-bienvenida" type="button" style="width:100%;margin-top:6px"></button>
      ${esAdmin ? `<button class="cancelar lead-config" id="detalle-config-bienvenida" type="button">${icon("pencil")} Editar bienvenida</button>` : ""}
      <div class="ayuda-modal" id="bienvenida-estado" style="margin:4px 0 0"></div>`;

    const checks = [...contB.querySelectorAll(".bienv-paso")];
    const btn = $("#btn-mandar-bienvenida");
    const actualizarBoton = () => {
      const n = checks.filter((x) => x.checked).length;
      btn.disabled = !n;
      btn.innerHTML = `${icon("send")} ${n === checks.length ? "Mandar bienvenida completa" : `Mandar ${n} de ${checks.length} paso${checks.length === 1 ? "" : "s"}`}`;
    };
    checks.forEach((x) => x.addEventListener("change", actualizarBoton));
    actualizarBoton();

    btn.addEventListener("click", async () => {
      const elegidos = checks.filter((x) => x.checked).map((x) => Number(x.value));
      if (!elegidos.length) return;
      if (!confirm(`¿Mandarle a ${nombre} ${elegidos.length === checks.length ? "la bienvenida completa" : `${elegidos.length} paso(s) de la bienvenida`}? Sale ahora mismo, en orden.`)) return;
      const aviso = $("#bienvenida-estado");
      btn.disabled = true;
      aviso.textContent = "Mandando…";
      try {
        const { pasos_mandados } = await pedir("/api/crm/welcome-send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: c.conversation_id, step_ids: elegidos.length === checks.length ? undefined : elegidos })
        });
        aviso.textContent = `Listo — ${pasos_mandados} paso(s) mandado(s) ✓`;
        programarSync(0);
      } catch (err) {
        aviso.textContent = err.message;
      } finally {
        actualizarBoton();
      }
    });
  }
  $("#detalle-config-bienvenida")?.addEventListener("click", () => $("#btn-abrir-bienvenida").click());

  const seq = secuenciaDeLeads(d);
  if (!seq || !seq.steps.length) {
    contL.innerHTML = `<div class="sin-ad">${esAdmin ? "Todavía no configuraste el seguimiento para leads." : "El admin todavía no configuró el seguimiento para leads."}</div>`
      + (esAdmin ? `<button class="cancelar lead-config" id="detalle-config-leads" type="button">${icon("pencil")} Configurar</button>` : "");
  } else {
    let acum = 0;
    contL.innerHTML = `
      <div class="ad-card lead-card">
        <div class="titulo">${icon("clock")} ${escapar(seq.title)}${d.settings.ad_followup_auto ? ` <span class="pill-auto">automático en leads nuevos</span>` : ""}</div>
        <ol class="lead-timeline">${seq.steps.map((p) => {
          acum += p.delay_minutes;
          return `<li><strong>En ${formatearMomento(acum)}</strong>${p.media_key ? " " + icon(p.media_type === "video" ? "video" : "image") : ""} — ${escapar(recortarTexto(p.body || "Foto/video", 70))}</li>`;
        }).join("")}</ol>
        <div class="lead-estado" id="detalle-leads-estado"></div>
      </div>
      <button class="crear" id="btn-aplicar-leads" type="button" style="width:100%;margin-top:6px">${icon("bolt")} Programar seguimiento de leads</button>
      ${esAdmin ? `<button class="cancelar lead-config" id="detalle-config-leads" type="button">${icon("pencil")} Configurar</button>` : ""}
      <div class="ayuda-modal" style="margin:4px 0 0">Se cancela si el cliente contesta o si le escribes.</div>`;
    pintarEstadoLead();

    $("#btn-aplicar-leads").addEventListener("click", async () => {
      const btn = $("#btn-aplicar-leads");
      btn.disabled = true;
      try {
        const { scheduled } = await pedir(`/api/crm/scheduled?conversation_id=${c.conversation_id}`);
        const activos = scheduled.filter(esSeguimientoLead);
        const pregunta = activos.length
          ? `Este chat ya tiene el seguimiento de leads activo. ¿Reprogramarlo desde ahora? Se reemplaza, no se duplica (el primero saldría en ${formatearMomento(seq.steps[0].delay_minutes)}).`
          : `¿Programar los ${seq.steps.length} mensaje(s) de seguimiento en este chat? El primero sale en ${formatearMomento(seq.steps[0].delay_minutes)}.`;
        if (!confirm(pregunta)) return;
        await pedir("/api/crm/followup-apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: c.conversation_id, sequence_id: seq.id })
        });
        await actualizarSeguimientosDetalle();
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }
  $("#detalle-config-leads")?.addEventListener("click", abrirModalLeads);
}

/**
 * "Asesora asignada" — bandeja compartida por defecto, la estrella (lista/header/acá) lo reclama con un clic.
 * Cada quien ve un botón distinto según su propia relación con el chat: lo
 * reclama si está libre o si es de otro y todavía nadie lo comparte, y se
 * saca (con "liberar") si es suyo o lo comparte — nunca "quitárselo" al
 * otro a la fuerza. Aparte, un administrador siempre puede vaciar la
 * asignación entera, sea de quien sea.
 */
function pintarAsignacion(c) {
  const cont = $("#detalle-asignacion");
  if (!cont) return;

  const miNombre = estado.miNombre;
  const asignado = c.assigned_agent;
  const otros = compartidosDe(c);
  const esAdmin = estado.miRol === "admin";
  const btnAdmin = esAdmin
    ? `<button class="cancelar" id="btn-editar-asignacion" type="button" style="width:100%;font-size:12px;margin-top:6px">${icon("users")} Elegir a quién se asigna (admin)</button>`
    : "";

  if (!asignado) {
    cont.innerHTML = `<button class="crear" id="btn-reclamar" type="button" style="width:100%">${icon("star")} Reclamar este chat</button>${btnAdmin}`;
    $("#btn-reclamar").addEventListener("click", () => cambiarAsignacion(c, "reclamar"));
    $("#btn-editar-asignacion")?.addEventListener("click", () => abrirModalAsignar(c));
    return;
  }

  const esMio = asignado === miNombre;
  const loComparto = otros.includes(miNombre);
  const nombresHtml = (arr) => unirNombres(arr.map((n) => `<strong>${escapar(n)}</strong>`));
  let linea, boton;
  if (esMio) {
    linea = otros.length ? `Es tuyo, compartido con ${nombresHtml(otros)}` : "Es tuyo";
    boton = `<button class="cancelar" id="btn-desasignar" type="button" style="width:100%;font-size:12px;margin-top:6px">${otros.length ? `Liberar (${escapar(otros[0])} pasa a ser el dueño)` : "Liberar chat (volver a bandeja compartida)"}</button>`;
  } else if (loComparto) {
    linea = `Lo tiene <strong>${escapar(asignado)}</strong>, lo compartís vos${otros.length > 1 ? ` con ${nombresHtml(otros.filter((n) => n !== miNombre))}` : ""}`;
    boton = `<button class="cancelar" id="btn-desasignar" type="button" style="width:100%;font-size:12px;margin-top:6px">Dejar de compartir</button>`;
  } else if (!otros.length) {
    linea = `Lo tiene <strong>${escapar(asignado)}</strong>`;
    boton = `<button class="cancelar" id="btn-desasignar" type="button" style="width:100%;font-size:12px;margin-top:6px">Reclamar comisión compartida</button>`;
  } else {
    linea = `Lo tienen ${nombresHtml([asignado, ...otros])}`;
    boton = "";
  }

  cont.innerHTML = `
    <div class="ad-card" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div>${icon("star")} ${linea}</div>
    </div>
    ${boton}
    ${btnAdmin}`;
  $("#btn-desasignar")?.addEventListener("click", () => cambiarAsignacion(c, esMio || loComparto ? "liberar" : "reclamar"));
  $("#btn-editar-asignacion")?.addEventListener("click", () => abrirModalAsignar(c));
}

/* ---------- Modal de asignación (admin): dueño + quienes comparten ---------- */

let chatAsignando = null;

async function abrirModalAsignar(c) {
  chatAsignando = c;
  $("#asignar-contacto").textContent = c.profile_name || `+${c.wa_id}`;
  $("#asignar-lista").innerHTML = "Cargando…";
  $("#modal-asignar-fondo").classList.add("abierto");
  let agentes = [];
  try {
    ({ agents: agentes } = await pedir("/api/crm/agents"));
  } catch (err) {
    $("#asignar-lista").textContent = err.message;
    return;
  }
  const actuales = [c.assigned_agent, ...compartidosDe(c)].filter(Boolean);
  // Los activos, más cualquiera que ya lo tenga aunque hoy esté inactivo (para no perderlo sin querer).
  const nombres = [...new Set([
    ...agentes.filter((a) => a.active).map((a) => a.display_name),
    ...actuales
  ])];
  if (!nombres.length) {
    $("#asignar-lista").innerHTML = `<p class="ayuda-modal">Todavía no hay vendedores — créalos en "Equipo".</p>`;
    return;
  }
  $("#asignar-lista").innerHTML = nombres.map((n) => `
    <div class="asignar-fila">
      <label class="asignar-incluir">
        <input type="checkbox" class="asignar-check" value="${escapar(n)}" ${actuales.includes(n) ? "checked" : ""} />
        <span>${escapar(n)}${n === estado.miNombre ? ` <span class="sub">(tú)</span>` : ""}</span>
      </label>
      <label class="asignar-dueno" title="La persona principal del chat">
        <input type="radio" name="asignar-dueno" value="${escapar(n)}" ${n === c.assigned_agent ? "checked" : ""} />
        Dueño
      </label>
    </div>`).join("");
  sincronizarModalAsignar();
  $("#asignar-lista").querySelectorAll("input").forEach((el) => el.addEventListener("change", (e) => {
    // Marcar a alguien como dueño lo incluye; sacarlo de la lista le quita lo de dueño.
    if (e.target.type === "radio") e.target.closest(".asignar-fila").querySelector(".asignar-check").checked = true;
    sincronizarModalAsignar();
  }));
}

function sincronizarModalAsignar() {
  const filas = [...document.querySelectorAll("#asignar-lista .asignar-fila")];
  for (const f of filas) {
    const incluido = f.querySelector(".asignar-check").checked;
    const radio = f.querySelector('input[type="radio"]');
    if (!incluido) radio.checked = false;
    f.classList.toggle("incluido", incluido);
  }
  const incluidos = filas.filter((f) => f.querySelector(".asignar-check").checked);
  if (incluidos.length && !incluidos.some((f) => f.querySelector('input[type="radio"]').checked)) {
    incluidos[0].querySelector('input[type="radio"]').checked = true;
  }
  const dueno = document.querySelector('#asignar-lista input[type="radio"]:checked')?.value;
  const otros = incluidos.map((f) => f.querySelector(".asignar-check").value).filter((n) => n !== dueno);
  $("#asignar-resumen").textContent = !incluidos.length
    ? "Queda libre (bandeja compartida)."
    : `Dueño: ${dueno}${otros.length ? ` · comparten: ${unirNombres(otros)}` : ""}`;
}

$("#asignar-cancelar").addEventListener("click", () => {
  $("#modal-asignar-fondo").classList.remove("abierto");
  chatAsignando = null;
});

$("#asignar-libre").addEventListener("click", () => {
  document.querySelectorAll("#asignar-lista .asignar-check").forEach((el) => { el.checked = false; });
  sincronizarModalAsignar();
});

$("#asignar-guardar").addEventListener("click", async () => {
  const c = chatAsignando;
  if (!c) return;
  const dueno = document.querySelector('#asignar-lista input[type="radio"]:checked')?.value || null;
  const shared = [...document.querySelectorAll("#asignar-lista .asignar-check:checked")].map((el) => el.value).filter((n) => n !== dueno);
  const btn = $("#asignar-guardar");
  btn.disabled = true;
  try {
    await cambiarAsignacion(c, "definir", { owner: dueno, shared });
    $("#modal-asignar-fondo").classList.remove("abierto");
    chatAsignando = null;
  } finally {
    btn.disabled = false;
  }
});

async function cambiarAsignacion(c, action, extra) {
  try {
    const { assigned_agent, shared_with } = await pedir("/api/crm/assign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: c.conversation_id, action, ...extra })
    });
    c.assigned_agent = assigned_agent;
    c.shared_with = shared_with ?? null;
    const conv = estado.conversaciones.find((x) => x.conversation_id === c.conversation_id);
    if (conv) { conv.assigned_agent = assigned_agent; conv.shared_with = c.shared_with; }
    marcarAsignacionLocal(c.conversation_id, assigned_agent, c.shared_with);
    pintarAsignacion(c);
    pintarEstrellaHeader(c);
    pintarLista();
  } catch (err) {
    alert(err.message);
  }
}

revisarSesion();

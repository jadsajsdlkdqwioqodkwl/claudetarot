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
  respondiendoA: null
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

  const promesa = (async () => {
    const data = await pedir(`/api/crm/conversations?${clave}`);
    estado.conversaciones = data.conversations;
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

function actualizarAvisosNoLeidos() {
  const total = estado.conversaciones.reduce((s, c) => s + (c.unread_count || 0), 0);

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
    div.className = "conv-item" + (c.conversation_id === estado.conversacionActivaId ? " activo" : "");

    const previewTexto = c.last_type === "text" || !c.last_type ? (c.last_body || "") : `[${c.last_type}]`;
    const prefijoYo = c.last_direction === "out" ? "Tú: " : "";

    div.innerHTML = `
      ${avatarHtml(nombre)}
      <div class="conv-info">
        <div class="fila1">
          <span class="nombre">${escapar(nombre)}</span>
          <span class="hora">${horaCorta(c.last_message_at)}</span>
        </div>
        <div class="fila2">
          <span class="preview">${escapar(prefijoYo + previewTexto)}</span>
          ${c.unread_count > 0 ? `<span class="badge">${c.unread_count}</span>` : ""}
          <button class="btn-star ${c.assigned_agent ? "marcada" : ""}" title="${!c.assigned_agent ? "Reclamar este chat" : c.assigned_agent === estado.miNombre ? "Es tuyo — clic para liberar" : `Lo tiene ${escapar(c.assigned_agent)} — clic para reclamarlo`}">${icon(c.assigned_agent ? "star" : "starOutline")}</button>
        </div>
        ${c.ctwa_clid ? `<span class="badge-ad">${icon("megaphone")} ${escapar(c.ad_source_type || "Anuncio")}</span>` : ""}
        ${c.assigned_agent ? `<span class="badge-asignado">${icon("star")} ${escapar(c.assigned_agent)}${c.shared_with ? ` + ${escapar(c.shared_with)}` : ""}</span>` : ""}
      </div>`;
    div.querySelector(".conv-info").addEventListener("click", (e) => {
      if (e.target.closest(".btn-star")) return;
      abrirConversacion(c);
    });
    div.querySelector(".btn-star").addEventListener("click", (e) => {
      e.stopPropagation();
      clicEstrella(c);
    });
    cont.appendChild(div);
  }
}

/** Clic en la estrella (lista, header, o el botón del sidebar) — reclamar/liberar/reasignar según de quién sea ahora mismo. */
function clicEstrella(c) {
  if (!c.assigned_agent) return cambiarAsignacion(c, "reclamar");
  if (c.assigned_agent === estado.miNombre) return cambiarAsignacion(c, "liberar");
  return cambiarAsignacion(c, "reasignar", c.assigned_agent);
}

/** Actualiza solo el ícono/título de la estrella del header, sin repintar todo el chat. */
function pintarEstrellaHeader(c) {
  const btn = $("#star-header");
  if (!btn || estado.conversacionActivaId !== c.conversation_id) return;
  btn.innerHTML = icon(c.assigned_agent ? "star" : "starOutline");
  btn.classList.toggle("marcada", Boolean(c.assigned_agent));
  btn.title = !c.assigned_agent ? "Reclamar este chat"
    : c.assigned_agent === estado.miNombre ? "Es tuyo — clic para liberar"
    : `Lo tiene ${c.assigned_agent} — clic para reclamarlo`;
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

async function abrirConversacion(c) {
  estado.conversacionActivaId = c.conversation_id;
  estado.mensajesCargados = [];
  estado.firmaMensajesPintados = null;
  estado.hayMasAntiguos = false;
  estado.respondiendoA = null;
  cancelarAdjunto();
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
  pintarDetalle(c);
  await cargarMensajes();
  programarSync();
  registrarEntradaChat(c);
}

function volverALaLista() {
  document.body.classList.remove("chat-abierto");
  document.body.classList.remove("detalle-abierto");
}

/**
 * Se llama solo cada vez que se abre un chat — no es un botón. Si el chat ya
 * es de otra persona y todavía nadie más lo compartía, deja a quien entró
 * como quien comparte la comisión de esa venta, sin que nadie tenga que
 * tocar nada aparte de abrir el chat.
 */
async function registrarEntradaChat(c) {
  try {
    const { assigned_agent, shared_with } = await pedir("/api/crm/assign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: c.conversation_id, action: "entrar" })
    });
    c.assigned_agent = assigned_agent;
    c.shared_with = shared_with;
    const conv = estado.conversaciones.find((x) => x.conversation_id === c.conversation_id);
    if (conv) { conv.assigned_agent = assigned_agent; conv.shared_with = shared_with; }
    pintarEstrellaHeader(c);
    pintarAsignacion(c);
    pintarLista();
  } catch { /* silencioso — no vale la pena molestar por esto */ }
}

// Mismo truco que con el chat/detalle, pero genérico para los modales
// (admin, equipo, plantillas, secuencias, respuestas rápidas, seguimiento,
// contacto, contraseña, bienvenida): al abrirse cualquiera se mete un
// estado en el historial, así el "atrás" físico del teléfono lo cierra en
// vez de salir del sitio. Se engancha una sola vez acá, sin tocar cada
// abrirModalX/botón "cerrar" por separado.
let sincronizandoModalHistorial = false;
document.querySelectorAll(".modal-fondo").forEach((el) => {
  let estabaAbierto = el.classList.contains("abierto");
  new MutationObserver(() => {
    const abierto = el.classList.contains("abierto");
    if (abierto === estabaAbierto) return;
    estabaAbierto = abierto;
    if (abierto) {
      if (!sincronizandoModalHistorial) history.pushState({ crmModal: el.id }, "", location.href);
      return;
    }
    if (sincronizandoModalHistorial) {
      // Se cerró porque el "atrás" ya consumió el estado — nada más que hacer.
      sincronizandoModalHistorial = false;
    } else {
      // Se cerró con su botón/click afuera — hay que consumir el estado pendiente.
      sincronizandoModalHistorial = true;
      history.back();
    }
  }).observe(el, { attributes: true, attributeFilter: ["class"] });
});

// El "atrás" del teléfono (o el del navegador) dispara esto en vez de salir
// del sitio cuando hay algo abierto — ver los pushState en abrirConversacion,
// al abrir "Detalle" y en el observer de modales de más arriba. Cierra lo de
// más arriba primero (modal, luego detalle, luego el chat), igual que la app real.
window.addEventListener("popstate", () => {
  const modalAbierto = document.querySelector(".modal-fondo.abierto");
  if (modalAbierto) {
    sincronizandoModalHistorial = true;
    modalAbierto.classList.remove("abierto");
    return;
  }
  if (sincronizandoModalHistorial) { sincronizandoModalHistorial = false; return; }
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
  mostrarEnviando(true);
  try {
    await pedir("/api/crm/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: estado.conversacionActivaId, media_key: sticker.media_key, media_type: "sticker" })
    });
    await cargarMensajes();
    await cargarConversaciones();
  } catch (err) {
    alert(err.message);
  } finally {
    mostrarEnviando(false);
  }
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
  mostrarEnviando(true);
  try {
    await pedir("/api/crm/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: estado.conversacionActivaId })
    });
    await cargarMensajes();
    await cargarConversaciones();
  } catch (err) {
    alert(err.message);
  } finally {
    mostrarEnviando(false);
  }
}

async function enviarProductoElegido(retailerId) {
  $("#panel-catalogo").classList.remove("abierto");
  const nombre = cacheProductosCatalogo?.find((p) => p.retailer_id === retailerId)?.name;
  mostrarEnviando(true);
  try {
    await pedir("/api/crm/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: estado.conversacionActivaId, product_retailer_id: retailerId, product_name: nombre })
    });
    await cargarMensajes();
    await cargarConversaciones();
  } catch (err) {
    alert(err.message);
  } finally {
    mostrarEnviando(false);
  }
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

/** Pone el botón de enviar en spinner mientras algo se está mandando (respuesta rápida, catálogo, producto…). */
function mostrarEnviando(activo) {
  const btn = $("#form-envio button.enviar");
  if (!btn) return;
  btn.disabled = activo;
  btn.innerHTML = activo ? icon("spinner", "girando") : icon("send");
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

/** Historial de eventos CAPI mandados en este chat (con o sin pedido del catálogo detrás). */
async function actualizarHistorialCapi(conversationId) {
  const cont = $("#detalle-capi-historial");
  if (!cont) return;
  try {
    const { events } = await pedir(`/api/crm/capi-send?conversation_id=${conversationId}`);
    cont.innerHTML = events.length
      ? `<div class="ayuda-modal" style="margin-bottom:4px">Enviados antes:</div>` + events.map((e) => `
        <div style="font-size:11px;color:var(--gris);display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--borde)">
          <span>${fechaCorta(e.created_at)}${e.product_label ? ` · ${escapar(e.product_label)}` : ""}</span>
          <span style="color:${e.status === "enviado" ? "var(--verde-osc)" : "var(--peligro)"}">${e.value} ${escapar(e.currency)} ${e.status === "enviado" ? "✓" : "✗"}</span>
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
  if (!cont || !estado.conversacionActivaId) return;
  try {
    const { scheduled } = await pedir(`/api/crm/scheduled?conversation_id=${estado.conversacionActivaId}`);
    const html = scheduled.length ? scheduled.map((s) => `
      <div class="ad-card seguimiento-detalle" data-id="${s.id}" style="margin-bottom:8px;display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div>
          <div class="titulo">${icon(s.batch_id ? "broadcast" : "clock")} ${fechaCorta(s.send_at)}${s.batch_id ? ` <span style="font-weight:400;color:var(--ad)">· Envío masivo</span>` : ""}</div>
          <div>${escapar(textoSeguimiento(s))}</div>
        </div>
        <div style="display:flex;gap:4px">
          ${seguimientoEditable(s) ? `<button class="editar-seguimiento-detalle" data-id="${s.id}" title="Editar">${icon("pencil")}</button>` : ""}
          <button class="borrar-seguimiento-detalle" data-id="${s.id}" title="Cancelar">${icon("close")}</button>
        </div>
      </div>`).join("") : `<div class="sin-ad">Sin seguimientos programados.</div>`;
    if (cont.innerHTML !== html) {
      cont.innerHTML = html;
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
  return `<span class="tipo">[${escapar(m.type)}]${m.body ? " " + escapar(m.body) : ""}</span>`;
}

/** Un extracto corto de un mensaje, para citarlo en la respuesta o en el "responde a" arriba de una burbuja. */
function extractoMensaje(tipo, body) {
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

function pintarMensajes() {
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

  cont.innerHTML = (estado.hayMasAntiguos
    ? `<div id="cargar-anteriores"><button type="button">Cargar mensajes anteriores</button></div>`
    : "") + filas;

  $("#cargar-anteriores button")?.addEventListener("click", cargarMensajesAnteriores);
  if (abajo || mensajes.length <= 20) cont.scrollTop = cont.scrollHeight;
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

async function enviarMensaje(e) {
  e.preventDefault();
  const input = $("#texto-envio");
  const texto = input.value.trim();
  const adjunto = estado.archivoAdjunto;
  const rapida = estado.rapidaPendiente;
  if (!texto && !adjunto && !rapida) return;

  input.disabled = true;
  mostrarEnviando(true);

  const replyToId = estado.respondiendoA?.id || undefined;

  try {
    if (adjunto) {
      const { media_key, type, original_name } = await subirArchivo(adjunto.file);
      await pedir("/api/crm/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `caption` es el pie de foto/video/documento. `file_name` queda en
        // el registro interno y, si es un documento, el cliente SÍ lo ve
        // como el nombre del archivo (ver enviarMedia en whatsapp.js) —
        // fotos/videos/stickers de WhatsApp no tienen "nombre" visible, así
        // que ahí no importa.
        body: JSON.stringify({ conversation_id: estado.conversacionActivaId, media_key, media_type: type, caption: texto || undefined, file_name: original_name, reply_to_id: replyToId })
      });
      cancelarAdjunto();
    } else if (rapida) {
      // Todas a la vez, no una por una: la API las procesa en paralelo y
      // llegan casi juntas — WhatsApp igual manda una notificación por
      // foto, eso lo decide el celular del cliente, no la API.
      const resultados = await Promise.allSettled(rapida.media.map((m) =>
        pedir("/api/crm/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: estado.conversacionActivaId, media_key: m.media_key, media_type: m.media_type })
        })
      ));
      const fallidas = resultados.filter((r) => r.status === "rejected");
      if (texto) {
        await pedir("/api/crm/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: estado.conversacionActivaId, body: texto, reply_to_id: replyToId })
        });
      }
      estado.rapidaPendiente = null;
      pintarPreviewArchivo();
      if (fallidas.length) {
        alert(`Se mandaron ${rapida.media.length - fallidas.length} de ${rapida.media.length} — falló: ${fallidas[0].reason.message}`);
      }
    } else {
      await pedir("/api/crm/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: estado.conversacionActivaId, body: texto, reply_to_id: replyToId })
      });
    }
    input.value = "";
    cancelarRespuesta();
    await cargarMensajes();
    await cargarConversaciones();
  } catch (err) {
    alert(err.message);
  } finally {
    input.disabled = false;
    mostrarEnviando(false);
    input.focus();
  }
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

function abrirModalProgramarSeguimiento() {
  estado.editandoSeguimientoId = null;
  $("#seg-modal-titulo").textContent = "Programar seguimiento";
  $("#seg-crear").textContent = "Programar";
  $("#seg-archivo").style.display = "";
  const sel = $("#seg-rapida");
  sel.style.display = "";
  sel.innerHTML = `<option value="">— o una respuesta rápida guardada —</option>` +
    estado.quickReplies.map((q) => `<option value="${q.id}">${escapar(q.title)}</option>`).join("");
  $("#modal-seguimiento-fondo").classList.add("abierto");
}

/** Solo los de texto libre — los que llevan respuesta rápida o foto/video propia se cancelan y se vuelven a programar. */
function abrirModalEditarSeguimiento(s) {
  estado.editandoSeguimientoId = s.id;
  $("#seg-modal-titulo").textContent = "Editar seguimiento";
  $("#seg-crear").textContent = "Guardar cambios";
  $("#seg-archivo").style.display = "none";
  $("#seg-rapida").style.display = "none";
  $("#seg-rapida").value = "";
  const d = new Date(s.send_at);
  $("#seg-fecha").value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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
    abrirModalSecuencias();
  });
}

$("#seg-cancelar").addEventListener("click", () => {
  $("#modal-seguimiento-fondo").classList.remove("abierto");
  estado.editandoSeguimientoId = null;
  $("#seg-fecha").value = "";
  $("#seg-texto").value = "";
  $("#seg-archivo").value = "";
});

$("#seg-crear").addEventListener("click", async () => {
  const fecha = $("#seg-fecha").value;
  const texto = $("#seg-texto").value.trim();
  const quickReplyId = $("#seg-rapida").value;
  const archivo = $("#seg-archivo").files[0];
  const editandoId = estado.editandoSeguimientoId;
  if (!fecha) return alert("Elige fecha y hora.");
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
      estado.editandoSeguimientoId = null;
      $("#seg-fecha").value = "";
      $("#seg-texto").value = "";
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
        conversation_id: estado.conversacionActivaId,
        send_at: new Date(fecha).toISOString(),
        body: texto || undefined,
        quick_reply_id: !archivo && quickReplyId ? quickReplyId : undefined,
        media_key, media_type, media_mime
      })
    });
    $("#modal-seguimiento-fondo").classList.remove("abierto");
    $("#seg-fecha").value = "";
    $("#seg-texto").value = "";
    $("#seg-archivo").value = "";
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

function abrirModalSecuencias() {
  $("#modal-secuencias-fondo").classList.add("abierto");
  cargarYPintarSecuencias();
}
$("#fs-cerrar").addEventListener("click", () => $("#modal-secuencias-fondo").classList.remove("abierto"));

async function cargarYPintarSecuencias() {
  const { sequences } = await pedir("/api/crm/followup-sequences");
  estadoSecuencias = sequences;
  pintarListaSecuencias();
}

function pintarListaSecuencias() {
  const cont = $("#lista-secuencias-seg");
  const puedeAplicar = Boolean(estado.conversacionActivaId);
  cont.innerHTML = estadoSecuencias.length ? estadoSecuencias.map((s) => `
    <div class="fila-secuencia" data-id="${s.id}">
      <div class="fila-secuencia-header">
        <div class="nombre">${escapar(s.title)} <span class="sub">(${s.steps.length} paso${s.steps.length === 1 ? "" : "s"})</span></div>
        <div style="display:flex;gap:4px">
          <button class="fs-aplicar" data-id="${s.id}" title="${puedeAplicar ? "Aplicar a este chat" : "Abre una conversación primero"}" ${puedeAplicar ? "" : "disabled"}>${icon("send")}</button>
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
    </div>`).join("") : `<p class="ayuda-modal">Todavía no armaste ninguna secuencia — créala abajo.</p>`;

  cont.querySelectorAll(".fs-editar").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pasos = cont.querySelector(`.fs-pasos[data-id="${btn.dataset.id}"]`);
      pasos.style.display = pasos.style.display === "none" ? "block" : "none";
    });
  });

  cont.querySelectorAll(".fs-aplicar").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!estado.conversacionActivaId) return;
      if (!confirm("¿Aplicar esta secuencia a la conversación abierta? Se programarán todos sus pasos.")) return;
      btn.disabled = true;
      try {
        const { pasos_programados } = await pedir("/api/crm/followup-apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: estado.conversacionActivaId, sequence_id: Number(btn.dataset.id) })
        });
        await actualizarSeguimientosDetalle();
        alert(`Listo — se programaron ${pasos_programados} mensaje(s).`);
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
  try {
    await pedir("/api/crm/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: estado.conversacionActivaId, name: t.name, language: t.language, parameters })
    });
    $("#modal-templates-fondo").classList.remove("abierto");
    await cargarMensajes();
    await cargarConversaciones();
  } catch (err) {
    alert(err.message);
  }
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

    <h2>Seguimientos programados</h2>
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

  await actualizarPedidosPanel();
  await actualizarSeguimientosDetalle();
}

/** "Asesora asignada" — bandeja compartida por defecto, la estrella (lista/header/acá) lo reclama con un clic. */
function pintarAsignacion(c) {
  const cont = $("#detalle-asignacion");
  if (!cont) return;

  const miNombre = estado.miNombre;
  const asignado = c.assigned_agent;
  const compartido = c.shared_with;

  if (!asignado) {
    cont.innerHTML = `<button class="crear" id="btn-reclamar" type="button" style="width:100%">${icon("star")} Reclamar este chat</button>`;
    $("#btn-reclamar").addEventListener("click", () => cambiarAsignacion(c, "reclamar"));
    return;
  }

  const esMio = asignado === miNombre;
  cont.innerHTML = `
    <div class="ad-card" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div>${icon("star")} ${esMio ? "Es tuyo" : `Lo tiene <strong>${escapar(asignado)}</strong>`}</div>
    </div>
    ${compartido ? `<div class="ayuda-modal" style="margin-top:4px">${icon("users")} Comisión compartida con <strong>${escapar(compartido)}</strong> — entró a este chat después de que ya era de ${escapar(asignado)}.</div>` : ""}
    <button class="cancelar" id="btn-desasignar" type="button" style="width:100%;font-size:12px;margin-top:6px">
      ${esMio ? "Liberar chat (volver a bandeja compartida)" : "Reclamar para mí (se lo quita a " + escapar(asignado) + ")"}
    </button>`;
  $("#btn-desasignar").addEventListener("click", () => cambiarAsignacion(c, esMio ? "liberar" : "reasignar", esMio ? null : asignado));
}

async function cambiarAsignacion(c, action, deQuien) {
  if (action === "reasignar" && !confirm(`¿Quitarle este chat a ${deQuien} y asignártelo a ti?`)) return;
  try {
    const { assigned_agent, shared_with } = await pedir("/api/crm/assign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: c.conversation_id, action })
    });
    c.assigned_agent = assigned_agent;
    c.shared_with = shared_with ?? null;
    const conv = estado.conversaciones.find((x) => x.conversation_id === c.conversation_id);
    if (conv) { conv.assigned_agent = assigned_agent; conv.shared_with = c.shared_with; }
    pintarAsignacion(c);
    pintarEstrellaHeader(c);
    pintarLista();
  } catch (err) {
    alert(err.message);
  }
}

revisarSesion();

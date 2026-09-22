/**
 * CRM de WhatsApp — sin build, sin dependencias. Todo el estado vive en
 * memoria del navegador; el servidor es la fuente de verdad y se repregunta
 * por polling (no hay WebSockets en este Worker).
 */

const $ = (sel) => document.querySelector(sel);

const EMOJIS = "😀 😁 😂 🤣 😊 😉 😍 😘 🥰 😎 🤔 🙄 😴 😢 😭 😅 🙏 👍 👎 👏 🙌 💪 🎉 🔥 ✨ ⭐ ❤️ 💚 💙 💛 ☕ 🎁 📦 🚚 ✅ ❌ ⏰ 📍 💰 🃏".split(" ");

const estado = {
  conversaciones: [],
  conversacionActivaId: null,
  filtroSeguimiento: false,
  filtroTexto: "",
  archivoAdjunto: null,
  quickReplies: [],
  login: { mode: "legacy", challengeId: null },
  templateElegido: null,
  miRol: null,
  pollConv: null,
  pollMsg: null
};

function pedir(url, opciones = {}) {
  return fetch(url, { credentials: "same-origin", ...opciones }).then(async (res) => {
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(datos.error || `HTTP ${res.status}`);
    return datos;
  });
}

const iniciales = (nombre) => (nombre || "?").trim().slice(0, 2).toUpperCase();

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

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function iconizar() {
  $("#btn-nuevo-contacto").innerHTML = icon("plus");
  $("#btn-equipo").innerHTML = icon("users");
  $("#btn-salir").innerHTML = icon("logout");
  $(".icono-buscar").innerHTML = icon("search");
  $("#btn-filtro-seguimiento").innerHTML = icon("starOutline") + " Seguimiento";
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
  } catch { /* si falla, se pide solo la contraseña */ }
}

function mostrarPasoCodigo() {
  $("#username").style.display = "none";
  $("#password").style.display = "none";
  $("#code").style.display = "block";
  $("#ayuda-2fa").style.display = "block";
  $("#btn-login").textContent = "Verificar código";
  $("#code").focus();
}

async function mostrarApp() {
  $("#login").style.display = "none";
  $("#app").classList.add("activo");
  const { role } = await pedir("/api/crm/session");
  estado.miRol = role;
  cargarConversaciones();
  cargarQuickReplies();
  clearInterval(estado.pollConv);
  estado.pollConv = setInterval(cargarConversaciones, 4000);
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
      mostrarPasoCodigo();
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

$("#btn-salir").addEventListener("click", async () => {
  await pedir("/api/crm/logout", { method: "POST" });
  clearInterval(estado.pollConv);
  clearInterval(estado.pollMsg);
  mostrarLogin();
});

/* ---------- Lista de conversaciones ---------- */

async function cargarConversaciones() {
  const params = new URLSearchParams();
  if (estado.filtroSeguimiento) params.set("follow_up", "1");
  if (estado.filtroTexto) params.set("q", estado.filtroTexto);

  const { conversations } = await pedir(`/api/crm/conversations?${params}`);
  estado.conversaciones = conversations;
  pintarLista();

  const activa = conversations.find((c) => c.conversation_id === estado.conversacionActivaId);
  if (activa) pintarDetalle(activa);
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
      <div class="avatar">${iniciales(nombre)}</div>
      <div class="conv-info">
        <div class="fila1">
          <span class="nombre">${escapar(nombre)}</span>
          <span class="hora">${horaCorta(c.last_message_at)}</span>
        </div>
        <div class="fila2">
          <span class="preview">${escapar(prefijoYo + previewTexto)}</span>
          ${c.unread_count > 0 ? `<span class="badge">${c.unread_count}</span>` : ""}
          <button class="btn-star ${c.follow_up ? "marcada" : ""}" title="Marcar seguimiento">${icon(c.follow_up ? "star" : "starOutline")}</button>
        </div>
        ${c.ctwa_clid ? `<span class="badge-ad">${icon("megaphone")} ${escapar(c.ad_source_type || "Anuncio")}</span>` : ""}
      </div>`;
    div.querySelector(".conv-info").addEventListener("click", (e) => {
      if (e.target.closest(".btn-star")) return;
      abrirConversacion(c);
    });
    div.querySelector(".btn-star").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSeguimiento(c);
    });
    cont.appendChild(div);
  }
}

async function toggleSeguimiento(c) {
  const nuevo = !c.follow_up;
  c.follow_up = nuevo ? 1 : 0;
  pintarLista();
  const starHeader = $("#star-header");
  if (starHeader && estado.conversacionActivaId === c.conversation_id) starHeader.innerHTML = icon(nuevo ? "star" : "starOutline");
  try {
    await pedir("/api/crm/follow-up", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: c.conversation_id, follow_up: nuevo })
    });
  } catch (err) {
    alert(err.message);
  }
}

$("#buscar").addEventListener("input", debounce((e) => {
  estado.filtroTexto = e.target.value.trim();
  cargarConversaciones();
}, 300));

$("#filtros").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-follow]");
  if (!btn) return;
  document.querySelectorAll("#filtros button").forEach((b) => b.classList.remove("activo"));
  btn.classList.add("activo");
  estado.filtroSeguimiento = btn.dataset.follow === "1";
  cargarConversaciones();
});

/* ---------- Conversación abierta ---------- */

async function abrirConversacion(c) {
  estado.conversacionActivaId = c.conversation_id;
  cancelarAdjunto();
  pintarLista();
  pintarChatBase(c);
  pintarDetalle(c);
  await cargarMensajes();
  clearInterval(estado.pollMsg);
  estado.pollMsg = setInterval(cargarMensajes, 3000);
}

function pintarChatBase(c) {
  const nombre = c.profile_name || c.wa_id;
  $("#chat").innerHTML = `
    <header>
      <div class="avatar">${iniciales(nombre)}</div>
      <div>
        <div class="nombre">${escapar(nombre)}</div>
        <div class="tel">+${escapar(c.wa_id)}</div>
      </div>
      <button class="btn-star" id="star-header" title="Marcar seguimiento">${icon(c.follow_up ? "star" : "starOutline")}</button>
    </header>
    <div id="mensajes"></div>
    <div id="preview-archivo" style="display:none"></div>
    <form id="form-envio">
      <button type="button" class="icono" id="btn-plantillas" title="Mandar plantilla">${icon("doc")}</button>
      <button type="button" class="icono" id="btn-catalogo" title="Mandar catálogo">${icon("bag")}</button>
      <button type="button" class="icono" id="btn-seguimiento" title="Seguimientos programados">${icon("clock")}</button>
      <button type="button" class="icono" id="btn-rapidas" title="Respuestas rápidas">${icon("bolt")}</button>
      <button type="button" class="icono" id="btn-adjuntar" title="Adjuntar foto o video">${icon("paperclip")}</button>
      <input type="file" id="input-archivo" accept="image/*,video/*" style="display:none" />
      <input type="text" id="texto-envio" placeholder="Escribe un mensaje" autocomplete="off" />
      <button type="button" class="icono" id="btn-emoji" title="Emojis">${icon("smile")}</button>
      <button type="submit" class="enviar" title="Enviar">${icon("send")}</button>
      <div id="panel-rapidas"></div>
      <div id="panel-seguimientos"></div>
      <div id="panel-emojis"></div>
    </form>`;
  $("#form-envio").addEventListener("submit", enviarMensaje);
  $("#star-header").addEventListener("click", () => {
    const c2 = estado.conversaciones.find((x) => x.conversation_id === estado.conversacionActivaId);
    if (c2) toggleSeguimiento(c2);
  });
  $("#btn-adjuntar").addEventListener("click", () => $("#input-archivo").click());
  $("#input-archivo").addEventListener("change", onArchivoElegido);
  $("#btn-rapidas").addEventListener("click", (e) => { e.stopPropagation(); cerrarPaneles(["#panel-rapidas"]); toggleQuickPanel(); });
  $("#btn-seguimiento").addEventListener("click", (e) => { e.stopPropagation(); cerrarPaneles(["#panel-seguimientos"]); toggleSeguimientosPanel(); });
  $("#btn-emoji").addEventListener("click", (e) => { e.stopPropagation(); cerrarPaneles(["#panel-emojis"]); toggleEmojiPanel(); });
  $("#btn-plantillas").addEventListener("click", () => abrirModalTemplates());
  $("#btn-catalogo").addEventListener("click", enviarCatalogo);
}

async function enviarCatalogo() {
  if (!confirm("¿Mandar el catálogo completo a este chat?")) return;
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
  }
}

function cerrarPaneles(excepto = []) {
  ["#panel-rapidas", "#panel-seguimientos", "#panel-emojis"].forEach((sel) => {
    if (!excepto.includes(sel)) $(sel)?.classList.remove("abierto");
  });
}

async function cargarMensajes() {
  if (!estado.conversacionActivaId) return;
  const { messages } = await pedir(`/api/crm/messages?conversation_id=${estado.conversacionActivaId}`);
  pintarMensajes(messages);
  const c = estado.conversaciones.find((x) => x.conversation_id === estado.conversacionActivaId);
  if (c) { c.unread_count = 0; pintarLista(); }
}

function contenidoMensaje(m) {
  if (m.type === "image" && (m.media_key || m.media_id)) {
    return `<img src="/api/crm/media?message_id=${m.id}" loading="lazy" alt="foto" />${m.body ? `<div class="caption">${escapar(m.body)}</div>` : ""}`;
  }
  if (m.type === "video" && (m.media_key || m.media_id)) {
    return `<video src="/api/crm/media?message_id=${m.id}" controls></video>${m.body ? `<div class="caption">${escapar(m.body)}</div>` : ""}`;
  }
  if (!m.type || m.type === "text") return escapar(m.body || "");
  if (m.type === "order") return `<span class="tipo">${icon("bag")} Pedido del catálogo: ${escapar(m.body || "")}</span>`;
  return `<span class="tipo">[${escapar(m.type)}]${m.body ? " " + escapar(m.body) : ""}</span>`;
}

function pintarMensajes(mensajes) {
  const cont = $("#mensajes");
  if (!cont) return;
  const abajo = cont.scrollTop + cont.clientHeight >= cont.scrollHeight - 40;
  cont.innerHTML = mensajes.map((m) => `
    <div class="msg ${m.direction}">
      ${contenidoMensaje(m)}
      <span class="hora">${m.sent_by ? escapar(m.sent_by) + " · " : ""}${horaCorta(m.created_at)}</span>
    </div>`).join("");
  if (abajo || mensajes.length <= 20) cont.scrollTop = cont.scrollHeight;
}

/* ---------- Adjuntar y enviar ---------- */

function onArchivoElegido(e) {
  const file = e.target.files[0];
  if (!file) return;
  const tipo = file.type.startsWith("video/") ? "video" : "image";
  const previewUrl = URL.createObjectURL(file);
  estado.archivoAdjunto = { file, tipo, previewUrl };
  pintarPreviewArchivo();
}

function pintarPreviewArchivo() {
  const cont = $("#preview-archivo");
  const a = estado.archivoAdjunto;
  if (!a) { cont.style.display = "none"; cont.innerHTML = ""; return; }
  cont.style.display = "flex";
  cont.innerHTML = `
    ${a.tipo === "video" ? `<video src="${a.previewUrl}"></video>` : `<img src="${a.previewUrl}" />`}
    <span>${escapar(a.file.name)}</span>
    <button type="button" id="quitar-archivo">Quitar</button>`;
  $("#quitar-archivo").addEventListener("click", cancelarAdjunto);
}

function cancelarAdjunto() {
  if (estado.archivoAdjunto) URL.revokeObjectURL(estado.archivoAdjunto.previewUrl);
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
  if (!texto && !adjunto) return;

  input.disabled = true;
  const btnEnviar = $("#form-envio button.enviar");
  btnEnviar.disabled = true;

  try {
    if (adjunto) {
      const { media_key, type } = await subirArchivo(adjunto.file);
      await pedir("/api/crm/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: estado.conversacionActivaId, media_key, media_type: type, caption: texto })
      });
      cancelarAdjunto();
    } else {
      await pedir("/api/crm/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: estado.conversacionActivaId, body: texto })
      });
    }
    input.value = "";
    await cargarMensajes();
    await cargarConversaciones();
  } catch (err) {
    alert(err.message);
  } finally {
    input.disabled = false;
    btnEnviar.disabled = false;
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
  if (!e.target.closest("#panel-rapidas, #btn-rapidas, #panel-seguimientos, #btn-seguimiento, #panel-emojis, #btn-emoji")) {
    cerrarPaneles();
  }
});

/* ---------- Respuestas rápidas ---------- */

async function cargarQuickReplies() {
  const { quick_replies } = await pedir("/api/crm/quick-replies");
  estado.quickReplies = quick_replies;
}

function toggleQuickPanel() {
  const panel = $("#panel-rapidas");
  if (!panel) return;
  panel.classList.toggle("abierto");
  pintarQuickPanel();
}

function pintarQuickPanel() {
  const panel = $("#panel-rapidas");
  if (!panel) return;
  panel.innerHTML = estado.quickReplies.map((q) => `
    <div class="item" data-id="${q.id}">
      <div>
        <div class="titulo">${q.media_type ? icon(q.media_type === "video" ? "video" : "image") + " " : ""}${escapar(q.title)}</div>
        ${q.body ? `<div class="cuerpo">${escapar(q.body)}</div>` : ""}
      </div>
      <button class="borrar" data-id="${q.id}" title="Borrar">${icon("close")}</button>
    </div>`).join("") + `<footer><button id="nueva-rapida">${icon("plus")} Nueva respuesta rápida</button></footer>`;

  panel.querySelectorAll(".item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".borrar")) return;
      const q = estado.quickReplies.find((x) => x.id === Number(el.dataset.id));
      if (q) enviarQuickReply(q);
    });
  });
  panel.querySelectorAll(".borrar").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
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
    $("#modal-rapida-fondo").classList.add("abierto");
  });
}

async function enviarQuickReply(q) {
  $("#panel-rapidas").classList.remove("abierto");
  try {
    await pedir("/api/crm/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        q.media_key
          ? { conversation_id: estado.conversacionActivaId, media_key: q.media_key, media_type: q.media_type, caption: q.body || undefined }
          : { conversation_id: estado.conversacionActivaId, body: q.body }
      )
    });
    await cargarMensajes();
    await cargarConversaciones();
  } catch (err) {
    alert(err.message);
  }
}

$("#rapida-cancelar").addEventListener("click", () => {
  $("#modal-rapida-fondo").classList.remove("abierto");
  $("#rapida-titulo").value = "";
  $("#rapida-texto").value = "";
  $("#rapida-archivo").value = "";
});

$("#rapida-crear").addEventListener("click", async () => {
  const title = $("#rapida-titulo").value.trim();
  const body = $("#rapida-texto").value.trim();
  const file = $("#rapida-archivo").files[0];
  if (!title) return alert("Ponle un título.");
  if (!body && !file) return alert("Necesita texto o un archivo.");

  const btn = $("#rapida-crear");
  btn.disabled = true;
  try {
    let media_key = null, media_type = null, media_mime = null;
    if (file) {
      const subida = await subirArchivo(file);
      media_key = subida.media_key;
      media_type = subida.type;
      media_mime = subida.mime;
    }
    await pedir("/api/crm/quick-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, media_key, media_type, media_mime })
    });
    await cargarQuickReplies();
    $("#modal-rapida-fondo").classList.remove("abierto");
    $("#rapida-titulo").value = "";
    $("#rapida-texto").value = "";
    $("#rapida-archivo").value = "";
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Seguimientos programados ---------- */

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
        <div class="titulo">${icon("clock")} ${fechaCorta(s.send_at)}</div>
        <div class="cuerpo">${escapar(s.body || s.quick_reply_title || "")}</div>
      </div>
      <button class="borrar" data-id="${s.id}" title="Cancelar">${icon("close")}</button>
    </div>`).join("") : `<div class="item"><div class="cuerpo">Sin seguimientos programados.</div></div>`)
    + `<footer><button id="nuevo-seguimiento">${icon("plus")} Programar seguimiento</button></footer>`;

  panel.querySelectorAll(".borrar").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await pedir("/api/crm/scheduled", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(btn.dataset.id) })
      });
      await pintarSeguimientosPanel();
    });
  });
  $("#nuevo-seguimiento")?.addEventListener("click", () => {
    panel.classList.remove("abierto");
    const sel = $("#seg-rapida");
    sel.innerHTML = `<option value="">— o una respuesta rápida guardada —</option>` +
      estado.quickReplies.map((q) => `<option value="${q.id}">${escapar(q.title)}</option>`).join("");
    $("#modal-seguimiento-fondo").classList.add("abierto");
  });
}

$("#seg-cancelar").addEventListener("click", () => {
  $("#modal-seguimiento-fondo").classList.remove("abierto");
  $("#seg-fecha").value = "";
  $("#seg-texto").value = "";
});

$("#seg-crear").addEventListener("click", async () => {
  const fecha = $("#seg-fecha").value;
  const texto = $("#seg-texto").value.trim();
  const quickReplyId = $("#seg-rapida").value;
  if (!fecha) return alert("Elige fecha y hora.");
  if (!texto && !quickReplyId) return alert("Escribe un texto o elige una respuesta rápida.");

  try {
    await pedir("/api/crm/scheduled", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: estado.conversacionActivaId,
        send_at: new Date(fecha).toISOString(),
        body: texto || undefined,
        quick_reply_id: quickReplyId || undefined
      })
    });
    $("#modal-seguimiento-fondo").classList.remove("abierto");
    $("#seg-fecha").value = "";
    $("#seg-texto").value = "";
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
      ${esAdmin ? `<button data-id="${a.id}" data-active="${a.active ? 0 : 1}" class="${a.active ? "" : "inactiva"}">${a.active ? "Desactivar" : "Activar"}</button>` : ""}
    </div>`).join("") || `<p class="ayuda-modal">${esAdmin ? "Todavía no hay vendedores — usa el formulario de abajo para crear el primero (puedes crear tu propia cuenta)." : "Todavía no hay vendedores."}</p>`;

  cont.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await pedir("/api/crm/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(btn.dataset.id), active: btn.dataset.active === "1" })
      });
      await pintarEquipo();
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

async function abrirModalTemplates() {
  $("#modal-templates-fondo").classList.add("abierto");
  $("#form-template-params").style.display = "none";
  const cont = $("#lista-templates");
  cont.innerHTML = "Cargando…";
  try {
    const { templates } = await pedir("/api/crm/templates");
    if (!templates.length) {
      cont.innerHTML = `<p class="ayuda-modal">No hay plantillas aprobadas todavía. Créalas en WhatsApp Manager → Message Templates.</p>`;
      return;
    }
    cont.innerHTML = templates.map((t, i) => `
      <div class="fila-template" data-i="${i}" style="cursor:pointer">
        <div>
          <div class="nombre">${escapar(t.name)}</div>
          <div class="sub">${escapar(t.category)} · ${escapar(t.language)}</div>
        </div>
      </div>`).join("");
    cont.querySelectorAll(".fila-template").forEach((el) => {
      el.addEventListener("click", () => elegirTemplate(templates[Number(el.dataset.i)]));
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
    <div class="avatar">${iniciales(nombre)}</div>
    <div class="nombre-contacto">${escapar(nombre)}</div>
    <div class="tel-contacto">+${escapar(c.wa_id)}</div>

    <h2>Origen</h2>
    ${tieneAd ? `
      <div class="ad-card">
        <div class="titulo">${icon("megaphone")} Vino de un anuncio</div>
        ${c.ad_headline ? `<div>${escapar(c.ad_headline)}</div>` : ""}
        ${c.ad_source_type ? `<div>Tipo: ${escapar(c.ad_source_type)}</div>` : ""}
        ${c.ctwa_clid ? `<div style="word-break:break-all">ctwa_clid: ${escapar(c.ctwa_clid)}</div>` : ""}
      </div>` : `<div class="sin-ad">Chat directo, sin anuncio detectado.</div>`}

    <h2>Pedidos del catálogo</h2>
    <div id="detalle-pedidos">Cargando…</div>
  `;

  try {
    const { orders } = await pedir(`/api/crm/catalog?conversation_id=${c.conversation_id}`);
    const cont = $("#detalle-pedidos");
    if (!cont) return;
    cont.innerHTML = orders.length ? orders.map((o) => `
      <div class="ad-card" style="margin-bottom:8px">
        <div class="titulo">${icon("bag")} ${fechaCorta(o.created_at)}</div>
        ${o.items.map((i) => `<div>${i.quantity}× ${escapar(i.product_retailer_id)} — ${i.item_price ?? ""} ${escapar(o.currency || "")}</div>`).join("")}
        ${o.total_amount ? `<div><strong>Total: ${o.total_amount} ${escapar(o.currency || "")}</strong></div>` : ""}
      </div>`).join("") : `<div class="sin-ad">Sin pedidos de catálogo todavía.</div>`;
  } catch { /* silencioso: no es crítico si esto no carga */ }
}

revisarSesion();

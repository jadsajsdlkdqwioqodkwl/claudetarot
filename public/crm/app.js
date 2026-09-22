/**
 * CRM de WhatsApp — sin build, sin dependencias. Todo el estado vive en
 * memoria del navegador; el servidor es la fuente de verdad y se repregunta
 * por polling (no hay WebSockets en este Worker).
 */

const $ = (sel) => document.querySelector(sel);

const estado = {
  conversaciones: [],
  conversacionActivaId: null,
  filtroSeguimiento: false,
  filtroTexto: "",
  archivoAdjunto: null, // { file, tipo, previewUrl }
  quickReplies: [],
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

function iniciales(nombre) {
  return (nombre || "?").trim().slice(0, 2).toUpperCase();
}

function horaCorta(iso) {
  if (!iso) return "";
  const d = new Date(iso.includes("Z") || iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* ---------- Login ---------- */

async function revisarSesion() {
  const { authenticated } = await pedir("/api/crm/session");
  if (authenticated) return mostrarApp();
  mostrarLogin();
}

async function mostrarLogin() {
  $("#login").style.display = "flex";
  $("#app").classList.remove("activo");
  try {
    const { requiere2FA } = await pedir("/api/crm/login-info");
    $("#code").style.display = requiere2FA ? "block" : "none";
    $("#ayuda-2fa").style.display = requiere2FA ? "block" : "none";
  } catch { /* si falla, se pide solo la contraseña */ }
}

function mostrarApp() {
  $("#login").style.display = "none";
  $("#app").classList.add("activo");
  cargarConversaciones();
  cargarQuickReplies();
  clearInterval(estado.pollConv);
  estado.pollConv = setInterval(cargarConversaciones, 4000);
}

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  try {
    await pedir("/api/crm/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: $("#password").value, code: $("#code").value })
    });
    $("#password").value = "";
    $("#code").value = "";
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

    const previewTexto = c.last_type === "text" || !c.last_type ? (c.last_body || "") : `📎 ${c.last_type}`;
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
          <button class="btn-star ${c.follow_up ? "marcada" : ""}" data-id="${c.conversation_id}" title="Marcar seguimiento">★</button>
        </div>
        ${c.ctwa_clid ? `<span class="badge-ad">📢 ${escapar(c.ad_source_type || "Anuncio")}</span>` : ""}
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
  if (estado.conversacionActivaId === c.conversation_id) pintarDetalle(c);
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
      <button class="btn-star ${c.follow_up ? "marcada" : ""}" id="star-header" title="Marcar seguimiento">★</button>
    </header>
    <div id="mensajes"></div>
    <div id="preview-archivo" style="display:none"></div>
    <form id="form-envio">
      <button type="button" class="icono" id="btn-rapidas" title="Respuestas rápidas">⚡</button>
      <button type="button" class="icono" id="btn-adjuntar" title="Adjuntar foto o video">📎</button>
      <input type="file" id="input-archivo" accept="image/*,video/*" style="display:none" />
      <input type="text" id="texto-envio" placeholder="Escribe un mensaje" autocomplete="off" />
      <button type="submit" class="enviar">➤</button>
      <div id="panel-rapidas"></div>
    </form>`;
  $("#form-envio").addEventListener("submit", enviarMensaje);
  $("#star-header").addEventListener("click", () => {
    const c2 = estado.conversaciones.find((x) => x.conversation_id === estado.conversacionActivaId);
    if (c2) toggleSeguimiento(c2);
  });
  $("#btn-adjuntar").addEventListener("click", () => $("#input-archivo").click());
  $("#input-archivo").addEventListener("change", onArchivoElegido);
  $("#btn-rapidas").addEventListener("click", (e) => { e.stopPropagation(); toggleQuickPanel(); });
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
  return `<span class="tipo">📎 ${escapar(m.type)}${m.body ? ": " + escapar(m.body) : ""}</span>`;
}

function pintarMensajes(mensajes) {
  const cont = $("#mensajes");
  if (!cont) return;
  const abajo = cont.scrollTop + cont.clientHeight >= cont.scrollHeight - 40;
  cont.innerHTML = mensajes.map((m) => `
    <div class="msg ${m.direction}">
      ${contenidoMensaje(m)}
      <span class="hora">${horaCorta(m.created_at)}</span>
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
        <div class="titulo">${q.media_type ? (q.media_type === "video" ? "🎬 " : "🖼️ ") : ""}${escapar(q.title)}</div>
        ${q.body ? `<div class="cuerpo">${escapar(q.body)}</div>` : ""}
      </div>
      <button class="borrar" data-id="${q.id}" title="Borrar">✕</button>
    </div>`).join("") + `<footer><button id="nueva-rapida">+ Nueva respuesta rápida</button></footer>`;

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

document.addEventListener("click", (e) => {
  const panel = $("#panel-rapidas");
  if (panel && panel.classList.contains("abierto") && !e.target.closest("#panel-rapidas") && !e.target.closest("#btn-rapidas")) {
    panel.classList.remove("abierto");
  }
});

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

/* ---------- Panel de detalle ---------- */

function pintarDetalle(c) {
  const nombre = c.profile_name || c.wa_id;
  const tieneAd = Boolean(c.ctwa_clid || c.ad_source_type);
  $("#detalle").innerHTML = `
    <div class="avatar">${iniciales(nombre)}</div>
    <div class="nombre-contacto">${escapar(nombre)}</div>
    <div class="tel-contacto">+${escapar(c.wa_id)}</div>

    <h2>Origen</h2>
    ${tieneAd ? `
      <div class="ad-card">
        <div class="titulo">📢 Vino de un anuncio</div>
        ${c.ad_headline ? `<div>${escapar(c.ad_headline)}</div>` : ""}
        ${c.ad_source_type ? `<div>Tipo: ${escapar(c.ad_source_type)}</div>` : ""}
        ${c.ctwa_clid ? `<div style="word-break:break-all">ctwa_clid: ${escapar(c.ctwa_clid)}</div>` : ""}
      </div>` : `<div class="sin-ad">Chat directo, sin anuncio detectado.</div>`}
  `;
}

revisarSesion();

/**
 * CRM de WhatsApp — sin build, sin dependencias. Todo el estado vive en
 * memoria del navegador; el servidor es la fuente de verdad y se repregunta
 * por polling (no hay WebSockets en este Worker).
 */

const $ = (sel) => document.querySelector(sel);

const EMOJIS = "😀 😁 😂 🤣 😊 😉 😍 😘 🥰 😎 🤔 🙄 😴 😢 😭 😅 🙏 👍 👎 👏 🙌 💪 🎉 🔥 ✨ ⭐ ❤️ 💚 💙 💛 ☕ 🎁 📦 🚚 ✅ ❌ ⏰ 📍 💰 🃏".split(" ");
const PAGINA_MENSAJES = 50;

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
  filtroRapidas: "",
  rapidasPorSlash: false,
  bienvenidaQuickReplyId: null,
  mensajesCargados: [],
  hayMasAntiguos: false,
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
  const { role, displayName } = await pedir("/api/crm/session");
  estado.miRol = role;
  // Para que quede clarísimo con qué cuenta estás — el panel de "Probar
  // bienvenida" y de Equipo solo salen con role "admin", y esto evita
  // preguntarse por qué no aparecen si entraste con otra cuenta.
  $("#sesion-actual").textContent = `${displayName || "Modo administrador"} · ${role === "admin" ? "admin" : "vendedor"}`;
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
  estado.mensajesCargados = [];
  estado.hayMasAntiguos = false;
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
    <div id="zona-arrastre">Suelta la foto o el video acá</div>
    <div id="preview-archivo" style="display:none"></div>
    <form id="form-envio">
      <button type="button" class="icono" id="btn-plantillas" title="Mandar plantilla">${icon("doc")}</button>
      <button type="button" class="icono" id="btn-catalogo" title="Mandar catálogo">${icon("bag")}</button>
      <button type="button" class="icono" id="btn-seguimiento" title="Seguimientos programados">${icon("clock")}</button>
      <button type="button" class="icono" id="btn-rapidas" title="Respuestas rápidas">${icon("bolt")}</button>
      <button type="button" class="icono" id="btn-adjuntar" title="Adjuntar foto o video">${icon("paperclip")}</button>
      <input type="file" id="input-archivo" accept="image/*,video/*" style="display:none" />
      <textarea id="texto-envio" placeholder="Escribe un mensaje — Enter manda, Shift+Enter hace un salto de línea" rows="1" autocomplete="off"></textarea>
      <button type="button" class="icono" id="btn-emoji" title="Emojis">${icon("smile")}</button>
      <button type="submit" class="enviar" title="Enviar">${icon("send")}</button>
      <div id="panel-rapidas"></div>
      <div id="panel-seguimientos"></div>
      <div id="panel-emojis"></div>
      <div id="panel-catalogo"></div>
    </form>`;
  $("#form-envio").addEventListener("submit", enviarMensaje);
  $("#star-header").addEventListener("click", () => {
    const c2 = estado.conversaciones.find((x) => x.conversation_id === estado.conversacionActivaId);
    if (c2) toggleSeguimiento(c2);
  });
  $("#btn-adjuntar").addEventListener("click", () => $("#input-archivo").click());
  $("#input-archivo").addEventListener("change", onArchivoElegido);

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
  $("#btn-emoji").addEventListener("click", (e) => { e.stopPropagation(); cerrarPaneles(["#panel-emojis"]); toggleEmojiPanel(); });
  $("#btn-plantillas").addEventListener("click", () => abrirModalTemplates());
  $("#btn-catalogo").addEventListener("click", (e) => { e.stopPropagation(); cerrarPaneles(["#panel-catalogo"]); toggleCatalogoPanel(); });
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
  ["#panel-rapidas", "#panel-seguimientos", "#panel-emojis", "#panel-catalogo"].forEach((sel) => {
    if (!excepto.includes(sel)) $(sel)?.classList.remove("abierto");
  });
}

async function cargarMensajes() {
  if (!estado.conversacionActivaId) return;
  const yaPagino = estado.mensajesCargados.length > PAGINA_MENSAJES;
  const { messages, hay_mas } = await pedir(`/api/crm/messages?conversation_id=${estado.conversacionActivaId}`);

  // Se mezcla con lo ya cargado (en vez de reemplazar) para no perder los
  // mensajes antiguos que el vendedor ya pidió con "Cargar anteriores".
  const mapa = new Map(estado.mensajesCargados.map((m) => [m.id, m]));
  for (const m of messages) mapa.set(m.id, m);
  estado.mensajesCargados = [...mapa.values()].sort((a, b) => a.id - b.id);
  if (!yaPagino) estado.hayMasAntiguos = hay_mas;

  pintarMensajes();
  const c = estado.conversaciones.find((x) => x.conversation_id === estado.conversacionActivaId);
  if (c) { c.unread_count = 0; pintarLista(); }
  actualizarPedidosPanel();
}

async function cargarMensajesAnteriores() {
  if (!estado.conversacionActivaId || !estado.mensajesCargados.length) return;
  const btn = $("#cargar-anteriores button");
  if (btn) { btn.disabled = true; btn.textContent = "Cargando…"; }

  const primerId = estado.mensajesCargados[0].id;
  const cont = $("#mensajes");
  const alturaPrevia = cont.scrollHeight;

  const { messages, hay_mas } = await pedir(`/api/crm/messages?conversation_id=${estado.conversacionActivaId}&before_id=${primerId}`);
  estado.mensajesCargados = [...messages, ...estado.mensajesCargados];
  estado.hayMasAntiguos = hay_mas;
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

function contenidoMensaje(m) {
  if (m.type === "image" && (m.media_key || m.media_id)) {
    return `<img src="/api/crm/media?message_id=${m.id}" loading="lazy" alt="foto" />${m.body ? `<div class="caption">${escapar(m.body)}</div>` : ""}`;
  }
  if (m.type === "video" && (m.media_key || m.media_id)) {
    return `<video src="/api/crm/media?message_id=${m.id}" controls></video>${m.body ? `<div class="caption">${escapar(m.body)}</div>` : ""}`;
  }
  if (!m.type || m.type === "text") return escapar(m.body || "");
  if (m.type === "order") return `<div class="tarjeta-especial tarjeta-pedido">${icon("bag")} <strong>Pedido del catálogo</strong><div>${escapar(m.body || "")}</div></div>`;
  if (m.type === "catalog") return `<div class="tarjeta-especial tarjeta-catalogo">${icon("bag")} Catálogo enviado</div>`;
  if (m.type === "product") return `<div class="tarjeta-especial tarjeta-catalogo">${icon("tag")} ${escapar(m.body || "Producto enviado")}</div>`;
  return `<span class="tipo">[${escapar(m.type)}]${m.body ? " " + escapar(m.body) : ""}</span>`;
}

function pintarMensajes() {
  const cont = $("#mensajes");
  if (!cont) return;
  const mensajes = estado.mensajesCargados;
  const abajo = cont.scrollTop + cont.clientHeight >= cont.scrollHeight - 40;

  cont.innerHTML = (estado.hayMasAntiguos
    ? `<div id="cargar-anteriores"><button type="button">Cargar mensajes anteriores</button></div>`
    : "") + mensajes.map((m) => `
    <div class="msg ${m.direction}">
      ${contenidoMensaje(m)}
      <span class="hora">${m.sent_by ? escapar(m.sent_by) + " · " : ""}${horaCorta(m.created_at)}</span>
    </div>`).join("");

  $("#cargar-anteriores button")?.addEventListener("click", cargarMensajesAnteriores);
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
  mostrarEnviando(true);

  try {
    if (adjunto) {
      const { media_key, type, original_name } = await subirArchivo(adjunto.file);
      await pedir("/api/crm/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `caption` es lo único que ve el cliente en WhatsApp — nunca el
        // nombre del archivo. `file_name` solo queda en el registro interno
        // (y de ahí al reporte de Sheets), el cliente nunca lo ve.
        body: JSON.stringify({ conversation_id: estado.conversacionActivaId, media_key, media_type: type, caption: texto || undefined, file_name: original_name })
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
  if (!e.target.closest("#panel-rapidas, #btn-rapidas, #panel-seguimientos, #btn-seguimiento, #panel-emojis, #btn-emoji, #panel-catalogo, #btn-catalogo")) {
    cerrarPaneles();
  }
});

/* ---------- Respuestas rápidas ---------- */

async function cargarQuickReplies() {
  const { quick_replies } = await pedir("/api/crm/quick-replies");
  estado.quickReplies = quick_replies;
  try {
    const { ad_welcome_quick_reply_id } = await pedir("/api/crm/settings");
    estado.bienvenidaQuickReplyId = ad_welcome_quick_reply_id;
  } catch { /* no crítico */ }
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
      const esBienvenida = estado.bienvenidaQuickReplyId === q.id;
      return `
      <div class="item" data-id="${q.id}">
        ${foto ? `<img class="miniatura" src="/api/crm/media?key=${encodeURIComponent(foto.media_key)}" alt="" />`
               : q.media.length === 0 ? "" : `<div class="miniatura">${icon("image")}</div>`}
        <div style="flex:1">
          <div class="titulo">${q.media.length ? icon(q.media.length > 1 ? "image" : (q.media[0].media_type === "video" ? "video" : "image")) + (q.media.length > 1 ? ` ×${q.media.length} ` : " ") : ""}${escapar(q.title)}</div>
          ${q.body ? `<div class="cuerpo">${escapar(q.body)}</div>` : ""}
        </div>
        ${esAdmin ? `<button class="estrella-bienvenida ${esBienvenida ? "activa" : ""}" data-id="${q.id}" title="Usar como bienvenida de anuncios">${icon(esBienvenida ? "star" : "starOutline")}</button>` : ""}
        <button class="borrar" data-id="${q.id}" title="Borrar">${icon("close")}</button>
      </div>`;
    }).join("") || `<div class="item"><div class="cuerpo">Sin resultados.</div></div>`}
    <footer>
      <button id="nueva-rapida">${icon("plus")} Nueva respuesta rápida</button>
      ${esAdmin ? `<button id="probar-bienvenida" style="margin-top:6px">${icon("bolt")} Probar bienvenida en un número</button>` : ""}
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
      if (e.target.closest(".borrar, .estrella-bienvenida")) return;
      const q = estado.quickReplies.find((x) => x.id === Number(el.dataset.id));
      if (q) enviarQuickReply(q);
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
  panel.querySelectorAll(".estrella-bienvenida").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const nuevo = estado.bienvenidaQuickReplyId === id ? null : id;
      estado.bienvenidaQuickReplyId = nuevo;
      pintarQuickPanel();
      await pedir("/api/crm/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ad_welcome_quick_reply_id: nuevo })
      }).catch((err) => alert(err.message));
    });
  });
  $("#nueva-rapida")?.addEventListener("click", () => {
    panel.classList.remove("abierto");
    $("#modal-rapida-fondo").classList.add("abierto");
  });
  $("#probar-bienvenida")?.addEventListener("click", probarBienvenida);
}

async function probarBienvenida() {
  const wa = prompt("¿A qué WhatsApp mando la bienvenida de prueba? (con código de país, ej. 51987654321)\n\nOjo: ese número tiene que haberte escrito antes al menos una vez, para que la ventana de 24h esté abierta.");
  if (!wa) return;
  try {
    await pedir("/api/crm/test-welcome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wa_id: wa.replace(/\D/g, "") })
    });
    alert("Bienvenida de prueba mandada — revisa ese WhatsApp.");
  } catch (err) {
    alert(err.message);
  }
}

async function enviarQuickReply(q) {
  $("#panel-rapidas").classList.remove("abierto");
  estado.rapidasPorSlash = false;
  const input = $("#texto-envio");
  if (input) input.value = "";
  mostrarEnviando(true);
  try {
    if (q.media.length) {
      // Todas a la vez, no una por una: la API las procesa en paralelo y
      // llegan casi juntas — WhatsApp igual manda una notificación por
      // foto, eso lo decide el celular del cliente, no la API.
      const resultados = await Promise.allSettled(q.media.map((m) =>
        pedir("/api/crm/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: estado.conversacionActivaId, media_key: m.media_key, media_type: m.media_type })
        })
      ));
      const fallidas = resultados.filter((r) => r.status === "rejected");

      if (q.body) {
        await pedir("/api/crm/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: estado.conversacionActivaId, body: q.body })
        });
      }
      await cargarMensajes();
      await cargarConversaciones();
      if (fallidas.length) {
        alert(`Se mandaron ${q.media.length - fallidas.length} de ${q.media.length} — falló: ${fallidas[0].reason.message}`);
      }
      return;
    }

    await pedir("/api/crm/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: estado.conversacionActivaId, body: q.body })
    });
    await cargarMensajes();
    await cargarConversaciones();
  } catch (err) {
    alert(err.message);
  } finally {
    mostrarEnviando(false);
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
  const files = [...$("#rapida-archivo").files];
  if (!title) return alert("Ponle un título.");
  if (!body && !files.length) return alert("Necesita texto o al menos un archivo.");

  const btn = $("#rapida-crear");
  btn.disabled = true;
  btn.textContent = "Subiendo…";
  try {
    const media_keys = [];
    for (const file of files) {
      const subida = await subirArchivo(file);
      media_keys.push({ media_key: subida.media_key, media_type: subida.type, media_mime: subida.mime });
    }
    await pedir("/api/crm/quick-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, media_keys })
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
    btn.textContent = "Guardar";
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

  if (esAdmin) {
    $("#eq-probar-bienvenida")?.remove();
    const btn = document.createElement("button");
    btn.id = "eq-probar-bienvenida";
    btn.className = "cancelar";
    btn.type = "button";
    btn.style.marginTop = "10px";
    btn.style.width = "100%";
    btn.innerHTML = `${icon("bolt")} Probar bienvenida de anuncios en un número`;
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.gap = "6px";
    btn.addEventListener("click", probarBienvenida);
    cont.after(btn);
  }
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

  await actualizarPedidosPanel();
}

revisarSesion();

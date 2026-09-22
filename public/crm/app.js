/**
 * CRM de WhatsApp — sin build, sin dependencias. Todo el estado vive en
 * memoria del navegador; el servidor es la fuente de verdad y se repregunta
 * por polling (no hay WebSockets en este Worker).
 */

const $ = (sel) => document.querySelector(sel);
const ETAPAS = ["nuevo", "contactado", "negociando", "ganado", "perdido"];

const estado = {
  conversaciones: [],
  conversacionActivaId: null,
  filtroStage: "",
  filtroTexto: "",
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

/* ---------- Login ---------- */

async function revisarSesion() {
  const { authenticated } = await pedir("/api/crm/session");
  if (authenticated) mostrarApp();
  else mostrarLogin();
}

function mostrarLogin() {
  $("#login").style.display = "flex";
  $("#app").classList.remove("activo");
}

function mostrarApp() {
  $("#login").style.display = "none";
  $("#app").classList.add("activo");
  cargarConversaciones();
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
      body: JSON.stringify({ password: $("#password").value })
    });
    $("#password").value = "";
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
  if (estado.filtroStage) params.set("stage", estado.filtroStage);
  if (estado.filtroTexto) params.set("q", estado.filtroTexto);

  const { conversations } = await pedir(`/api/crm/conversations?${params}`);
  estado.conversaciones = conversations;
  pintarLista();
}

function pintarLista() {
  const cont = $("#conversaciones");
  cont.innerHTML = "";
  for (const c of estado.conversaciones) {
    const nombre = c.name || c.profile_name || c.wa_id;
    const div = document.createElement("div");
    div.className = "conv-item" + (c.conversation_id === estado.conversacionActivaId ? " activo" : "");
    div.dataset.id = c.conversation_id;

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
        </div>
        <span class="etiqueta">${c.stage}</span>
      </div>`;
    div.addEventListener("click", () => abrirConversacion(c));
    cont.appendChild(div);
  }
}

$("#buscar").addEventListener("input", debounce((e) => {
  estado.filtroTexto = e.target.value.trim();
  cargarConversaciones();
}, 300));

$("#filtros").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-stage]");
  if (!btn) return;
  document.querySelectorAll("#filtros button").forEach((b) => b.classList.remove("activo"));
  btn.classList.add("activo");
  estado.filtroStage = btn.dataset.stage;
  cargarConversaciones();
});

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Conversación abierta ---------- */

async function abrirConversacion(c) {
  estado.conversacionActivaId = c.conversation_id;
  pintarLista();
  pintarChatBase(c);
  pintarDetalle(c);
  await cargarMensajes();
  clearInterval(estado.pollMsg);
  estado.pollMsg = setInterval(cargarMensajes, 3000);
}

function pintarChatBase(c) {
  const nombre = c.name || c.profile_name || c.wa_id;
  $("#chat").innerHTML = `
    <header>
      <div class="avatar">${iniciales(nombre)}</div>
      <div>
        <div class="nombre">${escapar(nombre)}</div>
        <div class="tel">+${escapar(c.wa_id)}</div>
      </div>
    </header>
    <div id="mensajes"></div>
    <form id="form-envio">
      <input type="text" id="texto-envio" placeholder="Escribe un mensaje" autocomplete="off" />
      <button type="submit">➤</button>
    </form>`;
  $("#form-envio").addEventListener("submit", enviarMensaje);
}

async function cargarMensajes() {
  if (!estado.conversacionActivaId) return;
  const { messages } = await pedir(`/api/crm/messages?conversation_id=${estado.conversacionActivaId}`);
  pintarMensajes(messages);
  // El contador de no leídos ya bajó a 0 en el servidor; refleja eso en la lista sin re-pedir.
  const c = estado.conversaciones.find((x) => x.conversation_id === estado.conversacionActivaId);
  if (c) { c.unread_count = 0; pintarLista(); }
}

function pintarMensajes(mensajes) {
  const cont = $("#mensajes");
  if (!cont) return;
  const abajo = cont.scrollTop + cont.clientHeight >= cont.scrollHeight - 40;
  cont.innerHTML = mensajes.map((m) => `
    <div class="msg ${m.direction}">
      ${m.type === "text" || !m.type
        ? escapar(m.body || "")
        : `<span class="tipo">📎 ${escapar(m.type)}${m.body ? ": " + escapar(m.body) : ""}</span>`}
      <span class="hora">${horaCorta(m.created_at)}</span>
    </div>`).join("");
  if (abajo || mensajes.length <= 20) cont.scrollTop = cont.scrollHeight;
}

async function enviarMensaje(e) {
  e.preventDefault();
  const input = $("#texto-envio");
  const texto = input.value.trim();
  if (!texto) return;
  input.disabled = true;
  try {
    await pedir("/api/crm/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: estado.conversacionActivaId, body: texto })
    });
    input.value = "";
    await cargarMensajes();
    await cargarConversaciones();
  } catch (err) {
    alert(err.message);
  } finally {
    input.disabled = false;
    input.focus();
  }
}

/* ---------- Panel de detalle / pipeline ---------- */

function pintarDetalle(c) {
  const nombre = c.name || c.profile_name || c.wa_id;
  $("#detalle").innerHTML = `
    <div class="avatar">${iniciales(nombre)}</div>
    <div class="nombre-contacto">${escapar(nombre)}</div>
    <div class="tel-contacto">+${escapar(c.wa_id)}</div>

    <h2>Nombre</h2>
    <input type="text" id="det-nombre" value="${escapar(c.name || "")}" placeholder="${escapar(c.profile_name || "")}" />

    <h2>Etapa</h2>
    <select id="det-stage">
      ${ETAPAS.map((et) => `<option value="${et}" ${et === c.stage ? "selected" : ""}>${et}</option>`).join("")}
    </select>

    <h2>Tags</h2>
    <input type="text" id="det-tags" value="" placeholder="vip, mayorista…" />

    <h2>Notas</h2>
    <textarea id="det-notas" placeholder="Notas internas de venta…"></textarea>

    <button class="guardar" id="det-guardar">Guardar</button>
  `;
  cargarDetalleContacto(c.contact_id);
  $("#det-guardar").addEventListener("click", () => guardarDetalle(c.contact_id));
}

async function cargarDetalleContacto(contactId) {
  // Los campos ya vienen de /conversations salvo tags/notas completas; para no
  // duplicar endpoint, se reusan los datos ya cargados en `estado`.
  const c = estado.conversaciones.find((x) => x.contact_id === contactId);
  if (!c) return;
  if (c.notes) $("#det-notas").value = c.notes;
  if (c.tags) $("#det-tags").value = c.tags;
}

async function guardarDetalle(contactId) {
  const btn = $("#det-guardar");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    const { contact } = await pedir("/api/crm/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: contactId,
        name: $("#det-nombre").value,
        stage: $("#det-stage").value,
        notes: $("#det-notas").value,
        tags: $("#det-tags").value
      })
    });
    const c = estado.conversaciones.find((x) => x.contact_id === contactId);
    if (c) Object.assign(c, { name: contact.name, stage: contact.stage, notes: contact.notes, tags: contact.tags });
    pintarLista();
    btn.textContent = "Guardado ✓";
  } catch (err) {
    alert(err.message);
    btn.textContent = "Guardar";
  } finally {
    btn.disabled = false;
    setTimeout(() => { btn.textContent = "Guardar"; }, 1500);
  }
}

revisarSesion();

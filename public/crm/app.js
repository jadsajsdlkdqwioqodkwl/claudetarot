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
  olvide: { resetId: null },
  templateElegido: null,
  miRol: null,
  filtroRapidas: "",
  rapidasPorSlash: false,
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

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function iconizar() {
  $("#btn-nuevo-contacto").innerHTML = icon("plus");
  $("#btn-mi-password").innerHTML = icon("key");
  $("#btn-bienvenida").innerHTML = icon("megaphone");
  $("#btn-admin").innerHTML = icon("broadcast");
  $("#btn-equipo").innerHTML = icon("users");
  $("#btn-salir").innerHTML = icon("logout");
  $(".icono-buscar").innerHTML = icon("search");
  $("#btn-filtro-seguimiento").innerHTML = icon("starOutline") + " Seguimiento";
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
  // Para que quede clarísimo con qué cuenta estás — el panel de "Probar
  // bienvenida" y de Equipo solo salen con role "admin", y esto evita
  // preguntarse por qué no aparecen si entraste con otra cuenta.
  $("#sesion-actual").textContent = `${displayName || "Modo administrador"} · ${role === "admin" ? "admin" : "vendedor"}`;
  $("#btn-mi-password").style.display = esCuentaDeVendedor ? "" : "none";
  $("#btn-bienvenida").style.display = role === "admin" ? "" : "none";
  $("#btn-admin").style.display = role === "admin" ? "" : "none";
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
  clearInterval(estado.pollConv);
  clearInterval(estado.pollMsg);
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

$("#btn-bienvenida").addEventListener("click", async () => {
  $("#modal-bienvenida-fondo").classList.add("abierto");
  await pintarSecuenciaBienvenida();
});
$("#bienvenida-cerrar").addEventListener("click", () => $("#modal-bienvenida-fondo").classList.remove("abierto"));

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
}

$("#seq-agregar-btn").addEventListener("click", async () => {
  const title = $("#seq-titulo").value.trim();
  const body = $("#seq-texto").value.trim();
  const files = [...$("#seq-archivo").files];
  if (!title) return alert("Ponle un título.");
  if (!body && !files.length) return alert("Necesita texto o al menos un archivo.");

  const btn = $("#seq-agregar-btn");
  btn.disabled = true;
  btn.textContent = "Subiendo…";
  try {
    const media_keys = [];
    for (const file of files) {
      const subida = await subirArchivo(file);
      media_keys.push({ media_key: subida.media_key, media_type: subida.type, media_mime: subida.mime });
    }
    await pedir("/api/crm/welcome-sequence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, media_keys })
    });
    await pintarSecuenciaBienvenida();
    $("#seq-titulo").value = "";
    $("#seq-texto").value = "";
    $("#seq-archivo").value = "";
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Agregar paso";
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
      ${avatarHtml(nombre)}
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
  document.body.classList.add("chat-abierto"); // en móvil: pantalla completa del chat, no la lista
  document.body.classList.remove("detalle-abierto");
  pintarLista();
  pintarChatBase(c);
  pintarDetalle(c);
  await cargarMensajes();
  clearInterval(estado.pollMsg);
  estado.pollMsg = setInterval(cargarMensajes, 3000);
}

function volverALaLista() {
  document.body.classList.remove("chat-abierto");
  document.body.classList.remove("detalle-abierto");
}

function pintarChatBase(c) {
  const nombre = c.profile_name || c.wa_id;
  $("#chat").innerHTML = `
    <header>
      <button id="btn-volver" title="Volver a la lista">${icon("arrowLeft")}</button>
      ${avatarHtml(nombre)}
      <div>
        <div class="nombre">${escapar(nombre)}</div>
        <div class="tel">+${escapar(c.wa_id)}</div>
      </div>
      <div class="acciones-chat">
        <button class="btn-star" id="star-header" title="Marcar seguimiento">${icon(c.follow_up ? "star" : "starOutline")}</button>
        <button class="icono" id="btn-detalle" title="Datos del contacto">${icon("more")}</button>
      </div>
    </header>
    <div id="mensajes"></div>
    <div id="zona-arrastre">Suelta la foto o el video acá</div>
    <div id="preview-archivo" style="display:none"></div>
    <form id="form-envio">
      <button type="button" class="icono" id="btn-mas" title="Más opciones">${icon("more")}</button>
      <button type="button" class="icono" id="btn-plantillas" title="Mandar plantilla">${icon("doc")}</button>
      <button type="button" class="icono" id="btn-catalogo" title="Mandar catálogo">${icon("bag")}</button>
      <button type="button" class="icono" id="btn-seguimiento" title="Seguimientos programados">${icon("clock")}</button>
      <button type="button" class="icono" id="btn-rapidas" title="Respuestas rápidas">${icon("bolt")}</button>
      <button type="button" class="icono" id="btn-adjuntar" title="Adjuntar foto o video">${icon("paperclip")}</button>
      <input type="file" id="input-archivo" accept="image/*,video/*" style="display:none" />
      <textarea id="texto-envio" placeholder="${window.matchMedia("(max-width: 600px)").matches ? "Mensaje…" : "Escribe un mensaje…"}" title="Enter manda, Shift+Enter hace un salto de línea" rows="1" autocomplete="off"></textarea>
      <button type="button" class="icono" id="btn-emoji" title="Emojis">${icon("smile")}</button>
      <button type="submit" class="enviar" title="Enviar">${icon("send")}</button>
      <div id="panel-mas"></div>
      <div id="panel-rapidas"></div>
      <div id="panel-seguimientos"></div>
      <div id="panel-emojis"></div>
      <div id="panel-catalogo"></div>
    </form>`;
  $("#form-envio").addEventListener("submit", enviarMensaje);
  $("#btn-volver").addEventListener("click", volverALaLista);
  $("#btn-detalle").addEventListener("click", () => document.body.classList.add("detalle-abierto"));
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
  $("#btn-mas").addEventListener("click", (e) => { e.stopPropagation(); cerrarPaneles(["#panel-mas"]); toggleMasPanel(); });
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
  ["#panel-rapidas", "#panel-seguimientos", "#panel-emojis", "#panel-catalogo", "#panel-mas"].forEach((sel) => {
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
    <div class="item" id="mas-seguimiento"><div class="titulo">${icon("clock")} Seguimientos programados</div></div>`;
  $("#mas-plantillas").addEventListener("click", () => { panel.classList.remove("abierto"); abrirModalTemplates(); });
  $("#mas-catalogo").addEventListener("click", () => { panel.classList.remove("abierto"); toggleCatalogoPanel(); });
  $("#mas-seguimiento").addEventListener("click", () => { panel.classList.remove("abierto"); toggleSeguimientosPanel(); });
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
  actualizarSeguimientosDetalle();
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
    const esAdmin = estado.miRol === "admin";
    const html = orders.length ? orders.map((o) => `
      <div class="ad-card" style="margin-bottom:8px">
        <div class="titulo">${icon("bag")} ${fechaCorta(o.created_at)}</div>
        ${o.items.map((i) => `<div>${i.quantity}× ${escapar(i.name || i.product_retailer_id)} — ${i.item_price ?? ""} ${escapar(o.currency || "")}</div>`).join("")}
        ${o.total_amount ? `<div><strong>Total: ${o.total_amount} ${escapar(o.currency || "")}</strong></div>` : ""}
        ${esAdmin ? `
        <div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <button class="capi-enviar" data-id="${o.id}" data-total="${o.total_amount || ""}" data-currency="${escapar(o.currency || "")}" style="font-size:11px;padding:4px 8px;border:1px solid var(--borde);border-radius:var(--radio-s);background:#fff;cursor:pointer">${o.capi_status === "enviado" ? "Reenviar a Meta (CAPI)" : "Mandar a Meta (CAPI)"}</button>
          ${o.capi_status === "enviado" ? `<span style="font-size:11px;color:var(--verde-osc)">✓ enviado</span>` : o.capi_status === "fallido" ? `<span style="font-size:11px;color:var(--peligro)">falló, reintenta</span>` : ""}
        </div>` : ""}
      </div>`).join("") : `<div class="sin-ad">Sin pedidos de catálogo todavía.</div>`;
    if (cont.innerHTML !== html) {
      cont.innerHTML = html;
      cont.querySelectorAll(".capi-enviar").forEach((btn) => {
        btn.addEventListener("click", async () => {
          let valor = btn.dataset.total;
          if (!valor) {
            valor = prompt("Este pedido no tiene un total guardado — escribe el monto de la venta:");
            if (!valor) return;
          }
          if (!confirm(`¿Mandar a Meta que esta venta valió ${valor} ${btn.dataset.currency || "PEN"}? Le da crédito al anuncio que originó la conversación.`)) return;
          btn.disabled = true;
          try {
            await pedir("/api/crm/capi-send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ order_id: Number(btn.dataset.id), value: Number(valor), currency: btn.dataset.currency || undefined })
            });
            alert("Evento mandado a Meta.");
            await actualizarPedidosPanel();
            await actualizarHistorialCapi(estado.conversacionActivaId);
          } catch (err) {
            alert(err.message);
          } finally {
            btn.disabled = false;
          }
        });
      });
    }
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
        <button class="borrar-seguimiento-detalle" data-id="${s.id}" title="Cancelar">${icon("close")}</button>
      </div>`).join("") : `<div class="sin-ad">Sin seguimientos programados.</div>`;
    if (cont.innerHTML !== html) {
      cont.innerHTML = html;
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
  if (m.status === "failed") return `<span class="estado-msg fallido" title="No se pudo enviar">${icon("alertCircle")}</span>`;
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
    <div class="msg ${m.direction}">
      ${contenidoMensaje(m)}
      <span class="hora">${m.sent_by ? escapar(m.sent_by) + " · " : ""}${horaCorta(m.created_at)}${estadoMensaje(m)}</span>
    </div>`;
  }).join("");

  cont.innerHTML = (estado.hayMasAntiguos
    ? `<div id="cargar-anteriores"><button type="button">Cargar mensajes anteriores</button></div>`
    : "") + filas;

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
  if (!e.target.closest("#panel-rapidas, #btn-rapidas, #panel-seguimientos, #btn-seguimiento, #panel-emojis, #btn-emoji, #panel-catalogo, #btn-catalogo, #panel-mas, #btn-mas")) {
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
      if (e.target.closest(".borrar")) return;
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
  $("#nueva-rapida")?.addEventListener("click", () => {
    panel.classList.remove("abierto");
    $("#modal-rapida-fondo").classList.add("abierto");
  });
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
        <div class="titulo">${icon(s.batch_id ? "broadcast" : "clock")} ${fechaCorta(s.send_at)}${s.media_key ? " " + icon(s.media_type === "video" ? "video" : "image") : ""}${s.batch_id ? ` <span style="font-weight:400;color:var(--ad)">· masivo</span>` : ""}</div>
        <div class="cuerpo">${escapar(textoSeguimiento(s))}</div>
      </div>
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
  $("#nuevo-seguimiento")?.addEventListener("click", () => {
    panel.classList.remove("abierto");
    const sel = $("#seg-rapida");
    sel.innerHTML = `<option value="">— o una respuesta rápida guardada —</option>` +
      estado.quickReplies.map((q) => `<option value="${q.id}">${escapar(q.title)}</option>`).join("");
    $("#modal-seguimiento-fondo").classList.add("abierto");
  });
  $("#aplicar-secuencia")?.addEventListener("click", () => {
    panel.classList.remove("abierto");
    abrirModalSecuencias();
  });
}

$("#seg-cancelar").addEventListener("click", () => {
  $("#modal-seguimiento-fondo").classList.remove("abierto");
  $("#seg-fecha").value = "";
  $("#seg-texto").value = "";
  $("#seg-archivo").value = "";
});

$("#seg-crear").addEventListener("click", async () => {
  const fecha = $("#seg-fecha").value;
  const texto = $("#seg-texto").value.trim();
  const quickReplyId = $("#seg-rapida").value;
  const archivo = $("#seg-archivo").files[0];
  if (!fecha) return alert("Elige fecha y hora.");
  if (!texto && !quickReplyId && !archivo) return alert("Escribe un texto, adjunta una foto/video o elige una respuesta rápida.");

  const btn = $("#seg-crear");
  btn.disabled = true;
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
            <button class="trash fs-borrar-paso" data-id="${p.id}">${icon("trash")}</button>
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
          <input type="file" class="fs-paso-archivo" accept="image/*,video/*" />
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
      if (!texto && !archivo) return alert("Escribe un texto o adjunta una foto/video.");

      btn.disabled = true;
      btn.textContent = "Subiendo…";
      try {
        let media_key, media_type, media_mime;
        if (archivo) {
          const subida = await subirArchivo(archivo);
          media_key = subida.media_key;
          media_type = subida.type;
          media_mime = subida.mime;
        }
        await pedir("/api/crm/followup-sequences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sequence_id: Number(btn.dataset.id),
            body: texto || undefined,
            media_key, media_type, media_mime,
            delay_minutes: valor * unidad
          })
        });
        await cargarYPintarSecuencias();
        // Vuelve a abrir los pasos de esa secuencia, ya con el nuevo agregado.
        cont.querySelector(`.fs-pasos[data-id="${btn.dataset.id}"]`).style.display = "block";
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Agregar paso";
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
    cont.innerHTML = templates.map((t, i) => `
      <div class="fila-template" data-i="${i}" style="${t.status === "APPROVED" ? "cursor:pointer" : "opacity:.55;cursor:default"}">
        <div>
          <div class="nombre">${escapar(t.name)}${badgeEstadoPlantilla(t.status)}</div>
          <div class="sub">${escapar(t.category)} · ${escapar(t.language)}</div>
        </div>
      </div>`).join("");
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

    <h2>Origen</h2>
    ${tieneAd ? `
      <div class="ad-card">
        <div class="titulo">${icon("megaphone")} Vino de un anuncio</div>
        ${c.ad_headline ? `<div>${escapar(c.ad_headline)}</div>` : ""}
        ${c.ad_source_type ? `<div>Tipo: ${escapar(c.ad_source_type)}</div>` : ""}
        ${c.ctwa_clid ? `<div style="word-break:break-all">ctwa_clid: ${escapar(c.ctwa_clid)}</div>` : ""}
      </div>` : `<div class="sin-ad">Chat directo, sin anuncio detectado.</div>`}
    ${estado.miRol === "admin" && !tieneAd ? `<button class="cancelar" id="detalle-simular-ad" style="width:100%;margin-top:8px;font-size:12px">${icon("megaphone")} Marcar este chat como venido de un anuncio</button>` : ""}

    <h2>Seguimientos programados</h2>
    <div id="detalle-seguimientos">Cargando…</div>

    <h2>Pedidos del catálogo</h2>
    <div id="detalle-pedidos">Cargando…</div>

    ${estado.miRol === "admin" ? `
    <h2>Meta Ads (CAPI)</h2>
    <p class="ayuda-modal" style="margin:0 0 8px">Reporta una venta a Meta sin necesidad de un pedido del catálogo — para cuando se cerró por chat. No le manda nada al cliente.</p>
    <input type="text" id="capi-producto" placeholder="Producto (opcional, ej. Kit de tarot x2)" />
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <input type="number" id="capi-valor" value="89" min="0" step="0.01" style="flex:1" />
      <select id="capi-moneda" style="width:80px">
        <option value="PEN" selected>PEN</option>
        <option value="USD">USD</option>
      </select>
    </div>
    <button class="crear" id="capi-mandar-btn" type="button" style="width:100%">Mandar a Meta (CAPI)</button>
    <div id="detalle-capi-historial" style="margin-top:8px"></div>
    ` : ""}
  `;

  $("#btn-cerrar-detalle").addEventListener("click", () => document.body.classList.remove("detalle-abierto"));

  $("#capi-mandar-btn")?.addEventListener("click", async () => {
    const valor = Number($("#capi-valor").value);
    const moneda = $("#capi-moneda").value;
    const producto = $("#capi-producto").value.trim();
    if (!valor || valor <= 0) return alert("Escribe un monto válido.");
    if (!confirm(`¿Mandar a Meta que esta venta valió ${valor} ${moneda}${producto ? ` (${producto})` : ""}?`)) return;

    const btn = $("#capi-mandar-btn");
    btn.disabled = true;
    try {
      await pedir("/api/crm/capi-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: c.conversation_id, value: valor, currency: moneda, product_label: producto || undefined })
      });
      alert("Evento mandado a Meta.");
      $("#capi-producto").value = "";
      await actualizarHistorialCapi(c.conversation_id);
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
    }
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

  await actualizarPedidosPanel();
  await actualizarSeguimientosDetalle();
}

revisarSesion();

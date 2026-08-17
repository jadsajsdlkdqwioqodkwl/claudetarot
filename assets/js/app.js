/* Tarot Claude — lógica del formulario COD */
(function () {
  "use strict";

  var PRICES = { 1: 89, 2: 160, 3: 225 };
  var WHATSAPP_BUSINESS = "51999888777"; // número visible al cliente en el botón de éxito

  var form = document.getElementById("order-form");
  if (!form) return;

  var submitBtn = document.getElementById("submit-btn");
  var spinner = submitBtn.querySelector(".spinner");
  var btnLabel = submitBtn.querySelector(".btn-label");
  var statusEl = document.getElementById("form-status");
  var successEl = document.getElementById("order-success");
  var qtySelect = document.getElementById("cantidad");

  document.getElementById("year").textContent = String(new Date().getFullYear());

  /* ---------- Resumen dinámico ---------- */
  function refreshSummary() {
    var qty = parseInt(qtySelect.value, 10) || 1;
    document.getElementById("sum-qty").textContent = String(qty);
    document.getElementById("sum-total").textContent = "S/ " + (PRICES[qty] || qty * PRICES[1]);
  }
  qtySelect.addEventListener("change", refreshSummary);
  refreshSummary();

  /* ---------- Validación ---------- */
  var RULES = {
    nombre: function (v) {
      if (v.length < 3) return "Escribe tu nombre completo.";
      if (!/\s/.test(v.trim())) return "Incluye también tu apellido.";
      return "";
    },
    telefono: function (v) {
      var digits = v.replace(/\D/g, "");
      if (digits.length < 9) return "El celular debe tener 9 dígitos.";
      if (digits.length === 9 && digits[0] !== "9") return "Un celular peruano empieza con 9.";
      return "";
    },
    email: function (v) {
      if (!v) return "";
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? "" : "Revisa el formato del correo.";
    },
    departamento: function (v) { return v ? "" : "Elige tu departamento."; },
    distrito: function (v) { return v.trim().length >= 3 ? "" : "Escribe tu distrito."; },
    direccion: function (v) { return v.trim().length >= 6 ? "" : "La dirección es muy corta."; }
  };

  function setFieldError(name, message) {
    var input = form.elements[name];
    if (!input) return;
    var field = input.closest(".field");
    var errorEl = form.querySelector('[data-error-for="' + name + '"]');
    if (errorEl) errorEl.textContent = message;
    if (field) field.classList.toggle("invalid", Boolean(message));
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function validateField(name) {
    var input = form.elements[name];
    if (!input || !RULES[name]) return true;
    var message = RULES[name](input.value);
    setFieldError(name, message);
    return !message;
  }

  Object.keys(RULES).forEach(function (name) {
    var input = form.elements[name];
    if (!input) return;
    input.addEventListener("blur", function () { validateField(name); });
    input.addEventListener("input", function () {
      if (input.closest(".field").classList.contains("invalid")) validateField(name);
    });
  });

  // El celular solo acepta dígitos y espacios
  form.elements.telefono.addEventListener("input", function (e) {
    e.target.value = e.target.value.replace(/[^\d\s]/g, "").slice(0, 15);
  });

  /* ---------- Envío ---------- */
  function setLoading(loading) {
    submitBtn.disabled = loading;
    spinner.hidden = !loading;
    btnLabel.textContent = loading ? "Enviando pedido…" : "Confirmar pedido contra entrega";
  }

  function showStatus(message, kind) {
    statusEl.textContent = message;
    statusEl.className = "form-status" + (kind ? " is-" + kind : "");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    showStatus("");

    var firstInvalid = null;
    Object.keys(RULES).forEach(function (name) {
      if (!validateField(name) && !firstInvalid) firstInvalid = form.elements[name];
    });
    if (firstInvalid) {
      firstInvalid.focus();
      showStatus("Revisa los campos marcados en rojo.", "error");
      return;
    }

    var data = Object.fromEntries(new FormData(form).entries());
    data.origen = document.referrer || "directo";
    data.utm = window.location.search || "";

    setLoading(true);

    fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
      .then(function (res) {
        return res.json().then(function (body) { return { ok: res.ok, status: res.status, body: body }; });
      })
      .then(function (result) {
        if (!result.ok) throw new Error(result.body && result.body.error ? result.body.error : "No pudimos registrar tu pedido.");
        onSuccess(result.body);
      })
      .catch(function (err) {
        setLoading(false);
        showStatus(err.message + " Escríbenos por WhatsApp y lo tomamos manualmente.", "error");
      });
  });

  function onSuccess(payload) {
    var code = payload && payload.orderId ? payload.orderId : "—";
    document.getElementById("success-code").textContent = code;

    if (payload && payload.whatsappSent === false) {
      document.getElementById("success-text").textContent =
        "Guardamos tu pedido. En unos minutos te escribimos por WhatsApp para confirmar la entrega.";
    }

    var msg = encodeURIComponent("Hola, acabo de hacer el pedido " + code + " del mazo Tarot Claude.");
    document.getElementById("wa-link").href = "https://wa.me/" + WHATSAPP_BUSINESS + "?text=" + msg;

    form.hidden = true;
    document.querySelector(".order-summary").hidden = true;
    successEl.hidden = false;
    successEl.scrollIntoView({ behavior: "smooth", block: "center" });

    if (window.dataLayer) window.dataLayer.push({ event: "cod_order_submitted", order_id: code });
  }
})();

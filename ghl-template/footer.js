<!-- ==========================================================================
     PLANTILLA GHL — Landing COD estilo Shopify
     Pega este bloque en: Sites → (tu Funnel) → Settings → Tracking Code →
     Footer Code. Si solo quieres que corra en una página (p.ej. el
     contador solo debe existir en /gracias), pégalo en el Footer Code del
     Step en vez del Funnel completo.

     Filosofía: casi todo el diseño original se resuelve con elementos
     nativos de GHL (Sticky, Image Gallery con lightbox, Video con
     autoplay-on-scroll, Form con lógica condicional, CSS :checked para las
     tarjetas de variante). Este archivo solo cubre lo que de verdad
     necesita JavaScript porque no existe como opción nativa:

       1. Contador regresivo de la página de Gracias (urgencia, decorativo).
       2. Contador de "personas viendo esto ahora" con ligera variación
          (social proof, decorativo — no toca precios ni el formulario).
       3. Alternativa manual del sticky bottom SOLO si tu builder no trae el
          toggle nativo "Sticky" en Advanced → Position de la Section.

     Ninguno de estos scripts toca el envío del formulario, precios ni
     datos del pedido: esa lógica queda 100% en tu Form Builder + tus
     automatizaciones de GHL, tal como pediste.
     ========================================================================== -->
<script>
(function () {
  "use strict";

  /* 1) Contador regresivo — página de Gracias -----------------------------
     Requisito: en el Text/Headline donde va el número, ábrelo como Custom
     HTML o dale al Text un "Element ID" = lpCountdown (Advanced → ID) desde
     el editor. Si tu builder no permite ID a un Text, envuélvelo en un
     elemento "Custom Code" con: <span id="lpCountdown">10:00</span> */
  (function cuentaRegresiva() {
    var el = document.getElementById("lpCountdown");
    if (!el) return; // esta página no tiene el contador: no hace nada
    var segundos = 600; // 10:00
    var iv = setInterval(function () {
      segundos--;
      if (segundos < 0) { clearInterval(iv); return; }
      var m = Math.floor(segundos / 60);
      var s = segundos % 60;
      el.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }, 1000);
  })();

  /* 2) "X personas viendo esto ahora" — landing ----------------------------
     Opcional. Requiere un elemento con id="lpViewingCount" alrededor del
     número. Si no existe en la página, no hace nada. Fluctúa dentro de un
     rango razonable para no verse falso ni cambiar demasiado rápido. */
  (function personasViendo() {
    var el = document.getElementById("lpViewingCount");
    if (!el) return;
    var base = parseInt(el.textContent, 10) || 12;
    setInterval(function () {
      var delta = Math.random() < 0.5 ? -1 : 1;
      base = Math.max(6, Math.min(28, base + delta));
      el.textContent = base;
    }, 4000);
  })();

  /* 3) Sticky bottom manual — SOLO como respaldo ---------------------------
     Actívalo quitando el comentario de abajo únicamente si tu cuenta de
     GHL no trae el toggle nativo Advanced → Position → Sticky en la
     Section. Requiere que la Section del sticky tenga la Custom Class
     lp-sticky-wrap (ya la trae el CSS de custom.css con position:fixed,
     así que ni siquiera necesitas este bloque para que se vea fijo — esto
     solo añade el comportamiento de "aparece recién al hacer scroll").

  (function stickyOnScroll() {
    var bar = document.querySelector(".lp-sticky-wrap");
    if (!bar) return;
    bar.style.opacity = "0";
    bar.style.pointerEvents = "none";
    window.addEventListener("scroll", function () {
      var mostrar = window.scrollY > 300;
      bar.style.opacity = mostrar ? "1" : "0";
      bar.style.pointerEvents = mostrar ? "auto" : "none";
    }, { passive: true });
  })();
  */
})();
</script>

/**
 * Service worker mínimo, solo para las notificaciones push — no cachea nada
 * (el CRM siempre pide todo fresco al servidor, no tiene sentido un modo
 * offline acá). Se registra con scope /crm/, cubre toda la app.
 */

self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let datos = {};
  try { datos = e.data.json(); } catch { datos = { title: "CRM WhatsApp", body: e.data?.text() || "Mensaje nuevo" }; }

  e.waitUntil(
    Promise.all([
      self.registration.showNotification(datos.title || "CRM WhatsApp", {
        body: datos.body || "",
        tag: datos.tag,
        renotify: Boolean(datos.tag),
        icon: "/kittarotcod/favicon-180.png",
        badge: "/kittarotcod/favicon-32.png",
        data: { conversation_id: datos.conversation_id }
      }),
      // Aviso a cualquier pestaña del CRM ya abierta para que refresque al
      // toque — así el polling de fondo puede ser mucho más espaciado (es
      // solo la red de seguridad) sin perder la sensación de tiempo real:
      // lo real-time ya lo cubre el push mismo.
      (async () => {
        const clientes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const c of clientes) c.postMessage({ tipo: "mensaje-nuevo", conversation_id: datos.conversation_id });
      })()
    ])
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const conversationId = e.notification.data?.conversation_id;
  e.waitUntil(
    (async () => {
      const clientes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existente = clientes.find((c) => c.url.includes("/crm/"));
      if (existente) {
        existente.focus();
        existente.postMessage({ tipo: "abrir-conversacion", conversation_id: conversationId });
      } else {
        self.clients.openWindow("/crm/");
      }
    })()
  );
});

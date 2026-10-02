// Service worker mínimo, solo para Web Push — no cachea nada ni intercepta
// `fetch` (no es un "offline-first PWA sw", ver frontend/src/features/notifications/README.md).
// Vive en /public (no pasa por el bundler) porque el navegador lo pide como
// script plano en la raíz del sitio, con ese scope exacto.

self.addEventListener("install", () => {
  // No esperar a que se cierren las pestañas viejas: sin esto, recién se
  // activaría en la próxima carga completa, y el usuario que acaba de
  // aceptar notificaciones no recibiría push hasta recargar.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const { title, body, url, tag, kind } = payload;

  if (kind === "call") {
    event.waitUntil(showCallNotification({ title, body, url, tag }));
    return;
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icons/icon-192.png",
      data: { url },
    }),
  );
});

// Cuánto se deja visible una llamada entrante. El backend ya no la considera
// "sonando" mucho después (y una notificación de llamada vieja engaña).
const CALL_NOTIFICATION_MS = 30000;

async function showCallNotification({ title, body, url, tag }) {
  // App en primer plano: el modal de llamada entrante ya la anuncia con tono,
  // una notificación del sistema encima sería duplicada.
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (clients.some((client) => client.focused)) return;

  await self.registration.showNotification(title, {
    body,
    tag,
    icon: "/icons/icon-192.png",
    data: { url },
    requireInteraction: true,
    renotify: true,
    vibrate: [300, 150, 300, 150, 300],
  });

  // Mantiene vivo el SW y retira la notificación si nadie la atendió.
  await new Promise((resolve) => setTimeout(resolve, CALL_NOTIFICATION_MS));
  const stale = await self.registration.getNotifications({ tag });
  stale.forEach((notification) => notification.close());
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => new URL(client.url).pathname === targetUrl);
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    }),
  );
});

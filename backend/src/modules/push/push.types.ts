export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface SubscribeInput {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

/// Payload que recibe el service worker en el evento `push` (ver
/// frontend/public/sw.js) — el JSON ya elegido por nosotros, no el sobre
/// cifrado que viaja por la red (eso lo arma `web-push`).
export interface PushPayload {
  title: string;
  body: string;
  /// Ruta (no URL completa) a la que navegar al clickear la notificación.
  url: string;
  /// Mismo `tag` reemplaza la notificación anterior de esa conversación en
  /// vez de apilarlas — igual criterio que ya usaba `showNotification` en
  /// el frontend (ver utils/browser-notifications.ts).
  tag: string;
}

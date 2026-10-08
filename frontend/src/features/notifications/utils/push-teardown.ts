import { unsubscribePush } from "@/features/notifications/api/push.api";

/// Da de baja el push de este navegador al cerrar sesión: avisa al backend
/// (que borra la suscripción) y se desuscribe del servicio push del navegador.
/// Sin esto, en un equipo compartido las notificaciones de la cuenta que acaba
/// de salir —con el texto de los mensajes— siguen apareciendo en el escritorio.
///
/// Nunca tira y no hace nada si el navegador no soporta push o no hay
/// suscripción: cerrar sesión no puede fallar por esto. Sin `token` (sesión ya
/// vencida) solo se desuscribe localmente; el backend limpia la fila cuando el
/// servicio push responde 404/410.
export async function teardownPushSubscription(token: string | null): Promise<void> {
  try {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    if (token) {
      await unsubscribePush(token, subscription.endpoint).catch(() => {});
    }
    await subscription.unsubscribe().catch(() => {});
  } catch {
    // Ignorado a propósito (ver comentario de la función).
  }
}

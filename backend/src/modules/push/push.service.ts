import webpush, { WebPushError } from "web-push";
import env from "../../config/env";
import { getLogger } from "../../config/request-context";
import { BadRequestError } from "../../utils/errors";
import { isAllowedPushEndpoint } from "./push-endpoint";
import * as PushRepository from "./push.repository";
import { PushPayload, SubscribeInput } from "./push.types";

webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

export function getPublicKey(): string {
  return env.VAPID_PUBLIC_KEY;
}

export async function subscribe(userId: string, input: SubscribeInput): Promise<void> {
  if (!isAllowedPushEndpoint(input.endpoint)) {
    throw new BadRequestError("Servicio de notificaciones no soportado", "push_endpoint_not_allowed");
  }

  // El endpoint identifica al navegador, no a la persona: otra persona que
  // entra en el mismo navegador reenvía la misma suscripción (mismas claves) y
  // se queda con la fila. Un endpoint ya registrado por otra cuenta pero con
  // claves distintas no es ese caso: se ignora en vez de reasignarlo, para que
  // conocer un endpoint ajeno no sirva para quitarle las notificaciones a su dueño.
  const existing = await PushRepository.findByEndpoint(input.endpoint);
  if (
    existing &&
    existing.userId !== userId &&
    (existing.p256dh !== input.keys.p256dh || existing.auth !== input.keys.auth)
  ) {
    getLogger().warn(
      { userId, subscriptionId: existing.id },
      "push subscription not reassigned: endpoint belongs to another account with different keys",
    );
    return;
  }

  await PushRepository.upsertSubscription(userId, input.endpoint, input.keys.p256dh, input.keys.auth);
}

/// Solo da de baja una suscripción del propio usuario (no hay error si no es
/// suya o no existe: el resultado, que no le lleguen notificaciones en ese
/// dispositivo, es el mismo).
export async function unsubscribe(userId: string, endpoint: string): Promise<void> {
  await PushRepository.deleteByEndpointForUser(endpoint, userId);
}

/// Llamada por `messages` al enviar un mensaje, para quien no tiene ESA
/// conversación abierta ahora mismo (ver message.service.ts `sendMessage`) —
/// a diferencia de la room de socket, esto llega con la pestaña cerrada o el
/// navegador entero cerrado. Nunca lanza: un push que falla no debe tumbar el
/// envío del mensaje que lo disparó.
export async function notifyUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;
  const subscriptions = await PushRepository.findByUserIds(userIds);
  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (subscription) => {
      // Filas guardadas antes de la allowlist: nunca se les envía nada y se
      // borran. No se loguea el endpoint, es una URL con capacidad de envío.
      if (!isAllowedPushEndpoint(subscription.endpoint)) {
        getLogger().warn(
          { subscriptionId: subscription.id, userId: subscription.userId },
          "push subscription skipped and deleted: endpoint not allowed",
        );
        await PushRepository.deleteByEndpoint(subscription.endpoint).catch(() => {});
        return;
      }

      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          body,
        );
      } catch (error) {
        // 404/410: el navegador invalidó esta suscripción (desinstaló el
        // service worker, borró datos del sitio, etc.) — se limpia para no
        // reintentar en cada mensaje futuro. Cualquier otro error se ignora
        // a propósito, ver comentario de la función.
        if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
          await PushRepository.deleteByEndpoint(subscription.endpoint).catch(() => {});
        }
      }
    }),
  );
}

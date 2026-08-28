import webpush, { WebPushError } from "web-push";
import env from "../../config/env";
import * as PushRepository from "./push.repository";
import { PushPayload, SubscribeInput } from "./push.types";

webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

export function getPublicKey(): string {
  return env.VAPID_PUBLIC_KEY;
}

export async function subscribe(userId: string, input: SubscribeInput): Promise<void> {
  await PushRepository.upsertSubscription(userId, input.endpoint, input.keys.p256dh, input.keys.auth);
}

export async function unsubscribe(endpoint: string): Promise<void> {
  await PushRepository.deleteByEndpoint(endpoint);
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

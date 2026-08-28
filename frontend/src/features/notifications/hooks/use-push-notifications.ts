"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { getVapidPublicKey, subscribePush } from "@/features/notifications/api/push.api";
import { urlBase64ToUint8Array } from "@/features/notifications/utils/vapid-key";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/// Registra el service worker (si hace falta) y confirma la suscripción de
/// Web Push contra el backend. Se llama tanto al aceptar el permiso por
/// primera vez como en cada carga si el permiso ya estaba concedido de antes
/// — así, una vez aceptadas, las notificaciones siguen llegando "todo el
/// tiempo" sin depender de que el usuario vuelva a hacer nada: si el
/// navegador perdió la suscripción (o el backend perdió la fila, ej. reset
/// de datos), se vuelve a crear sola.
async function ensureSubscribed(token: string): Promise<void> {
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { publicKey } = await getVapidPublicKey(token);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
  await subscribePush(token, { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
}

export function usePushNotifications() {
  const { session } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if (!isPushSupported()) return;
    setPermission(Notification.permission);
  }, []);

  // Ya concedido de una sesión anterior: asegura la suscripción sola, sin
  // esperar ningún click — ver comentario de `ensureSubscribed`.
  useEffect(() => {
    if (!session || permission !== "granted") return;
    ensureSubscribed(session.token).catch(() => {});
  }, [session, permission]);

  const requestPermission = useCallback(async () => {
    if (!isPushSupported() || !session) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      await ensureSubscribed(session.token).catch(() => {});
    }
  }, [session]);

  return { permission, isSupported: isPushSupported(), requestPermission };
}

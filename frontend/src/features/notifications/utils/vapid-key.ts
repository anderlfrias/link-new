/** `pushManager.subscribe` pide la VAPID key como `Uint8Array`, no como el
 * string URL-safe-base64 que devuelve el backend — conversión estándar, ver
 * https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

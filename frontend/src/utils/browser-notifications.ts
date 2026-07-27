/** Wrapper fino sobre el Notification API del navegador — nunca asume que existe (SSR, navegadores sin soporte). */

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Pide permiso una sola vez — si ya se concedió o rechazó antes, no vuelve a molestar. */
export function requestNotificationPermission(): void {
  if (!isNotificationSupported()) return;
  if (Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

export interface ShowNotificationOptions {
  title: string;
  body: string;
  /** Mismo `tag` reemplaza la notificación anterior de esa conversación en vez de apilarlas. */
  tag: string;
  onClick: () => void;
}

export function showNotification({ title, body, tag, onClick }: ShowNotificationOptions): void {
  if (!isNotificationSupported() || Notification.permission !== "granted") return;

  const notification = new Notification(title, {
    body,
    tag,
    icon: "/brand/logo-mark.png",
  });
  notification.onclick = () => {
    window.focus();
    onClick();
    notification.close();
  };
}

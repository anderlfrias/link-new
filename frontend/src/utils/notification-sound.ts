/** Tono corto reproducido cuando llega un mensaje nuevo (ver useNewMessageSound). */
const SOUND_SRC = "/sounds/notification.wav";

let cachedAudio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!cachedAudio) {
    cachedAudio = new Audio(SOUND_SRC);
    cachedAudio.volume = 0.5;
  }
  return cachedAudio;
}

// Los navegadores bloquean el autoplay de audio hasta que el usuario interactuó
// con la página al menos una vez — normal en un chat (login, click, etc.), por
// eso el error se descarta en silencio en vez de mostrarse como falla real.
export function playNotificationSound(): void {
  const audio = getAudio();
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

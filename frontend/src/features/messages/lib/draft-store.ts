/**
 * Almacén de borradores de mensajes (Drafts).
 *
 * Almacena el contenido no enviado por conversación en localStorage, aislado por usuario,
 * y provee un mecanismo reactivo de suscripción para sincronizar instantáneamente
 * el compositor (MessageInput) y la lista de conversaciones (ConversationListItem).
 */

type Listener = () => void;

const cache = new Map<string, Record<string, string>>();
const listeners = new Map<string, Set<Listener>>();

function getStorageKey(userId: string): string {
  return `link_drafts_${userId}`;
}

function getListenerKey(userId: string, conversationId: string): string {
  return `${userId}:${conversationId}`;
}

function readDraftsFromStorage(userId: string): Record<string, string> {
  if (!userId) return {};
  if (cache.has(userId)) {
    return cache.get(userId)!;
  }
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) {
      cache.set(userId, {});
      return {};
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      cache.set(userId, parsed as Record<string, string>);
      return parsed as Record<string, string>;
    }
  } catch {
    // Ignorar JSON corrupto
  }
  cache.set(userId, {});
  return {};
}

function writeDraftsToStorage(userId: string, drafts: Record<string, string>): void {
  cache.set(userId, drafts);
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const key = getStorageKey(userId);
    const hasAnyDraft = Object.keys(drafts).length > 0;
    if (hasAnyDraft) {
      window.localStorage.setItem(key, JSON.stringify(drafts));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignorar si el almacenamiento está lleno o deshabilitado
  }
}

function notifySubscribers(userId: string, conversationId: string): void {
  const key = getListenerKey(userId, conversationId);
  const subs = listeners.get(key);
  if (subs) {
    subs.forEach((cb) => {
      try {
        cb();
      } catch {
        // Evitar que el error de un suscriptor bloquee a los demás
      }
    });
  }
}

/**
 * Obtiene el borrador actual para una conversación y usuario dados.
 */
export function getDraft(userId: string, conversationId: string): string {
  if (!userId || !conversationId) return "";
  const drafts = readDraftsFromStorage(userId);
  return drafts[conversationId] ?? "";
}

/**
 * Guarda o actualiza el borrador de una conversación.
 * Si el texto está vacío (o solo contiene espacios), se elimina automáticamente.
 */
export function setDraft(userId: string, conversationId: string, text: string): void {
  if (!userId || !conversationId) return;
  const drafts = { ...readDraftsFromStorage(userId) };
  const prev = drafts[conversationId] ?? "";

  if (!text || text.trim() === "") {
    if (prev) {
      delete drafts[conversationId];
      writeDraftsToStorage(userId, drafts);
      notifySubscribers(userId, conversationId);
    }
    return;
  }

  if (prev !== text) {
    drafts[conversationId] = text;
    writeDraftsToStorage(userId, drafts);
    notifySubscribers(userId, conversationId);
  }
}

/**
 * Elimina el borrador de una conversación.
 */
export function clearDraft(userId: string, conversationId: string): void {
  setDraft(userId, conversationId, "");
}

/**
 * Suscribe un callback a los cambios del borrador de una conversación específica.
 * Retorna la función para desuscribirse.
 */
export function subscribeDraft(
  userId: string,
  conversationId: string,
  callback: Listener,
): () => void {
  if (!userId || !conversationId) return () => {};

  const key = getListenerKey(userId, conversationId);
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  const set = listeners.get(key)!;
  set.add(callback);

  return () => {
    set.delete(callback);
    if (set.size === 0) {
      listeners.delete(key);
    }
  };
}

/**
 * Limpia la caché en memoria (utilizado principalmente para testing y logout).
 */
export function resetDraftCache(): void {
  cache.clear();
  listeners.clear();
}

// Sincronización entre pestañas mediante el evento 'storage'
if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("storage", (event) => {
    if (event.key && event.key.startsWith("link_drafts_")) {
      const userId = event.key.replace("link_drafts_", "");
      cache.delete(userId);
      // Notificar a todos los escuchas registrados para este usuario
      listeners.forEach((_, key) => {
        if (key.startsWith(`${userId}:`)) {
          const conversationId = key.slice(userId.length + 1);
          notifySubscribers(userId, conversationId);
        }
      });
    }
  });
}

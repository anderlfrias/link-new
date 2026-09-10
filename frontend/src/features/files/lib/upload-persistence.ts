export interface PersistedUploadSession {
  sessionId: string;
  conversationId?: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  lastModified: number;
  createdAt: number;
}

const STORAGE_KEY = "link_active_upload_sessions";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas (§4.3, §8.5)

function readAllSessions(): PersistedUploadSession[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    // Filtrar sesiones expiradas (> 24h)
    return parsed.filter(
      (item): item is PersistedUploadSession =>
        Boolean(item && item.sessionId && item.fileName) && now - item.createdAt < SESSION_TTL_MS,
    );
  } catch {
    return [];
  }
}

function writeAllSessions(sessions: PersistedUploadSession[]): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Ignorar si el almacenamiento local está lleno o bloqueado
  }
}

/** Guarda o actualiza los metadatos de una sesión activa para permitir re-pick tras recarga. */
export function saveUploadSession(session: PersistedUploadSession): void {
  const current = readAllSessions().filter((s) => s.sessionId !== session.sessionId);
  current.push(session);
  writeAllSessions(current);
}

/**
 * Obtiene la sesión activa más reciente para la conversación dada (o general si no se especifica),
 * descartando automáticamente las que superen las 24 horas.
 */
export function getUploadSession(conversationId?: string): PersistedUploadSession | null {
  const valid = readAllSessions();
  const matched = conversationId
    ? valid.filter((s) => s.conversationId === conversationId)
    : valid;

  if (matched.length === 0) return null;
  // Devolver la más reciente
  return matched.sort((a, b) => b.createdAt - a.createdAt)[0];
}

/** Elimina la sesión persistida cuando finaliza, es cancelada o se descarta. */
export function removeUploadSession(sessionId: string): void {
  const current = readAllSessions().filter((s) => s.sessionId !== sessionId);
  writeAllSessions(current);
}

/** Limpia sesiones expiradas (> 24h). */
export function clearExpiredSessions(): void {
  const valid = readAllSessions();
  writeAllSessions(valid);
}

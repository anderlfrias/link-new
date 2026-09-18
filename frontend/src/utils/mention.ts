export interface ActiveMentionQuery {
  query: string;
  startIndex: number;
}

/**
 * Detecta si el cursor se encuentra actualmente dentro de una mención activa (iniciada con @).
 * Retorna el query de búsqueda actual y la posición de inicio del '@'.
 * Retorna null si no hay una mención activa bajo el cursor o si forma parte de un email.
 */
export function getActiveMentionQuery(text: string, cursorPosition: number): ActiveMentionQuery | null {
  if (cursorPosition < 0 || cursorPosition > text.length) return null;
  const textBeforeCursor = text.slice(0, cursorPosition);
  const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_.\u00C0-\u017F]*)$/);
  if (!match) return null;
  const query = match[1];
  const atIndex = textBeforeCursor.length - query.length - 1;
  return { query, startIndex: atIndex };
}

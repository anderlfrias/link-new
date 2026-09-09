/**
 * Utilidades para detectar y formatear URLs, correos electrónicos y teléfonos
 * en mensajes de texto para permitir interacción directa (abrir página, enviar correo, llamar).
 */

export type LinkTokenType = "text" | "url" | "email" | "phone";

export interface LinkToken {
  type: LinkTokenType;
  value: string;
  href?: string;
}

// Regex para detectar emails estándar
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Regex para detectar URLs (con protocolo http/https, con www, o con dominios conocidos)
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<]+|[a-zA-Z0-9][a-zA-Z0-9-]*\.(?:com|org|net|edu|gov|do|lat|io|co|me|info|biz|app|dev|es)(?:\/[^\s<]*)?/gi;

// Regex para candidatos de números telefónicos
const PHONE_CANDIDATE_REGEX = /(?:\+?\d{1,4}[-.\s]*)?(?:\(?\d{2,4}\)?[-.\s]*)?\d{3,4}[-.\s]?\d{3,4}|\b\d{10,12}\b/g;

/**
 * Limpia signos de puntuación sobrantes al final de un enlace, correo o teléfono
 * (ej. si el usuario escribió "¿viste https://google.com?" o "llama al 809-555-1234.").
 */
function trimTrailingPunctuation(raw: string, isUrl = false): { clean: string; trailing: string } {
  let clean = raw;
  let trailing = "";

  while (clean.length > 0) {
    const last = clean[clean.length - 1];
    if (/[.,;:!?]/.test(last)) {
      trailing = last + trailing;
      clean = clean.slice(0, -1);
      continue;
    }
    if (last === ")" && !clean.includes("(")) {
      trailing = last + trailing;
      clean = clean.slice(0, -1);
      continue;
    }
    if (last === "]" && !clean.includes("[")) {
      trailing = last + trailing;
      clean = clean.slice(0, -1);
      continue;
    }
    if (isUrl && (last === "'" || last === '"' || last === ">")) {
      trailing = last + trailing;
      clean = clean.slice(0, -1);
      continue;
    }
    break;
  }

  return { clean, trailing };
}

/**
 * Valida si un texto candidato es verdaderamente un número telefónico
 * y no una fecha, hora, código postal o número corto.
 */
export function isValidPhoneNumber(candidate: string): boolean {
  // Descartar fechas (YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY)
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(candidate)) return false;
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(candidate)) return false;
  // Descartar horas (HH:MM o HH:MM:SS)
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(candidate)) return false;

  const digits = candidate.replace(/\D/g, "");
  // Un teléfono internacional o local válido tiene entre 7 y 15 dígitos (estándar E.164)
  if (digits.length < 7 || digits.length > 15) return false;

  // Si no tiene separadores ni '+', exigimos al menos 10 dígitos (ej. 8095551234)
  // para no confundir números simples de 7 u 8 dígitos (como IDs o códigos) con teléfonos.
  const hasSeparators = /[-.()\s]/.test(candidate);
  const hasPlus = candidate.startsWith("+");
  if (!hasSeparators && !hasPlus && digits.length < 10) {
    return false;
  }

  return true;
}

/**
 * Normaliza un número telefónico para el esquema tel:
 */
export function buildTelHref(phone: string): string {
  const hasPlus = phone.trim().startsWith("+");
  const digits = phone.replace(/\D/g, "");
  return `tel:${hasPlus ? `+${digits}` : digits}`;
}

/**
 * Normaliza una URL para el esquema http/https
 */
export function buildUrlHref(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

/**
 * Tokeniza el contenido de un mensaje separando texto plano, URLs, correos y teléfonos.
 */
export function tokenizeMessageContent(content: string): LinkToken[] {
  if (!content) return [];

  // Paso 1: Encontrar todos los emails y URLs primero (tienen precedencia sobre números telefónicos)
  interface MatchItem {
    start: number;
    end: number;
    type: "email" | "url";
    value: string;
    href: string;
  }

  const firstPassMatches: MatchItem[] = [];

  // Buscar correos electrónicos
  const emailRegex = new RegExp(EMAIL_REGEX.source, "g");
  let emailMatch: RegExpExecArray | null;
  while ((emailMatch = emailRegex.exec(content)) !== null) {
    const rawValue = emailMatch[0];
    const { clean } = trimTrailingPunctuation(rawValue);
    firstPassMatches.push({
      start: emailMatch.index,
      end: emailMatch.index + clean.length,
      type: "email",
      value: clean,
      href: `mailto:${clean}`,
    });
  }

  // Buscar URLs
  const urlRegex = new RegExp(URL_REGEX.source, "gi");
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlRegex.exec(content)) !== null) {
    const start = urlMatch.index;
    const rawValue = urlMatch[0];
    const end = start + rawValue.length;

    // Verificar si se solapa con un correo ya encontrado (ej. el dominio de un email)
    const overlapsEmail = firstPassMatches.some(
      (m) => m.type === "email" && start < m.end && end > m.start,
    );
    if (overlapsEmail) continue;

    const { clean } = trimTrailingPunctuation(rawValue, true);
    if (!clean) continue;

    firstPassMatches.push({
      start,
      end: start + clean.length,
      type: "url",
      value: clean,
      href: buildUrlHref(clean),
    });
  }

  // Ordenar los matches encontrados por posición inicial
  firstPassMatches.sort((a, b) => a.start - b.start);

  // Construir tokens de nivel 1 (text, email, url)
  interface IntermediateToken {
    isLink: boolean;
    type?: "email" | "url";
    value: string;
    href?: string;
  }

  const intermediate: IntermediateToken[] = [];
  let cursor = 0;

  for (const m of firstPassMatches) {
    if (m.start < cursor) continue; // Evitar solapamientos accidentales
    if (m.start > cursor) {
      intermediate.push({
        isLink: false,
        value: content.slice(cursor, m.start),
      });
    }
    intermediate.push({
      isLink: true,
      type: m.type,
      value: m.value,
      href: m.href,
    });
    cursor = m.end;
  }

  if (cursor < content.length) {
    intermediate.push({
      isLink: false,
      value: content.slice(cursor),
    });
  }

  // Paso 2: Para cada segmento de texto que NO sea un link, buscar números telefónicos
  const finalTokens: LinkToken[] = [];

  for (const seg of intermediate) {
    if (seg.isLink) {
      finalTokens.push({
        type: seg.type!,
        value: seg.value,
        href: seg.href!,
      });
      continue;
    }

    // Buscar teléfonos en seg.value
    const text = seg.value;
    const phoneRegex = new RegExp(PHONE_CANDIDATE_REGEX.source, "g");
    let phoneMatch: RegExpExecArray | null;
    let textCursor = 0;

    while ((phoneMatch = phoneRegex.exec(text)) !== null) {
      const matchIndex = phoneMatch.index;
      const rawMatch = phoneMatch[0];
      const { clean } = trimTrailingPunctuation(rawMatch);

      if (!clean || !isValidPhoneNumber(clean)) {
        continue;
      }

      if (matchIndex > textCursor) {
        finalTokens.push({
          type: "text",
          value: text.slice(textCursor, matchIndex),
        });
      }

      finalTokens.push({
        type: "phone",
        value: clean,
        href: buildTelHref(clean),
      });

      textCursor = matchIndex + clean.length;
      phoneRegex.lastIndex = textCursor;
    }

    if (textCursor < text.length) {
      finalTokens.push({
        type: "text",
        value: text.slice(textCursor),
      });
    }
  }

  return finalTokens;
}

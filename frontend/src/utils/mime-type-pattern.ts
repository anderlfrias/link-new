/** Espejo de MIME_TYPE_PATTERN (backend/src/modules/settings/settings.validator.ts).
 * "type/subtype" o wildcard "type/*" — valida en el cliente ANTES de mandar un tipo
 * personalizado al backend, para que el error aparezca al tipear y no recién al guardar. */
export const MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9.+-]*\/(\*|[a-z0-9][a-z0-9.+-]*)$/i;

export function isValidMimeTypePattern(value: string): boolean {
  return MIME_TYPE_PATTERN.test(value.trim());
}

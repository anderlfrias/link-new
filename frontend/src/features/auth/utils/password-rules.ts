import type { PasswordPolicy } from "@/features/auth/types/auth.types";

/** Las mismas reglas que valida el backend (`backend/src/modules/auth/password.ts`).
 * Acá solo sirven para mostrar en vivo qué falta: la autoridad es el backend. */
export type PasswordRule = "min_length" | "max_length" | "uppercase" | "lowercase" | "number" | "symbol";

const MIN_LENGTH_FLOOR = 8;

/** Mismo criterio que el backend: NFKC y largo en code points (un emoji cuenta como uno). */
function normalizedLength(password: string): { normalized: string; length: number } {
  const normalized = password.normalize("NFKC");
  return { normalized, length: [...normalized].length };
}

/** Reglas que aplican con esta política, en el orden en que se muestran. */
export function activePasswordRules(policy: PasswordPolicy): PasswordRule[] {
  const rules: PasswordRule[] = ["min_length"];
  if (policy.requireUppercase) rules.push("uppercase");
  if (policy.requireLowercase) rules.push("lowercase");
  if (policy.requireNumber) rules.push("number");
  if (policy.requireSymbol) rules.push("symbol");
  return rules;
}

export function effectiveMinLength(policy: PasswordPolicy): number {
  return Math.min(Math.max(policy.minLength, MIN_LENGTH_FLOOR), policy.maxLength);
}

/** Reglas que la contraseña no cumple (vacío = las cumple todas). */
export function failedPasswordRules(password: string, policy: PasswordPolicy): PasswordRule[] {
  const { normalized, length } = normalizedLength(password);
  const failed: PasswordRule[] = [];
  if (length < effectiveMinLength(policy)) failed.push("min_length");
  if (length > policy.maxLength) failed.push("max_length");
  if (policy.requireUppercase && !/\p{Lu}/u.test(normalized)) failed.push("uppercase");
  if (policy.requireLowercase && !/\p{Ll}/u.test(normalized)) failed.push("lowercase");
  if (policy.requireNumber && !/\p{Nd}/u.test(normalized)) failed.push("number");
  if (policy.requireSymbol && !/[^\p{L}\p{N}\p{M}]/u.test(normalized)) failed.push("symbol");
  return failed;
}

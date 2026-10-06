import { randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from "crypto";

/// Hash y política de contraseñas del modo local (LOCAL_AUTH_PLAN.md, D4 y D15).
///
/// Los parámetros de scrypt y el largo máximo son fijos en código a propósito,
/// no van al panel: un N mal elegido tira el proceso por memoria (cada hash
/// reserva 128·N·r bytes fuera del heap, y libuv corre 4 a la vez), y sin
/// máximo cualquiera puede mandar un input gigante para ocupar CPU.
/// N=2^14, r=8, p=5 es la configuración equivalente de OWASP a N=2^17 con
/// 16 MiB en vez de 128 MiB.
const SCRYPT_N = 2 ** 14;
const SCRYPT_R = 8;
const SCRYPT_P = 5;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
/// Topes para los parámetros que vienen de un hash guardado: uno adulterado
/// con un N o un r enormes no puede hacer que verificarlo reserve cientos de
/// MiB (128·N·r), ni con un p enorme ocupar la CPU. Si algún día se suben los
/// parámetros de arriba, estos topes suben con ellos.
const MAX_STORED_MEMORY_BYTES = 64 * 1024 * 1024;
const MAX_STORED_P = 16;

/// El piso de NIST SP 800-63B: no se puede bajar ni por API (D15).
export const PASSWORD_MIN_LENGTH_FLOOR = 8;
export const PASSWORD_MAX_LENGTH = 128;

/// Las reglas de la política que configura un admin (`AppSettings`, §4.4).
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

export type PasswordRule = "min_length" | "max_length" | "uppercase" | "lowercase" | "number" | "symbol";

export interface PasswordVerification {
  valid: boolean;
  /// El hash usa parámetros viejos: conviene rehashear en este login, ahora que
  /// se tiene la contraseña en texto plano (D4).
  needsRehash: boolean;
}

/// NFKC: la misma contraseña escrita con caracteres equivalentes (ancho
/// completo, ligaduras, tildes compuestas o separadas) tiene que dar el mismo
/// hash, porque distintos teclados y sistemas operativos producen formas
/// distintas.
function normalize(password: string): string {
  return password.normalize("NFKC");
}

/// Largo en code points, no en unidades UTF-16: un emoji cuenta como un caracter.
function length(normalized: string): number {
  return [...normalized].length;
}

function deriveKey(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  // Siempre la versión async: scryptSync bloquearía el event loop, y con él
  // todos los sockets (D4).
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/// `maxmem` holgado: el default de Node (32 MiB) queda justo para 128·N·r.
function scryptOptions(N: number, r: number, p: number): ScryptOptions {
  return { N, r, p, maxmem: 256 * N * r + 1024 * 1024 };
}

/// Formato autodescriptivo `scrypt$N$r$p$salt$hash` (salt y hash en base64url):
/// guardar los parámetros permite subirlos más adelante rehasheando en el
/// próximo login exitoso.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(normalize(password), salt, KEY_LENGTH, scryptOptions(SCRYPT_N, SCRYPT_R, SCRYPT_P));
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, rawN, rawR, rawP, rawSalt, rawKey] = parts;
  if (![rawN, rawR, rawP].every((value) => /^\d+$/.test(value))) return null;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  const isPowerOfTwo = N >= 2 && Number.isSafeInteger(N) && (N & (N - 1)) === 0;
  if (!isPowerOfTwo || r < 1 || p < 1 || p > MAX_STORED_P || 128 * N * r > MAX_STORED_MEMORY_BYTES) return null;
  const salt = Buffer.from(rawSalt, "base64url");
  const key = Buffer.from(rawKey, "base64url");
  if (salt.length === 0 || key.length === 0) return null;
  return { N, r, p, salt, key };
}

/// Un hash adulterado o de un formato desconocido no es un error del server:
/// esa contraseña simplemente no es válida.
export async function verifyPassword(password: string, stored: string): Promise<PasswordVerification> {
  const parsed = parseHash(stored);
  if (!parsed || length(normalize(password)) > PASSWORD_MAX_LENGTH) {
    return { valid: false, needsRehash: false };
  }
  const key = await deriveKey(normalize(password), parsed.salt, parsed.key.length, scryptOptions(parsed.N, parsed.r, parsed.p));
  const valid = timingSafeEqual(key, parsed.key);
  const needsRehash =
    valid &&
    (parsed.N !== SCRYPT_N ||
      parsed.r !== SCRYPT_R ||
      parsed.p !== SCRYPT_P ||
      parsed.key.length !== KEY_LENGTH ||
      parsed.salt.length !== SALT_LENGTH);
  return { valid, needsRehash };
}

/// El largo mínimo que rige de verdad: nunca menos que el piso ni más que el
/// máximo, diga lo que diga la política recibida.
export function effectiveMinLength(minLength: number): number {
  return Math.min(Math.max(minLength, PASSWORD_MIN_LENGTH_FLOOR), PASSWORD_MAX_LENGTH);
}

/// Reglas que la contraseña no cumple (vacío = cumple). Aplica el piso de 8 y
/// el máximo de 128 aunque la política diga otra cosa.
export function evaluatePasswordPolicy(password: string, policy: PasswordPolicy): PasswordRule[] {
  const normalized = normalize(password);
  const chars = length(normalized);
  const failed: PasswordRule[] = [];
  if (chars < effectiveMinLength(policy.minLength)) failed.push("min_length");
  if (chars > PASSWORD_MAX_LENGTH) failed.push("max_length");
  if (policy.requireUppercase && !/\p{Lu}/u.test(normalized)) failed.push("uppercase");
  if (policy.requireLowercase && !/\p{Ll}/u.test(normalized)) failed.push("lowercase");
  if (policy.requireNumber && !/\p{Nd}/u.test(normalized)) failed.push("number");
  // Símbolo: cualquier caracter que no sea letra, número ni marca diacrítica.
  if (policy.requireSymbol && !/[^\p{L}\p{N}\p{M}]/u.test(normalized)) failed.push("symbol");
  return failed;
}

/// ¿Es una de las contraseñas anteriores? De a una, no en paralelo: cada
/// verificación reserva 16 MiB, y el historial llega a 12 (D15).
export async function isPasswordReused(password: string, previousHashes: string[]): Promise<boolean> {
  for (const stored of previousHashes) {
    if ((await verifyPassword(password, stored)).valid) return true;
  }
  return false;
}

// Sin caracteres que se confunden al dictarlos o copiarlos a mano (I/l/1, O/0)
// ni comillas, espacios o barras, que suelen romper al pegarlos en otro lado.
const TEMPORARY_UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TEMPORARY_LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const TEMPORARY_DIGITS = "23456789";
const TEMPORARY_SYMBOLS = "!#$%&*+-=?@^_~";
const TEMPORARY_ALPHABET = TEMPORARY_UPPERCASE + TEMPORARY_LOWERCASE + TEMPORARY_DIGITS + TEMPORARY_SYMBOLS;

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)];
}

/// Contraseña temporal para un alta o un restablecimiento. Siempre tiene al
/// menos una mayúscula, una minúscula, un número y un símbolo, y un largo de
/// `max(16, mínimo vigente)`: así cumple cualquier política configurable.
export function generateTemporaryPassword(policy: Pick<PasswordPolicy, "minLength">): string {
  const size = Math.max(16, effectiveMinLength(policy.minLength));
  const chars = [
    pick(TEMPORARY_UPPERCASE),
    pick(TEMPORARY_LOWERCASE),
    pick(TEMPORARY_DIGITS),
    pick(TEMPORARY_SYMBOLS),
  ];
  while (chars.length < size) chars.push(pick(TEMPORARY_ALPHABET));
  // Fisher-Yates con randomInt: los cuatro obligatorios no quedan siempre al principio.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/// Configuración de autenticación del core: el secreto con el que LINK firma sus
/// sesiones. Todo lo propio de un proveedor externo (sus variables, su validación) lo
/// lee y valida el proveedor en su `init()` (auth-providers/api.ts).
///
/// `sessionSecret` firma las sesiones de LINK (HS256) en **todos** los modos: LINK emite
/// siempre su propio token, también cuando el login lo valida un proveedor externo
/// (ver docs/auth-providers.md). El token del proveedor no sale del login.
export interface AuthConfig {
  sessionSecret: string;
}

/// Variables de las que se deduce la configuración, ya pasadas por el schema de
/// `env.ts`: un string vacío llega como `undefined`.
export interface AuthEnvVars {
  SESSION_JWT_SECRET?: string;
  /// Nombre anterior de `SESSION_JWT_SECRET` (cuando solo lo usaba el modo local).
  LOCAL_AUTH_JWT_SECRET?: string;
}

export interface ResolvedAuthConfig {
  config: AuthConfig;
  /// Avisos no fatales. Los loguea `server.ts` al arrancar: este archivo lo
  /// importa `env.ts`, donde todavía no existe el logger.
  warnings: string[];
}

export const SESSION_JWT_SECRET_MIN_LENGTH = 32;

/// Configuración de autenticación inválida. Expone `errors` igual que
/// `yup.ValidationError`, para que `env.ts` la imprima por el mismo canal y
/// con el mismo formato antes de cortar el arranque.
export class AuthConfigError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join("\n"));
    this.name = "AuthConfigError";
  }
}

/// Deduce la configuración a partir del `.env`. Pura a propósito (no lee `process.env`
/// ni importa `env.ts`): así se testea con una matriz de casos sin tener que esquivar
/// el `process.exit` de `env.ts`.
export function resolveAuthConfig(vars: AuthEnvVars): ResolvedAuthConfig {
  const warnings: string[] = [];

  // `LOCAL_AUTH_JWT_SECRET` se acepta como alias deprecado para no romper las
  // instalaciones locales existentes.
  let sessionSecret = vars.SESSION_JWT_SECRET;
  if (sessionSecret) {
    if (vars.LOCAL_AUTH_JWT_SECRET) {
      warnings.push("LOCAL_AUTH_JWT_SECRET is deprecated and ignored because SESSION_JWT_SECRET is set: remove it");
    }
  } else if (vars.LOCAL_AUTH_JWT_SECRET) {
    sessionSecret = vars.LOCAL_AUTH_JWT_SECRET;
    warnings.push("LOCAL_AUTH_JWT_SECRET is deprecated: rename it to SESSION_JWT_SECRET (same value)");
  }
  if (!sessionSecret) {
    throw new AuthConfigError(["SESSION_JWT_SECRET is required: it signs the session tokens of every login mode"]);
  }
  if (sessionSecret.length < SESSION_JWT_SECRET_MIN_LENGTH) {
    throw new AuthConfigError([
      `SESSION_JWT_SECRET must be at least ${SESSION_JWT_SECRET_MIN_LENGTH} characters long`,
    ]);
  }

  return { config: { sessionSecret }, warnings };
}

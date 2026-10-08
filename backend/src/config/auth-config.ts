import { ServiceUnavailableError } from "../utils/errors";

/// Modo de autenticación de la instalación (ver LOCAL_AUTH_PLAN.md, D1). No
/// lo elige ninguna variable: se deduce de si el `.env` configura EXTERNAL_AUTH o no.
/// Una instalación usa uno u otro, nunca los dos a la vez.
export type AuthMode = "external-auth" | "local";

export interface ExternalUserAuthConfig {
  /// URL base de EXTERNAL_AUTH, sin el sufijo `/v1/login`.
  apiUrl: string;
  /// Código de esta aplicación registrado en EXTERNAL_AUTH.
  appCode: string;
  /// Secreto compartido para verificar (HS256) el JWT que emite EXTERNAL_AUTH al iniciar sesión.
  jwtSecret: string;
}

/// `sessionSecret` firma las sesiones de LINK (HS256) en **todos** los modos: LINK emite
/// siempre su propio token, también cuando el login lo valida un proveedor externo
/// (AUTH_PROVIDERS_PLAN, decisión 1). El token del proveedor no sale del login.
export type AuthConfig =
  | { mode: "external-auth"; sessionSecret: string; external-auth: ExternalUserAuthConfig }
  | { mode: "local"; sessionSecret: string };

/// Variables de las que se deduce la configuración, ya pasadas por el schema de
/// `env.ts`: un string vacío llega como `undefined`.
export interface AuthEnvVars {
  EXTERNAL_AUTH_API_URL?: string;
  APP_CODE_EXTERNAL_AUTH?: string;
  EXTERNAL_AUTH_JWT_SECRET?: string;
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

const EXTERNAL_AUTH_ENV_VARS = ["EXTERNAL_AUTH_API_URL", "APP_CODE_EXTERNAL_AUTH", "EXTERNAL_AUTH_JWT_SECRET"] as const;

/// Configuración de autenticación inválida. Expone `errors` igual que
/// `yup.ValidationError`, para que `env.ts` la imprima por el mismo canal y
/// con el mismo formato antes de cortar el arranque.
export class AuthConfigError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join("\n"));
    this.name = "AuthConfigError";
  }
}

/// Deduce la configuración a partir del `.env` (LOCAL_AUTH_PLAN.md, D1 y D2). Pura a
/// propósito (no lee `process.env` ni importa `env.ts`): así se testea con
/// una matriz de casos sin tener que esquivar el `process.exit` de `env.ts`.
export function resolveAuthConfig(vars: AuthEnvVars): ResolvedAuthConfig {
  const warnings: string[] = [];

  // Una o dos de las tres EXTERNAL_AUTH_*: casi siempre un typo o una variable borrada a
  // medias. Pasar en silencio a modo local dejaría a todos sin poder entrar,
  // sin ninguna pista de por qué.
  const missing = EXTERNAL_AUTH_ENV_VARS.filter((name) => !vars[name]);
  if (missing.length > 0 && missing.length < EXTERNAL_AUTH_ENV_VARS.length) {
    throw new AuthConfigError([
      `Incomplete EXTERNAL_AUTH configuration: missing ${missing.join(", ")}. ` +
        "Set all three EXTERNAL_AUTH_* variables to use EXTERNAL_AUTH, or none of them to use local accounts.",
    ]);
  }

  // El secreto de sesión es obligatorio en los dos modos. `LOCAL_AUTH_JWT_SECRET` se
  // acepta como alias deprecado para no romper las instalaciones locales existentes.
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

  const { EXTERNAL_AUTH_API_URL: apiUrl, APP_CODE_EXTERNAL_AUTH: appCode, EXTERNAL_AUTH_JWT_SECRET: external-authJwtSecret } = vars;
  if (apiUrl && appCode && external-authJwtSecret) {
    return {
      config: { mode: "external-auth", sessionSecret, external-auth: { apiUrl, appCode, jwtSecret: external-authJwtSecret } },
      warnings,
    };
  }

  return { config: { mode: "local", sessionSecret }, warnings };
}

/// Config de EXTERNAL_AUTH, para el código que solo tiene sentido en modo external-auth
/// (login contra EXTERNAL_AUTH, verificar su JWT, fotos y contactos). En modo local
/// tira en vez de devolver `undefined`: así nadie arma una URL
/// "undefined/v1/login", y si alguno de esos caminos se llega a alcanzar,
/// el error dice por qué.
export function requireExternalUserConfig(config: AuthConfig): ExternalUserAuthConfig {
  if (config.mode !== "external-auth") {
    throw new ServiceUnavailableError(
      "EXTERNAL_AUTH no está configurado en esta instalación.",
      "external-auth_not_configured",
    );
  }
  return config.external-auth;
}

/// Guarda para el código que solo tiene sentido con cuentas locales (login
/// local, administrar contraseñas, alta de cuentas). En modo external-auth tira, como
/// `requireExternalUserConfig` en el modo local.
export function requireLocalAuth(config: AuthConfig): void {
  if (config.mode !== "local") {
    throw new ServiceUnavailableError(
      "Las cuentas locales no están habilitadas en esta instalación.",
      "local_auth_not_enabled",
    );
  }
}

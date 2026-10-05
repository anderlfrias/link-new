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
  /// Secreto compartido para verificar (HS256) los JWT que emite EXTERNAL_AUTH.
  jwtSecret: string;
}

export interface LocalAuthConfig {
  /// Secreto para firmar (HS256) los tokens de las cuentas locales.
  jwtSecret: string;
}

export type AuthConfig =
  | { mode: "external-auth"; external-auth: ExternalUserAuthConfig }
  | { mode: "local"; local: LocalAuthConfig };

/// Variables de las que se deduce el modo, ya pasadas por el schema de
/// `env.ts`: un string vacío llega como `undefined`.
export interface AuthEnvVars {
  EXTERNAL_AUTH_API_URL?: string;
  APP_CODE_EXTERNAL_AUTH?: string;
  EXTERNAL_AUTH_JWT_SECRET?: string;
  LOCAL_AUTH_JWT_SECRET?: string;
}

export interface ResolvedAuthConfig {
  config: AuthConfig;
  /// Avisos no fatales. Los loguea `server.ts` al arrancar: este archivo lo
  /// importa `env.ts`, donde todavía no existe el logger.
  warnings: string[];
}

export const LOCAL_AUTH_JWT_SECRET_MIN_LENGTH = 32;

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

/// Deduce el modo a partir del `.env` (LOCAL_AUTH_PLAN.md, D1 y D2). Pura a
/// propósito (no lee `process.env` ni importa `env.ts`): así se testea con
/// una matriz de casos sin tener que esquivar el `process.exit` de `env.ts`.
export function resolveAuthConfig(vars: AuthEnvVars): ResolvedAuthConfig {
  const { EXTERNAL_AUTH_API_URL: apiUrl, APP_CODE_EXTERNAL_AUTH: appCode, EXTERNAL_AUTH_JWT_SECRET: external-authJwtSecret } = vars;

  if (apiUrl && appCode && external-authJwtSecret) {
    return {
      config: { mode: "external-auth", external-auth: { apiUrl, appCode, jwtSecret: external-authJwtSecret } },
      warnings: vars.LOCAL_AUTH_JWT_SECRET
        ? ["LOCAL_AUTH_JWT_SECRET is set but EXTERNAL_AUTH is configured (external-auth mode): it is ignored"]
        : [],
    };
  }

  // Una o dos de las tres: casi siempre un typo o una variable borrada a
  // medias. Pasar en silencio a modo local dejaría a todos sin poder entrar,
  // sin ninguna pista de por qué.
  const missing = EXTERNAL_AUTH_ENV_VARS.filter((name) => !vars[name]);
  if (missing.length < EXTERNAL_AUTH_ENV_VARS.length) {
    throw new AuthConfigError([
      `Incomplete EXTERNAL_AUTH configuration: missing ${missing.join(", ")}. ` +
        "Set all three EXTERNAL_AUTH_* variables to use EXTERNAL_AUTH, or none of them to use local accounts.",
    ]);
  }

  const localJwtSecret = vars.LOCAL_AUTH_JWT_SECRET;
  if (!localJwtSecret) {
    throw new AuthConfigError([
      "LOCAL_AUTH_JWT_SECRET is required when EXTERNAL_AUTH is not configured (local mode)",
    ]);
  }
  if (localJwtSecret.length < LOCAL_AUTH_JWT_SECRET_MIN_LENGTH) {
    throw new AuthConfigError([
      `LOCAL_AUTH_JWT_SECRET must be at least ${LOCAL_AUTH_JWT_SECRET_MIN_LENGTH} characters long`,
    ]);
  }

  return { config: { mode: "local", local: { jwtSecret: localJwtSecret } }, warnings: [] };
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

/// Secreto JWT del modo activo. Hoy lo usa solo la firma de URLs de archivos,
/// como respaldo cuando no hay `FILE_URL_SIGNING_SECRET` (antes ese respaldo
/// era siempre `EXTERNAL_AUTH_JWT_SECRET`, que en modo local no existe).
export function getAuthJwtSecret(config: AuthConfig): string {
  return config.mode === "external-auth" ? config.external-auth.jwtSecret : config.local.jwtSecret;
}

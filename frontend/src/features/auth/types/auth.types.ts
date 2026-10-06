/** Ver backend/API.md, sección 2 (Autenticación). */

export interface LoginCredentials {
  /** Nombre de usuario o correo electrónico, en los dos modos. */
  user: string;
  password: string;
}

/** Modo de autenticación de la instalación (docs/design/LOCAL_AUTH_PLAN.md). */
export type AuthMode = "external-auth" | "local";

/** Por qué el login exigió cambiar la contraseña. */
export type MustChangePasswordReason = "reset" | "expired" | "policy";

export interface AuthUser {
  /** En modo external-auth, el id externo de EXTERNAL_AUTH — NO usar para relacionar nada
   * dentro del chat. En modo local es igual a `internalUserId`. */
  id: string;
  email: string;
  /** Null en las cuentas locales sin nombre de usuario. */
  username: string | null;
  fullName: string;
  roles: string[];
  permissions: string[];
  app: string;
  exp: number;
  /** Id interno (UUID de la tabla User local) — este es "mi id" para todo lo demás. */
  internalUserId: string;
  /** Quién autenticó la sesión. Opcional porque una sesión guardada antes de
   * que existiera el modo local no lo trae: ausente equivale a "external-auth". */
  authProvider?: AuthMode;
  /** Con `true`, el token es restringido: solo sirve para cambiar la contraseña. */
  mustChangePassword?: boolean;
  mustChangePasswordReason?: MustChangePasswordReason | null;
  /** Preferencia 100% local — ver backend User.notificationSoundEnabled. */
  notificationSoundEnabled: boolean;
  /** Idioma preferido del usuario — ver backend User.language. */
  language?: "es" | "en";
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface Session {
  token: string;
  user: AuthUser;
}

/** Política de contraseñas del modo local, tal como la expone `GET /auth/config`. */
export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  /** Cuántas contraseñas recientes no se pueden repetir, contando la actual. */
  historyCount: number;
}

/** `GET /auth/config`: público, se pide una vez al cargar la app. */
export type AuthConfig = { mode: "external-auth" } | { mode: "local"; passwordPolicy: PasswordPolicy };

/** Respuesta de `PATCH /auth/password`: el token nuevo reemplaza al actual. */
export interface ChangePasswordResponse {
  token: string;
  exp: number;
}

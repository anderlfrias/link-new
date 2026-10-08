/** Ver backend/API.md, sección 2 (Autenticación). */

export interface LoginCredentials {
  /** Nombre de usuario o correo electrónico, con cualquier proveedor. */
  user: string;
  password: string;
}

/** Por qué el login exigió cambiar la contraseña. */
export type MustChangePasswordReason = "reset" | "expired" | "policy";

export interface AuthUser {
  /** Igual a `internalUserId`. */
  id: string;
  email: string;
  /** Null en las cuentas locales sin nombre de usuario. */
  username: string | null;
  fullName: string;
  roles: string[];
  exp: number;
  /** Id interno (UUID de la tabla User local) — este es "mi id" para todo lo demás. */
  internalUserId: string;
  /** Id del proveedor que autenticó la sesión ("local" con cuentas propias). Es
   * informativo: la interfaz decide por `GET /auth/config`, no por este valor. */
  authProvider?: string;
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

/** Política de contraseñas de las cuentas locales, tal como la expone `GET /auth/config`. */
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

/** `GET /auth/config`: público, se pide una vez al cargar la app. La interfaz decide
 * qué mostrar por `capabilities`, no por el nombre del proveedor: `provider` solo
 * sirve para los textos. */
export interface AuthConfig {
  provider: {
    /** "local" con cuentas propias, o el id del proveedor externo. */
    id: string;
    /** Nombre visible: "LINK", o el del proveedor externo. */
    displayName: string;
    external: boolean;
  };
  capabilities: {
    /** Se puede cambiar la contraseña desde LINK (cuentas locales). */
    passwordChange: boolean;
    /** `full`: un admin crea y edita cuentas. `status-only`: solo activa o desactiva su
     * acceso; los datos de la cuenta los administra el proveedor. */
    accountManagement: "full" | "status-only";
  };
  /** Solo con cuentas locales. */
  passwordPolicy?: PasswordPolicy;
}

/** Respuesta de `PATCH /auth/password`: el token nuevo reemplaza al actual. */
export interface ChangePasswordResponse {
  token: string;
  exp: number;
}

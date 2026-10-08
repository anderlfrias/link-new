import { JwtPayload } from "jsonwebtoken";

/// Usuario autenticado, a partir del token de sesión de LINK en cada request.
///
/// En la sesión de LINK, `id === internalUserId` (el token lleva el id interno
/// en `sub`).
export interface MappedUser {
  id: string;
  email: string;
  /// Null en las cuentas locales sin username (es opcional, LOCAL_AUTH_PLAN.md D11).
  username: string | null;
  fullName: string;
  roles: string[];
  exp: number;
  /// Quién autenticó esta sesión: el id del proveedor ("local" con cuentas propias).
  authProvider: string;
  /// `id` interno (UUID) del perfil en la tabla `User` local. Lo completa
  /// `attachInternalUser` (ver `middlewares/current-user.middleware.ts`) para los
  /// módulos que necesiten relacionar datos con `User` (conversaciones, mensajes, etc.).
  internalUserId?: string;
}

/// Payload del token de sesión que firma este backend, en todos los modos de login (D5).
export interface SessionTokenPayload extends JwtPayload {
  /// Id interno (`User.id`).
  sub: string;
  email: string;
  /// "Password change required": solo presente (y en true) en un token
  /// restringido, que únicamente sirve para cambiar la contraseña (D13).
  pcr?: true;
}

/// Por qué el login emitió un token restringido (D13): un admin restableció la
/// contraseña, venció, o no cumple la política vigente.
export type MustChangePasswordReason = "reset" | "expired" | "policy";

/// `user` de la respuesta de `POST /auth/login`, en los dos modos (API.md §1).
export type LoginUserResponse = MappedUser & {
  internalUserId: string;
  mustChangePassword: boolean;
  mustChangePasswordReason: MustChangePasswordReason | null;
  notificationSoundEnabled: boolean;
  language: string;
};

/// `GET /auth/config` (D14): lo que el frontend necesita antes de tener sesión,
/// o con un token restringido. Nunca la duración de sesión ni el bloqueo.
///
/// El frontend decide qué mostrar por `capabilities`, no por el nombre del
/// proveedor: `provider` solo sirve para los textos ("Sincronizado con {displayName}").
export interface PublicAuthConfig {
  provider: {
    /// "local" con cuentas propias, o el `id` del proveedor externo.
    id: string;
    displayName: string;
    external: boolean;
  };
  capabilities: {
    /// Se puede cambiar la contraseña desde LINK (cuentas locales).
    passwordChange: boolean;
    /// `full`: un admin crea y edita cuentas. `status-only`: solo activa o desactiva
    /// su acceso; los datos de la cuenta los administra el proveedor.
    accountManagement: "full" | "status-only";
  };
  /// Solo con cuentas locales: lo necesario para elegir una contraseña.
  passwordPolicy?: {
    minLength: number;
    maxLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumber: boolean;
    requireSymbol: boolean;
    /// Cuántas contraseñas recientes no se pueden repetir, contando la actual.
    historyCount: number;
  };
}

/// Resultado de verificar el token de sesión de LINK (D6).
export interface AuthenticatedIdentity {
  user: MappedUser;
  /// Token restringido (`pcr`): solo sirve para `PATCH /auth/password`.
  mustChangePassword: boolean;
  /// `iat` del token, en segundos. Lo comparan `tokensValidAfter` y la duración
  /// de sesión vigente (D7).
  iat?: number;
}

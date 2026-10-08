import { JwtPayload } from "jsonwebtoken";

/// Usuario autenticado, a partir del token de sesión de LINK en cada request.
///
/// En la sesión de LINK, `id === internalUserId` (el token lleva el id interno
/// en `sub`) y `permissions` siempre es `[]`.
export interface MappedUser {
  id: string;
  email: string;
  /// Null en las cuentas locales sin username (es opcional, LOCAL_AUTH_PLAN.md D11).
  username: string | null;
  fullName: string;
  roles: string[];
  permissions: string[];
  app: string;
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
export type PublicAuthConfig =
  /// Con un proveedor externo, `mode` es su id.
  | { mode: string }
  | {
      mode: "local";
      passwordPolicy: {
        minLength: number;
        maxLength: number;
        requireUppercase: boolean;
        requireLowercase: boolean;
        requireNumber: boolean;
        requireSymbol: boolean;
        /// Cuántas contraseñas recientes no se pueden repetir, contando la actual.
        historyCount: number;
      };
    };

/// Resultado de verificar el token de sesión de LINK (D6).
export interface AuthenticatedIdentity {
  user: MappedUser;
  /// Token restringido (`pcr`): solo sirve para `PATCH /auth/password`.
  mustChangePassword: boolean;
  /// `iat` del token, en segundos. Lo comparan `tokensValidAfter` y la duración
  /// de sesión vigente (D7).
  iat?: number;
}

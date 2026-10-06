import { JwtPayload } from "jsonwebtoken";
import type { AuthMode } from "../../config/auth-config";

/// Restricción (permiso) asociada a un rol, tal como la expone EXTERNAL_AUTH.
export interface ExternalUserRestriction {
  code: string;
  [key: string]: unknown;
}

/// Rol de un usuario, tal como lo expone EXTERNAL_AUTH dentro del JWT. La clave con
/// el nombre del rol es `role` (no `name`) — confirmado contra un JWT real
/// emitido por EXTERNAL_AUTH, ej. `{ "role": "admin", "restrictions": [] }`.
export interface ExternalUserRole {
  role: string;
  restrictions?: ExternalUserRestriction[];
}

/// Payload del JWT emitido por EXTERNAL_AUTH.
export interface ExternalUserTokenPayload extends JwtPayload {
  id: string;
  email: string;
  username: string;
  name: string;
  firstSurname?: string;
  secondSurname?: string;
  roles: ExternalUserRole[];
  app: string;
  exp: number;
}

/// Respuesta del endpoint de login de EXTERNAL_AUTH.
export interface ExternalUserLoginResponse {
  success: boolean;
  token?: string;
  error?: string;
}

/// Usuario ya mapeado a la estructura interna, a partir del token del modo
/// activo (el JWT de EXTERNAL_AUTH, o el propio del modo local).
///
/// En modo local, `id === internalUserId` (el token lleva el id interno en
/// `sub`) y `permissions` siempre es `[]`: las restricciones por rol son un
/// concepto de EXTERNAL_AUTH.
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
  /// Quién autenticó esta sesión: el modo de la instalación.
  authProvider: AuthMode;
  /// `id` interno (UUID) del perfil en la tabla `User` local. No viene en el
  /// JWT de EXTERNAL_AUTH — lo agrega `attachInternalUser` (ver
  /// `middlewares/current-user.middleware.ts`) para los módulos que necesiten
  /// relacionar datos con `User` (conversaciones, mensajes, etc.).
  internalUserId?: string;
}

/// Payload del token que firma este backend en modo local (D5).
export interface LocalTokenPayload extends JwtPayload {
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
  | { mode: "external-auth" }
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

/// Resultado de verificar un token con el verificador del modo activo (D6).
export interface AuthenticatedIdentity {
  mode: AuthMode;
  user: MappedUser;
  /// Token restringido (`pcr`): solo sirve para `PATCH /auth/password`.
  mustChangePassword: boolean;
  /// `iat` del token, en segundos. En modo local lo comparan
  /// `tokensValidAfter` y la duración de sesión vigente (D7).
  iat?: number;
}

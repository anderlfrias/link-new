import { JwtPayload } from "jsonwebtoken";

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

/// Usuario ya mapeado a la estructura interna, a partir del JWT de EXTERNAL_AUTH.
export interface MappedUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  app: string;
  exp: number;
  /// `id` interno (UUID) del perfil en la tabla `User` local. No viene en el
  /// JWT de EXTERNAL_AUTH — lo agrega `attachInternalUser` (ver
  /// `middlewares/current-user.middleware.ts`) para los módulos que necesiten
  /// relacionar datos con `User` (conversaciones, mensajes, etc.).
  internalUserId?: string;
}

import jwt from "jsonwebtoken";
import { requireExternalUserConfig } from "../../config/auth-config";
import env from "../../config/env";
import { MappedUser, ExternalUserRole, ExternalUserTokenPayload } from "./auth.types";

/// Mismo criterio de armado de nombre que usa EXTERNAL_AUTH en el JWT (`name` +
/// apellidos) y en `/apps/users/by-codes` (ver auth.service.ts, `mapExternalUserAppUser`).
export function buildFullName(parts: {
  name?: string;
  firstSurname?: string;
  secondSurname?: string;
}): string {
  return [parts.name, parts.firstSurname, parts.secondSurname]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

export function mapTokenToUser(payload: ExternalUserTokenPayload): MappedUser {
  const fullName = buildFullName(payload);

  const roles = payload.roles.map((role: ExternalUserRole) => role.role);
  const permissions = payload.roles.flatMap(
    (role: ExternalUserRole) => role.restrictions?.map((restriction) => restriction.code) ?? [],
  );

  return {
    id: payload.id,
    email: payload.email,
    username: payload.username,
    fullName,
    roles,
    permissions,
    app: payload.app,
    exp: payload.exp,
  };
}

/// En modo local tira (`requireExternalUserConfig`): ahí ningún token de EXTERNAL_AUTH es
/// válido, por más bien firmado que esté con el secreto que EXTERNAL_AUTH usaba.
export function verifyToken(token: string): ExternalUserTokenPayload {
  const { jwtSecret } = requireExternalUserConfig(env.auth);
  return jwt.verify(token, jwtSecret, { algorithms: ["HS256"] }) as ExternalUserTokenPayload;
}

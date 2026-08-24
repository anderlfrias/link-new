import jwt from "jsonwebtoken";
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

export function verifyToken(token: string): ExternalUserTokenPayload {
  return jwt.verify(token, env.EXTERNAL_AUTH_JWT_SECRET, { algorithms: ["HS256"] }) as ExternalUserTokenPayload;
}

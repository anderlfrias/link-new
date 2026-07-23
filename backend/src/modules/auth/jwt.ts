import jwt from "jsonwebtoken";
import env from "../../config/env";
import { MappedUser, ExternalUserRole, ExternalUserTokenPayload } from "./auth.types";

export function mapTokenToUser(payload: ExternalUserTokenPayload): MappedUser {
  const fullName = [payload.name, payload.firstSurname, payload.secondSurname]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  const roles = payload.roles.map((role: ExternalUserRole) => role.name);
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

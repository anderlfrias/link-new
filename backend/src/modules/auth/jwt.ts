import jwt, { JsonWebTokenError } from "jsonwebtoken";
import { requireExternalUserConfig } from "../../config/auth-config";
import env from "../../config/env";
import { AuthenticatedIdentity, SessionTokenPayload, MappedUser, ExternalUserRole, ExternalUserTokenPayload } from "./auth.types";

/// Emisor y audiencia de los tokens de sesión de LINK (LOCAL_AUTH_PLAN.md, D5).
/// No cuestan nada y evitan aceptar el token de otra app firmado con el mismo
/// secreto.
export const SESSION_TOKEN_ISSUER = "link";
export const SESSION_TOKEN_AUDIENCE = "link";

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
    authProvider: "external-auth",
  };
}

/// Verifica el JWT que EXTERNAL_AUTH devuelve en el login. Solo se usa en ese momento: a
/// partir de ahí la sesión es el token propio de LINK (`signSessionToken`) y el de
/// EXTERNAL_AUTH no se acepta en ningún otro lugar. En modo local tira
/// (`requireExternalUserConfig`).
export function verifyToken(token: string): ExternalUserTokenPayload {
  const { jwtSecret } = requireExternalUserConfig(env.auth);
  return jwt.verify(token, jwtSecret, { algorithms: ["HS256"] }) as ExternalUserTokenPayload;
}

/// Firma la sesión de una cuenta (D5): HS256 con `SESSION_JWT_SECRET`, `sub` =
/// id interno, y `pcr` ("password change required") solo si el token es
/// restringido (D13). Es la sesión de LINK en todos los modos de login.
export function signSessionToken(
  user: { id: string; email: string },
  options: { ttlHours: number; mustChangePassword: boolean },
): string {
  const claims: Pick<SessionTokenPayload, "email" | "pcr"> = { email: user.email };
  if (options.mustChangePassword) claims.pcr = true;
  return jwt.sign(claims, env.auth.sessionSecret, {
    algorithm: "HS256",
    subject: user.id,
    issuer: SESSION_TOKEN_ISSUER,
    audience: SESSION_TOKEN_AUDIENCE,
    expiresIn: Math.round(options.ttlHours * 3600),
  });
}

/// El único verificador de tokens de request: solo acepta la sesión propia de
/// LINK. El token de un proveedor externo (EXTERNAL_AUTH) no autentica en ningún lado
/// aunque esté bien firmado. Los errores son los de `jsonwebtoken`
/// (`TokenExpiredError` incluido): los middlewares ya los traducen a 401.
export function verifyAccessToken(token: string): AuthenticatedIdentity {
  const payload = jwt.verify(token, env.auth.sessionSecret, {
    algorithms: ["HS256"],
    issuer: SESSION_TOKEN_ISSUER,
    audience: SESSION_TOKEN_AUDIENCE,
  }) as SessionTokenPayload;
  if (typeof payload.sub !== "string" || typeof payload.email !== "string" || typeof payload.iat !== "number") {
    throw new JsonWebTokenError("malformed session token");
  }
  return {
    // Solo lo que dice el token. Nombre, username y roles salen de la base en
    // `resolveInternalUser`: hasta entonces `roles` queda vacío, así que un
    // `requireRoles` montado sin `attachInternalUser` falla cerrado (D7).
    user: {
      id: payload.sub,
      email: payload.email,
      username: null,
      fullName: "",
      roles: [],
      permissions: [],
      app: SESSION_TOKEN_AUDIENCE,
      exp: payload.exp ?? 0,
      authProvider: env.auth.mode,
    },
    mustChangePassword: payload.pcr === true,
    iat: payload.iat,
  };
}

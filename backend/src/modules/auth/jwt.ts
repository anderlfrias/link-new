import jwt, { JsonWebTokenError } from "jsonwebtoken";
import { requireLocalConfig, requireExternalUserConfig } from "../../config/auth-config";
import env from "../../config/env";
import { AuthenticatedIdentity, LocalTokenPayload, MappedUser, ExternalUserRole, ExternalUserTokenPayload } from "./auth.types";

/// Emisor y audiencia de los tokens del modo local (LOCAL_AUTH_PLAN.md, D5).
/// No cuestan nada y evitan aceptar el token de otra app firmado con el mismo
/// secreto.
export const LOCAL_TOKEN_ISSUER = "link-local";
export const LOCAL_TOKEN_AUDIENCE = "link";

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

/// En modo local tira (`requireExternalUserConfig`): ahí ningún token de EXTERNAL_AUTH es
/// válido, por más bien firmado que esté con el secreto que EXTERNAL_AUTH usaba.
export function verifyToken(token: string): ExternalUserTokenPayload {
  const { jwtSecret } = requireExternalUserConfig(env.auth);
  return jwt.verify(token, jwtSecret, { algorithms: ["HS256"] }) as ExternalUserTokenPayload;
}

/// Firma el token de una cuenta local (D5): HS256 con `LOCAL_AUTH_JWT_SECRET`,
/// `sub` = id interno, y `pcr` ("password change required") solo si el token
/// es restringido (D13). En modo external-auth tira: ahí el backend no emite tokens.
export function signLocalToken(
  user: { id: string; email: string },
  options: { ttlHours: number; mustChangePassword: boolean },
): string {
  const { jwtSecret } = requireLocalConfig(env.auth);
  const claims: Pick<LocalTokenPayload, "email" | "pcr"> = { email: user.email };
  if (options.mustChangePassword) claims.pcr = true;
  return jwt.sign(claims, jwtSecret, {
    algorithm: "HS256",
    subject: user.id,
    issuer: LOCAL_TOKEN_ISSUER,
    audience: LOCAL_TOKEN_AUDIENCE,
    expiresIn: Math.round(options.ttlHours * 3600),
  });
}

/// El único verificador de tokens (D6): usa el del modo activo, así que al
/// cambiar de modo los tokens del modo anterior quedan muertos en el acto.
/// Los errores son los de `jsonwebtoken` (`TokenExpiredError` incluido): los
/// middlewares ya los traducen a 401.
export function verifyAccessToken(token: string): AuthenticatedIdentity {
  if (env.auth.mode === "external-auth") {
    const payload = verifyToken(token);
    // Un token local firmado con el mismo secreto (alguien reusó el valor en
    // las dos variables) tiene firma válida, pero no es de EXTERNAL_AUTH.
    if (payload.iss === LOCAL_TOKEN_ISSUER || typeof payload.email !== "string" || !Array.isArray(payload.roles)) {
      throw new JsonWebTokenError("token is not an EXTERNAL_AUTH token");
    }
    return { mode: "external-auth", user: mapTokenToUser(payload), mustChangePassword: false, iat: payload.iat };
  }

  const payload = jwt.verify(token, env.auth.local.jwtSecret, {
    algorithms: ["HS256"],
    issuer: LOCAL_TOKEN_ISSUER,
    audience: LOCAL_TOKEN_AUDIENCE,
  }) as LocalTokenPayload;
  if (typeof payload.sub !== "string" || typeof payload.email !== "string" || typeof payload.iat !== "number") {
    throw new JsonWebTokenError("malformed local token");
  }
  return {
    mode: "local",
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
      app: LOCAL_TOKEN_AUDIENCE,
      exp: payload.exp ?? 0,
      authProvider: "local",
    },
    mustChangePassword: payload.pcr === true,
    iat: payload.iat,
  };
}

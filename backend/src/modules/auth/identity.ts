import { User, UserStatus } from "@prisma/client";
import { ForbiddenError, UnauthorizedError } from "../../utils/errors";
import * as SettingsService from "../settings/settings.service";
import { findUserByEmail, findUserById } from "./auth.repository";
import { AuthenticatedIdentity, MappedUser } from "./auth.types";
import { verifyAccessToken } from "./jwt";

/// Usuario autenticado y ya resuelto contra la base: el `MappedUser` completo
/// (con `internalUserId`) y la fila de `User`.
export interface ResolvedUser {
  user: MappedUser & { internalUserId: string };
  record: User;
}

function toSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/// Resolución de identidad unificada (LOCAL_AUTH_PLAN.md, D7). La usan
/// `attachInternalUser`, el handshake del socket y `/files/:id/content`: antes
/// eran tres copias de la misma búsqueda.
///
/// - Modo external-auth: busca por email, como siempre. Los roles siguen saliendo del
///   JWT de EXTERNAL_AUTH.
/// - Modo local: busca por id (`sub`), así un cambio de email hecho por un
///   admin no rompe ni redirige sesiones; rechaza el token si es anterior a
///   `tokensValidAfter` o más viejo que la duración de sesión vigente (D16), y
///   toma email, nombre, username y roles de la fila.
/// - Los dos: la cuenta tiene que estar `ACTIVE` (D19).
///
/// Tira `UnauthorizedError`: para el cliente, una cuenta desactivada o una
/// sesión revocada es una sesión que terminó.
export async function resolveInternalUser(identity: AuthenticatedIdentity): Promise<ResolvedUser> {
  if (identity.mode === "external-auth") {
    const record = await findUserByEmail(identity.user.email);
    assertActive(record);
    return { record, user: { ...identity.user, internalUserId: record.id } };
  }

  const record = await findUserById(identity.user.id);
  assertActive(record);
  if (identity.iat === undefined) {
    throw new UnauthorizedError("Invalid token");
  }
  // `iat` está en segundos y `tokensValidAfter` se guarda truncado al
  // segundo: un token emitido en el mismo segundo que el corte (como el que
  // devuelve el cambio de contraseña) sigue siendo válido (D9).
  if (record.tokensValidAfter && identity.iat < toSeconds(record.tokensValidAfter)) {
    throw new UnauthorizedError("Token revoked", "token_revoked");
  }
  // Bajar la duración de sesión corta también los tokens ya emitidos; subirla
  // no alarga ninguno, porque manda el `exp` firmado (D16).
  const { localSessionTtlHours } = await SettingsService.getSettings();
  if (toSeconds(new Date()) - identity.iat > localSessionTtlHours * 3600) {
    throw new UnauthorizedError("Session expired", "session_expired");
  }
  return {
    record,
    user: {
      ...identity.user,
      email: record.email,
      username: record.username,
      fullName: record.name,
      roles: record.localRoles,
      internalUserId: record.id,
    },
  };
}

function assertActive(record: User | null): asserts record is User {
  if (!record) {
    throw new UnauthorizedError("User not found");
  }
  if (record.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedError("Account disabled", "account_disabled");
  }
}

/// Un token restringido (`pcr`, D13) solo sirve para cambiar la contraseña.
/// Para el resto de la API es un 403 con un `code` que el frontend reconoce;
/// no un 401, que haría que el cliente cierre la sesión.
export function assertNotPasswordChangeOnly(identity: AuthenticatedIdentity): void {
  if (identity.mustChangePassword) {
    throw new ForbiddenError("Tenés que cambiar tu contraseña antes de continuar.", "password_change_required");
  }
}

/// Verificación completa de un token suelto, para los caminos que no pasan
/// por los middlewares de Express (el handshake del socket y la rama Bearer de
/// `/files/:id/content`): verifica con el modo activo, rechaza tokens
/// restringidos y resuelve el usuario.
export async function authenticateAccessToken(token: string): Promise<ResolvedUser> {
  const identity = verifyAccessToken(token);
  assertNotPasswordChangeOnly(identity);
  return resolveInternalUser(identity);
}

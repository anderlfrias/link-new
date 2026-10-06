import { randomBytes } from "crypto";
import { AuditAction, LocalCredential, User, UserStatus } from "@prisma/client";
import jwt, { JwtPayload } from "jsonwebtoken";
import env from "../../config/env";
import { getLogger } from "../../config/request-context";
import { BadRequestError } from "../../utils/errors";
import * as AuditService from "../audit/audit.service";
import { LoginFailureReason, PasswordChangeReason } from "../audit/audit.types";
import * as SettingsService from "../settings/settings.service";
import { LocalAuthPolicy } from "../settings/settings.types";
import { TOO_MANY_ATTEMPTS_MESSAGE } from "../../middlewares/rate-limit.middleware";
import {
  findLoginCandidates,
  findUserWithCredential,
  registerFailedLogin,
  resetFailedLogins,
  savePasswordChange,
  updatePasswordHash,
} from "./auth.repository";
import { LocalLoginError } from "./auth.errors";
import { endLiveSessions } from "./live-sessions";
import { LoginUserResponse, MustChangePasswordReason, PublicAuthConfig } from "./auth.types";

export { LocalLoginError };
import { LOCAL_TOKEN_AUDIENCE, signLocalToken } from "./jwt";
import {
  evaluatePasswordPolicy,
  hashPassword,
  isPasswordReused,
  PASSWORD_MAX_LENGTH,
  verifyPassword,
} from "./password";

/// Mismo mensaje para cuenta inexistente, contraseña incorrecta y cuenta sin
/// contraseña (LOCAL_AUTH_PLAN.md, D12): la respuesta no confirma qué cuentas
/// existen. La auditoría sí distingue el motivo.
export const INVALID_CREDENTIALS_MESSAGE = "Usuario, correo o contraseña incorrectos.";

let dummyHash: Promise<string> | null = null;

/// Hash de una contraseña aleatoria que nadie conoce. Verificar contra él
/// cuesta lo mismo que contra uno real: una cuenta inexistente o sin
/// contraseña no se distingue por el tiempo de respuesta (D12).
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString("base64url"));
  return dummyHash;
}

function invalidCredentials(reason: LoginFailureReason): LocalLoginError {
  return new LocalLoginError(INVALID_CREDENTIALS_MESSAGE, 401, reason);
}

function toSecondPrecision(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

function tokenExp(token: string): number {
  return (jwt.decode(token) as JwtPayload).exp ?? 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/// Si el login tiene que exigir un cambio de contraseña, y por qué (D13 y
/// D16), en orden de prioridad. La política se evalúa contra la contraseña en
/// texto plano: el login es el único momento en que se la tiene sin guardar
/// nada extra.
function mustChangePasswordReason(
  credential: LocalCredential,
  password: string,
  policy: LocalAuthPolicy,
): MustChangePasswordReason | null {
  if (credential.mustChangePassword) return "reset";
  if (
    policy.expirationDays !== null &&
    Date.now() - credential.passwordChangedAt.getTime() >= policy.expirationDays * DAY_MS
  ) {
    return "expired";
  }
  if (evaluatePasswordPolicy(password, policy).length > 0) return "policy";
  return null;
}

/// Las últimas N contraseñas, contando la actual (D15). La actual nunca se
/// puede repetir, así que con un historial de 0 o 1 solo se compara contra ella.
function recentPasswordHashes(credential: LocalCredential, policy: LocalAuthPolicy): string[] {
  return [credential.passwordHash, ...credential.previousPasswordHashes].slice(0, Math.max(policy.historyCount, 1));
}

export interface LocalLoginResult {
  record: User;
  response: { token: string; user: LoginUserResponse };
}

/// Login con una cuenta local (LOCAL_AUTH_PLAN.md §7, Fases 5 y 6), en este
/// orden: búsqueda por email o username, bloqueo, verificación (con hash
/// ficticio si no hay cuenta o contraseña), estado, rehash, cambio
/// obligatorio y token.
export async function loginWithLocalAccount(identifier: string, password: string): Promise<LocalLoginResult> {
  const candidates = await findLoginCandidates(identifier.trim());
  if (candidates.length > 1) {
    // UUIDs, no emails ni usernames (LOGGING_PLAN.md §4.4).
    getLogger().warn(
      { userIds: candidates.map((candidate) => candidate.id) },
      "local login identifier matches accounts that differ only in letter case",
    );
  }
  const account = candidates.length === 1 ? candidates[0] : null;
  const credential = account?.localCredential ?? null;

  if (!account || !credential) {
    await verifyPassword(password, await getDummyHash());
    throw invalidCredentials(account ? "no_credential" : "unknown_account");
  }

  const policy = await SettingsService.getLocalAuthPolicy();

  // Bloqueo por intentos fallidos (D17): con la cuenta bloqueada no se
  // prueba la contraseña, ni siquiera la correcta. Responde exactamente lo
  // mismo que el rate limit, así no confirma que la cuenta existe.
  if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()) {
    throw new LocalLoginError(TOO_MANY_ATTEMPTS_MESSAGE.error, 429, "account_locked");
  }

  const verification = await verifyPassword(password, credential.passwordHash);
  if (!verification.valid) {
    // El contador solo corre con el bloqueo activado: si un admin lo activa
    // más tarde, los fallos de antes no cuentan.
    if (policy.maxFailedLoginAttempts !== null) {
      const locked = await registerFailedLogin(account.id, {
        maxAttempts: policy.maxFailedLoginAttempts,
        durationMinutes: policy.lockoutDurationMinutes,
      });
      if (locked) {
        getLogger().warn({ userId: account.id }, "local account locked after too many failed logins");
      }
    }
    throw invalidCredentials("wrong_password");
  }

  // Recién acá, con la contraseña correcta: informarlo antes confirmaría que
  // la cuenta existe (D12).
  if (account.status !== UserStatus.ACTIVE) {
    throw new LocalLoginError(
      "Tu cuenta está desactivada. Si creés que es un error, contactá a un administrador.",
      403,
      "account_disabled",
      "account_disabled",
    );
  }

  if (credential.failedLoginCount > 0 || credential.lockedUntil) {
    await resetFailedLogins(account.id);
  }
  if (verification.needsRehash) {
    await updatePasswordHash(account.id, await hashPassword(password));
  }

  const reason = mustChangePasswordReason(credential, password, policy);
  const token = signLocalToken(account, { ttlHours: policy.sessionTtlHours, mustChangePassword: reason !== null });

  return {
    record: account,
    response: {
      token,
      user: {
        id: account.id,
        email: account.email,
        username: account.username,
        fullName: account.name,
        roles: account.localRoles,
        permissions: [],
        app: LOCAL_TOKEN_AUDIENCE,
        exp: tokenExp(token),
        authProvider: "local",
        internalUserId: account.id,
        mustChangePassword: reason !== null,
        mustChangePasswordReason: reason,
        notificationSoundEnabled: account.notificationSoundEnabled,
        language: account.language,
      },
    },
  };
}

const INVALID_CURRENT_PASSWORD_MESSAGE = "La contraseña actual no es correcta.";

/// Cambio de la propia contraseña (`PATCH /auth/password`, solo modo local).
/// Revoca todos los tokens anteriores (D9), devuelve uno nuevo que los
/// reemplaza y corta los sockets abiertos con los viejos.
///
/// Los rechazos son 400 con `code`, nunca 401: el frontend trata cualquier
/// 401 fuera del login como sesión vencida y cierra la sesión (§7).
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ token: string; exp: number }> {
  const account = await findUserWithCredential(userId);
  const credential = account?.localCredential;
  if (!account || !credential) {
    throw new BadRequestError(INVALID_CURRENT_PASSWORD_MESSAGE, "invalid_current_password");
  }

  const current = await verifyPassword(currentPassword, credential.passwordHash);
  if (!current.valid) {
    throw new BadRequestError(INVALID_CURRENT_PASSWORD_MESSAGE, "invalid_current_password");
  }

  const policy = await SettingsService.getLocalAuthPolicy();
  const failedRules = evaluatePasswordPolicy(newPassword, policy);
  if (failedRules.length > 0) {
    throw new BadRequestError("La contraseña nueva no cumple la política de contraseñas.", "password_policy", {
      rules: failedRules,
    });
  }

  // Volver a poner la misma contraseña anularía un cambio obligatorio (por
  // ejemplo, por vencimiento): la actual nunca se puede repetir, y con
  // historial tampoco las anteriores (D15).
  if (await isPasswordReused(newPassword, recentPasswordHashes(credential, policy))) {
    throw new BadRequestError(
      policy.historyCount > 1
        ? `La contraseña nueva no puede ser ninguna de tus últimas ${policy.historyCount}.`
        : "La contraseña nueva tiene que ser distinta de la actual.",
      "password_reused",
    );
  }

  const reason: PasswordChangeReason = mustChangePasswordReason(credential, currentPassword, policy) ?? "voluntary";
  const tokensValidAfter = toSecondPrecision(new Date());
  await savePasswordChange(userId, {
    passwordHash: await hashPassword(newPassword),
    // La saliente pasa al historial, podado: con la nueva, son las últimas N.
    previousPasswordHashes: [credential.passwordHash, ...credential.previousPasswordHashes].slice(
      0,
      Math.max(policy.historyCount - 1, 0),
    ),
    tokensValidAfter,
  });

  // Emitido después del corte y en el mismo segundo o uno posterior: es
  // válido aunque los anteriores ya no (D9).
  const token = signLocalToken(account, { ttlHours: policy.sessionTtlHours, mustChangePassword: false });

  void AuditService.record({
    action: AuditAction.CHANGE_PASSWORD,
    userId,
    actorEmail: account.email,
    metadata: { reason },
  });
  endLiveSessions(userId);

  return { token, exp: tokenExp(token) };
}

/// `GET /auth/config` (D14). En modo local suma lo necesario para elegir una
/// contraseña; nunca la duración de sesión.
export async function getPublicAuthConfig(): Promise<PublicAuthConfig> {
  if (env.auth.mode === "external-auth") {
    return { mode: "external-auth" };
  }
  const policy = await SettingsService.getLocalAuthPolicy();
  return {
    mode: "local",
    passwordPolicy: {
      minLength: policy.minLength,
      maxLength: PASSWORD_MAX_LENGTH,
      requireUppercase: policy.requireUppercase,
      requireLowercase: policy.requireLowercase,
      requireNumber: policy.requireNumber,
      requireSymbol: policy.requireSymbol,
      historyCount: policy.historyCount,
    },
  };
}

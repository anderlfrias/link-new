import { AuditAction, Prisma, UserStatus } from "@prisma/client";
import { isExternalProvider, requireLocalAuth } from "../../auth-providers/registry";
import { ADMIN_ROLE } from "../../constants/roles.constant";
import { BadRequestError, ConflictError, NotFoundError } from "../../utils/errors";
import * as AuditService from "../audit/audit.service";
import { AccountAdminVia, AuditedUserField } from "../audit/audit.types";
import { endLiveSessions } from "../auth/live-sessions";
import { evaluatePasswordPolicy, generateTemporaryPassword, hashPassword } from "../auth/password";
import * as SettingsService from "../settings/settings.service";
import { LocalAuthPolicy } from "../settings/settings.types";
import * as Repo from "./account-admin.repository";
import { AdminAccountView, CreateLocalUserInput, UpdateUserAccountInput } from "./user.types";

/// Quién hace el cambio: desde el panel (el actor sale del contexto de la
/// request) o desde el CLI (sin actor humano autenticado, D18).
export interface AccountAdminActor {
  userId: string | null;
  via: AccountAdminVia;
}

type Changes = Partial<Record<AuditedUserField, { from: unknown; to: unknown }>>;

function toSecondPrecision(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

function isLocked(account: Repo.Account): boolean {
  return Boolean(account.localCredential?.lockedUntil && account.localCredential.lockedUntil.getTime() > Date.now());
}

export function toAccountView(account: Repo.Account): AdminAccountView {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    username: account.username,
    status: account.status,
    localRoles: account.roles,
    hasPassword: account.localCredential !== null,
    mustChangePassword: account.localCredential?.mustChangePassword ?? false,
    locked: isLocked(account),
  };
}

function sameRoles(a: string[], b: string[]): boolean {
  return [...a].sort().join("\n") === [...b].sort().join("\n");
}

/// Una contraseña que elige el admin tiene que cumplir la política igual que
/// cualquier otra; la generada la cumple siempre (`generateTemporaryPassword`).
function resolveAssignedPassword(password: string | undefined, policy: LocalAuthPolicy): {
  password: string;
  generated: boolean;
} {
  if (password === undefined) {
    return { password: generateTemporaryPassword(policy), generated: true };
  }
  const rules = evaluatePasswordPolicy(password, policy);
  if (rules.length > 0) {
    throw new BadRequestError("La contraseña no cumple la política de contraseñas.", "password_policy", { rules });
  }
  return { password, generated: false };
}

/// Historial (D15): la contraseña reemplazada pasa a `previousPasswordHashes`,
/// podado para que con la nueva sean las últimas N.
function nextHistory(account: Repo.Account, policy: LocalAuthPolicy): string[] {
  if (!account.localCredential) return [];
  return [account.localCredential.passwordHash, ...account.localCredential.previousPasswordHashes].slice(
    0,
    Math.max(policy.historyCount - 1, 0),
  );
}

/// Una carrera entre el chequeo de unicidad y el insert termina en el índice
/// único de la base: también es un 409, no un 500.
function mapUniqueViolation(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = String(error.meta?.target ?? "");
    throw target.includes("username")
      ? new ConflictError("Ese nombre de usuario ya está en uso.", "username_taken")
      : new ConflictError("Ese correo ya está en uso.", "email_taken");
  }
  throw error;
}

async function assertAvailable(tx: Repo.Tx, fields: { email?: string; username?: string | null }, exceptUserId?: string) {
  if (fields.email !== undefined && (await Repo.isEmailTaken(tx, fields.email, exceptUserId))) {
    throw new ConflictError("Ese correo ya está en uso.", "email_taken");
  }
  if (fields.username && (await Repo.isUsernameTaken(tx, fields.username, exceptUserId))) {
    throw new ConflictError("Ese nombre de usuario ya está en uso.", "username_taken");
  }
}

/// Editar una cuenta (PATCH /admin/users/:id). En modo external-auth solo cambia el
/// estado: los datos de la cuenta los administra EXTERNAL_AUTH (D19). En modo local
/// también nombre, email, username y roles (D11).
///
/// Reglas (invariante 12): nadie puede desactivarse ni quitarse el rol de
/// admin a sí mismo, y en modo local la instalación nunca se queda sin un
/// admin activo. Desactivar corta los sockets de la cuenta y, en modo local,
/// revoca sus tokens. Efecto y auditoría (`UPDATE_USER`) van en la misma
/// transacción.
export async function updateUserAccount(
  actor: AccountAdminActor,
  targetId: string,
  input: UpdateUserAccountInput,
): Promise<AdminAccountView> {
  const local = !isExternalProvider();
  const result = await Repo.runInTransaction(async (tx) => {
    const target = await Repo.findAccount(tx, targetId);
    if (!target) {
      throw new NotFoundError("Usuario no encontrado");
    }

    const next = {
      name: local && input.name !== undefined ? input.name : target.name,
      email: local && input.email !== undefined ? input.email : target.email,
      username: local && input.username !== undefined ? input.username : target.username,
      roles: local && input.roles !== undefined ? input.roles : target.roles,
      status: input.status ?? target.status,
    };

    const changed: Changes = {};
    if (next.name !== target.name) changed.name = { from: target.name, to: next.name };
    if (next.email !== target.email) changed.email = { from: target.email, to: next.email };
    if (next.username !== target.username) changed.username = { from: target.username, to: next.username };
    if (!sameRoles(next.roles, target.roles)) changed.roles = { from: target.roles, to: next.roles };
    if (next.status !== target.status) changed.status = { from: target.status, to: next.status };
    if (Object.keys(changed).length === 0) {
      return { account: target, deactivated: false };
    }

    const deactivates = target.status === UserStatus.ACTIVE && next.status !== UserStatus.ACTIVE;
    const wasAdmin = target.roles.includes(ADMIN_ROLE);
    const removesAdmin = local && wasAdmin && !next.roles.includes(ADMIN_ROLE);
    if (actor.userId === target.id && (deactivates || removesAdmin)) {
      throw new ConflictError("No podés desactivar tu propia cuenta ni quitarte el rol de admin.", "cannot_modify_self");
    }
    const staysActiveAdmin = next.status === UserStatus.ACTIVE && next.roles.includes(ADMIN_ROLE);
    if (local && target.status === UserStatus.ACTIVE && wasAdmin && !staysActiveAdmin) {
      if ((await Repo.countOtherActiveAdmins(tx, target.id)) === 0) {
        throw new ConflictError("La instalación tiene que tener al menos un admin activo.", "last_admin");
      }
    }

    await assertAvailable(
      tx,
      {
        email: changed.email ? next.email : undefined,
        username: changed.username ? next.username : undefined,
      },
      target.id,
    );

    const account = await Repo.updateAccount(tx, target.id, {
      ...(changed.name ? { name: next.name } : {}),
      ...(changed.email ? { email: next.email } : {}),
      ...(changed.username ? { username: next.username } : {}),
      ...(changed.roles ? { roles: next.roles } : {}),
      ...(changed.status ? { status: next.status } : {}),
      // En modo local, desactivar también revoca los tokens emitidos (D9). En
      // external-auth no hace falta: `resolveInternalUser` rechaza la cuenta inactiva.
      ...(local && deactivates ? { tokensValidAfter: toSecondPrecision(new Date()) } : {}),
    });
    await Repo.createAuditEntry(
      tx,
      AuditService.buildAuditData({
        action: AuditAction.UPDATE_USER,
        targetType: "User",
        targetId: target.id,
        metadata: { via: actor.via, changed },
      }),
    );
    return { account, deactivated: deactivates };
  }).catch(mapUniqueViolation);

  if (result.deactivated) {
    endLiveSessions(targetId);
  }
  return toAccountView(result.account);
}

/// Alta de una cuenta local (POST /admin/users). Sin `password`, se genera
/// una temporal que se devuelve una sola vez; con o sin ella, la cuenta queda
/// con el cambio obligatorio (D13).
export async function createLocalUser(
  actor: AccountAdminActor,
  input: CreateLocalUserInput,
): Promise<{ user: AdminAccountView; temporaryPassword?: string }> {
  requireLocalAuth();
  const policy = await SettingsService.getLocalAuthPolicy();
  const { password, generated } = resolveAssignedPassword(input.password, policy);
  // El hash antes de abrir la transacción: scrypt tarda y no necesita la base.
  const passwordHash = await hashPassword(password);
  const roles = input.roles ?? [];

  const account = await Repo.runInTransaction(async (tx) => {
    await assertAvailable(tx, { email: input.email, username: input.username ?? null });
    const created = await Repo.createAccount(
      tx,
      { name: input.name, email: input.email, username: input.username ?? null, roles },
      { passwordHash },
    );
    await Repo.createAuditEntry(
      tx,
      AuditService.buildAuditData({
        action: AuditAction.CREATE_USER,
        targetType: "User",
        targetId: created.id,
        metadata: { via: actor.via, roles },
      }),
    );
    return created;
  }).catch(mapUniqueViolation);

  return { user: toAccountView(account), ...(generated ? { temporaryPassword: password } : {}) };
}

/// Restablecimiento por un admin (POST /admin/users/:id/password-reset).
/// Deja el cambio obligatorio, desbloquea la cuenta, revoca sus tokens y
/// corta sus sockets. También sirve para darle contraseña a una cuenta que no
/// tenía (por ejemplo, las que vienen de EXTERNAL_AUTH, §10).
export async function resetLocalPassword(
  actor: AccountAdminActor,
  targetId: string,
  input: { password?: string },
): Promise<{ temporaryPassword?: string }> {
  requireLocalAuth();
  const policy = await SettingsService.getLocalAuthPolicy();
  const { password, generated } = resolveAssignedPassword(input.password, policy);
  const passwordHash = await hashPassword(password);

  await Repo.runInTransaction(async (tx) => {
    const target = await Repo.findAccount(tx, targetId);
    if (!target) {
      throw new NotFoundError("Usuario no encontrado");
    }
    await Repo.setAdminAssignedPassword(tx, target.id, {
      passwordHash,
      previousPasswordHashes: nextHistory(target, policy),
    });
    await Repo.updateAccount(tx, target.id, { tokensValidAfter: toSecondPrecision(new Date()) });
    await Repo.createAuditEntry(
      tx,
      AuditService.buildAuditData({
        action: AuditAction.RESET_PASSWORD,
        targetType: "User",
        targetId: target.id,
        metadata: { via: actor.via },
      }),
    );
  });

  endLiveSessions(targetId);
  return generated ? { temporaryPassword: password } : {};
}

/// Desbloqueo por un admin (POST /admin/users/:id/unlock, D17): reinicia el
/// contador de intentos. Se audita solo si la cuenta estaba bloqueada.
export async function unlockLocalUser(actor: AccountAdminActor, targetId: string): Promise<void> {
  requireLocalAuth();
  await Repo.runInTransaction(async (tx) => {
    const target = await Repo.findAccount(tx, targetId);
    if (!target) {
      throw new NotFoundError("Usuario no encontrado");
    }
    const credential = target.localCredential;
    if (!credential || (!isLocked(target) && credential.failedLoginCount === 0)) {
      return;
    }
    const wasLocked = isLocked(target);
    await Repo.clearLockout(tx, target.id);
    if (wasLocked) {
      await Repo.createAuditEntry(
        tx,
        AuditService.buildAuditData({
          action: AuditAction.UPDATE_USER,
          targetType: "User",
          targetId: target.id,
          metadata: { via: actor.via, changed: { locked: { from: true, to: false } } },
        }),
      );
    }
  });
}

/// `create-admin` del CLI (D18): crea la cuenta o, si ya hay una con ese
/// correo (por ejemplo de la época EXTERNAL_AUTH), le da credencial y rol admin
/// conservando su `User.id` y con él su historial (§10). Siempre deja una
/// contraseña temporal con el cambio obligatorio, y la cuenta activa.
export async function bootstrapAdmin(input: {
  email: string;
  name?: string;
  username?: string;
}): Promise<{ userId: string; created: boolean; temporaryPassword: string }> {
  requireLocalAuth();
  const via: AccountAdminVia = "cli";
  const policy = await SettingsService.getLocalAuthPolicy();
  const temporaryPassword = generateTemporaryPassword(policy);
  const passwordHash = await hashPassword(temporaryPassword);

  const result = await Repo.runInTransaction(async (tx) => {
    const existing = await Repo.findAccountByEmail(tx, input.email);
    if (!existing) {
      await assertAvailable(tx, { username: input.username ?? null });
      const created = await Repo.createAccount(
        tx,
        {
          name: input.name ?? input.email.split("@")[0],
          email: input.email,
          username: input.username ?? null,
          roles: [ADMIN_ROLE],
        },
        { passwordHash },
      );
      await Repo.createAuditEntry(
        tx,
        AuditService.buildAuditData({
          action: AuditAction.CREATE_USER,
          targetType: "User",
          targetId: created.id,
          metadata: { via, roles: [ADMIN_ROLE] },
        }),
      );
      return { userId: created.id, created: true };
    }

    const roles = existing.roles.includes(ADMIN_ROLE) ? existing.roles : [...existing.roles, ADMIN_ROLE];
    const changed: Changes = {};
    if (!sameRoles(roles, existing.roles)) changed.roles = { from: existing.roles, to: roles };
    if (existing.status !== UserStatus.ACTIVE) changed.status = { from: existing.status, to: UserStatus.ACTIVE };

    await Repo.setAdminAssignedPassword(tx, existing.id, {
      passwordHash,
      previousPasswordHashes: nextHistory(existing, policy),
    });
    await Repo.updateAccount(tx, existing.id, {
      roles,
      status: UserStatus.ACTIVE,
      tokensValidAfter: toSecondPrecision(new Date()),
    });
    if (Object.keys(changed).length > 0) {
      await Repo.createAuditEntry(
        tx,
        AuditService.buildAuditData({
          action: AuditAction.UPDATE_USER,
          targetType: "User",
          targetId: existing.id,
          metadata: { via, changed },
        }),
      );
    }
    await Repo.createAuditEntry(
      tx,
      AuditService.buildAuditData({
        action: AuditAction.RESET_PASSWORD,
        targetType: "User",
        targetId: existing.id,
        metadata: { via },
      }),
    );
    return { userId: existing.id, created: false };
  }).catch(mapUniqueViolation);

  return { ...result, temporaryPassword };
}

/// `reset-password` del CLI (D18): para cuando ningún admin puede entrar.
export async function resetPasswordByEmail(email: string): Promise<{ userId: string; temporaryPassword: string }> {
  requireLocalAuth();
  const account = await Repo.runInTransaction((tx) => Repo.findAccountByEmail(tx, email));
  if (!account) {
    throw new NotFoundError("No hay ninguna cuenta con ese correo.");
  }
  const { temporaryPassword } = await resetLocalPassword({ userId: null, via: "cli" }, account.id, {});
  return { userId: account.id, temporaryPassword: temporaryPassword! };
}

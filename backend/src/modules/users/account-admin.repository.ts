import { LocalCredential, Prisma, User, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { ADMIN_ROLE } from "../../constants/roles.constant";

/// Cliente de una transacción interactiva: las operaciones de administración
/// de cuentas leen, deciden y escriben adentro de la misma transacción, así
/// dos admins simultáneos no pueden, por ejemplo, quitarse el rol el uno al
/// otro y dejar la instalación sin ninguno (LOCAL_AUTH_PLAN.md §8, invariante 12).
export type Tx = Prisma.TransactionClient;

export type Account = User & { localCredential: LocalCredential | null };

export function runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn);
}

export function findAccount(tx: Tx, userId: string): Promise<Account | null> {
  return tx.user.findUnique({ where: { id: userId }, include: { localCredential: true } });
}

/// Sin distinguir mayúsculas: las cuentas que vienen de EXTERNAL_AUTH pueden tenerlas.
export function findAccountByEmail(tx: Tx, email: string): Promise<Account | null> {
  return tx.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { localCredential: true },
  });
}

/// Email y username son únicos sin distinguir mayúsculas (D11). El índice
/// único de la base distingue mayúsculas, así que la comparación se hace acá.
export async function isEmailTaken(tx: Tx, email: string, exceptUserId?: string): Promise<boolean> {
  const count = await tx.user.count({
    where: { email: { equals: email, mode: "insensitive" }, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
  });
  return count > 0;
}

export async function isUsernameTaken(tx: Tx, username: string, exceptUserId?: string): Promise<boolean> {
  const count = await tx.user.count({
    where: {
      username: { equals: username, mode: "insensitive" },
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
  });
  return count > 0;
}

/// Admins activos del modo local, sin contar a `exceptUserId`.
export function countOtherActiveAdmins(tx: Tx, exceptUserId: string): Promise<number> {
  return tx.user.count({
    where: { status: UserStatus.ACTIVE, localRoles: { has: ADMIN_ROLE }, id: { not: exceptUserId } },
  });
}

export function createAccount(
  tx: Tx,
  data: { name: string; email: string; username: string | null; localRoles: string[] },
  credential: { passwordHash: string },
): Promise<Account> {
  return tx.user.create({
    data: {
      ...data,
      localCredential: { create: { passwordHash: credential.passwordHash, mustChangePassword: true } },
    },
    include: { localCredential: true },
  });
}

export function updateAccount(tx: Tx, userId: string, data: Prisma.UserUpdateInput): Promise<Account> {
  return tx.user.update({ where: { id: userId }, data, include: { localCredential: true } });
}

/// Contraseña asignada por un admin (alta de credencial o restablecimiento):
/// siempre queda el cambio obligatorio y la cuenta desbloqueada.
export async function setAdminAssignedPassword(
  tx: Tx,
  userId: string,
  data: { passwordHash: string; previousPasswordHashes: string[] },
): Promise<void> {
  const values = {
    passwordHash: data.passwordHash,
    previousPasswordHashes: data.previousPasswordHashes,
    mustChangePassword: true,
    passwordChangedAt: new Date(),
    failedLoginCount: 0,
    lockedUntil: null,
  };
  await tx.localCredential.upsert({ where: { userId }, create: { userId, ...values }, update: values });
}

export async function clearLockout(tx: Tx, userId: string): Promise<void> {
  await tx.localCredential.update({ where: { userId }, data: { failedLoginCount: 0, lockedUntil: null } });
}

export async function createAuditEntry(tx: Tx, data: Prisma.AuditLogUncheckedCreateInput): Promise<void> {
  await tx.auditLog.create({ data });
}

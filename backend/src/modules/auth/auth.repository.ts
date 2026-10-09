import { LocalCredential, User, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { getLogger } from "../../config/request-context";
import type { DirectoryUser } from "../../auth-providers/api";

export function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export type UserWithCredential = User & { localCredential: LocalCredential | null };

/// Cuentas que coinciden con lo que alguien escribió en el login local
/// (LOCAL_AUTH_PLAN.md, D10): por email si tiene "@", si no por username, sin
/// distinguir mayúsculas (las cuentas que vienen de un proveedor externo pueden tenerlas).
/// Trae hasta dos: si hay dos que difieren solo en mayúsculas (dato
/// heredado), el login no puede elegir y se rechaza.
export function findLoginCandidates(identifier: string): Promise<UserWithCredential[]> {
  const field = identifier.includes("@") ? "email" : "username";
  return prisma.user.findMany({
    where: { [field]: { equals: identifier, mode: "insensitive" } },
    include: { localCredential: true },
    take: 2,
  });
}

export function findUserWithCredential(userId: string): Promise<UserWithCredential | null> {
  return prisma.user.findUnique({ where: { id: userId }, include: { localCredential: true } });
}

/// Rehash en un login exitoso (D4): la contraseña es la misma, así que
/// `passwordChangedAt` no se toca.
export function updatePasswordHash(userId: string, passwordHash: string): Promise<LocalCredential> {
  return prisma.localCredential.update({ where: { userId }, data: { passwordHash } });
}

/// Un login fallido con la contraseña equivocada (D17). El incremento es
/// atómico en la base: dos intentos simultáneos no se pisan el contador. Al
/// llegar al máximo, la cuenta queda bloqueada y el contador vuelve a 0, así
/// que cuando el bloqueo vence hay otra vez N intentos. Devuelve si este
/// intento bloqueó la cuenta.
export async function registerFailedLogin(
  userId: string,
  lock: { maxAttempts: number; durationMinutes: number },
): Promise<boolean> {
  const { failedLoginCount } = await prisma.localCredential.update({
    where: { userId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (failedLoginCount < lock.maxAttempts) return false;
  await prisma.localCredential.update({
    where: { userId },
    data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + lock.durationMinutes * 60_000) },
  });
  return true;
}

/// Un login exitoso reinicia el contador (D17).
export async function resetFailedLogins(userId: string): Promise<void> {
  await prisma.localCredential.update({ where: { userId }, data: { failedLoginCount: 0, lockedUntil: null } });
}

/// Cambio de la propia contraseña: la credencial nueva y la revocación de los
/// tokens anteriores (D9) van en la misma transacción. `tokensValidAfter`
/// llega truncado al segundo.
export async function savePasswordChange(
  userId: string,
  data: { passwordHash: string; previousPasswordHashes: string[]; tokensValidAfter: Date },
): Promise<void> {
  await prisma.$transaction([
    prisma.localCredential.update({
      where: { userId },
      data: {
        passwordHash: data.passwordHash,
        previousPasswordHashes: data.previousPasswordHashes,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    }),
    prisma.user.update({ where: { id: userId }, data: { tokensValidAfter: data.tokensValidAfter } }),
  ]);
}

/// Crea o actualiza la cuenta de una persona del proveedor externo `providerId`
/// (login o sincronización del directorio).
///
/// Cómo se la reconoce (ver docs/auth-providers.md): primero por `externalId`
/// (único en la instalación); si no, por correo exacto; si no, por correo sin
/// distinguir mayúsculas. Así una cuenta creada en modo local conserva su
/// `User.id` (y con él su historial) cuando la instalación pasa a un proveedor
/// externo, y a partir de ahí se la reconoce por `externalId`. Al reconocerla por
/// correo se completan `identityProvider` y `externalId` si estaban vacíos; si ya
/// tenían otro valor no se pisan.
///
/// `name` es un campo de *perfil*: solo se sincroniza desde afuera mientras
/// `syncProfileWithIntegration` siga en true para ese usuario (ver ese campo en
/// schema.prisma). No se puede resolver en un solo `upsert` (la condición depende de
/// la fila ya existente), por eso primero se busca y después se decide qué
/// actualizar. `username` es un campo de identidad: manda el del proveedor, y si otra
/// cuenta lo tiene se le quita en la misma transacción (antes ese choque terminaba en
/// un 500 por el índice único). `status` nunca se toca: una cuenta desactivada sigue
/// desactivada aunque el proveedor la sincronice.
///
/// `options.roles`: los roles que entrega el proveedor en el login. Se guardan
/// siempre que vengan (se sobrescriben en cada login); al sincronizar el directorio
/// (sin roles) los de la cuenta quedan como están.
export async function upsertExternalUser(
  providerId: string,
  user: DirectoryUser,
  options: { roles?: string[] } = {},
): Promise<User> {
  const byExternalId = await prisma.user.findUnique({ where: { externalId: user.externalId } });
  // El mismo `externalId` bajo otro proveedor no es esta persona.
  const matchedByExternalId =
    byExternalId && (byExternalId.identityProvider === null || byExternalId.identityProvider === providerId)
      ? byExternalId
      : null;
  const existing =
    matchedByExternalId ??
    (await prisma.user.findUnique({ where: { email: user.email } })) ??
    (await prisma.user.findFirst({ where: { email: { equals: user.email, mode: "insensitive" } } }));

  // Reconocida por `externalId`, su correo puede haber cambiado en el proveedor: se
  // adopta el nuevo salvo que otra cuenta ya lo tenga (el correo es único).
  let email = user.email;
  if (matchedByExternalId && matchedByExternalId.email !== user.email) {
    const holder = await prisma.user.findFirst({
      where: { email: { equals: user.email, mode: "insensitive" }, id: { not: matchedByExternalId.id } },
      select: { id: true },
    });
    if (holder) {
      // UUIDs, nunca correos ni usernames (LOGGING_PLAN.md §4.4).
      getLogger().warn(
        { userId: matchedByExternalId.id, heldByUserId: holder.id },
        "provider email is held by another account: kept the stored one",
      );
      email = matchedByExternalId.email;
    }
  }

  const write = existing
    ? prisma.user.update({
        where: { id: existing.id },
        data: {
          ...(user.username !== undefined ? { username: user.username } : {}),
          ...(existing.email !== email ? { email } : {}),
          ...(existing.syncProfileWithIntegration ? { name: user.fullName } : {}),
          ...(options.roles ? { roles: options.roles } : {}),
          ...(existing.externalId === null ? { externalId: user.externalId } : {}),
          ...(existing.identityProvider === null ? { identityProvider: providerId } : {}),
        },
      })
    : prisma.user.create({
        data: {
          email: user.email,
          name: user.fullName,
          username: user.username ?? null,
          externalId: user.externalId,
          identityProvider: providerId,
          ...(options.roles ? { roles: options.roles } : {}),
        },
      });

  const holder = user.username
    ? await prisma.user.findFirst({
        where: {
          username: { equals: user.username, mode: "insensitive" },
          ...(existing ? { id: { not: existing.id } } : {}),
        },
        select: { id: true },
      })
    : null;
  if (!holder) {
    return write;
  }

  // UUIDs, nunca correos ni usernames (LOGGING_PLAN.md §4.4).
  getLogger().warn(
    { userId: holder.id, ...(existing ? { adoptedByUserId: existing.id } : {}) },
    "provider username was held by another account: removed from it",
  );
  const [, saved] = await prisma.$transaction([
    prisma.user.update({ where: { id: holder.id }, data: { username: null } }),
    write,
  ]);
  return saved;
}

/// Cuentas activas de `providerId` sin avatar y cuyo perfil se sincroniza: las
/// únicas a las que el proveedor tiene sentido pedirles una foto.
export function findProviderUsersWithoutAvatar(
  providerId: string,
): Promise<Array<{ id: string; username: string | null; externalId: string | null }>> {
  return prisma.user.findMany({
    where: {
      identityProvider: providerId,
      avatarFileId: null,
      syncProfileWithIntegration: true,
      status: UserStatus.ACTIVE,
    },
    select: { id: true, username: true, externalId: true },
  });
}

export function updateAvatarFileId(userId: string, avatarFileId: string | null): Promise<User> {
  return prisma.user.update({ where: { id: userId }, data: { avatarFileId } });
}

/// A diferencia de `updateAvatarFileId` (usado al sincronizar DESDE el
/// proveedor externo — login propio o contactos, nunca debe tocar el flag),
/// esta función es para cuando el usuario cambia su propia foto acá: además
/// de guardarla, apaga `syncProfileWithIntegration` — a partir de ahora esa
/// foto vive solo en esta base.
export function setLocalAvatar(userId: string, avatarFileId: string | null): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: { avatarFileId, syncProfileWithIntegration: false },
  });
}

/// Cambiar el propio nombre acá — igual que `setLocalAvatar`, apaga
/// `syncProfileWithIntegration`: el login deja de pisar este nombre con lo
/// que diga el proveedor externo.
export function setLocalName(userId: string, name: string): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: { name, syncProfileWithIntegration: false },
  });
}

/// Preferencias 100% locales (sonido, idioma), sin ningún flag tipo
/// `syncProfileWithIntegration` de por medio — a diferencia de
/// `setLocalName`/`setLocalAvatar`, cambiar esto nunca afecta esa sincronización.
export interface UserPreferencesData {
  notificationSoundEnabled?: boolean;
  language?: string;
}

export function updateUserPreferences(userId: string, data: UserPreferencesData): Promise<User> {
  return prisma.user.update({ where: { id: userId }, data });
}

export function setNotificationSoundEnabled(userId: string, enabled: boolean): Promise<User> {
  return updateUserPreferences(userId, { notificationSoundEnabled: enabled });
}

/// Para servir la propia foto ya cacheada (`getOwnProfilePictureUrl` en
/// auth.service.ts) sin pedir el `User` completo.
export async function findAvatarFileId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      avatarFileId: true,
      avatarFile: { select: { deletedAt: true } },
    },
  });
  if (!user?.avatarFileId || user.avatarFile?.deletedAt) {
    return null;
  }
  return user.avatarFileId;
}

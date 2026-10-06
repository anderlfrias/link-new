import { LocalCredential, User } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { getLogger } from "../../config/request-context";
import { IDENTITY_PROVIDER } from "../../constants/identity-provider.constant";
import { MappedUser } from "./auth.types";

/// Búsqueda exacta por email: la del modo external-auth, igual que siempre (el email
/// del JWT de EXTERNAL_AUTH es la clave con la que se reconoce al perfil local).
export function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

export function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export type UserWithCredential = User & { localCredential: LocalCredential | null };

/// Cuentas que coinciden con lo que alguien escribió en el login local
/// (LOCAL_AUTH_PLAN.md, D10): por email si tiene "@", si no por username, sin
/// distinguir mayúsculas (las cuentas que vienen de EXTERNAL_AUTH pueden tenerlas).
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

/// Solo estos 4 campos de `MappedUser` importan acá — así también sirve para
/// upsertear contactos de `/apps/users/by-codes` (auth.service.ts,
/// `syncAppUsers`), que no traen `roles`/`permissions`/`app`/`exp`.
type ExternalUserProfileFields = Pick<MappedUser, "id" | "email" | "username" | "fullName">;

/// `username` es un campo de identidad (cómo lo conoce el proveedor externo,
/// necesario para pedirle su foto por username — ver `getProfilePictureByUsername`
/// en auth.service.ts) — siempre se actualiza. `name` es un campo de *perfil*:
/// solo se sincroniza desde afuera mientras `syncProfileWithIntegration` siga
/// en true para ese usuario (ver ese campo en schema.prisma). No se puede
/// resolver esto en un solo `upsert` (la condición depende de la fila ya
/// existente), por eso primero se busca y después se decide qué actualizar.
///
/// Migración entre modos (LOCAL_AUTH_PLAN.md, D20 y §10):
/// - La cuenta se reconoce por correo. Primero el exacto; si no hay, sin
///   distinguir mayúsculas: así una cuenta creada en modo local conserva su
///   `User.id` (y con él su historial) cuando la instalación pasa a EXTERNAL_AUTH. En
///   ese caso el correo guardado pasa a ser el de EXTERNAL_AUTH, que es con el que se
///   la busca de ahí en más.
/// - En modo external-auth manda el username de EXTERNAL_AUTH: si otra cuenta lo tiene, se le
///   quita en la misma transacción. Antes, ese choque terminaba en un 500 por
///   el índice único.
export async function upsertUserFromExternalUser(mappedUser: ExternalUserProfileFields): Promise<User> {
  const existing =
    (await prisma.user.findUnique({ where: { email: mappedUser.email } })) ??
    (await prisma.user.findFirst({ where: { email: { equals: mappedUser.email, mode: "insensitive" } } }));

  const write = existing
    ? prisma.user.update({
        where: { id: existing.id },
        data: {
          username: mappedUser.username,
          ...(existing.email !== mappedUser.email ? { email: mappedUser.email } : {}),
          ...(existing.syncProfileWithIntegration ? { name: mappedUser.fullName } : {}),
        },
      })
    : prisma.user.create({
        data: {
          email: mappedUser.email,
          name: mappedUser.fullName,
          username: mappedUser.username,
          externalId: mappedUser.id,
          identityProvider: IDENTITY_PROVIDER.EXTERNAL_AUTH,
        },
      });

  const holder = mappedUser.username
    ? await prisma.user.findFirst({
        where: {
          username: { equals: mappedUser.username, mode: "insensitive" },
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
    "external-auth username was held by another account: removed from it",
  );
  const [, user] = await prisma.$transaction([
    prisma.user.update({ where: { id: holder.id }, data: { username: null } }),
    write,
  ]);
  return user;
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

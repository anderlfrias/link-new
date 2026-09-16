import { User } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { IDENTITY_PROVIDER } from "../../constants/identity-provider.constant";
import { MappedUser } from "./auth.types";

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
export async function upsertUserFromExternalUser(mappedUser: ExternalUserProfileFields): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: mappedUser.email } });

  if (!existing) {
    return prisma.user.create({
      data: {
        email: mappedUser.email,
        name: mappedUser.fullName,
        username: mappedUser.username,
        externalId: mappedUser.id,
        identityProvider: IDENTITY_PROVIDER.EXTERNAL_AUTH,
      },
    });
  }

  return prisma.user.update({
    where: { id: existing.id },
    data: {
      username: mappedUser.username,
      ...(existing.syncProfileWithIntegration ? { name: mappedUser.fullName } : {}),
    },
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

/// Preferencia 100% local, sin ningún flag tipo `syncProfileWithIntegration`
/// de por medio (no existe en el proveedor externo, ver schema.prisma) —
/// a diferencia de `setLocalName`/`setLocalAvatar`, cambiar esto nunca afecta
/// esa sincronización.
export function setNotificationSoundEnabled(userId: string, enabled: boolean): Promise<User> {
  return prisma.user.update({ where: { id: userId }, data: { notificationSoundEnabled: enabled } });
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

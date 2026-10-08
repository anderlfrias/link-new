import { createHash } from "crypto";
import { User } from "@prisma/client";
import { getLogger } from "../../config/request-context";
import { NotFoundError } from "../../utils/errors";
import * as FileService from "../files/file.service";
import {
  findAvatarFileId,
  findUserById,
  setLocalAvatar,
  setLocalName,
  updateAvatarFileId,
  updateUserPreferences,
} from "./auth.repository";

/// Guarda el avatar que entregó el proveedor externo (`null`: ya no tiene foto) como
/// `StoredFile` propio y apunta `User.avatarFileId` ahí, para que cualquier otro usuario
/// la vea sin depender del proveedor. Compara el checksum contra la ya guardada para no
/// escribir un archivo nuevo si no cambió. Si la persona ya eligió su foto o su nombre
/// acá (`syncProfileWithIntegration` en false), la del proveedor no la pisa: respetar su
/// elección es más importante que tener la foto "más fresca".
export async function setAvatarFromProvider(
  userId: string,
  image: { data: Buffer; mimeType: string } | null,
): Promise<void> {
  const user = await findUserById(userId);
  if (!user || !user.syncProfileWithIntegration) return;

  if (image === null) {
    if (user.avatarFileId) {
      await updateAvatarFileId(userId, null);
    }
    return;
  }

  const checksum = createHash("sha256").update(image.data).digest("hex");
  const currentChecksum = user.avatarFileId ? await FileService.getFileChecksum(user.avatarFileId) : null;
  if (currentChecksum === checksum) return;

  const stored = await FileService.storeAvatar(userId, image.data, image.mimeType);
  await updateAvatarFileId(userId, stored.id);
  getLogger().debug({ userId, fileId: stored.id }, "profile picture cached");
}

/// Foto de perfil propia: 100% local a partir de acá — a diferencia de
/// `setAvatarFromProvider` (usada al sincronizar DESDE el proveedor externo),
/// esto NUNCA pega contra ningún proveedor externo y siempre apaga
/// `syncProfileWithIntegration` (`setLocalAvatar`, auth.repository.ts). Una
/// vez que el usuario elige su propia foto acá, esta base es la única fuente
/// de verdad para ella — el login deja de pisarla.
export async function setProfilePicture(userId: string, buffer: Buffer, contentType: string) {
  const stored = await FileService.storeAvatar(userId, buffer, contentType);
  await setLocalAvatar(userId, stored.id);
  return stored;
}

/// Quitar la propia foto (volver a mostrar iniciales) es, para este sistema,
/// una elección local tan explícita como subir una — también apaga
/// `syncProfileWithIntegration`, si no el próximo login traería de vuelta la
/// foto del proveedor externo pisando la decisión de sacarla.
export function removeProfilePicture(userId: string): Promise<User> {
  return setLocalAvatar(userId, null);
}

/// Cambiar el propio nombre: mismo criterio que la foto — 100% local, nunca
/// toca el proveedor externo, y apaga `syncProfileWithIntegration`.
export function updateOwnName(userId: string, name: string): Promise<User> {
  return setLocalName(userId, name);
}

/// Actualizar preferencias propias del usuario (sonido, idioma) — 100% locales.
export function updatePreferences(
  userId: string,
  prefs: { notificationSoundEnabled?: boolean; language?: string },
): Promise<User> {
  return updateUserPreferences(userId, prefs);
}

/// Activar/desactivar el tono de notificación de mensajes nuevos — preferencia
/// exclusiva de este usuario, ver `notificationSoundEnabled` en schema.prisma.
export function updateNotificationSoundEnabled(userId: string, enabled: boolean): Promise<User> {
  return updatePreferences(userId, { notificationSoundEnabled: enabled });
}

/// URL pública segura (`/api/v1/files/:id/content`) de mi propia foto ya cacheada
/// localmente — ya no proxea al proveedor externo (ver README del módulo):
/// una vez que esta base tiene la foto (sincronizada en el login, o subida
/// acá), servirla es un `StoredFile` más, igual que la de cualquier otro
/// usuario. `404` si todavía no tengo ninguna.
export async function getOwnProfilePictureUrl(userId: string): Promise<string> {
  const avatarFileId = await findAvatarFileId(userId);
  if (!avatarFileId) {
    throw new NotFoundError("Profile picture not found");
  }
  return `/api/v1/files/${avatarFileId}/content`;
}

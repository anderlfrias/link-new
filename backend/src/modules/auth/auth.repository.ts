import { User } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { IDENTITY_PROVIDER } from "../../constants/identity-provider.constant";
import { MappedUser } from "./auth.types";

/// Solo estos 4 campos de `MappedUser` importan acá — así también sirve para
/// upsertear contactos de `/apps/users/by-codes` (auth.service.ts,
/// `syncAppUsers`), que no traen `roles`/`permissions`/`app`/`exp`.
type ExternalUserProfileFields = Pick<MappedUser, "id" | "email" | "username" | "fullName">;

export function upsertUserFromExternalUser(mappedUser: ExternalUserProfileFields): Promise<User> {
  return prisma.user.upsert({
    where: { email: mappedUser.email },
    update: {
      name: mappedUser.fullName,
      username: mappedUser.username,
    },
    create: {
      email: mappedUser.email,
      name: mappedUser.fullName,
      username: mappedUser.username,
      externalId: mappedUser.id,
      identityProvider: IDENTITY_PROVIDER.EXTERNAL_AUTH,
    },
  });
}

export function updateAvatarFileId(userId: string, avatarFileId: string | null): Promise<User> {
  return prisma.user.update({ where: { id: userId }, data: { avatarFileId } });
}

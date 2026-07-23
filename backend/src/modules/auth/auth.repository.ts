import { User } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { IDENTITY_PROVIDER } from "../../constants/identity-provider.constant";
import { MappedUser } from "./auth.types";

export function upsertUserFromExternalUser(mappedUser: MappedUser): Promise<User> {
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

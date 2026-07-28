import { Prisma, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";

const publicSelect = {
  id: true,
  name: true,
  email: true,
  avatarFileId: true,
  avatarFile: { select: { path: true } },
  status: true,
} satisfies Prisma.UserSelect;

export function search(currentUserId: string, query?: string) {
  return prisma.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
      id: { not: currentUserId },
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: publicSelect,
    orderBy: { name: "asc" },
    take: 100,
  });
}

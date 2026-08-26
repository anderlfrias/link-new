import { Prisma, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AdminUserFilters } from "./user.types";

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

/// Único punto que arma el `where` del listado admin — compartido por
/// `findAllForAdmin`/`countAllForAdmin` para que ambas siempre respondan
/// sobre exactamente el mismo conjunto de usuarios. A diferencia de
/// `search()` (directorio de contactos), no fuerza `status: ACTIVE`: acá se
/// quiere ver todo.
function buildAdminUserWhere(filters: AdminUserFilters): Prisma.UserWhereInput {
  if (!filters.search) return {};
  return {
    OR: [
      { name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
      { username: { contains: filters.search, mode: "insensitive" } },
    ],
  };
}

const adminListSelect = {
  id: true,
  name: true,
  email: true,
  username: true,
  avatarFileId: true,
  avatarFile: { select: { path: true } },
  status: true,
  syncProfileWithIntegration: true,
  createdAt: true,
  _count: { select: { conversationMemberships: true, sentMessages: true } },
} satisfies Prisma.UserSelect;

export function findAllForAdmin(filters: AdminUserFilters, options: { beforeId?: string; limit: number }) {
  return prisma.user.findMany({
    where: buildAdminUserWhere(filters),
    select: adminListSelect,
    orderBy: { createdAt: "desc" },
    take: options.limit,
    ...(options.beforeId ? { cursor: { id: options.beforeId }, skip: 1 } : {}),
  });
}

export function countAllForAdmin(filters: AdminUserFilters) {
  return prisma.user.count({ where: buildAdminUserWhere(filters) });
}

/// Solo se llama con los ids de la página actual, no toda la tabla — igual
/// de eficiente que el resto de las queries paginadas de este backend.
export function sumStorageForUsers(userIds: string[]) {
  if (userIds.length === 0) return Promise.resolve([]);
  return prisma.storedFile.groupBy({
    by: ["createdById"],
    where: { createdById: { in: userIds }, deletedAt: null },
    _sum: { size: true },
    _count: true,
  });
}

export function countGroupAdminForUsers(userIds: string[]) {
  if (userIds.length === 0) return Promise.resolve([]);
  return prisma.conversationMember.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, isAdmin: true },
    _count: true,
  });
}

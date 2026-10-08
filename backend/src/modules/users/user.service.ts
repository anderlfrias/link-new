import env from "../../config/env";
import * as UserRepository from "./user.repository";
import { AdminUserFilters, AdminUserListOptions, AdminUserListResult } from "./user.types";

/// Directorio de contactos: lectura pura de la base de LINK. Con un proveedor
/// externo, la base se mantiene al día al iniciar sesión (`syncDirectoryThrottled`
/// en auth.service.ts), no acá: así listar usuarios no depende de que el
/// proveedor esté disponible.
export async function listUsers(currentUserId: string, search?: string) {
  return UserRepository.search(currentUserId, search);
}

const ADMIN_USERS_DEFAULT_PAGE_SIZE = 30;
const ADMIN_USERS_MAX_PAGE_SIZE = 100;

/// Panel de admin de gestión de usuarios — a diferencia de `listUsers`
/// (directorio de contactos), muestra a TODOS los usuarios (incluido el
/// propio admin, sin importar `status`) más su almacenamiento usado y su
/// actividad. Ver backend/src/modules/users/README.md, "Gestión de usuarios
/// (admin)".
export async function listUsersForAdmin(
  filters: AdminUserFilters,
  options: AdminUserListOptions,
): Promise<AdminUserListResult> {
  const limit = Math.min(Math.max(options.limit ?? ADMIN_USERS_DEFAULT_PAGE_SIZE, 1), ADMIN_USERS_MAX_PAGE_SIZE);

  const [rows, totalCount] = await Promise.all([
    UserRepository.findAllForAdmin(filters, { beforeId: options.beforeId, limit }),
    UserRepository.countAllForAdmin(filters),
  ]);

  const userIds = rows.map((user) => user.id);
  const [storageRows, groupAdminRows] = await Promise.all([
    UserRepository.sumStorageForUsers(userIds),
    UserRepository.countGroupAdminForUsers(userIds),
  ]);

  const storageByUser = new Map(
    storageRows
      .filter((row): row is typeof row & { createdById: string } => row.createdById !== null)
      // row._sum.size es bigint | null (StoredFile.size, ver schema.prisma) —
      // sin convertir, JSON.stringify explota al responder el panel admin.
      .map((row) => [row.createdById, { fileCount: row._count, totalSize: Number(row._sum.size ?? 0) }]),
  );
  const groupAdminByUser = new Map(groupAdminRows.map((row) => [row.userId, row._count]));

  const local = env.auth.mode === "local";
  const users = rows.map(({ _count, roles, localCredential, ...user }) => ({
    ...user,
    storage: storageByUser.get(user.id) ?? { fileCount: 0, totalSize: 0 },
    activity: {
      conversationCount: _count.conversationMemberships,
      messagesSentCount: _count.sentMessages,
      groupsAdministeredCount: groupAdminByUser.get(user.id) ?? 0,
    },
    // En modo local la app asigna los roles y administra las contraseñas,
    // así que el panel puede mostrarlos (LOCAL_AUTH_PLAN.md §7). En external-auth
    // los roles vienen de EXTERNAL_AUTH y no se conocen para un tercero.
    ...(local
      ? {
          localRoles: roles,
          hasPassword: localCredential !== null,
          mustChangePassword: localCredential?.mustChangePassword ?? false,
          locked: Boolean(localCredential?.lockedUntil && localCredential.lockedUntil.getTime() > Date.now()),
        }
      : {}),
  }));

  return { users, totalCount };
}

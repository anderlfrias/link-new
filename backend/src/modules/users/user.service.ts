import * as AuthService from "../auth/auth.service";
import * as UserRepository from "./user.repository";
import { AdminUserFilters, AdminUserListOptions, AdminUserListResult } from "./user.types";

/// Antes de leer el directorio local, sincroniza los usuarios de EXTERNAL_AUTH con
/// acceso a esta app (`AuthService.syncAppUsers`) — así el directorio incluye
/// a cualquiera con acceso, no solo a quien ya inició sesión en este chat
/// alguna vez. Si EXTERNAL_AUTH no responde, `syncAppUsers` nunca lanza: el
/// directorio simplemente se sirve con lo que ya había local.
export async function listUsers(currentUserId: string, token: string, search?: string) {
  await AuthService.syncAppUsers(token);
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
  token: string,
  filters: AdminUserFilters,
  options: AdminUserListOptions,
): Promise<AdminUserListResult> {
  await AuthService.syncAppUsers(token);
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
      .map((row) => [row.createdById, { fileCount: row._count, totalSize: row._sum.size ?? 0 }]),
  );
  const groupAdminByUser = new Map(groupAdminRows.map((row) => [row.userId, row._count]));

  const users = rows.map(({ _count, ...user }) => ({
    ...user,
    storage: storageByUser.get(user.id) ?? { fileCount: 0, totalSize: 0 },
    activity: {
      conversationCount: _count.conversationMemberships,
      messagesSentCount: _count.sentMessages,
      groupsAdministeredCount: groupAdminByUser.get(user.id) ?? 0,
    },
  }));

  return { users, totalCount };
}

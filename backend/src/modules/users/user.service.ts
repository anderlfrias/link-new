import env from "../../config/env";
import * as AuthService from "../auth/auth.service";
import * as UserRepository from "./user.repository";
import { AdminUserFilters, AdminUserListOptions, AdminUserListResult } from "./user.types";

/// En modo external-auth, antes de leer el directorio local sincroniza los usuarios de
/// EXTERNAL_AUTH con acceso a esta app (`AuthService.syncAppUsers`) — así el
/// directorio incluye a cualquiera con acceso, no solo a quien ya inició
/// sesión en este chat alguna vez. Si EXTERNAL_AUTH no responde, `syncAppUsers` nunca
/// lanza: el directorio simplemente se sirve con lo que ya había local. En
/// modo local no hay a quién preguntarle: las cuentas las crea un admin acá
/// (LOCAL_AUTH_PLAN.md, punto 8 del mapa).
async function syncDirectoryFromProvider(token: string): Promise<void> {
  if (env.auth.mode === "external-auth") {
    await AuthService.syncAppUsers(token);
  }
}

export async function listUsers(currentUserId: string, token: string, search?: string) {
  await syncDirectoryFromProvider(token);
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
  await syncDirectoryFromProvider(token);
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
  const users = rows.map(({ _count, localRoles, localCredential, ...user }) => ({
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
          localRoles,
          hasPassword: localCredential !== null,
          mustChangePassword: localCredential?.mustChangePassword ?? false,
          locked: Boolean(localCredential?.lockedUntil && localCredential.lockedUntil.getTime() > Date.now()),
        }
      : {}),
  }));

  return { users, totalCount };
}

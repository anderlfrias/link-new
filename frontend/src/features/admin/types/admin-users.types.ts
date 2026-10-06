/** Ver backend/API.md, sección 14 (Gestión de usuarios, admin). */

export type AdminUserStatus = "ACTIVE" | "INACTIVE";

export interface AdminUserStorage {
  fileCount: number;
  totalSize: number;
}

export interface AdminUserActivity {
  conversationCount: number;
  messagesSentCount: number;
  groupsAdministeredCount: number;
}

export interface AdminUserListItem {
  id: string;
  name: string;
  email: string;
  username: string | null;
  avatarFileId: string | null;
  avatarFile: { path: string } | null;
  status: AdminUserStatus;
  syncProfileWithIntegration: boolean;
  createdAt: string;
  storage: AdminUserStorage;
  activity: AdminUserActivity;
  /** Solo en modo local: los roles los asigna la app y la contraseña vive acá. */
  localRoles?: string[];
  hasPassword?: boolean;
  mustChangePassword?: boolean;
  locked?: boolean;
}

export interface AdminUserListResponse {
  users: AdminUserListItem[];
  totalCount: number;
}

export interface AdminUserFilters {
  search?: string;
  status?: AdminUserStatus;
  /** Solo modo local: `false` = cuentas sin contraseña (por ejemplo, después de migrar desde EXTERNAL_AUTH). */
  hasPassword?: boolean;
}

export interface AdminUserListQuery extends AdminUserFilters {
  before?: string;
  limit?: number;
}

/** Cuenta tal como la devuelven el alta y la edición. */
export interface AdminAccountView {
  id: string;
  name: string;
  email: string;
  username: string | null;
  status: AdminUserStatus;
  localRoles: string[];
  hasPassword: boolean;
  mustChangePassword: boolean;
  locked: boolean;
}

/** Alta de una cuenta local. Sin `password`, el backend genera una temporal. */
export interface CreateAdminUserPayload {
  name: string;
  email: string;
  username?: string | null;
  roles?: string[];
}

/** Edición. En modo external-auth solo cuenta `status`. `username: null` lo quita. */
export interface UpdateAdminUserPayload {
  name?: string;
  email?: string;
  username?: string | null;
  roles?: string[];
  status?: AdminUserStatus;
}

export interface CreateAdminUserResponse {
  user: AdminAccountView;
  /** Se devuelve una sola vez y solo si se generó. */
  temporaryPassword?: string;
}

export interface ResetPasswordResponse {
  temporaryPassword?: string;
}

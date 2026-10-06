import { UserStatus } from "@prisma/client";

export interface AdminUserFilters {
  /// Contains, case-insensitive, contra name/email/username.
  search?: string;
  /// Los dos modos.
  status?: UserStatus;
  /// Solo modo local: cuentas con o sin contraseña asignada. Sirve, por
  /// ejemplo, después de migrar desde EXTERNAL_AUTH (LOCAL_AUTH_PLAN.md §10).
  hasPassword?: boolean;
}

export interface AdminUserListOptions {
  beforeId?: string;
  limit?: number;
}

export interface AdminUserStorage {
  fileCount: number;
  totalSize: number;
}

export interface AdminUserActivity {
  conversationCount: number;
  messagesSentCount: number;
  /// Cuántos grupos tiene como admin de grupo (`ConversationMember.isAdmin`)
  /// — concepto ya existente, ver conversations/README.md#admins-de-grupo.
  groupsAdministeredCount: number;
}

export interface AdminUserListItem {
  id: string;
  name: string;
  email: string;
  username: string | null;
  avatarFileId: string | null;
  avatarFile: { path: string } | null;
  status: UserStatus;
  /// Si el perfil sigue sincronizado desde EXTERNAL_AUTH o ya fue editado localmente
  /// (ver auth.repository.ts, setLocalName/setLocalAvatar).
  syncProfileWithIntegration: boolean;
  createdAt: Date;
  storage: AdminUserStorage;
  activity: AdminUserActivity;
  /// Solo en modo local (LOCAL_AUTH_PLAN.md §7). Nunca el hash ni nada de la
  /// contraseña: solo si la tiene, si debe cambiarla y si está bloqueada.
  localRoles?: string[];
  hasPassword?: boolean;
  mustChangePassword?: boolean;
  locked?: boolean;
}

/// Una cuenta como la devuelven el alta y la edición del panel.
export interface AdminAccountView {
  id: string;
  name: string;
  email: string;
  username: string | null;
  status: UserStatus;
  localRoles: string[];
  hasPassword: boolean;
  mustChangePassword: boolean;
  locked: boolean;
}

/// Alta de una cuenta local. Email y username llegan ya normalizados a
/// minúsculas por el validador.
export interface CreateLocalUserInput {
  name: string;
  email: string;
  username?: string | null;
  roles?: string[];
  /// Sin contraseña, se genera una temporal.
  password?: string;
}

/// Edición desde el panel. En modo external-auth solo cuenta `status`.
export interface UpdateUserAccountInput {
  name?: string;
  email?: string;
  /// `null` le quita el username.
  username?: string | null;
  roles?: string[];
  status?: UserStatus;
}

export interface AdminUserListResult {
  users: AdminUserListItem[];
  totalCount: number;
}

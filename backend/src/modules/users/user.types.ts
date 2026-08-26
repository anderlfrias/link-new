import { UserStatus } from "@prisma/client";

export interface AdminUserFilters {
  /// Contains, case-insensitive, contra name/email/username.
  search?: string;
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
}

export interface AdminUserListResult {
  users: AdminUserListItem[];
  totalCount: number;
}

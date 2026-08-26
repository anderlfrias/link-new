/** Ver backend/API.md, sección 14 (Gestión de usuarios, admin). */

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
  status: "ACTIVE" | "INACTIVE";
  syncProfileWithIntegration: boolean;
  createdAt: string;
  storage: AdminUserStorage;
  activity: AdminUserActivity;
}

export interface AdminUserListResponse {
  users: AdminUserListItem[];
  totalCount: number;
}

export interface AdminUserFilters {
  search?: string;
}

export interface AdminUserListQuery extends AdminUserFilters {
  before?: string;
  limit?: number;
}

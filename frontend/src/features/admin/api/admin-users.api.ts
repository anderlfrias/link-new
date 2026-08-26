import { apiRequest } from "@/lib/api-client";
import type { AdminUserListQuery, AdminUserListResponse } from "@/features/admin/types/admin-users.types";

export function listAdminUsers(token: string, query: AdminUserListQuery = {}): Promise<AdminUserListResponse> {
  return apiRequest<AdminUserListResponse>("/v1/admin/users", {
    token,
    query: {
      before: query.before,
      limit: query.limit,
      search: query.search,
    },
  });
}

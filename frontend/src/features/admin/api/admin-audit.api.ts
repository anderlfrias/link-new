import { apiRequest } from "@/lib/api-client";
import type {
  AdminAuditLogQuery,
  AdminAuditLogListResponse,
} from "@/features/admin/types/admin-audit.types";

export function listAdminAuditLogs(
  token: string,
  query: AdminAuditLogQuery = {},
): Promise<AdminAuditLogListResponse> {
  return apiRequest<AdminAuditLogListResponse>("/v1/admin/audit-logs", {
    token,
    query: {
      before: query.before,
      limit: query.limit,
      action: Array.isArray(query.action) ? query.action.join(",") : query.action,
      userId: query.userId,
      targetType: query.targetType,
      from: query.from,
      to: query.to,
    },
  });
}

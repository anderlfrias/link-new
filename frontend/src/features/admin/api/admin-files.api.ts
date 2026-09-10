import { apiRequest } from "@/lib/api-client";
import type {
  AdminFileListQuery,
  AdminFileListResponse,
  AdminFileStatsResponse,
} from "@/features/admin/types/admin-files.types";

export function listAdminFiles(token: string, query: AdminFileListQuery = {}): Promise<AdminFileListResponse> {
  return apiRequest<AdminFileListResponse>("/v1/admin/files", {
    token,
    query: {
      before: query.before,
      limit: query.limit,
      type: query.type,
      uploader: query.uploader,
      from: query.from,
      to: query.to,
      search: query.search,
    },
  });
}

export function deleteAdminFile(token: string, fileId: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/v1/admin/files/${fileId}`, { method: "DELETE", token });
}

export function getAdminFileStats(token: string): Promise<AdminFileStatsResponse> {
  return apiRequest<AdminFileStatsResponse>("/v1/admin/files/stats", { token });
}

/** Ver backend/API.md, sección 13 (Gestión de storage, admin). */

export type AdminFileType = "image" | "audio" | "other";

export interface AdminFileUsage {
  avatarOfUserCount: number;
  groupImageOfConversationCount: number;
  messageAttachmentCount: number;
}

export interface AdminFileListItem {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  url: string;
  provider?: "LOCAL" | "S3";
  createdAt: string;
  createdBy: { id: string; name: string; email: string } | null;
  usage: AdminFileUsage;
}

export interface AdminFileListResponse {
  files: AdminFileListItem[];
  totalCount: number;
  totalSize: number;
}

export interface AdminFileStatsResponse {
  localCount: number;
  s3Count: number;
  totalCount: number;
  migrationEnabled: boolean;
  migrationBatchSize: number;
  migrationIntervalMinutes: number;
}

/** Filtros que arma el panel — no incluye paginación (eso lo agrega el hook). */
export interface AdminFileFilters {
  type?: AdminFileType;
  uploader?: string;
  from?: string;
  to?: string;
  search?: string;
}

export interface AdminFileListQuery extends AdminFileFilters {
  before?: string;
  limit?: number;
}

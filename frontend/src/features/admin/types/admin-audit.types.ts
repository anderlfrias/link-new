export interface AdminAuditActor {
  id: string | null;
  email: string | null;
  name: string | null;
}

export interface AdminAuditLogListItem {
  id: string;
  action: string;
  createdAt: string;
  actor: AdminAuditActor;
  conversationId: string | null;
  conversationName: string | null;
  messageId: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface AdminAuditLogListResponse {
  items: AdminAuditLogListItem[];
  nextCursor: string | null;
}

export interface AdminAuditLogFilters {
  action?: string | string[];
  userId?: string;
  targetType?: string;
  from?: string;
  to?: string;
}

export interface AdminAuditLogQuery extends AdminAuditLogFilters {
  before?: string;
  limit?: number;
}

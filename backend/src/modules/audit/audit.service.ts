import { AuditAction, ConversationType, Prisma } from "@prisma/client";
import { getLogger, getRequestMeta } from "../../config/request-context";
import * as AuditRepository from "./audit.repository";
import {
  AuditLogFilters,
  AuditLogListItem,
  AuditLogListOptions,
  AuditLogListResponse,
  AuditMetadataMap,
  DEFAULT_ADMIN_AUDIT_ACTIONS,
} from "./audit.types";

export type RecordParams<A extends AuditAction> = {
  action: A;
  /// Default: el `actorUserId` del contexto de la petición. Explícito solo
  /// cuando el actor no es quien hizo la request (o no hay request).
  userId?: string | null;
  actorEmail?: string | null;
  conversationId?: string;
  messageId?: string;
  targetType?: string;
  targetId?: string;
} & (AuditMetadataMap[A] extends undefined
  ? { metadata?: undefined }
  : { metadata: AuditMetadataMap[A] });

/// Arma la fila completando el contexto de la petición (IP, user-agent,
/// requestId, actor). Separada de `record` para que la variante transaccional
/// de §3.5 reuse exactamente la misma lógica.
export function buildAuditData<A extends AuditAction>(
  params: RecordParams<A>,
): Prisma.AuditLogUncheckedCreateInput {
  const meta = getRequestMeta();
  return {
    action: params.action,
    userId: params.userId !== undefined ? params.userId : (meta.actorUserId ?? null),
    actorEmail: params.actorEmail !== undefined ? params.actorEmail : (meta.actorEmail ?? null),
    conversationId: params.conversationId,
    messageId: params.messageId,
    targetType: params.targetType,
    targetId: params.targetId,
    metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  };
}

/// Registra una acción. **Nunca tira.**
///
/// El motivo: se llama DESPUÉS del write primario, que ya se commiteó. Si esto
/// tirara, el usuario vería un 500 sobre una acción que sí se ejecutó — el peor
/// de los dos mundos, y es el comportamiento que tiene el repo hoy con
/// `await logAudit(...)`. Perder una fila de auditoría es un problema, así que
/// no se traga en silencio: se loguea en `error` para que sea visible y
/// alertable.
///
/// Las acciones donde perder el rastro es inaceptable (las de admin) NO usan
/// esta función: van en la misma transacción que su efecto, ver §3.5.
export async function record<A extends AuditAction>(params: RecordParams<A>): Promise<void> {
  try {
    await AuditRepository.create(buildAuditData(params));
  } catch (err) {
    getLogger().error({ err, action: params.action }, "failed to write audit log");
  }
}

const DEFAULT_AUDIT_PAGE_SIZE = 50;
const MAX_AUDIT_PAGE_SIZE = 200;

export async function listAuditLogs(
  filters: AuditLogFilters,
  options: AuditLogListOptions = {},
): Promise<AuditLogListResponse> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_AUDIT_PAGE_SIZE, 1), MAX_AUDIT_PAGE_SIZE);

  const effectiveFilters: AuditLogFilters = {
    ...filters,
    action: filters.action ?? DEFAULT_ADMIN_AUDIT_ACTIONS,
  };

  const rows = await AuditRepository.listForAdmin(effectiveFilters, {
    beforeId: options.beforeId,
    limit: limit + 1,
  });

  const hasMore = rows.length > limit;
  const itemRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && itemRows.length > 0 ? itemRows[itemRows.length - 1].id : null;

  const items: AuditLogListItem[] = itemRows.map((log: any) => ({
    id: log.id,
    action: log.action,
    createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
    actor: {
      id: log.userId ?? null,
      email: log.actorEmail ?? log.user?.email ?? null,
      name: log.user?.name ?? null,
    },
    conversationId: log.conversationId ?? null,
    conversationName: log.conversation?.type === ConversationType.GROUP ? (log.conversation.name ?? null) : null,
    messageId: log.messageId ?? null,
    targetType: log.targetType ?? null,
    targetId: log.targetId ?? null,
    metadata: log.metadata,
    ip: log.ip ?? null,
    userAgent: log.userAgent ?? null,
    requestId: log.requestId ?? null,
  }));

  return { items, nextCursor };
}

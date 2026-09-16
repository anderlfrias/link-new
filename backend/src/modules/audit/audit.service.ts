import { AuditAction, Prisma } from "@prisma/client";
import { getLogger, getRequestMeta } from "../../config/request-context";
import * as AuditRepository from "./audit.repository";
import { AuditMetadataMap } from "./audit.types";

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

import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

import { AuditLogFilters, AuditLogListOptions } from "./audit.types";

/// Devuelve la operación SIN ejecutar (`PrismaPromise`), para poder incluirla en
/// un `prisma.$transaction([...])` junto al efecto que audita — ver §3.5.
export function createOperation(data: Prisma.AuditLogUncheckedCreateInput) {
  return prisma.auditLog.create({ data });
}

/// Vía normal: la ejecuta de una.
export function create(data: Prisma.AuditLogUncheckedCreateInput) {
  return createOperation(data);
}

export function buildAdminAuditWhere(filters: AuditLogFilters): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];

  if (filters.action) {
    const actions = Array.isArray(filters.action) ? filters.action : [filters.action];
    and.push({ action: { in: actions } });
  }

  if (filters.userId) {
    and.push({ userId: filters.userId });
  }

  if (filters.targetType) {
    and.push({ targetType: filters.targetType });
  }

  if (filters.from || filters.to) {
    and.push({
      createdAt: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      },
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

const adminAuditInclude = {
  user: { select: { id: true, email: true, name: true } },
  conversation: { select: { id: true, name: true, type: true } },
} satisfies Prisma.AuditLogInclude;

export function listForAdmin(filters: AuditLogFilters, options: { beforeId?: string; limit: number }) {
  return prisma.auditLog.findMany({
    where: buildAdminAuditWhere(filters),
    include: adminAuditInclude,
    orderBy: { createdAt: "desc" },
    take: options.limit,
    ...(options.beforeId ? { cursor: { id: options.beforeId }, skip: 1 } : {}),
  });
}

export async function deleteOlderThan(cutoffDate: Date): Promise<number> {
  const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoffDate } } });
  return result.count;
}

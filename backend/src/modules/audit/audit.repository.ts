import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";

/// Devuelve la operación SIN ejecutar (`PrismaPromise`), para poder incluirla en
/// un `prisma.$transaction([...])` junto al efecto que audita — ver §3.5.
export function createOperation(data: Prisma.AuditLogUncheckedCreateInput) {
  return prisma.auditLog.create({ data });
}

/// Vía normal: la ejecuta de una.
export function create(data: Prisma.AuditLogUncheckedCreateInput) {
  return createOperation(data);
}

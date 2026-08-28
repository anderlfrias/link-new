import { prisma } from "../../config/prisma";

/// `endpoint` es la clave natural (identifica al navegador/dispositivo, no a
/// la persona) — por eso `upsert` reasigna el `userId` si hace falta en vez
/// de fallar por la constraint `@unique` en `endpoint`: el mismo navegador
/// pudo haber quedado suscripto a nombre de otro usuario antes (ej. equipo
/// compartido).
export function upsertSubscription(userId: string, endpoint: string, p256dh: string, auth: string) {
  return prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId, p256dh, auth },
    create: { userId, endpoint, p256dh, auth },
  });
}

export function deleteByEndpoint(endpoint: string) {
  return prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

export function findByUserIds(userIds: string[]) {
  return prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
}

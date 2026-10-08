import { UserStatus } from "@prisma/client";
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

export function findByEndpoint(endpoint: string) {
  return prisma.pushSubscription.findUnique({ where: { endpoint } });
}

/// Sin filtrar por dueño: solo para la limpieza de suscripciones que el
/// navegador ya invalidó (404/410) o que no pasan la allowlist. Una baja pedida
/// por un usuario va por `deleteByEndpointForUser`.
export function deleteByEndpoint(endpoint: string) {
  return prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

/// Baja pedida por un usuario: solo borra una suscripción que es suya. Saber el
/// endpoint de otra persona no alcanza para darla de baja.
export function deleteByEndpointForUser(endpoint: string, userId: string) {
  return prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
}

/// Todas las suscripciones de un usuario: al cerrar sus sesiones (cuenta
/// desactivada, contraseña restablecida) para que sus dispositivos dejen de
/// recibir notificaciones con el texto de los mensajes.
export function deleteByUserId(userId: string) {
  return prisma.pushSubscription.deleteMany({ where: { userId } });
}

/// Solo cuentas activas: una cuenta desactivada no tiene que seguir recibiendo
/// el texto de los mensajes de sus grupos.
export function findByUserIds(userIds: string[]) {
  return prisma.pushSubscription.findMany({
    where: { userId: { in: userIds }, user: { status: UserStatus.ACTIVE } },
  });
}

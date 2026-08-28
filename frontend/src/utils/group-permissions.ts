import { ADMIN_ROLE } from "@/features/admin/constants/admin-role.constant";
import type { GroupPermissionLevel } from "@/features/admin/types/admin-settings.types";
import type { Conversation } from "@/features/conversations/types/conversation.types";

/** Mismo criterio que `assertGroupPermission` en
 * backend/src/modules/conversations/conversation.service.ts — para decidir en
 * el cliente si mostrar una acción de gobierno de grupo (agregar miembros,
 * cambiar nombre/foto, borrar el grupo), nunca para hacerla cumplir: el
 * backend vuelve a validar el permiso siempre, esto solo evita mostrar un
 * botón que el servidor terminaría rechazando. */
export function canPerformGroupAction(
  level: GroupPermissionLevel,
  conversation: Conversation,
  currentUserId: string,
  userRoles: string[],
): boolean {
  if (level === "APP_ADMINS_ONLY") return userRoles.includes(ADMIN_ROLE);
  if (level === "CREATOR_ONLY") return conversation.createdById === currentUserId;
  if (level === "GROUP_ADMINS_ONLY") {
    return conversation.members.find((member) => member.userId === currentUserId)?.isAdmin ?? false;
  }
  return true; // ALL_MEMBERS
}

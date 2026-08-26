import type { GroupPermissionLevel } from "@/features/admin/types/admin-settings.types";

export const GROUP_PERMISSION_LABELS: Record<GroupPermissionLevel, string> = {
  ALL_MEMBERS: "Cualquier miembro",
  GROUP_ADMINS_ONLY: "Admins del grupo",
  APP_ADMINS_ONLY: "Admins de la app",
  CREATOR_ONLY: "Solo el creador",
};

/** No existe grupo ni admin de grupo antes de que el grupo exista. */
export const CREATE_GROUPS_OPTIONS: GroupPermissionLevel[] = ["ALL_MEMBERS", "APP_ADMINS_ONLY"];

export const MEMBER_ACTION_OPTIONS: GroupPermissionLevel[] = [
  "ALL_MEMBERS",
  "GROUP_ADMINS_ONLY",
  "APP_ADMINS_ONLY",
  "CREATOR_ONLY",
];

/** Acción destructiva — se excluye "cualquier miembro". */
export const DELETE_GROUP_OPTIONS: GroupPermissionLevel[] = ["GROUP_ADMINS_ONLY", "APP_ADMINS_ONLY", "CREATOR_ONLY"];

/** Ver backend/API.md sección 4.9 (Admins de grupo y overrides por grupo). */

import type { GroupPermissionLevel } from "@/features/admin/types/admin-settings.types";

export interface GroupOverridableSettings {
  whoCanAddMembers: GroupPermissionLevel;
  whoCanRemoveMembers: GroupPermissionLevel;
  maxGroupMembers: number;
  whoCanChangeGroupInfo: GroupPermissionLevel;
  whoCanDeleteGroup: GroupPermissionLevel;
  whoCanLeaveGroup: GroupPermissionLevel;
}

export type GroupOverrideAllowedFlags = Record<keyof GroupOverridableSettings, boolean>;

/** Forma exacta de GET/PATCH /v1/conversations/:id/settings. */
export interface ConversationEffectiveSettings {
  conversationId: string;
  effective: GroupOverridableSettings;
  overrideAllowed: GroupOverrideAllowedFlags;
}

export type UpdateConversationSettingsPayload = Partial<GroupOverridableSettings>;

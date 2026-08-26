"use client";

import { useEffect, useState } from "react";
import { IconAlertCircle, IconLoader2 } from "@tabler/icons-react";
import { useConversationSettings } from "@/features/conversations/hooks/use-conversation-settings";
import { useUpdateConversationSettings } from "@/features/conversations/hooks/use-update-conversation-settings";
import {
  DELETE_GROUP_OPTIONS,
  GROUP_PERMISSION_LABELS,
  MEMBER_ACTION_OPTIONS,
} from "@/features/admin/constants/group-permission-options.constant";
import type { GroupPermissionLevel } from "@/features/admin/types/admin-settings.types";
import type {
  ConversationEffectiveSettings,
  GroupOverridableSettings,
  UpdateConversationSettingsPayload,
} from "@/features/conversations/types/group-settings.types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

interface GroupSettingsSectionProps {
  conversationId: string;
}

interface DraftState {
  maxGroupMembers: string;
  whoCanAddMembers: GroupPermissionLevel;
  whoCanRemoveMembers: GroupPermissionLevel;
  whoCanChangeGroupInfo: GroupPermissionLevel;
  whoCanDeleteGroup: GroupPermissionLevel;
}

function toDraft(effective: GroupOverridableSettings): DraftState {
  return {
    maxGroupMembers: String(effective.maxGroupMembers),
    whoCanAddMembers: effective.whoCanAddMembers,
    whoCanRemoveMembers: effective.whoCanRemoveMembers,
    whoCanChangeGroupInfo: effective.whoCanChangeGroupInfo,
    whoCanDeleteGroup: effective.whoCanDeleteGroup,
  };
}

function validate(draft: DraftState): string | undefined {
  const maxMembers = Number(draft.maxGroupMembers);
  if (!Number.isInteger(maxMembers) || maxMembers < 2) {
    return "Debe ser un número entero mayor a 1.";
  }
  return undefined;
}

function toPayload(draft: DraftState, allowed: ConversationEffectiveSettings["overrideAllowed"]) {
  const payload: UpdateConversationSettingsPayload = {};
  if (allowed.maxGroupMembers) payload.maxGroupMembers = Number(draft.maxGroupMembers);
  if (allowed.whoCanAddMembers) payload.whoCanAddMembers = draft.whoCanAddMembers;
  if (allowed.whoCanRemoveMembers) payload.whoCanRemoveMembers = draft.whoCanRemoveMembers;
  if (allowed.whoCanChangeGroupInfo) payload.whoCanChangeGroupInfo = draft.whoCanChangeGroupInfo;
  if (allowed.whoCanDeleteGroup) payload.whoCanDeleteGroup = draft.whoCanDeleteGroup;
  return payload;
}

export function GroupSettingsSection({ conversationId }: GroupSettingsSectionProps) {
  const { settings, status } = useConversationSettings(conversationId);
  const { save, pending, error: saveError } = useUpdateConversationSettings(conversationId);

  const [draft, setDraft] = useState<DraftState | null>(null);

  useEffect(() => {
    if (settings) setDraft(toDraft(settings.effective));
  }, [settings]);

  if (status === "loading" || status === "idle" || !settings || !draft) {
    if (status === "loading") {
      return (
        <div className="flex items-center justify-center py-4">
          <IconLoader2 className="animate-spin text-brand-blue" size={20} />
        </div>
      );
    }
    return null;
  }

  const { overrideAllowed } = settings;
  const hasAnyOverride = Object.values(overrideAllowed).some(Boolean);
  if (!hasAnyOverride) return null;

  const maxMembersError = validate(draft);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(toDraft(settings.effective));

  function updateField<K extends keyof DraftState>(field: K, value: DraftState[K]) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleSave() {
    if (maxMembersError || !draft) return;
    const updated = await save(toPayload(draft, overrideAllowed));
    if (updated) setDraft(toDraft(updated.effective));
  }

  return (
    <div className="mt-4">
      <h3 className="mb-1 px-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
        Configuración de este grupo
      </h3>
      <div className="flex flex-col gap-3 px-1 py-2">
        {saveError && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <IconAlertCircle size={16} className="shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        {overrideAllowed.maxGroupMembers && (
          <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
            Máximo de miembros
            <Input
              type="number"
              min={2}
              value={draft.maxGroupMembers}
              onChange={(event) => updateField("maxGroupMembers", event.target.value)}
              error={maxMembersError}
            />
          </label>
        )}
        {overrideAllowed.whoCanAddMembers && (
          <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
            ¿Quién puede agregar miembros?
            <Select
              value={draft.whoCanAddMembers}
              onChange={(event) => updateField("whoCanAddMembers", event.target.value as GroupPermissionLevel)}
            >
              {MEMBER_ACTION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {GROUP_PERMISSION_LABELS[option]}
                </option>
              ))}
            </Select>
          </label>
        )}
        {overrideAllowed.whoCanRemoveMembers && (
          <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
            ¿Quién puede quitar miembros?
            <Select
              value={draft.whoCanRemoveMembers}
              onChange={(event) => updateField("whoCanRemoveMembers", event.target.value as GroupPermissionLevel)}
            >
              {MEMBER_ACTION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {GROUP_PERMISSION_LABELS[option]}
                </option>
              ))}
            </Select>
          </label>
        )}
        {overrideAllowed.whoCanChangeGroupInfo && (
          <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
            ¿Quién puede renombrar o cambiar la foto?
            <Select
              value={draft.whoCanChangeGroupInfo}
              onChange={(event) => updateField("whoCanChangeGroupInfo", event.target.value as GroupPermissionLevel)}
            >
              {MEMBER_ACTION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {GROUP_PERMISSION_LABELS[option]}
                </option>
              ))}
            </Select>
          </label>
        )}
        {overrideAllowed.whoCanDeleteGroup && (
          <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
            ¿Quién puede eliminar el grupo?
            <Select
              value={draft.whoCanDeleteGroup}
              onChange={(event) => updateField("whoCanDeleteGroup", event.target.value as GroupPermissionLevel)}
            >
              {DELETE_GROUP_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {GROUP_PERMISSION_LABELS[option]}
                </option>
              ))}
            </Select>
          </label>
        )}

        <Button
          type="button"
          variant="ghost"
          disabled={!isDirty || !!maxMembersError || pending}
          onClick={handleSave}
        >
          {pending && <IconLoader2 className="animate-spin" size={16} />}
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}

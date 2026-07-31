"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconAlertCircle, IconArrowLeft, IconLoader2 } from "@tabler/icons-react";
import { useAdminSettings } from "@/features/admin/hooks/use-admin-settings";
import { useUpdateAdminSettings } from "@/features/admin/hooks/use-update-admin-settings";
import type {
  AdminSettings,
  FileTypeRestrictionMode,
  GroupPermissionLevel,
  UpdateAdminSettingsPayload,
} from "@/features/admin/types/admin-settings.types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

interface DraftState {
  maxUploadSizeMb: string;
  fileTypeRestrictionMode: FileTypeRestrictionMode;
  fileTypeList: string;
  maxVoiceNoteDurationSeconds: string;
  maxGroupMembers: string;
  whoCanCreateGroups: GroupPermissionLevel;
  whoCanAddMembers: GroupPermissionLevel;
  whoCanRemoveMembers: GroupPermissionLevel;
  messageRetentionDays: string;
}

function toDraft(settings: AdminSettings): DraftState {
  return {
    maxUploadSizeMb: String(settings.maxUploadSizeMb),
    fileTypeRestrictionMode: settings.fileTypeRestrictionMode,
    fileTypeList: settings.fileTypeList.join(", "),
    maxVoiceNoteDurationSeconds: String(settings.maxVoiceNoteDurationSeconds),
    maxGroupMembers: String(settings.maxGroupMembers),
    whoCanCreateGroups: settings.whoCanCreateGroups,
    whoCanAddMembers: settings.whoCanAddMembers,
    whoCanRemoveMembers: settings.whoCanRemoveMembers,
    messageRetentionDays: settings.messageRetentionDays == null ? "" : String(settings.messageRetentionDays),
  };
}

type FieldErrors = Partial<Record<keyof DraftState, string>>;

function validate(draft: DraftState): FieldErrors {
  const errors: FieldErrors = {};

  const uploadSize = Number(draft.maxUploadSizeMb);
  if (!Number.isInteger(uploadSize) || uploadSize < 1) {
    errors.maxUploadSizeMb = "Debe ser un número entero mayor a 0.";
  }

  const voiceDuration = Number(draft.maxVoiceNoteDurationSeconds);
  if (!Number.isInteger(voiceDuration) || voiceDuration < 1) {
    errors.maxVoiceNoteDurationSeconds = "Debe ser un número entero mayor a 0.";
  }

  const groupMax = Number(draft.maxGroupMembers);
  if (!Number.isInteger(groupMax) || groupMax < 2) {
    errors.maxGroupMembers = "Debe ser un número entero mayor a 1.";
  }

  if (draft.messageRetentionDays.trim() !== "") {
    const retention = Number(draft.messageRetentionDays);
    if (!Number.isInteger(retention) || retention < 0) {
      errors.messageRetentionDays = "Debe ser un número entero mayor o igual a 0, o vacío para deshabilitar.";
    }
  }

  return errors;
}

function toPayload(draft: DraftState): UpdateAdminSettingsPayload {
  return {
    maxUploadSizeMb: Number(draft.maxUploadSizeMb),
    fileTypeRestrictionMode: draft.fileTypeRestrictionMode,
    fileTypeList: draft.fileTypeList
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    maxVoiceNoteDurationSeconds: Number(draft.maxVoiceNoteDurationSeconds),
    maxGroupMembers: Number(draft.maxGroupMembers),
    whoCanCreateGroups: draft.whoCanCreateGroups,
    whoCanAddMembers: draft.whoCanAddMembers,
    whoCanRemoveMembers: draft.whoCanRemoveMembers,
    messageRetentionDays: draft.messageRetentionDays.trim() === "" ? null : Number(draft.messageRetentionDays),
  };
}

export function AdminSettingsPanel() {
  const { settings, status, error: loadError, refetch } = useAdminSettings();
  const { save, pending, error: saveError } = useUpdateAdminSettings();

  const [draft, setDraft] = useState<DraftState | null>(null);

  useEffect(() => {
    if (settings) setDraft(toDraft(settings));
  }, [settings]);

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <IconLoader2 className="animate-spin text-brand-blue" size={28} />
      </div>
    );
  }

  if (status === "error" || !settings || !draft) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <IconAlertCircle size={18} className="shrink-0" />
          <span>{loadError || "No se pudo cargar la configuración."}</span>
        </div>
        <Button type="button" variant="ghost" onClick={refetch}>
          Reintentar
        </Button>
      </div>
    );
  }

  const errors = validate(draft);
  const hasErrors = Object.keys(errors).length > 0;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(toDraft(settings));

  function updateField<K extends keyof DraftState>(field: K, value: DraftState[K]) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function handleSave() {
    if (hasErrors || !draft) return;
    const updated = await save(toPayload(draft));
    if (updated) setDraft(toDraft(updated));
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-3 border-b border-black/5 px-4 py-3 dark:border-white/10">
        <Link
          href="/"
          aria-label="Volver"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
        >
          <IconArrowLeft size={20} stroke={1.75} />
        </Link>
        <h2 className="font-display text-lg font-semibold text-brand-ink dark:text-white">Configuración global</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-lg flex-col gap-8">
          {saveError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <IconAlertCircle size={16} className="shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">Archivos adjuntos</h3>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                Tamaño máximo (MB)
                <Input
                  type="number"
                  min={1}
                  value={draft.maxUploadSizeMb}
                  onChange={(event) => updateField("maxUploadSizeMb", event.target.value)}
                  error={errors.maxUploadSizeMb}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                Restricción de tipo de archivo
                <Select
                  value={draft.fileTypeRestrictionMode}
                  onChange={(event) =>
                    updateField("fileTypeRestrictionMode", event.target.value as FileTypeRestrictionMode)
                  }
                >
                  <option value="DISABLED">Sin restricción</option>
                  <option value="ALLOWLIST">Solo permitir estos tipos</option>
                  <option value="BLOCKLIST">Bloquear estos tipos</option>
                </Select>
              </label>
              {draft.fileTypeRestrictionMode !== "DISABLED" && (
                <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                  Tipos MIME (separados por coma)
                  <Input
                    placeholder="image/png, application/pdf"
                    value={draft.fileTypeList}
                    onChange={(event) => updateField("fileTypeList", event.target.value)}
                  />
                </label>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">Notas de voz</h3>
            <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
              Duración máxima (segundos)
              <Input
                type="number"
                min={1}
                value={draft.maxVoiceNoteDurationSeconds}
                onChange={(event) => updateField("maxVoiceNoteDurationSeconds", event.target.value)}
                error={errors.maxVoiceNoteDurationSeconds}
              />
            </label>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">Grupos</h3>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                Máximo de miembros
                <Input
                  type="number"
                  min={2}
                  value={draft.maxGroupMembers}
                  onChange={(event) => updateField("maxGroupMembers", event.target.value)}
                  error={errors.maxGroupMembers}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                ¿Quién puede crear grupos?
                <Select
                  value={draft.whoCanCreateGroups}
                  onChange={(event) => updateField("whoCanCreateGroups", event.target.value as GroupPermissionLevel)}
                >
                  <option value="ALL_MEMBERS">Cualquier usuario</option>
                  <option value="ADMINS_ONLY">Solo administradores</option>
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                ¿Quién puede agregar miembros?
                <Select
                  value={draft.whoCanAddMembers}
                  onChange={(event) => updateField("whoCanAddMembers", event.target.value as GroupPermissionLevel)}
                >
                  <option value="ALL_MEMBERS">Cualquier miembro</option>
                  <option value="ADMINS_ONLY">Solo administradores</option>
                  <option value="CREATOR_ONLY">Solo el creador del grupo</option>
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                ¿Quién puede quitar miembros?
                <Select
                  value={draft.whoCanRemoveMembers}
                  onChange={(event) => updateField("whoCanRemoveMembers", event.target.value as GroupPermissionLevel)}
                >
                  <option value="ALL_MEMBERS">Cualquier miembro</option>
                  <option value="ADMINS_ONLY">Solo administradores</option>
                  <option value="CREATOR_ONLY">Solo el creador del grupo</option>
                </Select>
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">Retención de mensajes</h3>
            <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
              Días antes de eliminar automáticamente (vacío = deshabilitado)
              <Input
                type="number"
                min={0}
                value={draft.messageRetentionDays}
                onChange={(event) => updateField("messageRetentionDays", event.target.value)}
                error={errors.messageRetentionDays}
              />
            </label>
          </section>
        </div>
      </div>

      <div className="border-t border-black/5 px-4 py-3 dark:border-white/10">
        <div className="mx-auto max-w-lg">
          <Button type="button" disabled={!isDirty || hasErrors || pending} onClick={handleSave} className="w-full">
            {pending && <IconLoader2 className="animate-spin" size={16} />}
            Guardar cambios
          </Button>
        </div>
      </div>
    </div>
  );
}

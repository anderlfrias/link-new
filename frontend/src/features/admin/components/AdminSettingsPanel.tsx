"use client";

import { useEffect, useState } from "react";
import { IconAlertCircle, IconLoader2 } from "@tabler/icons-react";
import { useAdminSettings } from "@/features/admin/hooks/use-admin-settings";
import { useUpdateAdminSettings } from "@/features/admin/hooks/use-update-admin-settings";
import type {
  AdminSettings,
  FileTypeRestrictionMode,
  GroupPermissionLevel,
  UpdateAdminSettingsPayload,
} from "@/features/admin/types/admin-settings.types";
import {
  CREATE_GROUPS_OPTIONS,
  DELETE_GROUP_OPTIONS,
  GROUP_PERMISSION_LABELS,
  MEMBER_ACTION_OPTIONS,
} from "@/features/admin/constants/group-permission-options.constant";
import { FILE_TYPE_CATEGORIES } from "@/features/admin/constants/file-type-categories.constant";
import { FileTypeMultiSelect, type FileTypeSelectionItem } from "@/features/admin/components/FileTypeMultiSelect";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useTranslation } from "@/i18n";

interface DraftState {
  maxUploadSizeMb: string;
  fileTypeRestrictionMode: FileTypeRestrictionMode;
  /** Categorías curadas + valores manuales — se expanden a mime patterns recién en `toPayload`. */
  fileTypeSelection: FileTypeSelectionItem[];
  /** Vacío = sin límite (`null`). */
  maxFilesPerMessage: string;
  allowConversationDelete: boolean;
  maxVoiceNoteDurationSeconds: string;
  maxGroupMembers: string;
  whoCanCreateGroups: GroupPermissionLevel;
  whoCanAddMembers: GroupPermissionLevel;
  whoCanRemoveMembers: GroupPermissionLevel;
  whoCanChangeGroupInfo: GroupPermissionLevel;
  whoCanDeleteGroup: GroupPermissionLevel;
  allowGroupDelete: boolean;
  whoCanLeaveGroup: GroupPermissionLevel;
  allowGroupOverrideAddMembers: boolean;
  allowGroupOverrideRemoveMembers: boolean;
  allowGroupOverrideMaxGroupMembers: boolean;
  allowGroupOverrideChangeGroupInfo: boolean;
  allowGroupOverrideDeleteGroup: boolean;
  allowGroupOverrideLeaveGroup: boolean;
  messageRetentionDays: string;
  auditLogRetentionDays: string;
  allowMessageEdit: boolean;
  messageEditTimeLimitMinutes: string;
  allowMessageDeleteForEveryone: boolean;
  messageDeleteForEveryoneTimeLimitMinutes: string;
  allowStickersAndGifs: boolean;
  uploadCleanupEnabled: boolean;
  orphanFileRetentionHours: string;
  softDeletedFilePurgeDays: string;
  uploadCleanupDryRun: boolean;
  fileMigrationEnabled: boolean;
  fileMigrationBatchSize: string;
  fileMigrationIntervalMinutes: string;
  fileMigrationDeleteLocalAfterCommit: boolean;
}

/** Una categoría cuenta como "marcada" si TODOS sus patterns están en la lista guardada —
 * evita mostrarla a medias marcada por una coincidencia parcial. Cualquier pattern guardado
 * que no forme una categoría completa (ej. un valor manual, o el remanente de una categoría
 * que perdió un pattern) sobrevive como un chip "custom" en vez de perderse. */
function selectionFromPatterns(patterns: string[]): FileTypeSelectionItem[] {
  const remaining = new Set(patterns);
  const items: FileTypeSelectionItem[] = [];
  for (const category of FILE_TYPE_CATEGORIES) {
    if (category.patterns.every((pattern) => remaining.has(pattern))) {
      items.push({ type: "category", id: category.id });
      category.patterns.forEach((pattern) => remaining.delete(pattern));
    }
  }
  // Cada remanente queda como su propio chip de un pattern — no hay forma de recuperar qué
  // extensión tipeó el admin originalmente (el backend solo guarda el mime type resuelto), así
  // que el label del chip es el mime type mismo.
  for (const pattern of remaining) {
    items.push({ type: "custom", label: pattern, patterns: [pattern] });
  }
  return items;
}

function patternsFromSelection(items: FileTypeSelectionItem[]): string[] {
  const patterns = new Set<string>();
  for (const item of items) {
    if (item.type === "category") {
      const category = FILE_TYPE_CATEGORIES.find((candidate) => candidate.id === item.id);
      category?.patterns.forEach((pattern) => patterns.add(pattern));
    } else {
      item.patterns.forEach((pattern) => patterns.add(pattern));
    }
  }
  return Array.from(patterns);
}

function toDraft(settings: AdminSettings): DraftState {
  return {
    maxUploadSizeMb: String(settings.maxUploadSizeMb),
    fileTypeRestrictionMode: settings.fileTypeRestrictionMode,
    fileTypeSelection: selectionFromPatterns(settings.fileTypeList),
    maxFilesPerMessage: settings.maxFilesPerMessage == null ? "" : String(settings.maxFilesPerMessage),
    allowConversationDelete: settings.allowConversationDelete,
    maxVoiceNoteDurationSeconds: String(settings.maxVoiceNoteDurationSeconds),
    maxGroupMembers: String(settings.maxGroupMembers),
    whoCanCreateGroups: settings.whoCanCreateGroups,
    whoCanAddMembers: settings.whoCanAddMembers,
    whoCanRemoveMembers: settings.whoCanRemoveMembers,
    whoCanChangeGroupInfo: settings.whoCanChangeGroupInfo,
    whoCanDeleteGroup: settings.whoCanDeleteGroup,
    allowGroupDelete: settings.allowGroupDelete,
    whoCanLeaveGroup: settings.whoCanLeaveGroup,
    allowGroupOverrideAddMembers: settings.allowGroupOverrideAddMembers,
    allowGroupOverrideRemoveMembers: settings.allowGroupOverrideRemoveMembers,
    allowGroupOverrideMaxGroupMembers: settings.allowGroupOverrideMaxGroupMembers,
    allowGroupOverrideChangeGroupInfo: settings.allowGroupOverrideChangeGroupInfo,
    allowGroupOverrideDeleteGroup: settings.allowGroupOverrideDeleteGroup,
    allowGroupOverrideLeaveGroup: settings.allowGroupOverrideLeaveGroup,
    messageRetentionDays: settings.messageRetentionDays == null ? "" : String(settings.messageRetentionDays),
    auditLogRetentionDays: settings.auditLogRetentionDays == null ? "" : String(settings.auditLogRetentionDays),
    allowMessageEdit: settings.allowMessageEdit,
    messageEditTimeLimitMinutes:
      settings.messageEditTimeLimitMinutes == null ? "" : String(settings.messageEditTimeLimitMinutes),
    allowMessageDeleteForEveryone: settings.allowMessageDeleteForEveryone,
    messageDeleteForEveryoneTimeLimitMinutes:
      settings.messageDeleteForEveryoneTimeLimitMinutes == null
        ? ""
        : String(settings.messageDeleteForEveryoneTimeLimitMinutes),
    allowStickersAndGifs: settings.allowStickersAndGifs,
    uploadCleanupEnabled: settings.uploadCleanupEnabled ?? false,
    orphanFileRetentionHours:
      settings.orphanFileRetentionHours == null ? "" : String(settings.orphanFileRetentionHours),
    softDeletedFilePurgeDays:
      settings.softDeletedFilePurgeDays == null ? "" : String(settings.softDeletedFilePurgeDays),
    uploadCleanupDryRun: settings.uploadCleanupDryRun ?? false,
    fileMigrationEnabled: settings.fileMigrationEnabled ?? false,
    fileMigrationBatchSize: String(settings.fileMigrationBatchSize ?? 50),
    fileMigrationIntervalMinutes: String(settings.fileMigrationIntervalMinutes ?? 60),
    fileMigrationDeleteLocalAfterCommit: settings.fileMigrationDeleteLocalAfterCommit ?? false,
  };
}

type FieldErrors = Partial<Record<keyof DraftState, string>>;

function validate(draft: DraftState, t?: (key: string) => string): FieldErrors {
  const errors: FieldErrors = {};
  const tr = (k: string, defaultVal: string) => (t ? t(k) : defaultVal);

  const uploadSize = Number(draft.maxUploadSizeMb);
  if (!Number.isInteger(uploadSize) || uploadSize < 1) {
    errors.maxUploadSizeMb = tr("admin.settings.positiveIntegerError", "Debe ser un número entero mayor a 0.");
  }

  const voiceDuration = Number(draft.maxVoiceNoteDurationSeconds);
  if (!Number.isInteger(voiceDuration) || voiceDuration < 1) {
    errors.maxVoiceNoteDurationSeconds = tr("admin.settings.positiveIntegerError", "Debe ser un número entero mayor a 0.");
  }

  const groupMax = Number(draft.maxGroupMembers);
  if (!Number.isInteger(groupMax) || groupMax < 2) {
    errors.maxGroupMembers = tr("admin.settings.greaterThanOneIntegerError", "Debe ser un número entero mayor a 1.");
  }

  if (draft.maxFilesPerMessage.trim() !== "") {
    const filesLimit = Number(draft.maxFilesPerMessage);
    if (!Number.isInteger(filesLimit) || filesLimit < 1) {
      errors.maxFilesPerMessage = tr("admin.settings.filesPerMessageError", "Debe ser un número entero mayor a 0, o vacío para sin límite.");
    }
  }

  if (draft.messageRetentionDays.trim() !== "") {
    const retention = Number(draft.messageRetentionDays);
    if (!Number.isInteger(retention) || retention < 0) {
      errors.messageRetentionDays = tr("admin.settings.messageRetentionError", "Debe ser un número entero mayor o igual a 0, o vacío para deshabilitar.");
    }
  }

  if (draft.auditLogRetentionDays.trim() !== "") {
    const retention = Number(draft.auditLogRetentionDays);
    if (!Number.isInteger(retention) || retention < 1) {
      errors.auditLogRetentionDays = tr("admin.settings.auditRetentionError", "Debe ser un número entero mayor a 0, o vacío para conservar para siempre.");
    }
  }

  if (draft.messageEditTimeLimitMinutes.trim() !== "") {
    const limit = Number(draft.messageEditTimeLimitMinutes);
    if (!Number.isInteger(limit) || limit < 1) {
      errors.messageEditTimeLimitMinutes = tr("admin.settings.filesPerMessageError", "Debe ser un número entero mayor a 0, o vacío para sin límite.");
    }
  }

  if (draft.messageDeleteForEveryoneTimeLimitMinutes.trim() !== "") {
    const limit = Number(draft.messageDeleteForEveryoneTimeLimitMinutes);
    if (!Number.isInteger(limit) || limit < 1) {
      errors.messageDeleteForEveryoneTimeLimitMinutes = tr("admin.settings.filesPerMessageError", "Debe ser un número entero mayor a 0, o vacío para sin límite.");
    }
  }

  if (draft.orphanFileRetentionHours.trim() !== "") {
    const hours = Number(draft.orphanFileRetentionHours);
    if (!Number.isInteger(hours) || hours < 1) {
      errors.orphanFileRetentionHours = tr("admin.settings.orphanRetentionError", "Debe ser un número entero mayor a 0, o vacío para deshabilitar.");
    }
  }

  if (draft.softDeletedFilePurgeDays.trim() !== "") {
    const days = Number(draft.softDeletedFilePurgeDays);
    if (!Number.isInteger(days) || days < 1) {
      errors.softDeletedFilePurgeDays = tr("admin.settings.purgeRetentionError", "Debe ser un número entero mayor a 0, o vacío para deshabilitar.");
    }
  }

  const batchSize = Number(draft.fileMigrationBatchSize);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    errors.fileMigrationBatchSize = tr("admin.settings.migrationBatchError", "Debe ser un número entero entre 1 y 500.");
  }

  const intervalMinutes = Number(draft.fileMigrationIntervalMinutes);
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
    errors.fileMigrationIntervalMinutes = tr("admin.settings.migrationIntervalError", "Debe ser un número entero mayor a 0.");
  }

  return errors;
}

function toPayload(draft: DraftState): UpdateAdminSettingsPayload {
  return {
    maxUploadSizeMb: Number(draft.maxUploadSizeMb),
    fileTypeRestrictionMode: draft.fileTypeRestrictionMode,
    fileTypeList: patternsFromSelection(draft.fileTypeSelection),
    maxFilesPerMessage: draft.maxFilesPerMessage.trim() === "" ? null : Number(draft.maxFilesPerMessage),
    allowConversationDelete: draft.allowConversationDelete,
    maxVoiceNoteDurationSeconds: Number(draft.maxVoiceNoteDurationSeconds),
    maxGroupMembers: Number(draft.maxGroupMembers),
    whoCanCreateGroups: draft.whoCanCreateGroups,
    whoCanAddMembers: draft.whoCanAddMembers,
    whoCanRemoveMembers: draft.whoCanRemoveMembers,
    whoCanChangeGroupInfo: draft.whoCanChangeGroupInfo,
    whoCanDeleteGroup: draft.whoCanDeleteGroup,
    allowGroupDelete: draft.allowGroupDelete,
    whoCanLeaveGroup: draft.whoCanLeaveGroup,
    allowGroupOverrideAddMembers: draft.allowGroupOverrideAddMembers,
    allowGroupOverrideRemoveMembers: draft.allowGroupOverrideRemoveMembers,
    allowGroupOverrideMaxGroupMembers: draft.allowGroupOverrideMaxGroupMembers,
    allowGroupOverrideChangeGroupInfo: draft.allowGroupOverrideChangeGroupInfo,
    allowGroupOverrideDeleteGroup: draft.allowGroupOverrideDeleteGroup,
    allowGroupOverrideLeaveGroup: draft.allowGroupOverrideLeaveGroup,
    messageRetentionDays: draft.messageRetentionDays.trim() === "" ? null : Number(draft.messageRetentionDays),
    auditLogRetentionDays: draft.auditLogRetentionDays.trim() === "" ? null : Number(draft.auditLogRetentionDays),
    allowMessageEdit: draft.allowMessageEdit,
    messageEditTimeLimitMinutes:
      draft.messageEditTimeLimitMinutes.trim() === "" ? null : Number(draft.messageEditTimeLimitMinutes),
    allowMessageDeleteForEveryone: draft.allowMessageDeleteForEveryone,
    messageDeleteForEveryoneTimeLimitMinutes:
      draft.messageDeleteForEveryoneTimeLimitMinutes.trim() === ""
        ? null
        : Number(draft.messageDeleteForEveryoneTimeLimitMinutes),
    allowStickersAndGifs: draft.allowStickersAndGifs,
    uploadCleanupEnabled: draft.uploadCleanupEnabled,
    orphanFileRetentionHours:
      draft.orphanFileRetentionHours.trim() === "" ? null : Number(draft.orphanFileRetentionHours),
    softDeletedFilePurgeDays:
      draft.softDeletedFilePurgeDays.trim() === "" ? null : Number(draft.softDeletedFilePurgeDays),
    uploadCleanupDryRun: draft.uploadCleanupDryRun,
    fileMigrationEnabled: draft.fileMigrationEnabled,
    fileMigrationBatchSize: Number(draft.fileMigrationBatchSize),
    fileMigrationIntervalMinutes: Number(draft.fileMigrationIntervalMinutes),
    fileMigrationDeleteLocalAfterCommit: draft.fileMigrationDeleteLocalAfterCommit,
  };
}

interface GroupPermissionFieldProps {
  label: string;
  value: GroupPermissionLevel;
  options: GroupPermissionLevel[];
  onChange: (value: GroupPermissionLevel) => void;
  overrideAllowed?: boolean;
  onOverrideChange?: (value: boolean) => void;
  disabled?: boolean;
  optionLabels?: Record<GroupPermissionLevel, string>;
  overrideLabel?: string;
}

function GroupPermissionField({
  label,
  value,
  options,
  onChange,
  overrideAllowed,
  onOverrideChange,
  disabled,
  optionLabels = GROUP_PERMISSION_LABELS,
  overrideLabel = "El grupo puede cambiar esto",
}: GroupPermissionFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
      {label}
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value as GroupPermissionLevel)}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabels[option] ?? GROUP_PERMISSION_LABELS[option]}
          </option>
        ))}
      </Select>
      {onOverrideChange && (
        <Checkbox
          className="mt-1"
          checked={overrideAllowed ?? false}
          onChange={(event) => onOverrideChange(event.target.checked)}
          disabled={disabled}
          label={overrideLabel}
        />
      )}
    </label>
  );
}

export function AdminSettingsPanel() {
  const { t } = useTranslation();
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
          <span>{loadError || t("admin.settings.loadError")}</span>
        </div>
        <Button type="button" variant="ghost" onClick={refetch}>
          {t("admin.retry")}
        </Button>
      </div>
    );
  }

  const errors = validate(draft, (key) => t(key as any));
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

  const groupPermissionLabels: Record<GroupPermissionLevel, string> = {
    ALL_MEMBERS: t("admin.settings.permAllMembers"),
    GROUP_ADMINS_ONLY: t("admin.settings.permGroupAdminsOnly"),
    APP_ADMINS_ONLY: t("admin.settings.permAppAdminsOnly"),
    CREATOR_ONLY: t("admin.settings.permCreatorOnly"),
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-lg flex-col gap-8">
          <h2 className="font-display text-lg font-semibold text-brand-ink dark:text-white">
            {t("admin.settings.title")}
          </h2>

          {saveError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
              <IconAlertCircle size={16} className="shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">
              {t("admin.settings.attachmentsTitle")}
            </h3>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                {t("admin.settings.maxUploadSizeMb")}
                <Input
                  type="number"
                  min={1}
                  value={draft.maxUploadSizeMb}
                  onChange={(event) => updateField("maxUploadSizeMb", event.target.value)}
                  error={errors.maxUploadSizeMb}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                {t("admin.settings.maxFilesPerMessage")}
                <Input
                  type="number"
                  min={1}
                  value={draft.maxFilesPerMessage}
                  onChange={(event) => updateField("maxFilesPerMessage", event.target.value)}
                  error={errors.maxFilesPerMessage}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                {t("admin.settings.fileTypeRestrictionMode")}
                <Select
                  value={draft.fileTypeRestrictionMode}
                  onChange={(event) =>
                    updateField("fileTypeRestrictionMode", event.target.value as FileTypeRestrictionMode)
                  }
                >
                  <option value="DISABLED">{t("admin.settings.restrictionDisabled")}</option>
                  <option value="ALLOWLIST">{t("admin.settings.restrictionAllowlist")}</option>
                  <option value="BLOCKLIST">{t("admin.settings.restrictionBlocklist")}</option>
                </Select>
              </label>
              {draft.fileTypeRestrictionMode !== "DISABLED" && (
                <FileTypeMultiSelect
                  label={draft.fileTypeRestrictionMode === "ALLOWLIST" ? t("admin.settings.allowedTypes") : t("admin.settings.blockedTypes")}
                  value={draft.fileTypeSelection}
                  onChange={(next) => updateField("fileTypeSelection", next)}
                />
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">
              {t("admin.settings.cleanupTitle")}
            </h3>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Checkbox
                  checked={draft.uploadCleanupEnabled}
                  onChange={(event) => updateField("uploadCleanupEnabled", event.target.checked)}
                  label={t("admin.settings.uploadCleanupEnabled")}
                />
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  {t("admin.settings.uploadCleanupDesc")}
                </p>
              </div>

              {draft.uploadCleanupEnabled && (
                <div className="flex flex-col gap-3 border-l-2 border-brand-accent/30 pl-4">
                  <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                    {t("admin.settings.orphanFileRetentionHours")}
                    <Input
                      type="number"
                      min={1}
                      placeholder={t("admin.settings.orphanRetentionPlaceholder")}
                      value={draft.orphanFileRetentionHours}
                      onChange={(event) => updateField("orphanFileRetentionHours", event.target.value)}
                      error={errors.orphanFileRetentionHours}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                    {t("admin.settings.softDeletedFilePurgeDays")}
                    <Input
                      type="number"
                      min={1}
                      placeholder={t("admin.settings.softDeletedPurgePlaceholder")}
                      value={draft.softDeletedFilePurgeDays}
                      onChange={(event) => updateField("softDeletedFilePurgeDays", event.target.value)}
                      error={errors.softDeletedFilePurgeDays}
                    />
                  </label>

                  <Checkbox
                    checked={draft.uploadCleanupDryRun}
                    onChange={(event) => updateField("uploadCleanupDryRun", event.target.checked)}
                    label={t("admin.settings.uploadCleanupDryRun")}
                  />
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">
              {t("admin.settings.migrationTitle")}
            </h3>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Checkbox
                  checked={draft.fileMigrationEnabled}
                  onChange={(event) => updateField("fileMigrationEnabled", event.target.checked)}
                  label={t("admin.settings.fileMigrationEnabled")}
                />
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  {t("admin.settings.fileMigrationDesc")}
                </p>
              </div>

              {draft.fileMigrationEnabled && (
                <div className="flex flex-col gap-3 border-l-2 border-brand-accent/30 pl-4">
                  <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                    {t("admin.settings.fileMigrationBatchSize")}
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={draft.fileMigrationBatchSize}
                      onChange={(event) => updateField("fileMigrationBatchSize", event.target.value)}
                      error={errors.fileMigrationBatchSize}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                    {t("admin.settings.fileMigrationIntervalMinutes")}
                    <Input
                      type="number"
                      min={1}
                      value={draft.fileMigrationIntervalMinutes}
                      onChange={(event) => updateField("fileMigrationIntervalMinutes", event.target.value)}
                      error={errors.fileMigrationIntervalMinutes}
                    />
                  </label>

                  <div className="flex flex-col gap-1">
                    <Checkbox
                      checked={draft.fileMigrationDeleteLocalAfterCommit}
                      onChange={(event) =>
                        updateField("fileMigrationDeleteLocalAfterCommit", event.target.checked)
                      }
                      label={t("admin.settings.fileMigrationDeleteLocalAfterCommit")}
                    />
                    <p className="text-xs text-neutral-400 dark:text-neutral-500">
                      {t("admin.settings.fileMigrationDeleteLocalDesc")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">
              {t("admin.settings.privateChatsTitle")}
            </h3>
            <Checkbox
              checked={draft.allowConversationDelete}
              onChange={(event) => updateField("allowConversationDelete", event.target.checked)}
              label={t("admin.settings.allowConversationDelete")}
            />
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              {t("admin.settings.allowConversationDeleteDesc")}
            </p>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">
              {t("admin.settings.voiceNotesTitle")}
            </h3>
            <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
              {t("admin.settings.maxVoiceNoteDurationSeconds")}
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
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">
              {t("admin.settings.groupsTitle")}
            </h3>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                {t("admin.settings.maxGroupMembers")}
                <Input
                  type="number"
                  min={2}
                  value={draft.maxGroupMembers}
                  onChange={(event) => updateField("maxGroupMembers", event.target.value)}
                  error={errors.maxGroupMembers}
                />
                <Checkbox
                  className="mt-1"
                  checked={draft.allowGroupOverrideMaxGroupMembers}
                  onChange={(event) => updateField("allowGroupOverrideMaxGroupMembers", event.target.checked)}
                  label={t("admin.settings.groupOverrideCheckbox")}
                />
              </label>
              <GroupPermissionField
                label={t("admin.settings.whoCanCreateGroups")}
                value={draft.whoCanCreateGroups}
                options={CREATE_GROUPS_OPTIONS}
                onChange={(value) => updateField("whoCanCreateGroups", value)}
                optionLabels={groupPermissionLabels}
              />
              <GroupPermissionField
                label={t("admin.settings.whoCanAddMembers")}
                value={draft.whoCanAddMembers}
                options={MEMBER_ACTION_OPTIONS}
                onChange={(value) => updateField("whoCanAddMembers", value)}
                overrideAllowed={draft.allowGroupOverrideAddMembers}
                onOverrideChange={(value) => updateField("allowGroupOverrideAddMembers", value)}
                optionLabels={groupPermissionLabels}
                overrideLabel={t("admin.settings.groupOverrideCheckbox")}
              />
              <GroupPermissionField
                label={t("admin.settings.whoCanRemoveMembers")}
                value={draft.whoCanRemoveMembers}
                options={MEMBER_ACTION_OPTIONS}
                onChange={(value) => updateField("whoCanRemoveMembers", value)}
                overrideAllowed={draft.allowGroupOverrideRemoveMembers}
                onOverrideChange={(value) => updateField("allowGroupOverrideRemoveMembers", value)}
                optionLabels={groupPermissionLabels}
                overrideLabel={t("admin.settings.groupOverrideCheckbox")}
              />
              <GroupPermissionField
                label={t("admin.settings.whoCanChangeGroupInfo")}
                value={draft.whoCanChangeGroupInfo}
                options={MEMBER_ACTION_OPTIONS}
                onChange={(value) => updateField("whoCanChangeGroupInfo", value)}
                overrideAllowed={draft.allowGroupOverrideChangeGroupInfo}
                onOverrideChange={(value) => updateField("allowGroupOverrideChangeGroupInfo", value)}
                optionLabels={groupPermissionLabels}
                overrideLabel={t("admin.settings.groupOverrideCheckbox")}
              />
              <GroupPermissionField
                label={t("admin.settings.whoCanLeaveGroup")}
                value={draft.whoCanLeaveGroup}
                options={MEMBER_ACTION_OPTIONS}
                onChange={(value) => updateField("whoCanLeaveGroup", value)}
                overrideAllowed={draft.allowGroupOverrideLeaveGroup}
                onOverrideChange={(value) => updateField("allowGroupOverrideLeaveGroup", value)}
                optionLabels={groupPermissionLabels}
                overrideLabel={t("admin.settings.groupOverrideCheckbox")}
              />
              <div className="flex flex-col gap-1">
                <Checkbox
                  checked={draft.allowGroupDelete}
                  onChange={(event) => updateField("allowGroupDelete", event.target.checked)}
                  label={t("admin.settings.allowGroupDelete")}
                />
                <GroupPermissionField
                  label={t("admin.settings.whoCanDeleteGroup")}
                  value={draft.whoCanDeleteGroup}
                  options={DELETE_GROUP_OPTIONS}
                  onChange={(value) => updateField("whoCanDeleteGroup", value)}
                  overrideAllowed={draft.allowGroupOverrideDeleteGroup}
                  onOverrideChange={(value) => updateField("allowGroupOverrideDeleteGroup", value)}
                  disabled={!draft.allowGroupDelete}
                  optionLabels={groupPermissionLabels}
                  overrideLabel={t("admin.settings.groupOverrideCheckbox")}
                />
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">
              {t("admin.settings.retentionTitle")}
            </h3>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                {t("admin.settings.messageRetentionDays")}
                <Input
                  type="number"
                  min={0}
                  value={draft.messageRetentionDays}
                  onChange={(event) => updateField("messageRetentionDays", event.target.value)}
                  error={errors.messageRetentionDays}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                {t("admin.settings.auditLogRetentionDays")}
                <Input
                  type="number"
                  min={1}
                  value={draft.auditLogRetentionDays}
                  onChange={(event) => updateField("auditLogRetentionDays", event.target.value)}
                  error={errors.auditLogRetentionDays}
                />
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {t("admin.settings.auditRetentionWarning")}
                </span>
              </label>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">
              {t("admin.settings.editAndDeleteTitle")}
            </h3>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Checkbox
                  checked={draft.allowMessageEdit}
                  onChange={(event) => updateField("allowMessageEdit", event.target.checked)}
                  label={t("admin.settings.allowMessageEdit")}
                />
                <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                  {t("admin.settings.messageEditTimeLimitMinutes")}
                  <Input
                    type="number"
                    min={1}
                    disabled={!draft.allowMessageEdit}
                    value={draft.messageEditTimeLimitMinutes}
                    onChange={(event) => updateField("messageEditTimeLimitMinutes", event.target.value)}
                    error={errors.messageEditTimeLimitMinutes}
                  />
                </label>
              </div>
              <div className="flex flex-col gap-1">
                <Checkbox
                  checked={draft.allowMessageDeleteForEveryone}
                  onChange={(event) => updateField("allowMessageDeleteForEveryone", event.target.checked)}
                  label={t("admin.settings.allowMessageDeleteForEveryone")}
                />
                <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                  {t("admin.settings.messageDeleteForEveryoneTimeLimitMinutes")}
                  <Input
                    type="number"
                    min={1}
                    disabled={!draft.allowMessageDeleteForEveryone}
                    value={draft.messageDeleteForEveryoneTimeLimitMinutes}
                    onChange={(event) => updateField("messageDeleteForEveryoneTimeLimitMinutes", event.target.value)}
                    error={errors.messageDeleteForEveryoneTimeLimitMinutes}
                  />
                </label>
              </div>
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                {t("admin.settings.moderatorDeleteNotice")}
              </p>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">
              {t("admin.settings.stickersTitle")}
            </h3>
            <div className="flex flex-col gap-1">
              <Checkbox
                checked={draft.allowStickersAndGifs}
                onChange={(event) => updateField("allowStickersAndGifs", event.target.checked)}
                label={t("admin.settings.allowStickersAndGifs")}
              />
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                {t("admin.settings.stickersDesc")}
              </p>
            </div>
          </section>
        </div>
      </div>

      <div className="border-t border-black/5 px-4 py-3 dark:border-white/10">
        <div className="mx-auto max-w-lg">
          <Button type="button" disabled={!isDirty || hasErrors || pending} onClick={handleSave} className="w-full">
            {pending && <IconLoader2 className="animate-spin" size={16} />}
            {t("admin.saveChanges")}
          </Button>
        </div>
      </div>
    </div>
  );
}

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
  allowGroupOverrideAddMembers: boolean;
  allowGroupOverrideRemoveMembers: boolean;
  allowGroupOverrideMaxGroupMembers: boolean;
  allowGroupOverrideChangeGroupInfo: boolean;
  allowGroupOverrideDeleteGroup: boolean;
  messageRetentionDays: string;
  allowMessageEdit: boolean;
  messageEditTimeLimitMinutes: string;
  allowMessageDeleteForEveryone: boolean;
  messageDeleteForEveryoneTimeLimitMinutes: string;
  allowStickersAndGifs: boolean;
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
    allowGroupOverrideAddMembers: settings.allowGroupOverrideAddMembers,
    allowGroupOverrideRemoveMembers: settings.allowGroupOverrideRemoveMembers,
    allowGroupOverrideMaxGroupMembers: settings.allowGroupOverrideMaxGroupMembers,
    allowGroupOverrideChangeGroupInfo: settings.allowGroupOverrideChangeGroupInfo,
    allowGroupOverrideDeleteGroup: settings.allowGroupOverrideDeleteGroup,
    messageRetentionDays: settings.messageRetentionDays == null ? "" : String(settings.messageRetentionDays),
    allowMessageEdit: settings.allowMessageEdit,
    messageEditTimeLimitMinutes:
      settings.messageEditTimeLimitMinutes == null ? "" : String(settings.messageEditTimeLimitMinutes),
    allowMessageDeleteForEveryone: settings.allowMessageDeleteForEveryone,
    messageDeleteForEveryoneTimeLimitMinutes:
      settings.messageDeleteForEveryoneTimeLimitMinutes == null
        ? ""
        : String(settings.messageDeleteForEveryoneTimeLimitMinutes),
    allowStickersAndGifs: settings.allowStickersAndGifs,
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

  if (draft.maxFilesPerMessage.trim() !== "") {
    const filesLimit = Number(draft.maxFilesPerMessage);
    if (!Number.isInteger(filesLimit) || filesLimit < 1) {
      errors.maxFilesPerMessage = "Debe ser un número entero mayor a 0, o vacío para sin límite.";
    }
  }

  if (draft.messageRetentionDays.trim() !== "") {
    const retention = Number(draft.messageRetentionDays);
    if (!Number.isInteger(retention) || retention < 0) {
      errors.messageRetentionDays = "Debe ser un número entero mayor o igual a 0, o vacío para deshabilitar.";
    }
  }

  if (draft.messageEditTimeLimitMinutes.trim() !== "") {
    const limit = Number(draft.messageEditTimeLimitMinutes);
    if (!Number.isInteger(limit) || limit < 1) {
      errors.messageEditTimeLimitMinutes = "Debe ser un número entero mayor a 0, o vacío para sin límite.";
    }
  }

  if (draft.messageDeleteForEveryoneTimeLimitMinutes.trim() !== "") {
    const limit = Number(draft.messageDeleteForEveryoneTimeLimitMinutes);
    if (!Number.isInteger(limit) || limit < 1) {
      errors.messageDeleteForEveryoneTimeLimitMinutes = "Debe ser un número entero mayor a 0, o vacío para sin límite.";
    }
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
    allowGroupOverrideAddMembers: draft.allowGroupOverrideAddMembers,
    allowGroupOverrideRemoveMembers: draft.allowGroupOverrideRemoveMembers,
    allowGroupOverrideMaxGroupMembers: draft.allowGroupOverrideMaxGroupMembers,
    allowGroupOverrideChangeGroupInfo: draft.allowGroupOverrideChangeGroupInfo,
    allowGroupOverrideDeleteGroup: draft.allowGroupOverrideDeleteGroup,
    messageRetentionDays: draft.messageRetentionDays.trim() === "" ? null : Number(draft.messageRetentionDays),
    allowMessageEdit: draft.allowMessageEdit,
    messageEditTimeLimitMinutes:
      draft.messageEditTimeLimitMinutes.trim() === "" ? null : Number(draft.messageEditTimeLimitMinutes),
    allowMessageDeleteForEveryone: draft.allowMessageDeleteForEveryone,
    messageDeleteForEveryoneTimeLimitMinutes:
      draft.messageDeleteForEveryoneTimeLimitMinutes.trim() === ""
        ? null
        : Number(draft.messageDeleteForEveryoneTimeLimitMinutes),
    allowStickersAndGifs: draft.allowStickersAndGifs,
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
}

function GroupPermissionField({
  label,
  value,
  options,
  onChange,
  overrideAllowed,
  onOverrideChange,
  disabled,
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
            {GROUP_PERMISSION_LABELS[option]}
          </option>
        ))}
      </Select>
      {onOverrideChange && (
        <Checkbox
          className="mt-1"
          checked={overrideAllowed ?? false}
          onChange={(event) => onOverrideChange(event.target.checked)}
          disabled={disabled}
          label="El grupo puede cambiar esto"
        />
      )}
    </label>
  );
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
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-lg flex-col gap-8">
          <h2 className="font-display text-lg font-semibold text-brand-ink dark:text-white">Configuración global</h2>

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
                Máximo de archivos por mensaje (vacío = sin límite)
                <Input
                  type="number"
                  min={1}
                  value={draft.maxFilesPerMessage}
                  onChange={(event) => updateField("maxFilesPerMessage", event.target.value)}
                  error={errors.maxFilesPerMessage}
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
                <FileTypeMultiSelect
                  label={draft.fileTypeRestrictionMode === "ALLOWLIST" ? "Tipos permitidos" : "Tipos bloqueados"}
                  value={draft.fileTypeSelection}
                  onChange={(next) => updateField("fileTypeSelection", next)}
                />
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">Conversaciones privadas</h3>
            <Checkbox
              checked={draft.allowConversationDelete}
              onChange={(event) => updateField("allowConversationDelete", event.target.checked)}
              label="Los usuarios pueden eliminar sus chats privados"
            />
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              El chat se elimina solo para quien lo borra — reaparece si la otra persona escribe de nuevo, o si vos
              le volvés a escribir.
            </p>
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
                <Checkbox
                  className="mt-1"
                  checked={draft.allowGroupOverrideMaxGroupMembers}
                  onChange={(event) => updateField("allowGroupOverrideMaxGroupMembers", event.target.checked)}
                  label="El grupo puede cambiar esto"
                />
              </label>
              <GroupPermissionField
                label="¿Quién puede crear grupos?"
                value={draft.whoCanCreateGroups}
                options={CREATE_GROUPS_OPTIONS}
                onChange={(value) => updateField("whoCanCreateGroups", value)}
              />
              <GroupPermissionField
                label="¿Quién puede agregar miembros?"
                value={draft.whoCanAddMembers}
                options={MEMBER_ACTION_OPTIONS}
                onChange={(value) => updateField("whoCanAddMembers", value)}
                overrideAllowed={draft.allowGroupOverrideAddMembers}
                onOverrideChange={(value) => updateField("allowGroupOverrideAddMembers", value)}
              />
              <GroupPermissionField
                label="¿Quién puede quitar miembros?"
                value={draft.whoCanRemoveMembers}
                options={MEMBER_ACTION_OPTIONS}
                onChange={(value) => updateField("whoCanRemoveMembers", value)}
                overrideAllowed={draft.allowGroupOverrideRemoveMembers}
                onOverrideChange={(value) => updateField("allowGroupOverrideRemoveMembers", value)}
              />
              <GroupPermissionField
                label="¿Quién puede renombrar o cambiar la foto del grupo?"
                value={draft.whoCanChangeGroupInfo}
                options={MEMBER_ACTION_OPTIONS}
                onChange={(value) => updateField("whoCanChangeGroupInfo", value)}
                overrideAllowed={draft.allowGroupOverrideChangeGroupInfo}
                onOverrideChange={(value) => updateField("allowGroupOverrideChangeGroupInfo", value)}
              />
              <div className="flex flex-col gap-1">
                <Checkbox
                  checked={draft.allowGroupDelete}
                  onChange={(event) => updateField("allowGroupDelete", event.target.checked)}
                  label="Los grupos se pueden eliminar"
                />
                <GroupPermissionField
                  label="¿Quién puede eliminar el grupo?"
                  value={draft.whoCanDeleteGroup}
                  options={DELETE_GROUP_OPTIONS}
                  onChange={(value) => updateField("whoCanDeleteGroup", value)}
                  overrideAllowed={draft.allowGroupOverrideDeleteGroup}
                  onOverrideChange={(value) => updateField("allowGroupOverrideDeleteGroup", value)}
                  disabled={!draft.allowGroupDelete}
                />
              </div>
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

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">Edición y borrado de mensajes</h3>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Checkbox
                  checked={draft.allowMessageEdit}
                  onChange={(event) => updateField("allowMessageEdit", event.target.checked)}
                  label="Los usuarios pueden editar sus propios mensajes"
                />
                <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                  Tiempo límite para editar, en minutos (vacío = sin límite)
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
                  label="Los usuarios pueden eliminar sus propios mensajes para todos"
                />
                <label className="flex flex-col gap-1 text-sm text-neutral-600 dark:text-neutral-300">
                  Tiempo límite para eliminar para todos, en minutos (vacío = sin límite)
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
                El creador de la conversación siempre puede eliminar mensajes ajenos como moderador, sin importar
                esta configuración.
              </p>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">GIFs y stickers</h3>
            <div className="flex flex-col gap-1">
              <Checkbox
                checked={draft.allowStickersAndGifs}
                onChange={(event) => updateField("allowStickersAndGifs", event.target.checked)}
                label="Los usuarios pueden buscar y enviar GIFs y stickers (Giphy)"
              />
              <p className="text-xs text-neutral-400 dark:text-neutral-500">
                Requiere además una API key de Giphy configurada en el servidor (GIPHY_API_KEY) — sin eso, el
                buscador responde error aunque esta opción esté activada.
              </p>
            </div>
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

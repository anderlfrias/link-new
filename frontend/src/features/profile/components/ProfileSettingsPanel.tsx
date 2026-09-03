"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCheck,
  IconLoader2,
  IconPencil,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useAuth } from "@/providers/auth-provider";
import { useProfilePicture } from "@/features/auth/hooks/use-profile-picture";
import { useUpdateProfilePicture } from "@/features/profile/hooks/use-update-profile-picture";
import { useUpdateProfileName } from "@/features/profile/hooks/use-update-profile-name";
import { useUpdateNotificationSound } from "@/features/profile/hooks/use-update-notification-sound";
import { BoringAvatarPicker } from "@/features/profile/components/BoringAvatarPicker";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";

interface ProfileSettingsPanelProps {
  onClose: () => void;
}

export function ProfileSettingsPanel({ onClose }: ProfileSettingsPanelProps) {
  const { session } = useAuth();
  const { url: profilePictureUrl } = useProfilePicture();
  const { upload, remove, pending, error } = useUpdateProfilePicture();
  const { updateName, pending: updatingName, error: nameError } = useUpdateProfileName();
  const { setEnabled: setSoundEnabled, pending: updatingSound, error: soundError } = useUpdateNotificationSound();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const currentName = session?.user.fullName || session?.user.username || "";
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(currentName);

  // Si `session.user.fullName` cambia por fuera (ej. login), y no estás
  // editando en este momento, seguí ese valor en vez de quedarte con uno viejo.
  useEffect(() => {
    if (!editingName) setNameDraft(currentName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentName]);

  if (!session) return null;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Permite volver a elegir el mismo archivo después (si lo borró y lo quiere subir de nuevo).
    event.target.value = "";
    if (file) upload(file, file.name);
  }

  async function handleRemove() {
    await remove();
    setConfirmingRemove(false);
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === currentName) {
      setEditingName(false);
      return;
    }
    const ok = await updateName(trimmed);
    if (ok) setEditingName(false);
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveName();
    } else if (event.key === "Escape") {
      setNameDraft(currentName);
      setEditingName(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Volver"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
        >
          <IconArrowLeft size={20} stroke={1.75} />
        </button>
        <h2 className="font-display text-lg font-semibold text-brand-ink dark:text-white">Mi perfil</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {(error || nameError || soundError) && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <IconAlertCircle size={16} className="shrink-0" />
            <span>{error || nameError || soundError}</span>
          </div>
        )}

        <div className="flex flex-col items-center gap-3 py-4">
          <div className="relative">
            <Avatar name={currentName} imageUrl={profilePictureUrl} size="xl" />
            {pending && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30">
                <IconLoader2 className="animate-spin text-white" size={24} />
              </div>
            )}
          </div>

          {editingName ? (
            <div className="flex w-full items-center gap-1.5">
              <input
                autoFocus
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={handleNameKeyDown}
                maxLength={120}
                disabled={updatingName}
                className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-center text-sm text-brand-ink outline-none focus:border-brand-blue dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
              <button
                type="button"
                onClick={saveName}
                disabled={updatingName || !nameDraft.trim()}
                aria-label="Guardar nombre"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-brand-blue hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
              >
                {updatingName ? <IconLoader2 className="animate-spin" size={16} /> : <IconCheck size={18} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNameDraft(currentName);
                  setEditingName(false);
                }}
                disabled={updatingName}
                aria-label="Cancelar"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
              >
                <IconX size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-brand-ink dark:text-white">{currentName}</p>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                aria-label="Editar mi nombre"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <IconPencil size={14} stroke={1.75} />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <Button
            type="button"
            disabled={pending}
            onClick={() => fileInputRef.current?.click()}
            className="w-full"
          >
            <IconUpload size={16} stroke={1.75} />
            Subir una foto
          </Button>

          {!confirmingRemove ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending || !profilePictureUrl}
              onClick={() => setConfirmingRemove(true)}
              className="w-full"
            >
              <IconTrash size={16} stroke={1.75} />
              Eliminar foto actual
            </Button>
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm dark:bg-red-500/10">
              <span className="flex-1 text-red-700 dark:text-red-300">¿Eliminar tu foto de perfil?</span>
              <button
                type="button"
                onClick={() => setConfirmingRemove(false)}
                className="rounded px-2 py-1 text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
              >
                Cancelar
              </button>
              <Button type="button" variant="danger" disabled={pending} onClick={handleRemove}>
                Eliminar
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">O elegí un avatar</h3>
          <BoringAvatarPicker
            seed={session.user.internalUserId}
            onSelect={(blob) => upload(blob, "avatar.png")}
            disabled={pending}
          />
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">Notificaciones</h3>
          <Checkbox
            checked={session.user.notificationSoundEnabled !== false}
            disabled={updatingSound}
            onChange={(event) => setSoundEnabled(event.target.checked)}
            label="Reproducir un sonido al recibir mensajes"
          />
        </div>
      </div>
    </div>
  );
}

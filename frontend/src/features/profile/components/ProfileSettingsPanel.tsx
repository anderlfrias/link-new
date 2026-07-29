"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { IconAlertCircle, IconArrowLeft, IconLoader2, IconTrash, IconUpload } from "@tabler/icons-react";
import { useAuth } from "@/providers/auth-provider";
import { useProfilePicture } from "@/features/auth/hooks/use-profile-picture";
import { useUpdateProfilePicture } from "@/features/profile/hooks/use-update-profile-picture";
import { BoringAvatarPicker } from "@/features/profile/components/BoringAvatarPicker";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";

interface ProfileSettingsPanelProps {
  onClose: () => void;
}

export function ProfileSettingsPanel({ onClose }: ProfileSettingsPanelProps) {
  const { session } = useAuth();
  const { url: profilePictureUrl } = useProfilePicture();
  const { upload, remove, pending, error } = useUpdateProfilePicture();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

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
        <h2 className="font-display text-lg font-semibold text-brand-ink dark:text-white">Foto de perfil</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <IconAlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col items-center gap-3 py-4">
          <div className="relative">
            <Avatar
              name={session.user.fullName || session.user.username}
              imageUrl={profilePictureUrl}
              size="xl"
            />
            {pending && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30">
                <IconLoader2 className="animate-spin text-white" size={24} />
              </div>
            )}
          </div>
          <p className="text-sm font-medium text-brand-ink dark:text-white">
            {session.user.fullName || session.user.username}
          </p>
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
      </div>
    </div>
  );
}

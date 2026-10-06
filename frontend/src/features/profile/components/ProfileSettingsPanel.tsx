"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowRight,
  IconCamera,
  IconCheck,
  IconLoader2,
  IconPalette,
  IconPencil,
  IconPhoto,
  IconShieldLock,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useAuth } from "@/providers/auth-provider";
import { useProfilePicture } from "@/features/auth/hooks/use-profile-picture";
import { useUpdateProfilePicture } from "@/features/profile/hooks/use-update-profile-picture";
import { useUpdateProfileName } from "@/features/profile/hooks/use-update-profile-name";
import { useUpdateNotificationSound } from "@/features/profile/hooks/use-update-notification-sound";
import { useUpdateLanguage } from "@/features/profile/hooks/use-update-language";
import { useTranslation } from "@/i18n";
import { AvatarSelectionModal } from "@/features/profile/components/AvatarSelectionModal";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { LanguageSelector } from "@/components/ui/LanguageSelector";
import { APP_VERSION } from "@/constants/app-version.constant";
import { ChangePasswordForm } from "@/features/auth/components/ChangePasswordForm";
import { useAuthConfig } from "@/providers/auth-config-provider";

interface ProfileSettingsPanelProps {
  onClose: () => void;
}

export function ProfileSettingsPanel({ onClose }: ProfileSettingsPanelProps) {
  const { t } = useTranslation();
  const { session, completePasswordChange } = useAuth();
  const { config } = useAuthConfig();
  const { url: profilePictureUrl } = useProfilePicture();
  const { upload, remove, pending, error } = useUpdateProfilePicture();
  const { updateName, pending: updatingName, error: nameError } = useUpdateProfileName();
  const { setEnabled: setSoundEnabled, pending: updatingSound, error: soundError } = useUpdateNotificationSound();
  const { changeLanguage, pending: updatingLanguage, error: languageError } = useUpdateLanguage();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);

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
          aria-label={t("common.back")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
        >
          <IconArrowLeft size={20} stroke={1.75} />
        </button>
        <h2 className="font-display text-lg font-semibold text-brand-ink dark:text-white">{t("profile.myProfile")}</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {(error || nameError || soundError || languageError) && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <IconAlertCircle size={16} className="shrink-0" />
            <span>{error || nameError || soundError || languageError}</span>
          </div>
        )}

        <div className="flex flex-col items-center gap-3 py-4">
          <button
            type="button"
            onClick={() => setIsAvatarModalOpen(true)}
            disabled={pending}
            title={t("profile.changePhoto")}
            className="group relative cursor-pointer rounded-full focus:outline-none focus:ring-2 focus:ring-brand-blue focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
          >
            <Avatar name={currentName} imageUrl={profilePictureUrl} size="xl" />
            {pending ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                <IconLoader2 className="animate-spin text-white" size={24} />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <IconCamera size={22} className="text-white" stroke={2} />
                <span className="text-[10px] font-medium text-white">{t("common.edit")}</span>
              </div>
            )}
            <div className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-brand-blue text-white shadow-md dark:border-neutral-900">
              <IconCamera size={14} stroke={2} />
            </div>
          </button>

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
                aria-label={t("profile.saveName")}
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
                aria-label={t("common.cancel")}
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
                aria-label={t("profile.editName")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <IconPencil size={14} stroke={1.75} />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            disabled={pending}
            onClick={() => setIsAvatarModalOpen(true)}
            className="w-full gap-2 shadow-sm"
          >
            <IconPhoto size={16} stroke={1.75} />
            {t("profile.changePhotoOrAvatar")}
          </Button>

          {!confirmingRemove ? (
            profilePictureUrl ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending || !profilePictureUrl}
                onClick={() => setConfirmingRemove(true)}
                className="w-full"
              >
                <IconTrash size={16} stroke={1.75} />
                {t("profile.deleteCurrentPhoto")}
              </Button>
            ) : null
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm dark:bg-red-500/10">
              <span className="flex-1 text-red-700 dark:text-red-300">{t("profile.confirmDeletePhoto")}</span>
              <button
                type="button"
                onClick={() => setConfirmingRemove(false)}
                className="rounded px-2 py-1 text-neutral-600 hover:bg-black/5 dark:text-neutral-300 dark:hover:bg-white/10"
              >
                {t("common.cancel")}
              </button>
              <Button type="button" variant="danger" disabled={pending} onClick={handleRemove}>
                {t("common.delete")}
              </Button>
            </div>
          )}
        </div>

        {/* Sección de galería de ilustraciones y avatares */}
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-brand-ink dark:text-white">{t("profile.avatarsAndIllustrations")}</h3>
            <button
              type="button"
              onClick={() => setIsAvatarModalOpen(true)}
              disabled={pending}
              className="text-xs font-medium text-brand-blue hover:underline dark:text-brand-blue-light"
            >
              {t("profile.viewCatalog")}
            </button>
          </div>
          <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
            {t("profile.catalogDescription")}
          </p>
          <button
            type="button"
            onClick={() => setIsAvatarModalOpen(true)}
            disabled={pending}
            className="group flex w-full items-center justify-between rounded-xl border border-black/10 bg-black/[0.02] p-3 text-left transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20 dark:text-brand-blue-light">
                <IconPalette size={20} stroke={1.75} />
              </div>
              <div>
                <span className="block text-sm font-medium text-brand-ink dark:text-white">
                  {t("profile.galleryTitle")}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t("profile.gallerySubtitle")}
                </span>
              </div>
            </div>
            <IconArrowRight
              size={18}
              stroke={1.75}
              className="shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5 dark:text-neutral-500"
            />
          </button>
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-sm font-medium text-brand-ink dark:text-white">{t("profile.notifications")}</h3>
          <Checkbox
            checked={session.user.notificationSoundEnabled !== false}
            disabled={updatingSound}
            onChange={(event) => setSoundEnabled(event.target.checked)}
            label={t("profile.soundNotification")}
          />
        </div>

        {/* Sección de Selección de Idioma */}
        <div className="mt-6">
          <h3 className="mb-1 text-sm font-medium text-brand-ink dark:text-white">
            {t("profile.language")}
          </h3>
          <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
            {t("profile.languageDescription")}
          </p>
          <LanguageSelector
            variant="segmented"
            disabled={updatingLanguage}
            onLanguageChange={(locale) => void changeLanguage(locale)}
          />
        </div>

        {/* Seguridad: solo con cuentas locales. En modo external-auth la contraseña
            se administra en EXTERNAL_AUTH. */}
        {session.user.authProvider === "local" && (
          <div className="mt-6">
            <h3 className="mb-1 text-sm font-medium text-brand-ink dark:text-white">{t("password.securityTitle")}</h3>
            <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">{t("password.changePasswordDescription")}</p>
            {passwordChanged && (
              <div role="status" className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                <IconCheck size={16} className="shrink-0" />
                <span>{t("password.changed")}</span>
              </div>
            )}
            {changingPassword ? (
              <ChangePasswordForm
                policy={config?.mode === "local" ? config.passwordPolicy : null}
                currentPasswordLabel={t("password.currentPassword")}
                onChanged={({ token, exp }) => {
                  completePasswordChange(token, exp);
                  setChangingPassword(false);
                  setPasswordChanged(true);
                }}
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setChangingPassword(true);
                  setPasswordChanged(false);
                }}
                className="w-full"
              >
                <IconShieldLock size={16} stroke={1.75} />
                {t("password.submit")}
              </Button>
            )}
          </div>
        )}

        {/* Versión de la aplicación */}
        <div className="mt-8 border-t border-black/5 pt-4 text-center text-xs text-neutral-400 dark:border-white/5 dark:text-neutral-500">
          Link • v{APP_VERSION}
        </div>
      </div>

      {/* Modal de selección de avatar con pestañas (Ilustraciones, Abstractos, Subir) */}
      <AvatarSelectionModal
        isOpen={isAvatarModalOpen}
        onClose={() => setIsAvatarModalOpen(false)}
        userSeed={session.user.internalUserId}
        onSelectImage={(blob, filename) => upload(blob, filename)}
        disabled={pending}
      />
    </div>
  );
}

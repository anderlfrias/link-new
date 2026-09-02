"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertCircle,
  IconCamera,
  IconCheck,
  IconDoorExit,
  IconLoader2,
  IconPencil,
  IconTrash,
  IconUserPlus,
  IconX,
} from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { FileTypeIcon } from "@/features/files/components/FileTypeIcon";
import { useConversationFiles } from "@/features/messages/hooks/use-conversation-files";
import { useConversationSettings } from "@/features/conversations/hooks/use-conversation-settings";
import { useDeleteConversation } from "@/features/conversations/hooks/use-delete-conversation";
import { useLeaveGroup } from "@/features/conversations/hooks/use-leave-group";
import { useUpdateConversation } from "@/features/conversations/hooks/use-update-conversation";
import { useSetMemberAdmin } from "@/features/conversations/hooks/use-set-member-admin";
import { useImageLightbox } from "@/features/messages/providers/image-lightbox-provider";
import { uploadFile } from "@/features/files/api/files.api";
import { useAuth } from "@/providers/auth-provider";
import { usePublicSettings } from "@/providers/public-settings-provider";
import {
  getConversationAvatarUrl,
  getConversationDisplayName,
  getOtherMembers,
} from "@/utils/conversation-display";
import { buildUploadedFileUrl } from "@/utils/file-url";
import { downloadFile } from "@/utils/download-file";
import { compressImage, IMAGE_COMPRESSION_PRESETS } from "@/utils/compress-image";
import { formatFileSize, isImageMimeType } from "@/utils/file-format";
import { canPerformGroupAction } from "@/utils/group-permissions";
import { AddMembersModal } from "@/features/conversations/components/AddMembersModal";
import { ConversationDangerConfirmModal } from "@/features/conversations/components/ConversationDangerConfirmModal";
import { GroupMemberRow } from "@/features/conversations/components/GroupMemberRow";
import { GroupSettingsSection } from "@/features/conversations/components/GroupSettingsSection";
import type { Conversation } from "@/features/conversations/types/conversation.types";

interface ConversationDetailPanelProps {
  conversation: Conversation;
  currentUserId: string;
  onClose: () => void;
}

/** Panel de detalle de la conversación, tipo WhatsApp/Telegram: en GROUP
 * muestra los integrantes (renombrar/cambiar la foto y gestionar admins de
 * grupo están sujetos a la configuración del grupo — ver backend/API.md
 * sección 4.8/4.9), en PRIVATE solo a la otra persona — y en ambos casos,
 * los archivos compartidos. */
export function ConversationDetailPanel({ conversation, currentUserId, onClose }: ConversationDetailPanelProps) {
  const router = useRouter();
  const { files, status: filesStatus, hasMore, loadingMore, loadMore } = useConversationFiles(conversation.id);
  const { open: openLightbox } = useImageLightbox();
  const { session } = useAuth();
  const publicSettings = usePublicSettings();
  const { update, pending: updating, error: updateError } = useUpdateConversation(conversation.id);
  const { setAdmin, pendingUserId: pendingAdminUserId, error: setAdminError } = useSetMemberAdmin(conversation.id);
  const { remove: deleteConversation, pending: deletePending, error: deleteError } = useDeleteConversation();
  const { leave: leaveGroup, pending: leavePending, error: leaveError } = useLeaveGroup();

  const isGroup = conversation.type === "GROUP";
  const { settings: groupSettings } = useConversationSettings(conversation.id, isGroup);
  const displayName = getConversationDisplayName(conversation, currentUserId);
  const avatarUrl = getConversationAvatarUrl(conversation, currentUserId);
  const otherMember = getOtherMembers(conversation, currentUserId)[0];
  const currentMember = conversation.members.find((member) => member.userId === currentUserId);
  const canManageGroup = currentMember?.isAdmin ?? false;
  // Deliberadamente `false` mientras `groupSettings` todavía no cargó — mostrar
  // el botón antes de tiempo (con el default global ALL_MEMBERS) y esconderlo
  // después si el grupo tiene un override más restrictivo sería un parpadeo
  // confuso. Mismo criterio que `assertGroupPermission` en
  // backend/src/modules/conversations/conversation.service.ts.
  const canAddMembers =
    isGroup && groupSettings
      ? canPerformGroupAction(groupSettings.effective.whoCanAddMembers, conversation, currentUserId, session?.user.roles ?? [])
      : false;
  // Acá sí tenemos `groupSettings.effective.whoCanDeleteGroup` cargado gratis
  // (a diferencia del menú rápido de la lista, que solo gatea por el
  // interruptor público) — mismo criterio que canAddMembers.
  const canDeleteGroup =
    isGroup &&
    Boolean(publicSettings?.allowGroupDelete) &&
    groupSettings != null &&
    canPerformGroupAction(groupSettings.effective.whoCanDeleteGroup, conversation, currentUserId, session?.user.roles ?? []);
  const canDeleteChat = !isGroup && Boolean(publicSettings?.allowConversationDelete);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(conversation.name ?? "");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [pendingAction, setPendingAction] = useState<"delete-chat" | "delete-group" | "leave-group" | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // El nombre puede cambiar por socket (otro miembro lo editó) mientras no
  // estás vos mismo editándolo — si ya estás editando, no pisar lo que estás
  // escribiendo con lo que llegue de afuera.
  useEffect(() => {
    if (!editingName) setNameDraft(conversation.name ?? "");
  }, [conversation.name, editingName]);

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === conversation.name) {
      setEditingName(false);
      return;
    }
    const ok = await update({ name: trimmed });
    if (ok) setEditingName(false);
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveName();
    } else if (event.key === "Escape") {
      setNameDraft(conversation.name ?? "");
      setEditingName(false);
    }
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !session) return;
    setUploadingPhoto(true);
    try {
      const compressed = await compressImage(file, file.name, IMAGE_COMPRESSION_PRESETS.avatar);
      const uploaded = await uploadFile(session.token, compressed, conversation.id);
      await update({ imageFileId: uploaded.id });
    } finally {
      setUploadingPhoto(false);
    }
  }

  // Cualquiera de las 3 hace que esta conversación deje de existir para mí
  // (oculta, borrada, o ya no soy miembro) — cerrar el panel y salir de la
  // conversación abierta, no tiene sentido quedarse mirándola.
  async function confirmPendingAction() {
    if (!pendingAction) return;
    const ok = pendingAction === "leave-group" ? await leaveGroup(conversation.id) : await deleteConversation(conversation.id);
    if (ok) {
      setPendingAction(null);
      onClose();
      // No hay ruta para "/conversations" sin id (`(chat)/page.tsx` es la que
      // resuelve en "/", con el estado vacío de "sin conversación
      // seleccionada") — esta conversación ya no existe para mí, así que no
      // hay a dónde volver salvo la raíz.
      router.push("/");
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="font-display text-lg font-semibold text-brand-ink dark:text-white">
          {isGroup ? "Info del grupo" : "Info del contacto"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <IconX size={20} stroke={1.75} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {updateError && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <IconAlertCircle size={16} className="shrink-0" />
            <span>{updateError}</span>
          </div>
        )}
        {setAdminError && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <IconAlertCircle size={16} className="shrink-0" />
            <span>{setAdminError}</span>
          </div>
        )}

        <div className="flex flex-col items-center gap-1 py-4 text-center">
          <div className="relative">
            <Avatar name={displayName} imageUrl={avatarUrl} size="xl" />
            {isGroup && (
              <>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  aria-label="Cambiar foto del grupo"
                  className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue text-white shadow disabled:opacity-60"
                >
                  <IconCamera size={16} stroke={1.75} />
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </>
            )}
            {uploadingPhoto && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30">
                <IconLoader2 className="animate-spin text-white" size={24} />
              </div>
            )}
          </div>

          {isGroup && editingName ? (
            <div className="mt-2 flex w-full items-center gap-1.5">
              <input
                autoFocus
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={handleNameKeyDown}
                maxLength={120}
                disabled={updating}
                className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-center text-sm text-brand-ink outline-none focus:border-brand-blue dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
              <button
                type="button"
                onClick={saveName}
                disabled={updating || !nameDraft.trim()}
                aria-label="Guardar nombre"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-brand-blue hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
              >
                {updating ? <IconLoader2 className="animate-spin" size={16} /> : <IconCheck size={18} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNameDraft(conversation.name ?? "");
                  setEditingName(false);
                }}
                disabled={updating}
                aria-label="Cancelar"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/10"
              >
                <IconX size={18} />
              </button>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-1.5">
              <p className="font-display text-lg font-semibold text-brand-ink dark:text-white">{displayName}</p>
              {isGroup && (
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  aria-label="Editar nombre del grupo"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <IconPencil size={14} stroke={1.75} />
                </button>
              )}
            </div>
          )}

          {isGroup ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {conversation.members.length} participantes
            </p>
          ) : (
            otherMember && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">{otherMember.user.email}</p>
            )
          )}
        </div>

        {isGroup && (
          <div className="mt-2">
            <h3 className="mb-1 px-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Participantes ({conversation.members.length})
            </h3>
            <div className="flex flex-col">
              {canAddMembers && (
                <button
                  type="button"
                  onClick={() => setShowAddMembers(true)}
                  className="flex w-full items-center gap-3 px-1 py-2 text-left transition-colors hover:bg-black/3 dark:hover:bg-white/5"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue dark:bg-brand-blue/20">
                    <IconUserPlus size={20} stroke={1.75} />
                  </span>
                  <p className="font-medium text-brand-ink dark:text-white">Agregar participantes</p>
                </button>
              )}
              {conversation.members.map((member) => (
                <GroupMemberRow
                  key={member.id}
                  member={member}
                  currentUserId={currentUserId}
                  conversationCreatedById={conversation.createdById}
                  canManageAdmins={canManageGroup}
                  pending={pendingAdminUserId === member.userId}
                  onSetAdmin={setAdmin}
                />
              ))}
            </div>
          </div>
        )}

        {isGroup && canManageGroup && <GroupSettingsSection conversationId={conversation.id} />}

        {(isGroup || canDeleteChat) && (
          <div className="mt-4 flex flex-col gap-1">
            {isGroup && (
              <button
                type="button"
                onClick={() => setPendingAction("leave-group")}
                className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <IconDoorExit size={18} stroke={1.75} />
                <p className="font-medium">Salir del grupo</p>
              </button>
            )}
            {canDeleteGroup && (
              <button
                type="button"
                onClick={() => setPendingAction("delete-group")}
                className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <IconTrash size={18} stroke={1.75} />
                <p className="font-medium">Eliminar grupo</p>
              </button>
            )}
            {canDeleteChat && (
              <button
                type="button"
                onClick={() => setPendingAction("delete-chat")}
                className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <IconTrash size={18} stroke={1.75} />
                <p className="font-medium">Eliminar chat</p>
              </button>
            )}
          </div>
        )}

        <div className="mt-4">
          <h3 className="mb-1 px-1 text-sm font-medium text-neutral-500 dark:text-neutral-400">
            Archivos compartidos
          </h3>

          {filesStatus === "loading" && (
            <div className="flex items-center justify-center py-6">
              <IconLoader2 className="animate-spin text-brand-blue" size={20} />
            </div>
          )}
          {filesStatus === "error" && (
            <p className="px-1 py-4 text-sm text-neutral-500 dark:text-neutral-400">
              No se pudieron cargar los archivos.
            </p>
          )}
          {filesStatus === "ready" && files.length === 0 && (
            <p className="px-1 py-4 text-sm text-neutral-500 dark:text-neutral-400">
              Todavía no se compartieron archivos.
            </p>
          )}
          {filesStatus === "ready" && files.length > 0 && (
            <div className="flex flex-col gap-1">
              {files.map((file) => {
                // `file.url` viene relativo ("/uploads/...", igual que POST /api/v1/files) —
                // hay que anteponerle el origin del backend, si no el navegador lo
                // resuelve contra el origin del frontend y da 404.
                const url = buildUploadedFileUrl(file.url);

                if (isImageMimeType(file.mimeType)) {
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => openLightbox({ url, name: file.originalName })}
                      className="flex items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-brand-ink dark:text-white">
                          {file.originalName}
                        </p>
                        <p className="text-xs text-neutral-400">{formatFileSize(file.size)}</p>
                      </div>
                    </button>
                  );
                }

                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => downloadFile(url, file.originalName)}
                    className="flex items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-black/5 dark:bg-white/10">
                      <FileTypeIcon mimeType={file.mimeType} size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-brand-ink dark:text-white">
                        {file.originalName}
                      </p>
                      <p className="text-xs text-neutral-400">{formatFileSize(file.size)}</p>
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-1 py-2 text-center text-sm text-brand-blue hover:underline disabled:opacity-60"
                >
                  {loadingMore ? "Cargando..." : "Cargar más"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showAddMembers && (
        <Modal onClose={() => setShowAddMembers(false)} aria-label="Agregar participantes">
          <AddMembersModal conversation={conversation} onClose={() => setShowAddMembers(false)} />
        </Modal>
      )}

      {pendingAction && (
        <ConversationDangerConfirmModal
          title={pendingAction === "delete-chat" ? "Eliminar chat" : pendingAction === "delete-group" ? "Eliminar grupo" : "Salir del grupo"}
          description={
            pendingAction === "delete-chat"
              ? `Se eliminará esta conversación de tu lista. Si ${displayName} te escribe de nuevo, o si vos le volvés a escribir, va a reaparecer.`
              : pendingAction === "delete-group"
                ? "Esta acción no se puede deshacer. El grupo se va a eliminar para todos los integrantes."
                : "Vas a dejar de ser miembro de este grupo y no vas a poder ver los mensajes nuevos."
          }
          confirmLabel={pendingAction === "delete-chat" ? "Eliminar chat" : pendingAction === "delete-group" ? "Eliminar grupo" : "Salir del grupo"}
          pending={pendingAction === "leave-group" ? leavePending : deletePending}
          error={pendingAction === "leave-group" ? leaveError : deleteError}
          onConfirm={() => void confirmPendingAction()}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}

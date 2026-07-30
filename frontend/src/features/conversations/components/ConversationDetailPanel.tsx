"use client";

import { IconLoader2, IconX } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { FileTypeIcon } from "@/features/files/components/FileTypeIcon";
import { useConversationFiles } from "@/features/messages/hooks/use-conversation-files";
import { useImageLightbox } from "@/features/messages/providers/image-lightbox-provider";
import {
  getConversationAvatarUrl,
  getConversationDisplayName,
  getOtherMembers,
} from "@/utils/conversation-display";
import { buildStoredFileUrl, buildUploadedFileUrl } from "@/utils/file-url";
import { formatFileSize, isImageMimeType } from "@/utils/file-format";
import type { Conversation } from "@/features/conversations/types/conversation.types";

interface ConversationDetailPanelProps {
  conversation: Conversation;
  currentUserId: string;
  onClose: () => void;
}

/** Panel de detalle de la conversación, tipo WhatsApp/Telegram: en GROUP
 * muestra los integrantes, en PRIVATE solo a la otra persona — y en ambos
 * casos, los archivos compartidos en el chat. */
export function ConversationDetailPanel({ conversation, currentUserId, onClose }: ConversationDetailPanelProps) {
  const { files, status: filesStatus, hasMore, loadingMore, loadMore } = useConversationFiles(conversation.id);
  const { open: openLightbox } = useImageLightbox();

  const isGroup = conversation.type === "GROUP";
  const displayName = getConversationDisplayName(conversation, currentUserId);
  const avatarUrl = getConversationAvatarUrl(conversation, currentUserId);
  const otherMember = getOtherMembers(conversation, currentUserId)[0];

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
        <div className="flex flex-col items-center gap-1 py-4 text-center">
          <Avatar name={displayName} imageUrl={avatarUrl} size="xl" />
          <p className="mt-2 font-display text-lg font-semibold text-brand-ink dark:text-white">{displayName}</p>
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
              {conversation.members.map((member) => (
                <div key={member.id} className="flex items-center gap-3 px-1 py-2">
                  <Avatar
                    name={member.user.name}
                    imageUrl={member.user.avatarFile ? buildStoredFileUrl(member.user.avatarFile.path) : null}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand-ink dark:text-white">
                      {member.user.name}
                      {member.userId === currentUserId && " (Tú)"}
                    </p>
                    <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{member.user.email}</p>
                  </div>
                  {member.userId === conversation.createdById && (
                    <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
                      Creador
                    </span>
                  )}
                </div>
              ))}
            </div>
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
                  <a
                    key={file.id}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
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
                  </a>
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
    </div>
  );
}

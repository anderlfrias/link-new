"use client";

import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { IconBookmark, IconCheck, IconLoader2, IconCloudUpload } from "@tabler/icons-react";
import { useAuth } from "@/providers/auth-provider";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { useConversation } from "@/features/conversations/hooks/use-conversation";
import { useMessages } from "@/features/messages/hooks/use-messages";
import { useTyping } from "@/features/messages/hooks/use-typing";
import { useMessageAttachments } from "@/features/messages/hooks/use-message-attachments";
import { Drawer } from "@/components/ui/Drawer";
import { Modal } from "@/components/ui/Modal";
import { ConversationHeader } from "@/components/layout/ConversationHeader";
import { useCall } from "@/features/calls/hooks/use-call";
import { MessageSelectionToolbar } from "@/features/messages/components/MessageSelectionToolbar";
import { InChatSearchBar } from "@/features/messages/components/InChatSearchBar";
import { MessageList } from "@/features/messages/components/MessageList";
import { MessageInput } from "@/features/messages/components/MessageInput";
import { ConversationDetailPanel } from "@/features/conversations/components/ConversationDetailPanel";
import { ForwardMessageModal } from "@/features/messages/components/ForwardMessageModal";
import { DeleteMessageConfirmModal } from "@/features/messages/components/DeleteMessageConfirmModal";
import { ImageLightboxProvider } from "@/features/messages/providers/image-lightbox-provider";
import { getConversationAvatarUrl, getConversationDisplayName } from "@/utils/conversation-display";
import { getAvatarUrl } from "@/utils/file-url";
import { extractFilesFromClipboard, copyTextToClipboard } from "@/utils/clipboard";
import { isWithinMessageTimeLimit } from "@/utils/message-edit-window";
import { formatMessagesForCopy } from "@/features/messages/utils/format-messages-copy";
import { cn } from "@/utils/cn";
import type { CreatePollPayload, Message } from "@/features/messages/types/message.types";

interface ConversationViewProps {
  conversationId: string;
}

export function ConversationView({ conversationId }: ConversationViewProps) {
  const { session } = useAuth();
  const { startCall } = useCall();
  const settings = usePublicSettings();
  const currentUserId = session?.user.internalUserId ?? "";
  const currentUserName = session?.user.username || session?.user.fullName || "";

  const { conversation, status: conversationStatus } = useConversation(conversationId);
  const { messages, status: messagesStatus, hasMore, loadingMore, loadMore, send, edit, remove, toggleReaction, votePoll } =
    useMessages(conversationId);
  const { typingUserIds, notifyTyping, notifyStopped } = useTyping(conversationId);
  const attachmentsState = useMessageAttachments(conversationId);

  const mentionCandidates = useMemo(() => {
    // Las menciones solo aplican a grupos — en chats individuales no aplica autocompletado
    if (conversation?.type !== "GROUP" || !conversation?.members) return [];
    return conversation.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      username: m.user.username,
      avatarUrl: getAvatarUrl(m.user),
    }));
  }, [conversation?.type, conversation?.members]);

  // Arrastrar un archivo sobre un hijo (ej. una burbuja de mensaje) dispara
  // dragLeave del contenedor antes que dragEnter del hijo — un contador evita
  // que el overlay parpadee al pasar entre elementos internos.
  const dragCounter = useRef(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [forwardModalMessages, setForwardModalMessages] = useState<Message[] | null>(null);

  // Modo selección múltiple
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [multiCopiedFeedback, setMultiCopiedFeedback] = useState<string | null>(null);
  const [deleteSelectedModalOpen, setDeleteSelectedModalOpen] = useState(false);
  const [deleteSelectedPending, setDeleteSelectedPending] = useState(false);
  const [deleteSelectedError, setDeleteSelectedError] = useState<string | null>(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [searchJumpTarget, setSearchJumpTarget] = useState<{ messageId: string; nonce: number } | null>(null);

  useEffect(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setActiveMatchIndex(0);
    setSearchJumpTarget(null);
    setIsSelectionMode(false);
    setSelectedMessageIds(new Set());
  }, [conversationId]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if (event.key === "Escape" && isSelectionMode) {
        handleExitSelectionMode();
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isSelectionMode]);

  function handleExitSelectionMode() {
    setIsSelectionMode(false);
    setSelectedMessageIds(new Set());
  }

  function handleEnterSelectionMode(initialMessageId: string) {
    const target = messages.find((m) => m.id === initialMessageId);
    if (target?.deletedAt) return;
    setIsSelectionMode(true);
    setSelectedMessageIds(new Set([initialMessageId]));
  }

  function handleToggleSelectMessage(messageId: string) {
    const target = messages.find((m) => m.id === messageId);
    if (target?.deletedAt) return;
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
        if (next.size === 0) {
          setIsSelectionMode(false);
        }
      } else {
        next.add(messageId);
      }
      return next;
    });
  }

  const selectedMessages = useMemo(() => {
    if (selectedMessageIds.size === 0) return [];
    return messages.filter((m) => selectedMessageIds.has(m.id));
  }, [messages, selectedMessageIds]);

  const canForwardSelected = useMemo(() => {
    if (selectedMessages.length === 0) return false;
    return selectedMessages.every((m) => !m.deletedAt);
  }, [selectedMessages]);

  const canDeleteSelected = useMemo(() => {
    if (selectedMessages.length === 0) return false;
    const isCreator = conversation?.createdById === currentUserId;
    return selectedMessages.every((m) => {
      if (m.deletedAt) return false;
      if (isCreator) return true;
      return (
        m.senderId === currentUserId &&
        Boolean(settings?.allowMessageDeleteForEveryone) &&
        isWithinMessageTimeLimit(
          m.createdAt,
          settings?.messageDeleteForEveryoneTimeLimitMinutes ?? null,
        )
      );
    });
  }, [selectedMessages, conversation?.createdById, currentUserId, settings]);

  async function handleCopySelectedMessages() {
    if (selectedMessages.length === 0) return;
    const formatted = formatMessagesForCopy(selectedMessages, currentUserId);
    await copyTextToClipboard(formatted);
    const feedback =
      selectedMessages.length === 1
        ? "Mensaje copiado al portapapeles"
        : `${selectedMessages.length} mensajes copiados al portapapeles`;
    setMultiCopiedFeedback(feedback);
    setTimeout(() => setMultiCopiedFeedback(null), 2500);
    handleExitSelectionMode();
  }

  async function handleConfirmDeleteSelected() {
    setDeleteSelectedPending(true);
    setDeleteSelectedError(null);
    try {
      for (const m of selectedMessages) {
        await remove(m.id);
      }
      setDeleteSelectedModalOpen(false);
      handleExitSelectionMode();
    } catch (err: any) {
      setDeleteSelectedError(err?.message || "No se pudieron eliminar los mensajes");
    } finally {
      setDeleteSelectedPending(false);
    }
  }

  const matchingMessages = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) return [];
    return messages.filter(
      (m) => !m.deletedAt && m.content.toLowerCase().includes(trimmed),
    );
  }, [messages, searchQuery]);

  useEffect(() => {
    if (matchingMessages.length > 0) {
      const initialIndex = matchingMessages.length;
      setActiveMatchIndex(initialIndex);
      const target = matchingMessages[initialIndex - 1];
      if (target) {
        setSearchJumpTarget({ messageId: target.id, nonce: Date.now() });
      }
    } else {
      setActiveMatchIndex(0);
    }
  }, [matchingMessages]);

  function handlePrevMatch() {
    if (matchingMessages.length === 0) return;
    const nextIndex = activeMatchIndex <= 1 ? matchingMessages.length : activeMatchIndex - 1;
    setActiveMatchIndex(nextIndex);
    const target = matchingMessages[nextIndex - 1];
    if (target) {
      setSearchJumpTarget({ messageId: target.id, nonce: Date.now() });
    }
  }

  function handleNextMatch() {
    if (matchingMessages.length === 0) return;
    const nextIndex = activeMatchIndex >= matchingMessages.length ? 1 : activeMatchIndex + 1;
    setActiveMatchIndex(nextIndex);
    const target = matchingMessages[nextIndex - 1];
    if (target) {
      setSearchJumpTarget({ messageId: target.id, nonce: Date.now() });
    }
  }

  function handleCloseSearch() {
    setIsSearchOpen(false);
    setSearchQuery("");
    setActiveMatchIndex(0);
    setSearchJumpTarget(null);
  }

  // El propio `send` no sabe nada de "a qué estoy respondiendo" — ese estado
  // es puramente de esta pantalla (qué está armado en el composer ahora
  // mismo), por eso se resuelve acá y no en use-messages.ts.
  async function handleSend(content: string, fileIds?: string[], type?: "STICKER" | "CONTACT") {
    await send(content, fileIds, replyTarget?.id, type);
    setReplyTarget(null);
  }

  async function handleSendPoll(payload: CreatePollPayload) {
    await send(undefined, undefined, replyTarget?.id, "POLL", payload);
    setReplyTarget(null);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragCounter.current += 1;
    setIsDraggingFile(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    // Sin este preventDefault el navegador nunca dispara onDrop.
    if (event.dataTransfer.types.includes("Files")) event.preventDefault();
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDraggingFile(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragCounter.current = 0;
    setIsDraggingFile(false);
    if (event.dataTransfer.files.length > 0) {
      attachmentsState.addFiles(event.dataTransfer.files);
    }
  }

  // Soporte para pegar archivos (imágenes, documentos, audios, videos, etc.) en cualquier lugar de la vista
  // del chat (ej. tras copiar un archivo sin tener que haber hecho foco previamente en el textarea).
  useEffect(() => {
    function handleGlobalPaste(event: globalThis.ClipboardEvent) {
      const activeEl = document.activeElement;
      // Si el foco está en un input o textarea (ej. buscador, o el propio composer que ya tiene su handler),
      // dejamos que el elemento maneje el paste o evitamos duplicar la acción.
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")
      ) {
        return;
      }

      const files = extractFilesFromClipboard(event.clipboardData);
      if (files.length > 0) {
        event.preventDefault();
        attachmentsState.addFiles(files);
      }
    }

    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [attachmentsState]);

  if (conversationStatus === "loading" || conversationStatus === "idle") {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <IconLoader2 className="animate-spin text-brand-blue" size={24} />
      </div>
    );
  }

  if (conversationStatus === "error" || !conversation) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-sm text-neutral-500 dark:text-neutral-400">
        No se pudo cargar la conversación.
      </div>
    );
  }

  const displayName = getConversationDisplayName(conversation, currentUserId);
  const avatarUrl = getConversationAvatarUrl(conversation, currentUserId);
  const typingNames = typingUserIds
    .map((userId) => conversation.members.find((member) => member.userId === userId)?.user.name)
    .filter((name): name is string => Boolean(name));

  const subtitle =
    typingNames.length > 0
      ? `${typingNames.join(", ")} escribiendo...`
      : conversation.type === "GROUP"
        ? `${conversation.members.length} miembros`
        : undefined;

  return (
    <ImageLightboxProvider>
      <div
        className="relative flex h-[100dvh] lg:h-full flex-1 flex-col min-h-0 min-w-0"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isSelectionMode ? (
          <MessageSelectionToolbar
            selectedCount={selectedMessageIds.size}
            canCopy={selectedMessages.some((m) => !m.deletedAt)}
            canForward={canForwardSelected}
            canDelete={canDeleteSelected}
            onClose={handleExitSelectionMode}
            onCopy={handleCopySelectedMessages}
            onForward={() => {
              const forwardable = selectedMessages.filter((m) => !m.deletedAt);
              if (forwardable.length > 0) setForwardModalMessages(forwardable);
            }}
            onDelete={() => setDeleteSelectedModalOpen(true)}
          />
        ) : (
          <ConversationHeader
            title={displayName}
            subtitle={subtitle}
            imageUrl={avatarUrl}
            icon={conversation.type === "SELF" ? <IconBookmark size={20} stroke={1.75} /> : undefined}
            onOpenDetails={() => setShowDetails(true)}
            onToggleSearch={() => setIsSearchOpen((prev) => !prev)}
            isSearchOpen={isSearchOpen}
            onStartAudioCall={
              conversation.type === "PRIVATE" && conversation.members?.some((m) => m.userId !== currentUserId)
                ? () => {
                    const peer = conversation.members?.find((m) => m.userId !== currentUserId);
                    if (peer) void startCall(conversationId, peer.userId, displayName, "AUDIO");
                  }
                : undefined
            }
            onStartVideoCall={
              conversation.type === "PRIVATE" && conversation.members?.some((m) => m.userId !== currentUserId)
                ? () => {
                    const peer = conversation.members?.find((m) => m.userId !== currentUserId);
                    if (peer) void startCall(conversationId, peer.userId, displayName, "VIDEO");
                  }
                : undefined
            }
          />
        )}
        {isSearchOpen && !isSelectionMode && (
          <InChatSearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            matchCount={matchingMessages.length}
            activeMatchIndex={activeMatchIndex}
            onPrevMatch={handlePrevMatch}
            onNextMatch={handleNextMatch}
            onClose={handleCloseSearch}
          />
        )}
        <MessageList
          key={conversationId}
          conversationId={conversationId}
          messages={messages}
          status={messagesStatus}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          conversationType={conversation.type}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          isTyping={typingNames.length > 0}
          onEditMessage={edit}
          onDeleteMessage={remove}
          onReplyMessage={setReplyTarget}
          onForwardMessage={(msg) => setForwardModalMessages([msg])}
          onToggleReaction={toggleReaction}
          onVotePoll={votePoll}
          searchQuery={isSearchOpen ? searchQuery : undefined}
          searchJumpTarget={searchJumpTarget}
          isSelectionMode={isSelectionMode}
          selectedMessageIds={selectedMessageIds}
          onToggleSelectMessage={handleToggleSelectMessage}
          onEnterSelectionMode={handleEnterSelectionMode}
        />
        <div className={cn(isSelectionMode && "pointer-events-none opacity-50")}>
          <MessageInput
            conversationId={conversationId}
            onSend={handleSend}
            onTyping={notifyTyping}
            onStopTyping={notifyStopped}
            attachmentsState={attachmentsState}
            replyTo={replyTarget}
            onCancelReply={() => setReplyTarget(null)}
            currentUserId={currentUserId}
            mentionCandidates={mentionCandidates}
            isGroup={conversation?.type === "GROUP"}
            onSendPoll={handleSendPoll}
          />
        </div>
        {isDraggingFile && (
          <div className="pointer-events-none absolute inset-0 z-20 p-10 bg-brand-ink/5 dark:bg-black/35 backdrop-blur-[2px] transition-all duration-300">
            <div className="relative w-full h-full rounded-3xl bg-white/95 dark:bg-neutral-900/95 shadow-2xl flex flex-col items-center justify-center transition-all duration-300">
              <svg className="absolute inset-0 w-full h-full pointer-events-none p-[2px]">
                <rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  rx="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-brand-blue/50 dark:text-brand-blue/40 animate-marching-ants"
                />
              </svg>
              <div className="relative z-10 flex flex-col items-center justify-center max-w-sm px-6 text-center">
                <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue dark:text-brand-blue-light animate-float">
                  <IconCloudUpload size={48} stroke={1.5} />
                  <div className="absolute inset-0 rounded-full border border-brand-blue/30 dark:border-brand-blue/50 animate-pulse-glow" />
                </div>
                <h3 className="font-display text-xl font-bold text-neutral-800 dark:text-neutral-100 mb-2">
                  Enviar archivos
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-[280px]">
                  Soltá tus imágenes, videos o documentos aquí para compartirlos
                </p>
                <div className="mt-8 flex gap-1.5 justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-blue/20 dark:bg-brand-blue/30" />
                  <span className="w-8 h-1.5 rounded-full bg-brand-blue dark:bg-brand-blue/80" />
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-blue/20 dark:bg-brand-blue/30" />
                </div>
              </div>
            </div>
          </div>
        )}
        {showDetails && (
          <Drawer onClose={() => setShowDetails(false)} aria-label="Información de la conversación">
            <ConversationDetailPanel
              conversation={conversation}
              currentUserId={currentUserId}
              onClose={() => setShowDetails(false)}
            />
          </Drawer>
        )}
        {forwardModalMessages && (
          <Modal onClose={() => setForwardModalMessages(null)} aria-label="Reenviar mensaje">
            <ForwardMessageModal
              messages={forwardModalMessages}
              currentUserId={currentUserId}
              onClose={() => {
                setForwardModalMessages(null);
                if (isSelectionMode) handleExitSelectionMode();
              }}
            />
          </Modal>
        )}
        {deleteSelectedModalOpen && (
          <DeleteMessageConfirmModal
            pending={deleteSelectedPending}
            error={deleteSelectedError}
            count={selectedMessages.length}
            onConfirm={handleConfirmDeleteSelected}
            onCancel={() => {
              setDeleteSelectedModalOpen(false);
              setDeleteSelectedError(null);
            }}
          />
        )}
        {multiCopiedFeedback && (
          <div
            role="status"
            className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-neutral-900/90 px-4 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur-sm dark:bg-white/95 dark:text-neutral-900"
          >
            <IconCheck size={14} stroke={2.5} className="text-emerald-400 dark:text-emerald-600" />
            <span>{multiCopiedFeedback}</span>
          </div>
        )}
      </div>
    </ImageLightboxProvider>
  );
}

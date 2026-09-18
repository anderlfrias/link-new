"use client";

import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { IconBookmark, IconLoader2, IconCloudUpload } from "@tabler/icons-react";
import { useAuth } from "@/providers/auth-provider";
import { useConversation } from "@/features/conversations/hooks/use-conversation";
import { useMessages } from "@/features/messages/hooks/use-messages";
import { useTyping } from "@/features/messages/hooks/use-typing";
import { useMessageAttachments } from "@/features/messages/hooks/use-message-attachments";
import { Drawer } from "@/components/ui/Drawer";
import { Modal } from "@/components/ui/Modal";
import { ConversationHeader } from "@/components/layout/ConversationHeader";
import { InChatSearchBar } from "@/features/messages/components/InChatSearchBar";
import { MessageList } from "@/features/messages/components/MessageList";
import { MessageInput } from "@/features/messages/components/MessageInput";
import { ConversationDetailPanel } from "@/features/conversations/components/ConversationDetailPanel";
import { ForwardMessageModal } from "@/features/messages/components/ForwardMessageModal";
import { ImageLightboxProvider } from "@/features/messages/providers/image-lightbox-provider";
import { getConversationAvatarUrl, getConversationDisplayName } from "@/utils/conversation-display";
import { getAvatarUrl } from "@/utils/file-url";
import { extractFilesFromClipboard } from "@/utils/clipboard";
import type { Message } from "@/features/messages/types/message.types";

interface ConversationViewProps {
  conversationId: string;
}

export function ConversationView({ conversationId }: ConversationViewProps) {
  const { session } = useAuth();
  const currentUserId = session?.user.internalUserId ?? "";
  const currentUserName = session?.user.username || session?.user.fullName || "";

  const { conversation, status: conversationStatus } = useConversation(conversationId);
  const { messages, status: messagesStatus, hasMore, loadingMore, loadMore, send, edit, remove, toggleReaction } =
    useMessages(conversationId);
  const { typingUserIds, notifyTyping, notifyStopped } = useTyping(conversationId);
  const attachmentsState = useMessageAttachments(conversationId);

  const mentionCandidates = useMemo(() => {
    if (!conversation?.members) return [];
    return conversation.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      username: m.user.username,
      avatarUrl: getAvatarUrl(m.user),
    }));
  }, [conversation?.members]);

  // Arrastrar un archivo sobre un hijo (ej. una burbuja de mensaje) dispara
  // dragLeave del contenedor antes que dragEnter del hijo — un contador evita
  // que el overlay parpadee al pasar entre elementos internos.
  const dragCounter = useRef(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [searchJumpTarget, setSearchJumpTarget] = useState<{ messageId: string; nonce: number } | null>(null);

  useEffect(() => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setActiveMatchIndex(0);
    setSearchJumpTarget(null);
  }, [conversationId]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

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
  async function handleSend(content: string, fileIds?: string[], type?: "STICKER") {
    await send(content, fileIds, replyTarget?.id, type);
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
        <ConversationHeader
          title={displayName}
          subtitle={subtitle}
          imageUrl={avatarUrl}
          icon={conversation.type === "SELF" ? <IconBookmark size={20} stroke={1.75} /> : undefined}
          onOpenDetails={() => setShowDetails(true)}
          onToggleSearch={() => setIsSearchOpen((prev) => !prev)}
          isSearchOpen={isSearchOpen}
        />
        {isSearchOpen && (
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
          onForwardMessage={setForwardTarget}
          onToggleReaction={toggleReaction}
          searchQuery={isSearchOpen ? searchQuery : undefined}
          searchJumpTarget={searchJumpTarget}
        />
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
        />
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
        {forwardTarget && (
          <Modal onClose={() => setForwardTarget(null)} aria-label="Reenviar mensaje">
            <ForwardMessageModal
              message={forwardTarget}
              currentUserId={currentUserId}
              onClose={() => setForwardTarget(null)}
            />
          </Modal>
        )}
      </div>
    </ImageLightboxProvider>
  );
}

"use client";

import { DragEvent, useRef, useState } from "react";
import { IconLoader2, IconCloudUpload } from "@tabler/icons-react";
import { useAuth } from "@/providers/auth-provider";
import { useConversation } from "@/features/conversations/hooks/use-conversation";
import { useMessages } from "@/features/messages/hooks/use-messages";
import { useTyping } from "@/features/messages/hooks/use-typing";
import { useMessageAttachments } from "@/features/messages/hooks/use-message-attachments";
import { Drawer } from "@/components/ui/Drawer";
import { ConversationHeader } from "@/components/layout/ConversationHeader";
import { MessageList } from "@/features/messages/components/MessageList";
import { MessageInput } from "@/features/messages/components/MessageInput";
import { ConversationDetailPanel } from "@/features/conversations/components/ConversationDetailPanel";
import { ImageLightboxProvider } from "@/features/messages/providers/image-lightbox-provider";
import { getConversationAvatarUrl, getConversationDisplayName } from "@/utils/conversation-display";

interface ConversationViewProps {
  conversationId: string;
}

export function ConversationView({ conversationId }: ConversationViewProps) {
  const { session } = useAuth();
  const currentUserId = session?.user.internalUserId ?? "";

  const { conversation, status: conversationStatus } = useConversation(conversationId);
  const { messages, status: messagesStatus, hasMore, loadingMore, loadMore, send, edit, remove } =
    useMessages(conversationId);
  const { typingUserIds, notifyTyping, notifyStopped } = useTyping(conversationId);
  const attachmentsState = useMessageAttachments(conversationId);

  // Arrastrar un archivo sobre un hijo (ej. una burbuja de mensaje) dispara
  // dragLeave del contenedor antes que dragEnter del hijo — un contador evita
  // que el overlay parpadee al pasar entre elementos internos.
  const dragCounter = useRef(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

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
          onOpenDetails={() => setShowDetails(true)}
        />
        <MessageList
          messages={messages}
          status={messagesStatus}
          currentUserId={currentUserId}
          conversationType={conversation.type}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          isTyping={typingNames.length > 0}
          onEditMessage={edit}
          onDeleteMessage={remove}
        />
        <MessageInput
          conversationId={conversationId}
          onSend={send}
          onTyping={notifyTyping}
          onStopTyping={notifyStopped}
          attachmentsState={attachmentsState}
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
      </div>
    </ImageLightboxProvider>
  );
}

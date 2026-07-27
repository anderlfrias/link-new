"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { useAuth } from "@/providers/auth-provider";
import { useConversation } from "@/features/conversations/hooks/use-conversation";
import { useMessages } from "@/features/messages/hooks/use-messages";
import { useTyping } from "@/features/messages/hooks/use-typing";
import { ConversationHeader } from "@/components/layout/ConversationHeader";
import { MessageList } from "@/features/messages/components/MessageList";
import { MessageInput } from "@/features/messages/components/MessageInput";
import { ImageLightboxProvider } from "@/features/messages/providers/image-lightbox-provider";
import { getConversationDisplayName } from "@/utils/conversation-display";

interface ConversationViewProps {
  conversationId: string;
}

export function ConversationView({ conversationId }: ConversationViewProps) {
  const { session } = useAuth();
  const currentUserId = session?.user.internalUserId ?? "";

  const { conversation, status: conversationStatus } = useConversation(conversationId);
  const { messages, status: messagesStatus, hasMore, loadingMore, loadMore, send } =
    useMessages(conversationId);
  const { typingUserIds, notifyTyping, notifyStopped } = useTyping(conversationId);

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
      <div className="flex h-[100dvh] lg:h-full flex-1 flex-col min-h-0">
        <ConversationHeader title={displayName} subtitle={subtitle} />
        <MessageList
          messages={messages}
          status={messagesStatus}
          currentUserId={currentUserId}
          conversationType={conversation.type}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          isTyping={typingNames.length > 0}
        />
        <MessageInput
          conversationId={conversationId}
          onSend={send}
          onTyping={notifyTyping}
          onStopTyping={notifyStopped}
        />
      </div>
    </ImageLightboxProvider>
  );
}

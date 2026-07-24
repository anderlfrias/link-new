interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { conversationId } = await params;
  // TODO: MessageList + MessageInput (features/messages/components)
  return (
    <p className="m-auto text-sm text-neutral-500">
      Conversación {conversationId} — pendiente de interfaz
    </p>
  );
}

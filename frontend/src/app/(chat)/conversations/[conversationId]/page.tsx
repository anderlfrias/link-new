import Link from "next/link";
import { IconChevronLeft } from "@tabler/icons-react";

interface ConversationPageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function ConversationPage({ params }: ConversationPageProps) {
  const { conversationId } = await params;

  return (
    <div className="flex h-full flex-col">
      {/* En desktop la lista de conversaciones ya queda visible al costado — el botón volver
          solo hace falta en mobile, donde esta pantalla ocupa toda la pantalla. */}
      <div className="flex items-center gap-2 border-b border-black/5 px-3 py-2.5 lg:hidden dark:border-white/10">
        <Link
          href="/"
          aria-label="Volver a la lista de conversaciones"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
        >
          <IconChevronLeft size={22} stroke={1.75} />
        </Link>
      </div>
      {/* TODO: MessageList + MessageInput (features/messages/components) */}
      <p className="m-auto text-sm text-neutral-500 dark:text-neutral-400">
        Conversación {conversationId} — pendiente de interfaz
      </p>
    </div>
  );
}

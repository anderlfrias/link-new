"use client";

import { useMemo, useState, type ReactNode } from "react";
import { IconAlertCircle, IconBookmark, IconCheck, IconLoader2, IconSearch, IconUsers, IconX } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ContactRow } from "@/features/users/components/ContactRow";
import { useConversations } from "@/features/conversations/hooks/use-conversations";
import { useUsers } from "@/features/users/hooks/use-users";
import { useForwardMessage, type ForwardTarget } from "@/features/messages/hooks/use-forward-message";
import { getConversationAvatarUrl, getConversationDisplayName, getOtherMembers } from "@/utils/conversation-display";
import { cn } from "@/utils/cn";
import type { Message } from "@/features/messages/types/message.types";

interface ForwardMessageModalProps {
  message?: Message;
  messages?: Message[];
  currentUserId: string;
  onClose: () => void;
}

const SELF_ID = "self";

interface SelectableChatRowProps {
  name: string;
  avatar: ReactNode;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/** Mismo check-badge que ContactRow, pero para filas que no son un DirectoryUser
 * (el propio "Mensajes guardados" y las conversaciones existentes). */
function SelectableChatRow({ name, avatar, selected, onClick, disabled }: SelectableChatRowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/3 disabled:opacity-60 dark:hover:bg-white/5"
    >
      {avatar}
      <p className="flex-1 truncate font-medium text-brand-ink dark:text-white">{name}</p>
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          selected ? "border-brand-blue bg-brand-blue text-white" : "border-neutral-300 dark:border-neutral-600",
        )}
      >
        {selected && <IconCheck size={14} stroke={3} />}
      </span>
    </button>
  );
}

/** Elegir a dónde reenviar — varios destinos a la vez (grupos, personas y/o
 * "Mensajes guardados"), igual que el forward multi-select de WhatsApp/Telegram.
 * "Mensajes guardados" siempre va primero y fijo (no se filtra por búsqueda):
 * es el caso de uso más práctico y no depende de haberlo usado antes (se crea
 * solo la primera vez que se elige, ver useForwardMessage). Por eso la
 * conversación SELF real (si ya existe) se excluye de la lista de abajo —
 * sería la misma cosa dos veces.
 *
 * También se puede reenviar a alguien con quien todavía no tenés chat — no
 * solo a conversaciones ya existentes: el directorio completo (`useUsers`,
 * mismo que "Chat nuevo") aparece como "Contactos", excluyendo a quien ya
 * tiene una `PRIVATE` en la lista de arriba (sería la misma persona dos
 * veces). Elegir un contacto crea (o reusa, si ya existía) esa conversación
 * al momento de reenviar — ver useForwardMessage.
 *
 * Con varios destinos seleccionados no tiene sentido navegar a "el" chat de
 * destino (podría haber muchos) — al reenviar con éxito el modal simplemente
 * se cierra y el usuario se queda donde estaba. */
export function ForwardMessageModal({ message, messages, currentUserId, onClose }: ForwardMessageModalProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { conversations, status } = useConversations();
  const { users, status: usersStatus } = useUsers(true);
  const { forward, forwardMany, pending, error } = useForwardMessage();

  const targetMessages = useMemo(() => {
    const list = messages && messages.length > 0 ? messages : message ? [message] : [];
    return [...list]
      .filter((m) => !m.deletedAt)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages, message]);

  const otherConversations = useMemo(
    () => conversations.filter((conversation) => conversation.type !== "SELF"),
    [conversations],
  );

  const existingPrivateUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const conversation of conversations) {
      if (conversation.type !== "PRIVATE") continue;
      const other = getOtherMembers(conversation, currentUserId)[0];
      if (other) ids.add(other.userId);
    }
    return ids;
  }, [conversations, currentUserId]);

  const contacts = useMemo(
    () => users.filter((user) => !existingPrivateUserIds.has(user.id)),
    [users, existingPrivateUserIds],
  );

  const query = search.trim().toLowerCase();
  const filteredConversations = useMemo(() => {
    if (!query) return otherConversations;
    return otherConversations.filter((conversation) =>
      getConversationDisplayName(conversation, currentUserId).toLowerCase().includes(query),
    );
  }, [otherConversations, query, currentUserId]);
  const filteredContacts = useMemo(() => {
    if (!query) return contacts;
    return contacts.filter(
      (user) => user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query),
    );
  }, [contacts, query]);

  function toggle(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    if (selectedIds.length === 0 || targetMessages.length === 0) return;
    const conversationIds = new Set(otherConversations.map((conversation) => conversation.id));
    const targets: ForwardTarget[] = selectedIds.map((id) => {
      if (id === SELF_ID) return "self";
      if (conversationIds.has(id)) return { conversationId: id };
      return { userId: id };
    });

    const succeeded =
      targetMessages.length === 1
        ? await forward(targetMessages[0].id, targets)
        : await forwardMany(
            targetMessages.map((m) => m.id),
            targets,
          );

    if (succeeded === targets.length) onClose();
  }

  const titlePrefix =
    targetMessages.length > 1 ? `Reenviar ${targetMessages.length} mensajes` : "Reenviar mensaje";

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="truncate font-display text-lg font-semibold text-brand-ink dark:text-white">
          {titlePrefix}{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
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

      <div className="px-3 pb-2">
        <Input
          icon={<IconSearch size={16} stroke={1.75} />}
          placeholder="Buscar conversación"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoFocus
        />
      </div>

      {error && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <IconAlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SelectableChatRow
          name="Mensajes guardados"
          avatar={<Avatar name="Mensajes guardados" icon={<IconBookmark size={20} stroke={1.75} />} size="lg" />}
          selected={selectedIds.includes(SELF_ID)}
          onClick={() => toggle(SELF_ID)}
          disabled={pending}
        />

        {(status === "loading" || status === "idle") && (
          <div className="flex flex-1 items-center justify-center py-8">
            <IconLoader2 className="animate-spin text-brand-blue" size={24} />
          </div>
        )}
        {status === "ready" &&
          filteredConversations.map((conversation) => {
            const displayName = getConversationDisplayName(conversation, currentUserId);
            const avatarUrl = getConversationAvatarUrl(conversation, currentUserId);
            return (
              <SelectableChatRow
                key={conversation.id}
                name={displayName}
                avatar={<Avatar name={displayName} imageUrl={avatarUrl} size="lg" />}
                selected={selectedIds.includes(conversation.id)}
                onClick={() => toggle(conversation.id)}
                disabled={pending}
              />
            );
          })}

        {/* Gente con la que todavía no tenés chat — no solo lo ya conversado. */}
        {usersStatus === "ready" && filteredContacts.length > 0 && (
          <p className="px-4 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            Contactos
          </p>
        )}
        {usersStatus === "ready" &&
          filteredContacts.map((user) => (
            <ContactRow
              key={user.id}
              user={user}
              selected={selectedIds.includes(user.id)}
              onClick={() => toggle(user.id)}
              disabled={pending}
            />
          ))}

        {status === "ready" &&
          usersStatus === "ready" &&
          filteredConversations.length === 0 &&
          filteredContacts.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-8 text-center">
              <IconUsers size={32} className="text-neutral-300 dark:text-neutral-600" />
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Sin resultados</p>
            </div>
          )}
      </div>

      <div className="border-t border-black/5 px-4 py-3 dark:border-white/10">
        <Button
          type="button"
          className="w-full"
          disabled={selectedIds.length === 0 || targetMessages.length === 0 || pending}
          onClick={handleSubmit}
        >
          {pending ? (
            <IconLoader2 className="animate-spin" size={16} />
          ) : (
            `Reenviar${selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}`
          )}
        </Button>
      </div>
    </div>
  );
}

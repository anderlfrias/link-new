"use client";

import { useMemo, useState } from "react";
import { IconLoader2, IconMessageCircle2 } from "@tabler/icons-react";
import { ConversationDangerConfirmModal } from "@/features/conversations/components/ConversationDangerConfirmModal";
import { ConversationListItem } from "@/features/conversations/components/ConversationListItem";
import { useDeleteConversation } from "@/features/conversations/hooks/use-delete-conversation";
import { useLeaveGroup } from "@/features/conversations/hooks/use-leave-group";
import { useSetConversationPreference } from "@/features/conversations/hooks/use-set-conversation-preference";
import { getConversationDisplayName } from "@/utils/conversation-display";
import type { ConversationsStatus } from "@/features/conversations/hooks/use-conversations";
import type {
  ConversationFilter,
  ConversationListItem as ConversationListItemType,
} from "@/features/conversations/types/conversation.types";

interface ConversationListProps {
  conversations: ConversationListItemType[];
  status: ConversationsStatus;
  searchQuery: string;
  activeFilter: ConversationFilter;
  currentUserId: string;
}

type PendingAction = { conversationId: string; kind: "delete-chat" | "delete-group" | "leave-group" };

export function ConversationList({
  conversations,
  status,
  searchQuery,
  activeFilter,
  currentUserId,
}: ConversationListProps) {
  const { setPinned, setFavorite, pendingId } = useSetConversationPreference();
  const { remove: deleteConversation, pending: deletePending, error: deleteError } = useDeleteConversation();
  const { leave: leaveGroup, pending: leavePending, error: leaveError } = useLeaveGroup();
  // Un solo menú de opciones abierto a la vez — vive acá (no en cada fila)
  // para que abrir el de un chat cierre el de cualquier otro automáticamente.
  const [openMenuConversationId, setOpenMenuConversationId] = useState<string | null>(null);
  // Un solo modal de confirmación reusado para las 3 acciones destructivas
  // (ver ConversationDangerConfirmModal) — nunca hay más de una a la vez.
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const pendingConversation = pendingAction
    ? conversations.find((conversation) => conversation.id === pendingAction.conversationId)
    : undefined;

  async function confirmPendingAction() {
    if (!pendingAction) return;
    const ok =
      pendingAction.kind === "leave-group"
        ? await leaveGroup(pendingAction.conversationId)
        : await deleteConversation(pendingAction.conversationId);
    // No se refresca la lista a mano acá: el backend avisa por socket a la
    // room personal de quien actuó (ver conversation.service.ts) y
    // use-conversations.ts ya escucha esos eventos y refresca solo.
    if (ok) setPendingAction(null);
  }

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (query && !getConversationDisplayName(conversation, currentUserId).toLowerCase().includes(query)) {
        return false;
      }
      if (activeFilter === "unread" && conversation.unreadCount === 0) return false;
      if (activeFilter === "groups" && conversation.type !== "GROUP") return false;
      if (activeFilter === "favorites" && !conversation.isFavoritedByMe) return false;
      return true;
    });
    // El orden ya viene de `conversations` (fijadas primero, server-side) —
    // `.filter()` lo preserva, no hace falta reordenar acá.
  }, [conversations, searchQuery, activeFilter, currentUserId]);

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <IconLoader2 className="animate-spin text-brand-blue" size={24} />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        No se pudieron cargar tus conversaciones.
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <IconMessageCircle2 size={32} className="text-neutral-300 dark:text-neutral-600" />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {searchQuery || activeFilter !== "all" ? "Sin resultados" : "Todavía no tenés conversaciones"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {filtered.map((conversation) => (
        <ConversationListItem
          key={conversation.id}
          conversation={conversation}
          currentUserId={currentUserId}
          pending={pendingId === conversation.id}
          menuOpen={openMenuConversationId === conversation.id}
          onOpenMenu={() => setOpenMenuConversationId(conversation.id)}
          onCloseMenu={() => setOpenMenuConversationId((prev) => (prev === conversation.id ? null : prev))}
          onTogglePin={setPinned}
          onToggleFavorite={setFavorite}
          onRequestDeleteChat={(id) => setPendingAction({ conversationId: id, kind: "delete-chat" })}
          onRequestDeleteGroup={(id) => setPendingAction({ conversationId: id, kind: "delete-group" })}
          onRequestLeaveGroup={(id) => setPendingAction({ conversationId: id, kind: "leave-group" })}
        />
      ))}

      {pendingAction && (
        <ConversationDangerConfirmModal
          title={
            pendingAction.kind === "delete-chat"
              ? "Eliminar chat"
              : pendingAction.kind === "delete-group"
                ? "Eliminar grupo"
                : "Salir del grupo"
          }
          description={
            pendingAction.kind === "delete-chat"
              ? `Se eliminará esta conversación de tu lista. Si ${
                  pendingConversation ? getConversationDisplayName(pendingConversation, currentUserId) : "la otra persona"
                } te escribe de nuevo, o si vos le volvés a escribir, va a reaparecer.`
              : pendingAction.kind === "delete-group"
                ? "Esta acción no se puede deshacer. El grupo se va a eliminar para todos los integrantes."
                : "Vas a dejar de ser miembro de este grupo y no vas a poder ver los mensajes nuevos."
          }
          confirmLabel={
            pendingAction.kind === "delete-chat"
              ? "Eliminar chat"
              : pendingAction.kind === "delete-group"
                ? "Eliminar grupo"
                : "Salir del grupo"
          }
          pending={pendingAction.kind === "leave-group" ? leavePending : deletePending}
          error={pendingAction.kind === "leave-group" ? leaveError : deleteError}
          onConfirm={() => void confirmPendingAction()}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}

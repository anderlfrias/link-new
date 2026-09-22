"use client";

import { useEffect, useMemo, useState } from "react";
import { IconLoader2, IconMessageCircle2 } from "@tabler/icons-react";
import { useAuth } from "@/providers/auth-provider";
import { ConversationDangerConfirmModal } from "@/features/conversations/components/ConversationDangerConfirmModal";
import { ConversationListItem } from "@/features/conversations/components/ConversationListItem";
import { ConversationSelectionToolbar } from "@/features/conversations/components/ConversationSelectionToolbar";
import { BatchDangerConfirmModal } from "@/features/conversations/components/BatchDangerConfirmModal";
import { useDeleteConversation } from "@/features/conversations/hooks/use-delete-conversation";
import { useLeaveGroup } from "@/features/conversations/hooks/use-leave-group";
import { useSetConversationPreference } from "@/features/conversations/hooks/use-set-conversation-preference";
import { markConversationRead } from "@/features/conversations/api/conversations.api";
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
  isSelectionMode?: boolean;
  onExitSelectionMode?: () => void;
  onEnterSelectionMode?: () => void;
}

type PendingAction = { conversationId: string; kind: "delete-chat" | "delete-group" | "leave-group" };

export function ConversationList({
  conversations,
  status,
  searchQuery,
  activeFilter,
  currentUserId,
  isSelectionMode: isSelectionModeProp,
  onExitSelectionMode,
  onEnterSelectionMode,
}: ConversationListProps) {
  const { session } = useAuth();
  const { setPinned, setFavorite, pendingId } = useSetConversationPreference();
  const { remove: deleteConversation, pending: deletePending, error: deleteError } = useDeleteConversation();
  const { leave: leaveGroup, pending: leavePending, error: leaveError } = useLeaveGroup();

  // Modo selección: soporta control externo o interno
  const [internalSelectionMode, setInternalSelectionMode] = useState(false);
  const isSelectionMode = isSelectionModeProp !== undefined ? isSelectionModeProp : internalSelectionMode;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal batch para eliminar o salir de grupos en masa
  const [batchAction, setBatchAction] = useState<"delete" | "leave" | null>(null);
  const [batchPending, setBatchPending] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Un solo menú de opciones abierto a la vez
  const [openMenuConversationId, setOpenMenuConversationId] = useState<string | null>(null);
  // Modal de confirmación individual existente
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const pendingConversation = pendingAction
    ? conversations.find((conversation) => conversation.id === pendingAction.conversationId)
    : undefined;

  function handleExitSelectionMode() {
    setInternalSelectionMode(false);
    onExitSelectionMode?.();
    setSelectedIds(new Set());
    setBatchAction(null);
    setBatchError(null);
  }

  function handleEnterSelectionMode(initialId?: string) {
    setInternalSelectionMode(true);
    onEnterSelectionMode?.();
    if (initialId) {
      setSelectedIds(new Set([initialId]));
    }
  }

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0 && isSelectionModeProp === undefined) {
          setInternalSelectionMode(false);
          onExitSelectionMode?.();
        }
      } else {
        next.add(id);
      }
      return next;
    });
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
  }, [conversations, searchQuery, activeFilter, currentUserId]);

  function handleToggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  }

  // Conversaciones actualmente seleccionadas
  const selectedConversations = useMemo(() => {
    return conversations.filter((c) => selectedIds.has(c.id));
  }, [conversations, selectedIds]);

  const canMarkAsRead = useMemo(() => {
    return selectedConversations.some((c) => c.unreadCount > 0);
  }, [selectedConversations]);

  const isAllPinned = useMemo(() => {
    return selectedConversations.length > 0 && selectedConversations.every((c) => c.isPinnedByMe);
  }, [selectedConversations]);

  const isAllFavorite = useMemo(() => {
    return selectedConversations.length > 0 && selectedConversations.every((c) => c.isFavoritedByMe);
  }, [selectedConversations]);

  const hasGroupsSelected = useMemo(() => {
    return selectedConversations.some((c) => c.type === "GROUP");
  }, [selectedConversations]);

  // Tecla Escape para salir de modo selección
  useEffect(() => {
    if (!isSelectionMode) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleExitSelectionMode();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSelectionMode]);

  async function handleBatchMarkAsRead() {
    if (!session || selectedConversations.length === 0) return;
    const unread = selectedConversations.filter((c) => c.unreadCount > 0);
    if (unread.length === 0) return;
    setBatchPending(true);
    try {
      await Promise.allSettled(unread.map((c) => markConversationRead(session.token, c.id)));
      handleExitSelectionMode();
    } finally {
      setBatchPending(false);
    }
  }

  function handleBatchTogglePin() {
    if (selectedConversations.length === 0) return;
    const nextPinState = !isAllPinned;
    for (const c of selectedConversations) {
      setPinned(c.id, nextPinState);
    }
    handleExitSelectionMode();
  }

  function handleBatchToggleFavorite() {
    if (selectedConversations.length === 0) return;
    const nextFavoriteState = !isAllFavorite;
    for (const c of selectedConversations) {
      setFavorite(c.id, nextFavoriteState);
    }
    handleExitSelectionMode();
  }

  async function handleConfirmBatchLeave() {
    const groupsToLeave = selectedConversations.filter((c) => c.type === "GROUP");
    if (groupsToLeave.length === 0) return;
    setBatchPending(true);
    setBatchError(null);
    try {
      let failed = 0;
      for (const g of groupsToLeave) {
        const ok = await leaveGroup(g.id);
        if (!ok) failed++;
      }
      if (failed > 0) {
        setBatchError(`No se pudo salir de ${failed} grupo(s).`);
      } else {
        setBatchAction(null);
        handleExitSelectionMode();
      }
    } catch (err: any) {
      setBatchError(err?.message || "Error al salir de los grupos");
    } finally {
      setBatchPending(false);
    }
  }

  async function handleConfirmBatchDelete() {
    if (selectedConversations.length === 0) return;
    setBatchPending(true);
    setBatchError(null);
    try {
      let failed = 0;
      for (const c of selectedConversations) {
        const ok = await deleteConversation(c.id);
        if (!ok) failed++;
      }
      if (failed > 0) {
        setBatchError(`No se pudieron eliminar ${failed} conversación(es).`);
      } else {
        setBatchAction(null);
        handleExitSelectionMode();
      }
    } catch (err: any) {
      setBatchError(err?.message || "Error al eliminar las conversaciones");
    } finally {
      setBatchPending(false);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    const ok =
      pendingAction.kind === "leave-group"
        ? await leaveGroup(pendingAction.conversationId)
        : await deleteConversation(pendingAction.conversationId);
    if (ok) setPendingAction(null);
  }

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

  if (filtered.length === 0 && !isSelectionMode) {
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
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {isSelectionMode && (
        <ConversationSelectionToolbar
          selectedCount={selectedIds.size}
          totalCount={filtered.length}
          allSelected={filtered.length > 0 && selectedIds.size === filtered.length}
          onToggleSelectAll={handleToggleSelectAll}
          onClose={handleExitSelectionMode}
          canMarkAsRead={canMarkAsRead}
          onMarkAsRead={handleBatchMarkAsRead}
          canPin={selectedConversations.length > 0}
          isAllPinned={isAllPinned}
          onTogglePin={handleBatchTogglePin}
          canFavorite={selectedConversations.length > 0}
          isAllFavorite={isAllFavorite}
          onToggleFavorite={handleBatchToggleFavorite}
          hasGroupsSelected={hasGroupsSelected}
          onLeaveGroups={() => setBatchAction("leave")}
          canDelete={selectedConversations.length > 0}
          onDelete={() => setBatchAction("delete")}
          pending={batchPending}
        />
      )}

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
            isSelectionMode={isSelectionMode}
            isSelected={selectedIds.has(conversation.id)}
            onToggleSelect={handleToggleSelect}
            onEnterSelectionMode={handleEnterSelectionMode}
          />
        ))}
      </div>

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

      {batchAction && (
        <BatchDangerConfirmModal
          kind={batchAction}
          selectedConversations={
            batchAction === "leave"
              ? selectedConversations.filter((c) => c.type === "GROUP")
              : selectedConversations
          }
          pending={batchPending}
          error={batchError}
          onConfirm={() =>
            batchAction === "leave" ? void handleConfirmBatchLeave() : void handleConfirmBatchDelete()
          }
          onCancel={() => {
            setBatchAction(null);
            setBatchError(null);
          }}
        />
      )}
    </div>
  );
}

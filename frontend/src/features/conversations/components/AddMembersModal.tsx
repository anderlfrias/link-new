"use client";

import { useMemo, useState } from "react";
import { IconAlertCircle, IconLoader2, IconSearch, IconUsers, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ContactRow } from "@/features/users/components/ContactRow";
import { useUsers } from "@/features/users/hooks/use-users";
import { useAddMembers } from "@/features/conversations/hooks/use-add-members";
import type { Conversation } from "@/features/conversations/types/conversation.types";

interface AddMembersModalProps {
  conversation: Conversation;
  onClose: () => void;
}

/** Mismo picker multi-select que el paso "selectMembers" de NewChatModal.tsx,
 * filtrado para no repetir a quien ya está en el grupo. El estado actualizado
 * llega vía socket (`conversation:member_added`, ver useConversation) — acá
 * solo hace falta cerrar el modal al terminar. */
export function AddMembersModal({ conversation, onClose }: AddMembersModalProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { users, status } = useUsers(true);
  const { addMembers, pending, error } = useAddMembers(conversation.id);

  const existingMemberIds = useMemo(
    () => new Set(conversation.members.map((member) => member.userId)),
    [conversation.members],
  );

  const candidates = useMemo(
    () => users.filter((user) => !existingMemberIds.has(user.id)),
    [users, existingMemberIds],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return candidates;
    return candidates.filter(
      (user) => user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query),
    );
  }, [candidates, search]);

  function toggle(userId: string) {
    setSelectedIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function handleSubmit() {
    if (selectedIds.length === 0) return;
    const ok = await addMembers(selectedIds);
    if (ok) onClose();
  }

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="truncate font-display text-lg font-semibold text-brand-ink dark:text-white">
          Agregar participantes{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
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
          placeholder="Buscar"
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
        {(status === "loading" || status === "idle") && (
          <div className="flex items-center justify-center py-8">
            <IconLoader2 className="animate-spin text-brand-blue" size={24} />
          </div>
        )}
        {status === "error" && (
          <div className="flex items-center justify-center px-6 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No se pudieron cargar los contactos.
          </div>
        )}
        {status === "ready" && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <IconUsers size={32} className="text-neutral-300 dark:text-neutral-600" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {search ? "Sin resultados" : "No hay nadie más para agregar"}
            </p>
          </div>
        )}
        {status === "ready" &&
          filtered.map((user) => (
            <ContactRow
              key={user.id}
              user={user}
              selected={selectedIds.includes(user.id)}
              onClick={() => toggle(user.id)}
            />
          ))}
      </div>

      <div className="border-t border-black/5 px-4 py-3 dark:border-white/10">
        <Button
          type="button"
          className="w-full"
          disabled={selectedIds.length === 0 || pending}
          onClick={handleSubmit}
        >
          {pending ? <IconLoader2 className="animate-spin" size={16} /> : "Agregar"}
        </Button>
      </div>
    </div>
  );
}

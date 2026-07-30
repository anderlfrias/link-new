"use client";

import { useMemo, useState } from "react";
import {
  IconAlertCircle,
  IconLoader2,
  IconSearch,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { Input } from "@/components/ui/Input";
import { useUsers } from "@/features/users/hooks/use-users";
import { useStartConversation } from "@/features/conversations/hooks/use-start-conversation";
import { buildStoredFileUrl } from "@/utils/file-url";

interface NewChatContactListProps {
  onClose: () => void;
}

export function NewChatContactList({ onClose }: NewChatContactListProps) {
  const [search, setSearch] = useState("");
  const { users, status } = useUsers(true);
  const { startWithUser, pending, error } = useStartConversation();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (user) => user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query),
    );
  }, [users, search]);

  async function handleSelectUser(userId: string) {
    const conversation = await startWithUser(userId);
    if (conversation) onClose();
  }

  return (
    <div className="flex min-h-0 w-full flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="font-display text-lg font-semibold text-brand-ink dark:text-white">
          Chat nuevo
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <IconX size={20} stroke={1.75} />
        </button>
      </div>
      <div className="px-3 pb-2">
        <Input
          icon={<IconSearch size={16} stroke={1.75} />}
          placeholder="Buscar contacto"
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

      {(status === "loading" || status === "idle") && (
        <div className="flex flex-1 items-center justify-center">
          <IconLoader2 className="animate-spin text-brand-blue" size={24} />
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No se pudieron cargar los contactos.
        </div>
      )}

      {status === "ready" && filtered.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <IconUsers size={32} className="text-neutral-300 dark:text-neutral-600" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {search ? "Sin resultados" : "No hay otros usuarios todavía"}
          </p>
        </div>
      )}

      {status === "ready" && filtered.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          {filtered.map((user) => (
            <button
              key={user.id}
              type="button"
              disabled={pending}
              onClick={() => handleSelectUser(user.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/3 disabled:opacity-60 dark:hover:bg-white/5"
            >
              <Avatar
                name={user.name}
                imageUrl={user.avatarFile ? buildStoredFileUrl(user.avatarFile.path) : null}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-brand-ink dark:text-white">{user.name}</p>
                <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">
                  {user.email}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

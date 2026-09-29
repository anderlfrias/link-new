"use client";

import { useMemo, useState } from "react";
import { IconLoader2, IconSearch, IconX } from "@tabler/icons-react";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { useUsers } from "@/features/users/hooks/use-users";
import { getAvatarUrl } from "@/utils/file-url";
import { useTranslation } from "@/i18n";
import type { DirectoryUser } from "@/features/users/types/user.types";

interface ShareContactModalProps {
  onClose: () => void;
  onSelectContact: (user: DirectoryUser) => void;
  currentUserId?: string;
}

export function ShareContactModal({
  onClose,
  onSelectContact,
  currentUserId,
}: ShareContactModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const { users, status } = useUsers(true);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users
      .filter((user) => (currentUserId ? user.id !== currentUserId : true))
      .filter((user) => {
        if (!query) return true;
        const matchName = user.name.toLowerCase().includes(query);
        const matchEmail = user.email.toLowerCase().includes(query);
        const matchUsername = user.username?.toLowerCase().includes(query);
        return matchName || matchEmail || Boolean(matchUsername);
      });
  }, [users, search, currentUserId]);

  return (
    <Modal onClose={onClose} aria-label={t("modals.shareContactTitle")}>
      <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {t("modals.shareContactTitle")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("modals.closeModal")}
          className="rounded-lg p-1.5 text-neutral-500 hover:bg-black/5 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
        >
          <IconX size={20} />
        </button>
      </div>

      <div className="p-3 border-b border-black/5 dark:border-white/10">
        <div className="relative">
          <IconSearch
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("modals.searchContactsPlaceholderDetailed")}
            autoFocus
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-blue"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[50vh] divide-y divide-black/5 dark:divide-white/5">
        {(status === "loading" || status === "idle") && (
          <div className="flex items-center justify-center p-8 text-neutral-400">
            <IconLoader2 size={24} className="animate-spin" />
          </div>
        )}

        {status === "error" && (
          <div className="p-6 text-center text-sm text-red-500">
            {t("modals.loadContactsErrorDetailed")}
          </div>
        )}

        {status === "ready" && filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {t("modals.noContactsFound")}
          </div>
        )}

        {status === "ready" &&
          filtered.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => {
                onSelectContact(user);
                onClose();
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Avatar name={user.name} imageUrl={getAvatarUrl(user)} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">
                    {user.name}
                  </p>
                  {user.username && (
                    <span className="text-xs text-brand-blue font-mono truncate">
                      @{user.username}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {user.email}
                </p>
              </div>
            </button>
          ))}
      </div>
    </Modal>
  );
}

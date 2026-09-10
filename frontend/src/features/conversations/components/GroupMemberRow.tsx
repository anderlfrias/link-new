"use client";

import { useEffect, useRef, useState } from "react";
import { IconDotsVertical, IconLoader2 } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { getAvatarUrl } from "@/utils/file-url";
import type { ConversationMember } from "@/features/conversations/types/conversation.types";

interface GroupMemberRowProps {
  member: ConversationMember;
  currentUserId: string;
  conversationCreatedById: string;
  /** Si quien mira este panel es admin de ESTE grupo. */
  canManageAdmins: boolean;
  pending: boolean;
  onSetAdmin: (userId: string, isAdmin: boolean) => void;
}

export function GroupMemberRow({
  member,
  currentUserId,
  conversationCreatedById,
  canManageAdmins,
  pending,
  onSetAdmin,
}: GroupMemberRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isCreator = member.userId === conversationCreatedById;
  // El creador nunca puede degradarse — no tiene sentido mostrarle el menú.
  const showMenu = canManageAdmins && !isCreator;

  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <Avatar
        name={member.user.name}
        imageUrl={getAvatarUrl(member.user)}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-brand-ink dark:text-white">
          {member.user.name}
          {member.userId === currentUserId && " (Tú)"}
        </p>
        <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{member.user.email}</p>
      </div>
      {isCreator && (
        <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
          Creador
        </span>
      )}
      {member.isAdmin && (
        <span className="shrink-0 rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] text-brand-blue dark:bg-brand-blue/20">
          Admin
        </span>
      )}
      {showMenu && (
        <div className="relative shrink-0" ref={containerRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            disabled={pending}
            aria-label="Opciones del miembro"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 disabled:opacity-60 dark:text-neutral-400 dark:hover:bg-white/10"
          >
            {pending ? <IconLoader2 className="animate-spin" size={16} /> : <IconDotsVertical size={16} />}
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-lg border border-black/5 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-neutral-900">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onSetAdmin(member.userId, !member.isAdmin);
                }}
                className="flex w-full items-center px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
              >
                {member.isAdmin ? "Quitar como admin" : "Hacer admin"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

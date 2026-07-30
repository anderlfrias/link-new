"use client";

import { IconCheck } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { buildStoredFileUrl } from "@/utils/file-url";
import { cn } from "@/utils/cn";
import type { DirectoryUser } from "@/features/users/types/user.types";

interface ContactRowProps {
  user: DirectoryUser;
  onClick: () => void;
  disabled?: boolean;
  /** Si se pasa, muestra un check de selección (modo multi-select para grupos) en vez de solo el click directo. */
  selected?: boolean;
}

export function ContactRow({ user, onClick, disabled, selected }: ContactRowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/3 disabled:opacity-60 dark:hover:bg-white/5"
    >
      <Avatar
        name={user.name}
        imageUrl={user.avatarFile ? buildStoredFileUrl(user.avatarFile.path) : null}
        size="lg"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-brand-ink dark:text-white">{user.name}</p>
        <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">{user.email}</p>
      </div>
      {selected !== undefined && (
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            selected
              ? "border-brand-blue bg-brand-blue text-white"
              : "border-neutral-300 dark:border-neutral-600",
          )}
        >
          {selected && <IconCheck size={14} stroke={3} />}
        </span>
      )}
    </button>
  );
}

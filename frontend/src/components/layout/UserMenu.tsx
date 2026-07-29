"use client";

import { useEffect, useRef, useState } from "react";
import { IconLogout, IconUserEdit } from "@tabler/icons-react";
import { useAuth } from "@/providers/auth-provider";
import { useProfilePicture } from "@/features/auth/hooks/use-profile-picture";
import { Avatar } from "@/components/ui/Avatar";

interface UserMenuProps {
  onOpenProfileSettings: () => void;
}

export function UserMenu({ onOpenProfileSettings }: UserMenuProps) {
  const { session, logout } = useAuth();
  const { url: profilePictureUrl } = useProfilePicture();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!session) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Menú de usuario"
        className="flex items-center gap-2 rounded-full"
      >
        <Avatar name={session.user.fullName || session.user.username} imageUrl={profilePictureUrl} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-52 overflow-hidden rounded-lg border border-black/5 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-neutral-900">
          <div className="border-b border-black/5 px-3 py-2 dark:border-white/10">
            <p className="truncate text-sm font-medium text-brand-ink dark:text-white">
              {session.user.fullName}
            </p>
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
              {session.user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenProfileSettings();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10"
          >
            <IconUserEdit size={16} stroke={1.75} />
            Editar perfil
          </button>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <IconLogout size={16} stroke={1.75} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

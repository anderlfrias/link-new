"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ADMIN_NAV_ITEMS } from "@/features/admin/constants/admin-nav.constant";
import { cn } from "@/utils/cn";

interface AdminShellProps {
  children: React.ReactNode;
}

/// Layout visual del panel de administración: nav lateral propio, sin nada
/// del sidebar de chats. El gate de rol vive en el layout que envuelve a
/// este componente (`(admin)/admin/layout.tsx`), no acá — este componente
/// asume que quien lo renderiza ya está autorizado.
export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen h-[100dvh] overflow-hidden">
      <div className="flex w-64 shrink-0 flex-col border-r border-black/5 dark:border-white/10">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <Link
            href="/"
            aria-label="Volver al chat"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-black/5 hover:text-brand-ink dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <IconArrowLeft size={20} stroke={1.75} />
          </Link>
          <ThemeToggle />
        </div>
        <nav className="flex flex-col gap-1 px-3 py-2">
          {ADMIN_NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-ink hover:bg-black/5 dark:text-white dark:hover:bg-white/10",
                  isActive && "bg-black/5 font-medium text-brand-blue dark:bg-white/10 dark:text-brand-blue-light",
                )}
              >
                <Icon size={16} stroke={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

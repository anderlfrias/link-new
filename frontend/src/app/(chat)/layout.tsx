"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { IconLoader2 } from "@tabler/icons-react";
import { useAuth } from "@/providers/auth-provider";
import { useConversations } from "@/features/conversations/hooks/use-conversations";
import { useMessageNotifications } from "@/features/conversations/hooks/use-message-notifications";
import { requestNotificationPermission } from "@/utils/browser-notifications";
import { DesktopSidebar } from "@/components/layout/DesktopSidebar";
import { MobileChatListScreen } from "@/components/layout/MobileChatListScreen";
import { cn } from "@/utils/cn";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { session, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Rutas donde el panel principal (a la derecha del sidebar) debe ocupar toda
  // la pantalla en mobile, en vez del listado de conversaciones.
  const isConversationRoute = pathname?.startsWith("/conversations/") ?? false;
  const isAdminRoute = pathname?.startsWith("/admin") ?? false;
  const showMainPanelOnMobile = isConversationRoute || isAdminRoute;

  const { conversations, status: conversationsStatus } = useConversations();
  useMessageNotifications(conversations, session?.user.internalUserId ?? "");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // Recién acá adentro (ya logueado) — pedir el permiso antes solo genera
  // rechazos automáticos del navegador por falta de interacción del usuario.
  useEffect(() => {
    if (status === "authenticated") {
      requestNotificationPermission();
    }
  }, [status]);

  if (status !== "authenticated" || !session) {
    return (
      <div className="flex h-screen items-center justify-center">
        <IconLoader2 className="animate-spin text-brand-blue" size={28} />
      </div>
    );
  }

  const currentUserId = session.user.internalUserId;

  return (
    <div className="flex h-screen h-[100dvh] overflow-hidden">
      {/* Lista de conversaciones — siempre visible en desktop, pantalla completa en mobile
          (oculta cuando hay una conversación abierta, como en WhatsApp Mobile). */}
      <div
        className={cn(
          "border-black/5 dark:border-white/10 lg:flex lg:w-95 lg:shrink-0 lg:border-r",
          showMainPanelOnMobile ? "hidden" : "flex w-full",
        )}
      >
        <div className="hidden h-full w-full lg:block">
          <DesktopSidebar
            conversations={conversations}
            status={conversationsStatus}
            currentUserId={currentUserId}
          />
        </div>
        <div className="block h-full w-full lg:hidden">
          <MobileChatListScreen
            conversations={conversations}
            status={conversationsStatus}
            currentUserId={currentUserId}
          />
        </div>
      </div>

      {/* Panel principal — en desktop siempre visible (empty state o conversación); en mobile
          solo cuando hay una conversación abierta, ocupando toda la pantalla. */}
      <div className={cn("h-full flex-1 flex-col min-h-0", showMainPanelOnMobile ? "flex" : "hidden lg:flex")}>
        {children}
      </div>
    </div>
  );
}

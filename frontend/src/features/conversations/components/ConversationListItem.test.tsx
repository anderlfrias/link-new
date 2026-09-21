import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ConversationListItem } from "./ConversationListItem";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { usePathname } from "next/navigation";
import type { ConversationListItem as ConversationListItemType } from "@/features/conversations/types/conversation.types";

vi.mock("@/providers/public-settings-provider", () => ({
  usePublicSettings: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    session: { user: { internalUserId: "user-1" } },
  }),
}));

import { setDraft, clearDraft, resetDraftCache } from "@/features/messages/lib/draft-store";

describe("ConversationListItem", () => {
  const baseConversation: ConversationListItemType = {
    id: "conv-1",
    name: "Chat Privado",
    type: "PRIVATE",
    imageFileId: null,
    imageFile: null,
    createdById: "user-1",
    lastMessageId: "msg-1",
    lastMessageAt: "2026-09-09T10:00:00Z",
    lastMessageSenderId: "user-2",
    createdAt: "2026-09-09T09:00:00Z",
    updatedAt: "2026-09-09T10:00:00Z",
    deletedAt: null,
    members: [
      {
        id: "m-1",
        conversationId: "conv-1",
        userId: "user-2",
        joinedAt: "2026-09-09T09:00:00Z",
        lastReadMessageId: null,
        lastReadAt: null,
        lastDeliveredMessageId: null,
        lastDeliveredAt: null,
        isAdmin: false,
        isPinned: false,
        isFavorite: false,
        user: {
          id: "user-2",
          name: "Juan Perez",
          email: "juan@example.com",
          avatarFileId: null,
          avatarFile: null,
          status: "ACTIVE",
        },
      },
    ],
    unreadCount: 3,
    lastMessageStatus: "delivered",
    lastMessagePreview: "Hola cómo estás?",
    isPinnedByMe: true,
    isFavoritedByMe: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetDraftCache();
    vi.mocked(usePathname).mockReturnValue("/conversations/other");
    vi.mocked(usePublicSettings).mockReturnValue({
      allowConversationDelete: true,
      allowGroupDelete: true,
    } as any);
  });

  it("renders conversation details (name, preview, unread count badge, pin)", () => {
    render(
      <ConversationListItem
        conversation={baseConversation}
        currentUserId="user-1"
        pending={false}
        menuOpen={false}
        onOpenMenu={vi.fn()}
        onCloseMenu={vi.fn()}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
        onRequestDeleteChat={vi.fn()}
        onRequestDeleteGroup={vi.fn()}
        onRequestLeaveGroup={vi.fn()}
      />,
    );

    expect(screen.getByText("Juan Perez")).toBeInTheDocument();
    expect(screen.getByText("Hola cómo estás?")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument(); // Unread badge
  });

  it("opens options menu on right click (context menu)", () => {
    const onOpenMenu = vi.fn();
    render(
      <ConversationListItem
        conversation={baseConversation}
        currentUserId="user-1"
        pending={false}
        menuOpen={false}
        onOpenMenu={onOpenMenu}
        onCloseMenu={vi.fn()}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
        onRequestDeleteChat={vi.fn()}
        onRequestDeleteGroup={vi.fn()}
        onRequestLeaveGroup={vi.fn()}
      />,
    );

    const link = screen.getByRole("link");
    fireEvent.contextMenu(link);

    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });

  it("toggles options menu when clicking options chevron button", () => {
    const onOpenMenu = vi.fn();
    const onCloseMenu = vi.fn();

    render(
      <ConversationListItem
        conversation={baseConversation}
        currentUserId="user-1"
        pending={false}
        menuOpen={false}
        onOpenMenu={onOpenMenu}
        onCloseMenu={onCloseMenu}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
        onRequestDeleteChat={vi.fn()}
        onRequestDeleteGroup={vi.fn()}
        onRequestLeaveGroup={vi.fn()}
      />,
    );

    const optionsBtn = screen.getByLabelText(/Opciones de Juan Perez/i);
    fireEvent.click(optionsBtn);

    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });

  it("respects allowConversationDelete = false for private chat", () => {
    vi.mocked(usePublicSettings).mockReturnValue({
      allowConversationDelete: false,
      allowGroupDelete: true,
    } as any);

    render(
      <ConversationListItem
        conversation={baseConversation}
        currentUserId="user-1"
        pending={false}
        menuOpen={true}
        onOpenMenu={vi.fn()}
        onCloseMenu={vi.fn()}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
        onRequestDeleteChat={vi.fn()}
        onRequestDeleteGroup={vi.fn()}
        onRequestLeaveGroup={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Eliminar chat/i })).not.toBeInTheDocument();
  });

  it("shows delete group and leave group options for group conversations", () => {
    const groupConversation: ConversationListItemType = {
      ...baseConversation,
      id: "group-1",
      name: "Equipo Dev",
      type: "GROUP",
    };

    render(
      <ConversationListItem
        conversation={groupConversation}
        currentUserId="user-1"
        pending={false}
        menuOpen={true}
        onOpenMenu={vi.fn()}
        onCloseMenu={vi.fn()}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
        onRequestDeleteChat={vi.fn()}
        onRequestDeleteGroup={vi.fn()}
        onRequestLeaveGroup={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Salir del grupo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Eliminar grupo/i })).toBeInTheDocument();
  });

  it("muestra el indicador 'Borrador: [texto]' y oculta ticks cuando hay un borrador guardado", () => {
    setDraft("user-1", "conv-1", "Mensaje pendiente de enviar");

    render(
      <ConversationListItem
        conversation={baseConversation}
        currentUserId="user-1"
        pending={false}
        menuOpen={false}
        onOpenMenu={vi.fn()}
        onCloseMenu={vi.fn()}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
        onRequestDeleteChat={vi.fn()}
        onRequestDeleteGroup={vi.fn()}
        onRequestLeaveGroup={vi.fn()}
      />,
    );

    expect(screen.getByText("Borrador:")).toBeInTheDocument();
    expect(screen.getByText("Mensaje pendiente de enviar")).toBeInTheDocument();
    // No debe mostrar el preview del último mensaje
    expect(screen.queryByText("Hola cómo estás?")).not.toBeInTheDocument();
  });

  it("vuelve a mostrar el preview del último mensaje cuando se elimina el borrador", () => {
    setDraft("user-1", "conv-1", "Borrador temporal");

    const { rerender } = render(
      <ConversationListItem
        conversation={baseConversation}
        currentUserId="user-1"
        pending={false}
        menuOpen={false}
        onOpenMenu={vi.fn()}
        onCloseMenu={vi.fn()}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
        onRequestDeleteChat={vi.fn()}
        onRequestDeleteGroup={vi.fn()}
        onRequestLeaveGroup={vi.fn()}
      />,
    );

    expect(screen.getByText("Borrador:")).toBeInTheDocument();

    act(() => {
      clearDraft("user-1", "conv-1");
    });

    rerender(
      <ConversationListItem
        conversation={baseConversation}
        currentUserId="user-1"
        pending={false}
        menuOpen={false}
        onOpenMenu={vi.fn()}
        onCloseMenu={vi.fn()}
        onTogglePin={vi.fn()}
        onToggleFavorite={vi.fn()}
        onRequestDeleteChat={vi.fn()}
        onRequestDeleteGroup={vi.fn()}
        onRequestLeaveGroup={vi.fn()}
      />,
    );

    expect(screen.queryByText("Borrador:")).not.toBeInTheDocument();
    expect(screen.getByText("Hola cómo estás?")).toBeInTheDocument();
  });
});

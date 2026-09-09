import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConversationList } from "./ConversationList";
import { useDeleteConversation } from "@/features/conversations/hooks/use-delete-conversation";
import { useLeaveGroup } from "@/features/conversations/hooks/use-leave-group";
import { useSetConversationPreference } from "@/features/conversations/hooks/use-set-conversation-preference";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { usePathname } from "next/navigation";
import type { ConversationListItem as ConversationListItemType } from "@/features/conversations/types/conversation.types";

vi.mock("@/features/conversations/hooks/use-delete-conversation", () => ({
  useDeleteConversation: vi.fn(),
}));

vi.mock("@/features/conversations/hooks/use-leave-group", () => ({
  useLeaveGroup: vi.fn(),
}));

vi.mock("@/features/conversations/hooks/use-set-conversation-preference", () => ({
  useSetConversationPreference: vi.fn(),
}));

vi.mock("@/providers/public-settings-provider", () => ({
  usePublicSettings: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

describe("ConversationList", () => {
  const mockDeleteFn = vi.fn();
  const mockLeaveFn = vi.fn();
  const mockSetPinnedFn = vi.fn();
  const mockSetFavoriteFn = vi.fn();

  const convs: ConversationListItemType[] = [
    {
      id: "c1",
      name: "Juan Perez",
      type: "PRIVATE",
      imageFileId: null,
      imageFile: null,
      createdById: "user-1",
      lastMessageId: "m1",
      lastMessageAt: "2026-09-09T10:00:00Z",
      lastMessageSenderId: "user-2",
      createdAt: "2026-09-09T09:00:00Z",
      updatedAt: "2026-09-09T10:00:00Z",
      deletedAt: null,
      members: [
        {
          id: "mem-1",
          conversationId: "c1",
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
      unreadCount: 2,
      lastMessageStatus: "delivered",
      lastMessagePreview: "Hola Juan",
      isPinnedByMe: true,
      isFavoritedByMe: false,
    },
    {
      id: "c2",
      name: "Grupo Médicos",
      type: "GROUP",
      imageFileId: null,
      imageFile: null,
      createdById: "user-1",
      lastMessageId: "m2",
      lastMessageAt: "2026-09-09T09:30:00Z",
      lastMessageSenderId: "user-3",
      createdAt: "2026-09-09T08:00:00Z",
      updatedAt: "2026-09-09T09:30:00Z",
      deletedAt: null,
      members: [],
      unreadCount: 0,
      lastMessageStatus: "read",
      lastMessagePreview: "Reunión a las 11",
      isPinnedByMe: false,
      isFavoritedByMe: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue("/conversations");
    vi.mocked(usePublicSettings).mockReturnValue({
      allowConversationDelete: true,
      allowGroupDelete: true,
    } as any);
    vi.mocked(useDeleteConversation).mockReturnValue({
      remove: mockDeleteFn,
      pending: false,
      error: null,
    });
    vi.mocked(useLeaveGroup).mockReturnValue({
      leave: mockLeaveFn,
      pending: false,
      error: null,
    });
    vi.mocked(useSetConversationPreference).mockReturnValue({
      setPinned: mockSetPinnedFn,
      setFavorite: mockSetFavoriteFn,
      pendingId: null,
      error: null,
    });
  });

  it("shows loading spinner when status is loading", () => {
    const { container } = render(
      <ConversationList
        conversations={[]}
        status="loading"
        searchQuery=""
        activeFilter="all"
        currentUserId="user-1"
      />,
    );

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows error message when status is error", () => {
    render(
      <ConversationList
        conversations={[]}
        status="error"
        searchQuery=""
        activeFilter="all"
        currentUserId="user-1"
      />,
    );

    expect(screen.getByText("No se pudieron cargar tus conversaciones.")).toBeInTheDocument();
  });

  it("renders empty state when conversation list is empty", () => {
    render(
      <ConversationList
        conversations={[]}
        status="ready"
        searchQuery=""
        activeFilter="all"
        currentUserId="user-1"
      />,
    );

    expect(screen.getByText("Todavía no tenés conversaciones")).toBeInTheDocument();
  });

  it("filters conversations by search query", () => {
    render(
      <ConversationList
        conversations={convs}
        status="ready"
        searchQuery="Médicos"
        activeFilter="all"
        currentUserId="user-1"
      />,
    );

    expect(screen.getByText("Grupo Médicos")).toBeInTheDocument();
    expect(screen.queryByText("Juan Perez")).not.toBeInTheDocument();
  });

  it("filters conversations by unread filter", () => {
    render(
      <ConversationList
        conversations={convs}
        status="ready"
        searchQuery=""
        activeFilter="unread"
        currentUserId="user-1"
      />,
    );

    expect(screen.getByText("Juan Perez")).toBeInTheDocument();
    expect(screen.queryByText("Grupo Médicos")).not.toBeInTheDocument();
  });

  it("filters conversations by groups filter", () => {
    render(
      <ConversationList
        conversations={convs}
        status="ready"
        searchQuery=""
        activeFilter="groups"
        currentUserId="user-1"
      />,
    );

    expect(screen.queryByText("Juan Perez")).not.toBeInTheDocument();
    expect(screen.getByText("Grupo Médicos")).toBeInTheDocument();
  });

  it("filters conversations by favorites filter", () => {
    render(
      <ConversationList
        conversations={convs}
        status="ready"
        searchQuery=""
        activeFilter="favorites"
        currentUserId="user-1"
      />,
    );

    expect(screen.queryByText("Juan Perez")).not.toBeInTheDocument();
    expect(screen.getByText("Grupo Médicos")).toBeInTheDocument();
  });

  it("opens delete chat confirmation modal and calls deleteConversation", async () => {
    mockDeleteFn.mockResolvedValueOnce(true);

    render(
      <ConversationList
        conversations={convs}
        status="ready"
        searchQuery=""
        activeFilter="all"
        currentUserId="user-1"
      />,
    );

    // Right click on Juan Perez to open menu
    const juanLink = screen.getByText("Juan Perez").closest("a")!;
    fireEvent.contextMenu(juanLink);

    // Click delete chat
    const deleteBtn = screen.getByRole("button", { name: /Eliminar chat/i });
    fireEvent.click(deleteBtn);

    // Modal should be open
    expect(screen.getByRole("heading", { name: "Eliminar chat" })).toBeInTheDocument();
    const modalConfirmBtn = screen.getByRole("button", { name: "Eliminar chat" });
    fireEvent.click(modalConfirmBtn);

    await waitFor(() => {
      expect(mockDeleteFn).toHaveBeenCalledWith("c1");
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddMembersModal } from "./AddMembersModal";
import { useUsers } from "@/features/users/hooks/use-users";
import { useAddMembers } from "@/features/conversations/hooks/use-add-members";
import type { Conversation } from "@/features/conversations/types/conversation.types";

vi.mock("@/features/users/hooks/use-users", () => ({
  useUsers: vi.fn(),
}));

vi.mock("@/features/conversations/hooks/use-add-members", () => ({
  useAddMembers: vi.fn(),
}));

describe("AddMembersModal", () => {
  const mockConversation: Conversation = {
    id: "conv-1",
    name: "Team",
    type: "GROUP",
    imageFileId: null,
    imageFile: null,
    createdById: "user-1",
    lastMessageId: null,
    lastMessageAt: null,
    lastMessageSenderId: null,
    createdAt: "2026-09-09T09:00:00Z",
    updatedAt: "2026-09-09T10:00:00Z",
    deletedAt: null,
    members: [
      {
        id: "mem-1",
        conversationId: "conv-1",
        userId: "user-1",
        joinedAt: "2026-09-09T09:00:00Z",
        lastReadMessageId: null,
        lastReadAt: null,
        lastDeliveredMessageId: null,
        lastDeliveredAt: null,
        isAdmin: true,
        isPinned: false,
        isFavorite: false,
        user: {
          id: "user-1",
          name: "User One",
          email: "user1@example.com",
          avatarFileId: null,
          avatarFile: null,
          status: "ACTIVE",
        },
      },
    ],
  };

  const mockUsers = [
    { id: "user-1", name: "User One", email: "user1@example.com", avatarFile: null, status: "ACTIVE" },
    { id: "user-2", name: "Carlos Perez", email: "carlos@example.com", avatarFile: null, status: "ACTIVE" },
    { id: "user-3", name: "Lucia Gómez", email: "lucia@example.com", avatarFile: null, status: "ACTIVE" },
  ];

  const mockAddMembersFn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useUsers).mockReturnValue({
      users: mockUsers as any,
      status: "ready",
    });
    vi.mocked(useAddMembers).mockReturnValue({
      addMembers: mockAddMembersFn,
      pending: false,
      error: null,
    });
  });

  it("filters out existing group members and displays only candidates", () => {
    render(<AddMembersModal conversation={mockConversation} onClose={vi.fn()} />);

    // user-1 is already a member, so only Carlos and Lucia should be shown
    expect(screen.queryByText("User One")).not.toBeInTheDocument();
    expect(screen.getByText("Carlos Perez")).toBeInTheDocument();
    expect(screen.getByText("Lucia Gómez")).toBeInTheDocument();
  });

  it("filters candidate list when searching by name", () => {
    render(<AddMembersModal conversation={mockConversation} onClose={vi.fn()} />);

    const searchInput = screen.getByPlaceholderText("Buscar");
    fireEvent.change(searchInput, { target: { value: "carlos" } });

    expect(screen.getByText("Carlos Perez")).toBeInTheDocument();
    expect(screen.queryByText("Lucia Gómez")).not.toBeInTheDocument();
  });

  it("allows selecting candidates and submits with selected userIds", async () => {
    mockAddMembersFn.mockResolvedValueOnce(true);
    const onClose = vi.fn();

    render(<AddMembersModal conversation={mockConversation} onClose={onClose} />);

    const submitBtn = screen.getByRole("button", { name: "Agregar" });
    expect(submitBtn).toBeDisabled();

    // Select Carlos
    fireEvent.click(screen.getByText("Carlos Perez"));
    expect(submitBtn).not.toBeDisabled();
    expect(screen.getByText("Agregar participantes (1)")).toBeInTheDocument();

    // Submit
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAddMembersFn).toHaveBeenCalledWith(["user-2"]);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows error state when users fetch fails", () => {
    vi.mocked(useUsers).mockReturnValue({
      users: [],
      status: "error",
    });

    render(<AddMembersModal conversation={mockConversation} onClose={vi.fn()} />);

    expect(screen.getByText("No se pudieron cargar los contactos.")).toBeInTheDocument();
  });

  it("shows empty state when no candidates remain", () => {
    vi.mocked(useUsers).mockReturnValue({
      users: [mockUsers[0]] as any, // only user-1 who is already in group
      status: "ready",
    });

    render(<AddMembersModal conversation={mockConversation} onClose={vi.fn()} />);

    expect(screen.getByText("No hay nadie más para agregar")).toBeInTheDocument();
  });
});

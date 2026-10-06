import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConversationDetailPanel } from "./ConversationDetailPanel";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { useConversationFiles } from "@/features/messages/hooks/use-conversation-files";
import { useConversationSettings } from "@/features/conversations/hooks/use-conversation-settings";
import { useDeleteConversation } from "@/features/conversations/hooks/use-delete-conversation";
import { useLeaveGroup } from "@/features/conversations/hooks/use-leave-group";
import { useUpdateConversation } from "@/features/conversations/hooks/use-update-conversation";
import { useSetMemberAdmin } from "@/features/conversations/hooks/use-set-member-admin";
import { useImageLightbox } from "@/features/messages/providers/image-lightbox-provider";
import { createMockSession } from "@/test/test-utils";
import type { Conversation } from "@/features/conversations/types/conversation.types";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/providers/public-settings-provider", () => ({
  usePublicSettings: vi.fn(),
}));

vi.mock("@/features/messages/hooks/use-conversation-files", () => ({
  useConversationFiles: vi.fn(),
}));

vi.mock("@/features/conversations/hooks/use-conversation-settings", () => ({
  useConversationSettings: vi.fn(),
}));

vi.mock("@/features/conversations/hooks/use-delete-conversation", () => ({
  useDeleteConversation: vi.fn(),
}));

vi.mock("@/features/conversations/hooks/use-leave-group", () => ({
  useLeaveGroup: vi.fn(),
}));

vi.mock("@/features/conversations/hooks/use-update-conversation", () => ({
  useUpdateConversation: vi.fn(),
}));

vi.mock("@/features/conversations/hooks/use-set-member-admin", () => ({
  useSetMemberAdmin: vi.fn(),
}));

vi.mock("@/features/messages/providers/image-lightbox-provider", () => ({
  useImageLightbox: vi.fn(),
}));

describe("ConversationDetailPanel", () => {
  const mockPush = vi.fn();
  const mockUpdateFn = vi.fn();
  const mockDeleteFn = vi.fn();
  const mockLeaveFn = vi.fn();
  const mockSetAdminFn = vi.fn();

  const groupConv: Conversation = {
    id: "grp-1",
    name: "Cirugía General",
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
        id: "m1",
        conversationId: "grp-1",
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
          name: "User Admin",
          email: "admin@example.com",
          avatarFileId: null,
          avatarFile: null,
          status: "ACTIVE",
        },
      },
      {
        id: "m2",
        conversationId: "grp-1",
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
          name: "Dr. Morales",
          email: "morales@example.com",
          avatarFileId: null,
          avatarFile: null,
          status: "ACTIVE",
        },
      },
    ],
  };

  const privateConv: Conversation = {
    id: "priv-1",
    name: null,
    type: "PRIVATE",
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
        id: "m1",
        conversationId: "priv-1",
        userId: "user-1",
        joinedAt: "2026-09-09T09:00:00Z",
        lastReadMessageId: null,
        lastReadAt: null,
        lastDeliveredMessageId: null,
        lastDeliveredAt: null,
        isAdmin: false,
        isPinned: false,
        isFavorite: false,
        user: {
          id: "user-1",
          name: "User Admin",
          email: "admin@example.com",
          avatarFileId: null,
          avatarFile: null,
          status: "ACTIVE",
        },
      },
      {
        id: "m2",
        conversationId: "priv-1",
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
          name: "Dra. Ramos",
          email: "ramos@example.com",
          avatarFileId: null,
          avatarFile: null,
          status: "ACTIVE",
        },
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as any);
    vi.mocked(useAuth).mockReturnValue({
      session: createMockSession({ user: { internalUserId: "user-1", roles: ["USER"] } as any }),
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });
    vi.mocked(usePublicSettings).mockReturnValue({
      allowConversationDelete: true,
      allowGroupDelete: true,
    } as any);
    vi.mocked(useConversationFiles).mockReturnValue({
      files: [],
      status: "ready",
      hasMore: false,
      loadingMore: false,
      loadMore: vi.fn(),
    });
    vi.mocked(useConversationSettings).mockReturnValue({
      settings: {
        conversationId: "grp-1",
        effective: {
          maxGroupMembers: 100,
          whoCanAddMembers: "ALL_MEMBERS",
          whoCanRemoveMembers: "GROUP_ADMINS_ONLY",
          whoCanChangeGroupInfo: "GROUP_ADMINS_ONLY",
          whoCanDeleteGroup: "GROUP_ADMINS_ONLY",
          whoCanLeaveGroup: "ALL_MEMBERS",
        },
        overrideAllowed: {
          maxGroupMembers: true,
          whoCanAddMembers: true,
          whoCanRemoveMembers: false,
          whoCanChangeGroupInfo: false,
          whoCanDeleteGroup: true,
          whoCanLeaveGroup: false,
        },
      },
      status: "ready",
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(useUpdateConversation).mockReturnValue({
      update: mockUpdateFn,
      pending: false,
      error: null,
    });
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
    vi.mocked(useSetMemberAdmin).mockReturnValue({
      setAdmin: mockSetAdminFn,
      pendingUserId: null,
      error: null,
    });
    vi.mocked(useImageLightbox).mockReturnValue({
      open: vi.fn(),
    } as any);
  });

  it("renders group info title, member list and close button", () => {
    const onClose = vi.fn();
    render(
      <ConversationDetailPanel
        conversation={groupConv}
        currentUserId="user-1"
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Info del grupo")).toBeInTheDocument();
    expect(screen.getByText("Cirugía General")).toBeInTheDocument();
    expect(screen.getByText("2 participantes")).toBeInTheDocument();
    expect(screen.getByText("Dr. Morales")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Cerrar"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders contact info for private conversation", () => {
    render(
      <ConversationDetailPanel
        conversation={privateConv}
        currentUserId="user-1"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Info del contacto")).toBeInTheDocument();
    expect(screen.getByText("Dra. Ramos")).toBeInTheDocument();
    expect(screen.getByText("ramos@example.com")).toBeInTheDocument();
  });

  it("allows renaming group when editing group name", async () => {
    mockUpdateFn.mockResolvedValueOnce(true);

    render(
      <ConversationDetailPanel
        conversation={groupConv}
        currentUserId="user-1"
        onClose={vi.fn()}
      />,
    );

    const editBtn = screen.getByLabelText("Editar nombre del grupo");
    fireEvent.click(editBtn);

    const nameInput = screen.getByDisplayValue("Cirugía General");
    fireEvent.change(nameInput, { target: { value: "Cirugía Pediátrica" } });

    const saveBtn = screen.getByLabelText("Guardar nombre");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateFn).toHaveBeenCalledWith({ name: "Cirugía Pediátrica" });
    });
  });

  it("opens delete chat modal for private conversation and navigates to '/' on confirm", async () => {
    mockDeleteFn.mockResolvedValueOnce(true);
    const onClose = vi.fn();

    render(
      <ConversationDetailPanel
        conversation={privateConv}
        currentUserId="user-1"
        onClose={onClose}
      />,
    );

    const deleteBtn = screen.getByRole("button", { name: /Eliminar chat/i });
    fireEvent.click(deleteBtn);

    // Danger confirm modal appears
    expect(screen.getByRole("heading", { name: "Eliminar chat" })).toBeInTheDocument();
    const modalConfirmBtn = screen.getAllByRole("button", { name: "Eliminar chat" })[1];
    fireEvent.click(modalConfirmBtn);

    await waitFor(() => {
      expect(mockDeleteFn).toHaveBeenCalledWith("priv-1");
      expect(onClose).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("opens leave group modal for group conversation", async () => {
    mockLeaveFn.mockResolvedValueOnce(true);
    const onClose = vi.fn();

    render(
      <ConversationDetailPanel
        conversation={groupConv}
        currentUserId="user-1"
        onClose={onClose}
      />,
    );

    const leaveBtn = screen.getByRole("button", { name: /Salir del grupo/i });
    fireEvent.click(leaveBtn);

    expect(screen.getByRole("heading", { name: "Salir del grupo" })).toBeInTheDocument();
    const modalConfirmBtn = screen.getAllByRole("button", { name: "Salir del grupo" })[1];
    fireEvent.click(modalConfirmBtn);

    await waitFor(() => {
      expect(mockLeaveFn).toHaveBeenCalledWith("grp-1");
      expect(onClose).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("does not render 'Salir del grupo' when user does not have permission according to whoCanLeaveGroup", () => {
    vi.mocked(useConversationSettings).mockReturnValue({
      settings: {
        conversationId: "grp-1",
        effective: {
          maxGroupMembers: 100,
          whoCanAddMembers: "ALL_MEMBERS",
          whoCanRemoveMembers: "GROUP_ADMINS_ONLY",
          whoCanChangeGroupInfo: "GROUP_ADMINS_ONLY",
          whoCanDeleteGroup: "GROUP_ADMINS_ONLY",
          whoCanLeaveGroup: "APP_ADMINS_ONLY",
        },
        overrideAllowed: {
          maxGroupMembers: true,
          whoCanAddMembers: true,
          whoCanRemoveMembers: false,
          whoCanChangeGroupInfo: false,
          whoCanDeleteGroup: true,
          whoCanLeaveGroup: false,
        },
      },
      status: "ready",
      error: null,
      refetch: vi.fn(),
    });

    render(
      <ConversationDetailPanel
        conversation={groupConv}
        currentUserId="user-1"
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Salir del grupo/i })).not.toBeInTheDocument();
  });

  describe("Archivos compartidos: segmentación por tipo", () => {
    it("etiqueta imagen, GIF, sticker, nota de voz y deja el resto como archivo genérico", () => {
      vi.mocked(useConversationFiles).mockReturnValue({
        files: [
          {
            id: "file-img",
            originalName: "foto.jpg",
            mimeType: "image/jpeg",
            extension: "jpg",
            size: 245678,
            url: "/uploads/foto.jpg",
            createdAt: "2026-09-09T09:00:00Z",
            messageId: "m-1",
            senderId: "user-2",
          },
          {
            id: "file-gif",
            originalName: "gif-abc123.gif",
            mimeType: "image/gif",
            extension: "gif",
            size: 102400,
            url: "/uploads/gif-abc123.gif",
            createdAt: "2026-09-09T09:01:00Z",
            messageId: "m-2",
            senderId: "user-2",
          },
          {
            id: "file-sticker",
            originalName: "sticker-xyz789.gif",
            // Giphy sirve stickers animados como image/gif también — el
            // mimeType solo no alcanza para distinguirlo de un GIF (ver
            // ConversationDetailPanel.tsx), hace falta messageType.
            mimeType: "image/gif",
            extension: "gif",
            size: 51200,
            url: "/uploads/sticker-xyz789.gif",
            createdAt: "2026-09-09T09:02:00Z",
            messageId: "m-3",
            senderId: "user-2",
            messageType: "STICKER",
          },
          {
            id: "file-voice",
            originalName: "nota-de-voz.webm",
            mimeType: "audio/webm",
            extension: "webm",
            size: 30000,
            url: "/uploads/nota-de-voz.webm",
            createdAt: "2026-09-09T09:03:00Z",
            messageId: "m-4",
            senderId: "user-2",
          },
          {
            id: "file-doc",
            originalName: "informe.pdf",
            mimeType: "application/pdf",
            extension: "pdf",
            size: 512000,
            url: "/uploads/informe.pdf",
            createdAt: "2026-09-09T09:04:00Z",
            messageId: "m-5",
            senderId: "user-2",
          },
        ],
        status: "ready",
        hasMore: false,
        loadingMore: false,
        loadMore: vi.fn(),
      });

      render(
        <ConversationDetailPanel
          conversation={groupConv}
          currentUserId="user-1"
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText("Imagen")).toBeInTheDocument();
      expect(screen.getByText("GIF")).toBeInTheDocument();
      expect(screen.getByText("Sticker")).toBeInTheDocument();
      expect(screen.getByText("Nota de voz ·")).toBeInTheDocument();
      expect(screen.getByText("informe.pdf")).toBeInTheDocument();
      expect(screen.queryByText("Archivo adjunto")).not.toBeInTheDocument();
    });
  });
});

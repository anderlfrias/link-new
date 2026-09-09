import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupMemberRow } from "./GroupMemberRow";
import type { ConversationMember } from "@/features/conversations/types/conversation.types";

describe("GroupMemberRow", () => {
  const baseMember: ConversationMember = {
    id: "mem-1",
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
      name: "Ana García",
      email: "ana@example.com",
      avatarFileId: null,
      avatarFile: null,
      status: "ACTIVE",
    },
  };

  it("renders member name, email and avatar", () => {
    render(
      <GroupMemberRow
        member={baseMember}
        currentUserId="user-1"
        conversationCreatedById="user-1"
        canManageAdmins={false}
        pending={false}
        onSetAdmin={vi.fn()}
      />,
    );

    expect(screen.getByText("Ana García")).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
  });

  it("indicates current user with '(Tú)'", () => {
    render(
      <GroupMemberRow
        member={{ ...baseMember, userId: "user-1" }}
        currentUserId="user-1"
        conversationCreatedById="creator-id"
        canManageAdmins={false}
        pending={false}
        onSetAdmin={vi.fn()}
      />,
    );

    expect(screen.getByText(/Ana García.*\(Tú\)/)).toBeInTheDocument();
  });

  it("shows 'Creador' badge when member is the group creator and hides options menu", () => {
    render(
      <GroupMemberRow
        member={{ ...baseMember, userId: "creator-id" }}
        currentUserId="user-1"
        conversationCreatedById="creator-id"
        canManageAdmins={true}
        pending={false}
        onSetAdmin={vi.fn()}
      />,
    );

    expect(screen.getByText("Creador")).toBeInTheDocument();
    expect(screen.queryByLabelText("Opciones del miembro")).not.toBeInTheDocument();
  });

  it("shows 'Admin' badge when member is an admin", () => {
    render(
      <GroupMemberRow
        member={{ ...baseMember, isAdmin: true }}
        currentUserId="user-1"
        conversationCreatedById="creator-id"
        canManageAdmins={false}
        pending={false}
        onSetAdmin={vi.fn()}
      />,
    );

    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("allows promoting a member to admin when canManageAdmins is true", () => {
    const onSetAdmin = vi.fn();
    render(
      <GroupMemberRow
        member={baseMember}
        currentUserId="user-1"
        conversationCreatedById="creator-id"
        canManageAdmins={true}
        pending={false}
        onSetAdmin={onSetAdmin}
      />,
    );

    const menuButton = screen.getByLabelText("Opciones del miembro");
    fireEvent.click(menuButton);

    const promoteButton = screen.getByRole("button", { name: "Hacer admin" });
    fireEvent.click(promoteButton);

    expect(onSetAdmin).toHaveBeenCalledWith("user-2", true);
  });

  it("allows demoting an admin when canManageAdmins is true", () => {
    const onSetAdmin = vi.fn();
    render(
      <GroupMemberRow
        member={{ ...baseMember, isAdmin: true }}
        currentUserId="user-1"
        conversationCreatedById="creator-id"
        canManageAdmins={true}
        pending={false}
        onSetAdmin={onSetAdmin}
      />,
    );

    const menuButton = screen.getByLabelText("Opciones del miembro");
    fireEvent.click(menuButton);

    const demoteButton = screen.getByRole("button", { name: "Quitar como admin" });
    fireEvent.click(demoteButton);

    expect(onSetAdmin).toHaveBeenCalledWith("user-2", false);
  });
});

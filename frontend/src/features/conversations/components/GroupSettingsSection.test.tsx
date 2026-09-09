import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GroupSettingsSection } from "./GroupSettingsSection";
import { useConversationSettings } from "@/features/conversations/hooks/use-conversation-settings";
import { useUpdateConversationSettings } from "@/features/conversations/hooks/use-update-conversation-settings";
import type { ConversationEffectiveSettings } from "@/features/conversations/types/group-settings.types";

vi.mock("@/features/conversations/hooks/use-conversation-settings", () => ({
  useConversationSettings: vi.fn(),
}));

vi.mock("@/features/conversations/hooks/use-update-conversation-settings", () => ({
  useUpdateConversationSettings: vi.fn(),
}));

describe("GroupSettingsSection", () => {
  const mockSettings: ConversationEffectiveSettings = {
    conversationId: "conv-1",
    effective: {
      maxGroupMembers: 50,
      whoCanAddMembers: "ALL_MEMBERS",
      whoCanRemoveMembers: "GROUP_ADMINS_ONLY",
      whoCanChangeGroupInfo: "GROUP_ADMINS_ONLY",
      whoCanDeleteGroup: "CREATOR_ONLY",
    },
    overrideAllowed: {
      maxGroupMembers: true,
      whoCanAddMembers: true,
      whoCanRemoveMembers: false,
      whoCanChangeGroupInfo: false,
      whoCanDeleteGroup: true,
    },
  };

  const mockSaveFn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConversationSettings).mockReturnValue({
      settings: mockSettings,
      status: "ready",
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(useUpdateConversationSettings).mockReturnValue({
      save: mockSaveFn,
      pending: false,
      error: null,
    });
  });

  it("returns null if no overrides are allowed by global settings", () => {
    vi.mocked(useConversationSettings).mockReturnValue({
      settings: {
        ...mockSettings,
        overrideAllowed: {
          maxGroupMembers: false,
          whoCanAddMembers: false,
          whoCanRemoveMembers: false,
          whoCanChangeGroupInfo: false,
          whoCanDeleteGroup: false,
        },
      },
      status: "ready",
      error: null,
      refetch: vi.fn(),
    });

    const { container } = render(<GroupSettingsSection conversationId="conv-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders only fields where overrideAllowed is true", () => {
    render(<GroupSettingsSection conversationId="conv-1" />);

    expect(screen.getByText("Máximo de miembros")).toBeInTheDocument();
    expect(screen.getByText("¿Quién puede agregar miembros?")).toBeInTheDocument();
    expect(screen.queryByText("¿Quién puede quitar miembros?")).not.toBeInTheDocument();
    expect(screen.queryByText("¿Quién puede renombrar o cambiar la foto?")).not.toBeInTheDocument();
    expect(screen.getByText("¿Quién puede eliminar el grupo?")).toBeInTheDocument();
  });

  it("validates maxGroupMembers must be integer >= 2", () => {
    render(<GroupSettingsSection conversationId="conv-1" />);

    const maxMembersInput = screen.getByLabelText("Máximo de miembros");
    fireEvent.change(maxMembersInput, { target: { value: "1" } });

    expect(screen.getByText("Debe ser un número entero mayor a 1.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("enables save button when dirty and valid, and submits payload", async () => {
    mockSaveFn.mockResolvedValueOnce({
      ...mockSettings,
      effective: { ...mockSettings.effective, maxGroupMembers: 80 },
    });

    render(<GroupSettingsSection conversationId="conv-1" />);

    const saveBtn = screen.getByRole("button", { name: "Guardar cambios" });
    expect(saveBtn).toBeDisabled();

    const maxMembersInput = screen.getByLabelText("Máximo de miembros");
    fireEvent.change(maxMembersInput, { target: { value: "80" } });

    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockSaveFn).toHaveBeenCalledWith({
        maxGroupMembers: 80,
        whoCanAddMembers: "ALL_MEMBERS",
        whoCanDeleteGroup: "CREATOR_ONLY",
      });
    });
  });

  it("displays save error message if save fails", () => {
    vi.mocked(useUpdateConversationSettings).mockReturnValue({
      save: mockSaveFn,
      pending: false,
      error: "Error al actualizar configuración",
    });

    render(<GroupSettingsSection conversationId="conv-1" />);

    expect(screen.getByText("Error al actualizar configuración")).toBeInTheDocument();
  });
});

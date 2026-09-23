import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesktopSidebar } from "./DesktopSidebar";
import { useOpenSelfChat } from "@/features/conversations/hooks/use-open-self-chat";
import type { ConversationListItem } from "@/features/conversations/types/conversation.types";

const mockOpenSelfChat = vi.fn();

vi.mock("@/features/conversations/hooks/use-open-self-chat", () => ({
  useOpenSelfChat: vi.fn(() => ({
    open: mockOpenSelfChat,
    pending: false,
  })),
}));

vi.mock("@/components/layout/UserMenu", () => ({
  UserMenu: ({ onOpenProfileSettings }: { onOpenProfileSettings: () => void }) => (
    <button data-testid="user-menu" onClick={onOpenProfileSettings}>
      User Menu
    </button>
  ),
}));

vi.mock("@/components/ui/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock("@/features/conversations/components/ConversationFilterBar", () => ({
  ConversationFilterBar: ({
    active,
    onChange,
  }: {
    active: string;
    onChange: (val: any) => void;
  }) => (
    <div data-testid="filter-bar">
      <span>Active: {active}</span>
      <button onClick={() => onChange("unread")}>Filter Unread</button>
    </div>
  ),
}));

vi.mock("@/features/conversations/components/ConversationList", () => ({
  ConversationList: ({
    conversations,
    searchQuery,
    activeFilter,
    isSelectionMode,
    onEnterSelectionMode,
    onExitSelectionMode,
  }: {
    conversations: ConversationListItem[];
    searchQuery: string;
    activeFilter: string;
    isSelectionMode?: boolean;
    onEnterSelectionMode?: () => void;
    onExitSelectionMode?: () => void;
  }) => (
    <div data-testid="conversation-list">
      Items: {conversations.length} | Search: &quot;{searchQuery}&quot; | Filter: {activeFilter} | Selection: {String(isSelectionMode)}
      <button onClick={onEnterSelectionMode}>Enter Selection</button>
      <button onClick={onExitSelectionMode}>Exit Selection</button>
    </div>
  ),
}));

vi.mock("@/features/users/components/NewChatModal", () => ({
  NewChatModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="new-chat-modal">
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}));

vi.mock("@/features/profile/components/ProfileSettingsPanel", () => ({
  ProfileSettingsPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="profile-settings-panel">
      <button onClick={onClose}>Back to List</button>
    </div>
  ),
}));

describe("DesktopSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders sidebar with search, filters, conversation list, and action buttons", () => {
    render(
      <DesktopSidebar
        conversations={[]}
        status="ready"
        currentUserId="user-1"
      />,
    );

    expect(screen.getByTestId("user-menu")).toBeInTheDocument();
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar conversación")).toBeInTheDocument();
    expect(screen.getByTestId("filter-bar")).toBeInTheDocument();
    expect(screen.getByTestId("conversation-list")).toBeInTheDocument();
  });

  it("updates search input and passes query to ConversationList", async () => {
    const user = userEvent.setup();
    render(
      <DesktopSidebar
        conversations={[]}
        status="ready"
        currentUserId="user-1"
      />,
    );

    const input = screen.getByPlaceholderText("Buscar conversación");
    await user.type(input, "Cirugía");

    expect(
      screen.getByText(/Search: "Cirugía"/i),
    ).toBeInTheDocument();
  });

  it("clicking filter button updates activeFilter", async () => {
    const user = userEvent.setup();
    render(
      <DesktopSidebar
        conversations={[]}
        status="ready"
        currentUserId="user-1"
      />,
    );

    expect(screen.getByText("Active: all")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filter Unread" }));
    expect(screen.getByText("Active: unread")).toBeInTheDocument();
  });

  it("switches to profile settings view when UserMenu triggers it and back to list", async () => {
    const user = userEvent.setup();
    render(
      <DesktopSidebar
        conversations={[]}
        status="ready"
        currentUserId="user-1"
      />,
    );

    await user.click(screen.getByTestId("user-menu"));
    expect(screen.getByTestId("profile-settings-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to List" }));
    expect(screen.queryByTestId("profile-settings-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("conversation-list")).toBeInTheDocument();
  });

  it("opens and closes NewChatModal", async () => {
    const user = userEvent.setup();
    render(
      <DesktopSidebar
        conversations={[]}
        status="ready"
        currentUserId="user-1"
      />,
    );

    const newChatButtons = screen.getAllByRole("button", { name: "Chat nuevo" });
    await user.click(newChatButtons[0]);

    expect(screen.getByTestId("new-chat-modal")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close Modal" }));
    expect(screen.queryByTestId("new-chat-modal")).not.toBeInTheDocument();
  });

  it("calls openSelfChat when saved messages button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <DesktopSidebar
        conversations={[]}
        status="ready"
        currentUserId="user-1"
      />,
    );

    const savedBtn = screen.getByRole("button", { name: "Mensajes guardados" });
    await user.click(savedBtn);

    expect(mockOpenSelfChat).toHaveBeenCalledTimes(1);
  });

  it("no renderiza el botón de selección en el header y coordina el modo con ConversationList", async () => {
    const user = userEvent.setup();
    render(
      <DesktopSidebar
        conversations={[]}
        status="ready"
        currentUserId="user-1"
      />,
    );

    expect(screen.queryByRole("button", { name: "Seleccionar chats" })).not.toBeInTheDocument();
    expect(screen.getByText(/Selection: false/)).toBeInTheDocument();

    await user.click(screen.getByText("Enter Selection"));
    expect(screen.getByText(/Selection: true/)).toBeInTheDocument();

    await user.click(screen.getByText("Exit Selection"));
    expect(screen.getByText(/Selection: false/)).toBeInTheDocument();
  });
});


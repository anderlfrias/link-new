import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewChatModal } from "./NewChatModal";
import type { DirectoryUser } from "@/features/users/types/user.types";

const mockUseUsers = vi.fn();
vi.mock("@/features/users/hooks/use-users", () => ({
  useUsers: () => mockUseUsers(),
}));

const mockStartWithUser = vi.fn();
vi.mock("@/features/conversations/hooks/use-start-conversation", () => ({
  useStartConversation: () => ({
    startWithUser: mockStartWithUser,
    pending: false,
    error: null,
  }),
}));

const mockCreateGroup = vi.fn();
vi.mock("@/features/conversations/hooks/use-create-group", () => ({
  useCreateGroup: () => ({
    createGroup: mockCreateGroup,
    pending: false,
    error: null,
  }),
}));

describe("NewChatModal", () => {
  const onClose = vi.fn();
  const mockUsers: DirectoryUser[] = [
    { id: "u-1", name: "Ana Gomez", email: "ana@test.com", avatarFileId: null, avatarFile: null, status: "ACTIVE" },
    { id: "u-2", name: "Carlos Perez", email: "carlos@test.com", avatarFileId: null, avatarFile: null, status: "INACTIVE" },
    { id: "u-3", name: "Beatriz Lopez", email: "blopez@test.com", avatarFileId: null, avatarFile: null, status: "ACTIVE" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUsers.mockReturnValue({
      users: mockUsers,
      status: "ready",
    });
  });

  it("renderiza lista de contactos y permite iniciar un chat privado", async () => {
    const user = userEvent.setup();
    mockStartWithUser.mockResolvedValueOnce({ id: "c-123" });

    render(<NewChatModal onClose={onClose} />);

    expect(screen.getByRole("heading", { name: "Chat nuevo" })).toBeInTheDocument();
    expect(screen.getByText("Ana Gomez")).toBeInTheDocument();
    expect(screen.getByText("Carlos Perez")).toBeInTheDocument();

    // Click en Ana Gomez
    await user.click(screen.getByText("Ana Gomez"));

    expect(mockStartWithUser).toHaveBeenCalledWith("u-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("permite filtrar contactos por el buscador", async () => {
    const user = userEvent.setup();
    render(<NewChatModal onClose={onClose} />);

    const searchInput = screen.getByPlaceholderText("Buscar contacto");
    await user.type(searchInput, "Carlos");

    expect(screen.getByText("Carlos Perez")).toBeInTheDocument();
    expect(screen.queryByText("Ana Gomez")).not.toBeInTheDocument();
  });

  it("permite flujo de creación de nuevo grupo", async () => {
    const user = userEvent.setup();
    mockCreateGroup.mockResolvedValueOnce({ id: "c-group-1" });

    render(<NewChatModal onClose={onClose} />);

    // Click en "Nuevo grupo"
    await user.click(screen.getByText("Nuevo grupo"));

    // Ahora estamos en selectMembers
    expect(screen.getByRole("heading", { name: /Elegir participantes/i })).toBeInTheDocument();

    const nextBtn = screen.getByRole("button", { name: "Siguiente" });
    expect(nextBtn).toBeDisabled();

    // Seleccionar 2 participantes
    await user.click(screen.getByText("Ana Gomez"));
    await user.click(screen.getByText("Carlos Perez"));

    expect(nextBtn).not.toBeDisabled();
    await user.click(nextBtn);

    // Ahora en groupDetails
    expect(screen.getByRole("heading", { name: "Datos del grupo" })).toBeInTheDocument();

    const groupNameInput = screen.getByPlaceholderText("Nombre del grupo");
    await user.type(groupNameInput, "Equipo de Guardia");

    const createGroupBtn = screen.getByRole("button", { name: "Crear grupo" });
    await user.click(createGroupBtn);

    expect(mockCreateGroup).toHaveBeenCalledWith(
      ["u-1", "u-2"],
      "Equipo de Guardia",
      null,
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("permite cerrar el modal con el botón X", async () => {
    const user = userEvent.setup();
    render(<NewChatModal onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });
});

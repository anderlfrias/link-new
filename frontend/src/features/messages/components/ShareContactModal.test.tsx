import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareContactModal } from "./ShareContactModal";
import { I18nProvider } from "@/i18n";
import type { DirectoryUser } from "@/features/users/types/user.types";

const mockUseUsers = vi.fn();
vi.mock("@/features/users/hooks/use-users", () => ({
  useUsers: () => mockUseUsers(),
}));

describe("ShareContactModal", () => {
  const onClose = vi.fn();
  const onSelectContact = vi.fn();

  const mockUsers: DirectoryUser[] = [
    {
      id: "u-1",
      name: "Ana Gomez",
      username: "anag",
      email: "ana@test.com",
      avatarFileId: null,
      avatarFile: null,
      status: "ACTIVE",
    },
    {
      id: "u-2",
      name: "Carlos Perez",
      username: "cperez",
      email: "carlos@test.com",
      avatarFileId: null,
      avatarFile: null,
      status: "ACTIVE",
    },
    {
      id: "u-me",
      name: "Yo Mismo",
      username: "yomismo",
      email: "yo@test.com",
      avatarFileId: null,
      avatarFile: null,
      status: "ACTIVE",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUsers.mockReturnValue({
      users: mockUsers,
      status: "ready",
    });
  });

  it("renderiza lista de contactos excluyendo currentUserId", () => {
    render(
      <ShareContactModal
        onClose={onClose}
        onSelectContact={onSelectContact}
        currentUserId="u-me"
      />,
    );

    expect(screen.getByText("Compartir contacto")).toBeInTheDocument();
    expect(screen.getByText("Ana Gomez")).toBeInTheDocument();
    expect(screen.getByText("@anag")).toBeInTheDocument();
    expect(screen.getByText("Carlos Perez")).toBeInTheDocument();
    expect(screen.getByText("@cperez")).toBeInTheDocument();
    expect(screen.queryByText("Yo Mismo")).not.toBeInTheDocument();
  });

  it("muestra spinner mientras status es loading o idle", () => {
    mockUseUsers.mockReturnValue({
      users: [],
      status: "loading",
    });

    const { container } = render(
      <ShareContactModal
        onClose={onClose}
        onSelectContact={onSelectContact}
        currentUserId="u-me"
      />,
    );

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("muestra mensaje de error si status es error", () => {
    mockUseUsers.mockReturnValue({
      users: [],
      status: "error",
    });

    render(
      <ShareContactModal
        onClose={onClose}
        onSelectContact={onSelectContact}
        currentUserId="u-me"
      />,
    );

    expect(
      screen.getByText("Error al cargar los contactos. Por favor intenta de nuevo."),
    ).toBeInTheDocument();
  });

  it("muestra mensaje de vacío si no hay contactos disponibles", () => {
    mockUseUsers.mockReturnValue({
      users: [],
      status: "ready",
    });

    render(
      <ShareContactModal
        onClose={onClose}
        onSelectContact={onSelectContact}
        currentUserId="u-me"
      />,
    );

    expect(screen.getByText("No se encontraron contactos")).toBeInTheDocument();
  });

  it("filtra contactos por texto de búsqueda", async () => {
    const user = userEvent.setup();
    render(
      <ShareContactModal
        onClose={onClose}
        onSelectContact={onSelectContact}
        currentUserId="u-me"
      />,
    );

    const input = screen.getByPlaceholderText("Buscar por nombre, usuario o correo...");
    await user.type(input, "cperez");

    expect(screen.getByText("Carlos Perez")).toBeInTheDocument();
    expect(screen.queryByText("Ana Gomez")).not.toBeInTheDocument();
  });

  it("llama a onSelectContact y onClose al hacer click en un contacto", async () => {
    const user = userEvent.setup();
    render(
      <ShareContactModal
        onClose={onClose}
        onSelectContact={onSelectContact}
        currentUserId="u-me"
      />,
    );

    await user.click(screen.getByText("Ana Gomez"));

    expect(onSelectContact).toHaveBeenCalledWith(mockUsers[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("renderiza correctamente en inglés cuando el locale es en", () => {
    render(
      <I18nProvider initialLocale="en">
        <ShareContactModal
          onClose={onClose}
          onSelectContact={onSelectContact}
          currentUserId="u-me"
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Share contact" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by name, username or email...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close modal" })).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactMessageCard } from "./ContactMessageCard";
import type { ContactMessagePayload } from "@/features/messages/types/message.types";

const mockStartWithUser = vi.fn();
let mockPending = false;

vi.mock("@/features/conversations/hooks/use-start-conversation", () => ({
  useStartConversation: () => ({
    startWithUser: mockStartWithUser,
    pending: mockPending,
    error: null,
  }),
}));

const mockCopyTextToClipboard = vi.fn();
vi.mock("@/utils/clipboard", () => ({
  copyTextToClipboard: (...args: unknown[]) => mockCopyTextToClipboard(...args),
}));

describe("ContactMessageCard", () => {
  const samplePayload: ContactMessagePayload = {
    id: "user-contact-123",
    name: "Dra. Sofía Martínez",
    username: "smartinez",
    email: "smartinez@example.com",
    avatarUrl: "https://example.com/avatar.jpg",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPending = false;
    mockStartWithUser.mockResolvedValue({ id: "conv-456" });
    mockCopyTextToClipboard.mockResolvedValue(true);
  });

  it("renderiza correctamente los datos del contacto compartido", () => {
    render(
      <ContactMessageCard
        rawContent={JSON.stringify(samplePayload)}
        isOwn={false}
        currentUserId="user-viewer"
        footer={<span data-testid="test-footer">10:30</span>}
      />,
    );

    expect(screen.getByText("Dra. Sofía Martínez")).toBeInTheDocument();
    expect(screen.getByText("@smartinez")).toBeInTheDocument();
    expect(screen.getByText("smartinez@example.com")).toBeInTheDocument();
    expect(screen.getByTestId("test-footer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar mensaje a este contacto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar correo del contacto" })).toBeInTheDocument();
  });

  it("muestra la etiqueta 'Vos' si el contacto compartido es el propio usuario actual", () => {
    render(
      <ContactMessageCard
        rawContent={JSON.stringify(samplePayload)}
        isOwn={true}
        currentUserId="user-contact-123"
      />,
    );

    expect(screen.getByText("Vos")).toBeInTheDocument();
  });

  it("llama a startWithUser con el ID del contacto al hacer clic en 'Enviar mensaje'", async () => {
    const user = userEvent.setup();
    render(
      <ContactMessageCard
        rawContent={JSON.stringify(samplePayload)}
        isOwn={false}
        currentUserId="user-viewer"
      />,
    );

    const sendBtn = screen.getByRole("button", { name: "Enviar mensaje a este contacto" });
    await user.click(sendBtn);

    expect(mockStartWithUser).toHaveBeenCalledTimes(1);
    expect(mockStartWithUser).toHaveBeenCalledWith("user-contact-123");
  });

  it("copia el correo al portapapeles y muestra confirmación al hacer clic en 'Copiar correo'", async () => {
    const user = userEvent.setup();
    render(
      <ContactMessageCard
        rawContent={JSON.stringify(samplePayload)}
        isOwn={false}
        currentUserId="user-viewer"
      />,
    );

    const copyBtn = screen.getByRole("button", { name: "Copiar correo del contacto" });
    await user.click(copyBtn);

    expect(mockCopyTextToClipboard).toHaveBeenCalledTimes(1);
    expect(mockCopyTextToClipboard).toHaveBeenCalledWith("smartinez@example.com");

    await waitFor(() => {
      expect(screen.getByText("Copiado")).toBeInTheDocument();
    });
  });

  describe("foto del contacto", () => {
    const withoutPhoto: ContactMessagePayload = {
      id: "user-contact-123",
      name: "Dra. Sofía Martínez",
      email: "smartinez@example.com",
    };

    it("muestra la foto a partir de avatarFileId", () => {
      render(
        <ContactMessageCard
          rawContent={JSON.stringify({ ...withoutPhoto, avatarFileId: "f-avatar" })}
          isOwn={false}
          currentUserId="user-viewer"
        />,
      );

      expect(screen.getByRole("img", { name: "Dra. Sofía Martínez" })).toHaveAttribute(
        "src",
        "http://localhost:4000/api/v1/files/f-avatar/content",
      );
    });

    it("ignora un avatarUrl externo de un mensaje viejo", () => {
      render(
        <ContactMessageCard
          rawContent={JSON.stringify({ ...withoutPhoto, avatarUrl: "https://atacante.example/pixel.png" })}
          isOwn={false}
          currentUserId="user-viewer"
        />,
      );

      // Nunca se pide una imagen a un host externo: queda el avatar con iniciales.
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(screen.getByText("D")).toBeInTheDocument();
    });

    it("usa un avatarUrl viejo que apunta al backend", () => {
      render(
        <ContactMessageCard
          rawContent={JSON.stringify({
            ...withoutPhoto,
            avatarUrl: "http://localhost:4000/api/v1/files/f-viejo/content",
          })}
          isOwn={false}
          currentUserId="user-viewer"
        />,
      );

      expect(screen.getByRole("img", { name: "Dra. Sofía Martínez" })).toHaveAttribute(
        "src",
        "http://localhost:4000/api/v1/files/f-viejo/content",
      );
    });

    it("prefiere avatarFileId sobre un avatarUrl viejo", () => {
      render(
        <ContactMessageCard
          rawContent={JSON.stringify({
            ...withoutPhoto,
            avatarFileId: "f-nuevo",
            avatarUrl: "http://localhost:4000/api/v1/files/f-viejo/content",
          })}
          isOwn={false}
          currentUserId="user-viewer"
        />,
      );

      expect(screen.getByRole("img")).toHaveAttribute("src", "http://localhost:4000/api/v1/files/f-nuevo/content");
    });
  });

  it("renderiza fallback si el contenido no es un JSON válido de contacto", () => {
    render(
      <ContactMessageCard
        rawContent="Texto simple no parseable"
        isOwn={false}
        currentUserId="user-viewer"
        footer={<span data-testid="test-footer">10:30</span>}
      />,
    );

    expect(screen.getByText("👤 Contacto")).toBeInTheDocument();
    expect(screen.getByText("Texto simple no parseable")).toBeInTheDocument();
    expect(screen.getByTestId("test-footer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar mensaje a este contacto" })).not.toBeInTheDocument();
  });

  it("deshabilita el botón de enviar mensaje cuando pending es true", () => {
    mockPending = true;
    render(
      <ContactMessageCard
        rawContent={JSON.stringify(samplePayload)}
        isOwn={false}
        currentUserId="user-viewer"
      />,
    );

    const sendBtn = screen.getByRole("button", { name: "Enviar mensaje a este contacto" });
    expect(sendBtn).toBeDisabled();
  });
});

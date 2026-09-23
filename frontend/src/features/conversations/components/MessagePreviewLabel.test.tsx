import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessagePreviewLabel, parseMessagePreview } from "./MessagePreviewLabel";

describe("MessagePreviewLabel & parseMessagePreview", () => {
  it("muestra 'Sin mensajes todavía' si el preview es nulo o vacío", () => {
    const { Icon, text } = parseMessagePreview(null);
    expect(Icon).toBeNull();
    expect(text).toBe("Sin mensajes todavía");

    render(<MessagePreviewLabel preview={null} />);
    expect(screen.getByText("Sin mensajes todavía")).toBeInTheDocument();
  });

  it("parsea notas de voz con ícono de micrófono y limpia el emoji", () => {
    const parsed = parseMessagePreview("🎤 Nota de voz");
    expect(parsed.Icon).not.toBeNull();
    expect(parsed.text).toBe("Nota de voz");

    render(<MessagePreviewLabel senderPrefix="Tú: " preview="🎤 Nota de voz" />);
    expect(screen.getByText("Tú:")).toBeInTheDocument();
    expect(screen.getByText("Nota de voz")).toBeInTheDocument();
    expect(screen.queryByText("🎤")).not.toBeInTheDocument();
  });

  it("parsea fotos con ícono de foto y limpia el emoji", () => {
    const parsed = parseMessagePreview("📷 Foto");
    expect(parsed.Icon).not.toBeNull();
    expect(parsed.text).toBe("Foto");

    render(<MessagePreviewLabel preview="📷 3 fotos" />);
    expect(screen.getByText("3 fotos")).toBeInTheDocument();
    expect(screen.queryByText("📷")).not.toBeInTheDocument();
  });

  it("parsea GIFs con ícono de reproductor/GIF y limpia el emoji", () => {
    const parsed = parseMessagePreview("👾 GIF");
    expect(parsed.Icon).not.toBeNull();
    expect(parsed.text).toBe("GIF");

    render(<MessagePreviewLabel preview="👾 GIF" />);
    expect(screen.getByText("GIF")).toBeInTheDocument();
    expect(screen.queryByText("👾")).not.toBeInTheDocument();
  });

  it("parsea videos con ícono de video y limpia el emoji", () => {
    const parsed = parseMessagePreview("🎥 Video");
    expect(parsed.Icon).not.toBeNull();
    expect(parsed.text).toBe("Video");

    render(<MessagePreviewLabel preview="🎥 Video" />);
    expect(screen.getByText("Video")).toBeInTheDocument();
    expect(screen.queryByText("🎥")).not.toBeInTheDocument();
  });

  it("parsea documentos con ícono de documento y nombre de archivo", () => {
    const parsed = parseMessagePreview("📄 balance_2026.pdf");
    expect(parsed.Icon).not.toBeNull();
    expect(parsed.text).toBe("balance_2026.pdf");

    render(<MessagePreviewLabel preview="📄 balance_2026.pdf" />);
    expect(screen.getByText("balance_2026.pdf")).toBeInTheDocument();
    expect(screen.queryByText("📄")).not.toBeInTheDocument();
  });

  it("parsea contactos con ícono de usuario", () => {
    const parsed = parseMessagePreview("👤 Contacto: Juan Pérez");
    expect(parsed.Icon).not.toBeNull();
    expect(parsed.text).toBe("Contacto: Juan Pérez");

    render(<MessagePreviewLabel preview="👤 Contacto: Juan Pérez" />);
    expect(screen.getByText("Contacto: Juan Pérez")).toBeInTheDocument();
    expect(screen.queryByText("👤")).not.toBeInTheDocument();
  });

  it("parsea mensajes eliminados con ícono de bloqueo", () => {
    const parsed = parseMessagePreview("Mensaje eliminado");
    expect(parsed.Icon).not.toBeNull();
    expect(parsed.text).toBe("Mensaje eliminado");
    expect(parsed.isDeleted).toBe(true);

    render(<MessagePreviewLabel preview="Mensaje eliminado" />);
    expect(screen.getByText("Mensaje eliminado")).toBeInTheDocument();
  });

  it("parsea archivos adjuntos con ícono de clip (paperclip)", () => {
    const parsed = parseMessagePreview("📎 Archivo adjunto");
    expect(parsed.Icon).not.toBeNull();
    expect(parsed.text).toBe("Archivo adjunto");

    render(<MessagePreviewLabel preview="📎 Archivo adjunto" />);
    expect(screen.getByText("Archivo adjunto")).toBeInTheDocument();
    expect(screen.queryByText("📎")).not.toBeInTheDocument();
  });

  it("parsea Sticker sin emoji y asigna ícono de sticker", () => {
    const parsed = parseMessagePreview("Sticker");
    expect(parsed.Icon).not.toBeNull();
    expect(parsed.text).toBe("Sticker");

    render(<MessagePreviewLabel preview="Sticker" />);
    expect(screen.getByText("Sticker")).toBeInTheDocument();
  });

  it("parsea Imagen sin emoji y asigna ícono de foto", () => {
    const parsed = parseMessagePreview("Imagen");
    expect(parsed.Icon).not.toBeNull();
    expect(parsed.text).toBe("Imagen");

    render(<MessagePreviewLabel preview="Imagen" />);
    expect(screen.getByText("Imagen")).toBeInTheDocument();
  });

  it("parsea encuestas con ícono de gráfico de barras", () => {
    const parsed = parseMessagePreview("Encuesta: ¿Cuál es su turno preferido?");
    expect(parsed.Icon).not.toBeNull();
    expect(parsed.text).toBe("Encuesta: ¿Cuál es su turno preferido?");

    render(<MessagePreviewLabel preview="Encuesta: ¿Cuál es su turno preferido?" />);
    expect(screen.getByText("Encuesta: ¿Cuál es su turno preferido?")).toBeInTheDocument();
  });

  it("parsea encuestas con emoji previo y limpia el emoji asignando ícono de gráfico", () => {
    const parsed = parseMessagePreview("📊 Encuesta: ¿Almorzamos juntos?");
    expect(parsed.Icon).not.toBeNull();
    expect(parsed.text).toBe("Encuesta: ¿Almorzamos juntos?");

    render(<MessagePreviewLabel preview="📊 Encuesta: ¿Almorzamos juntos?" />);
    expect(screen.getByText("Encuesta: ¿Almorzamos juntos?")).toBeInTheDocument();
    expect(screen.queryByText("📊")).not.toBeInTheDocument();
  });

  it("renderiza texto común sin íconos especiales", () => {
    const parsed = parseMessagePreview("Hola a todos");
    expect(parsed.Icon).toBeNull();
    expect(parsed.text).toBe("Hola a todos");

    render(<MessagePreviewLabel preview="Hola a todos" />);
    expect(screen.getByText("Hola a todos")).toBeInTheDocument();
  });
});

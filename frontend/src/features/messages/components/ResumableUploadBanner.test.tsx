import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResumableUploadBanner } from "./ResumableUploadBanner";
import type { PersistedUploadSession } from "@/features/files/lib/upload-persistence";

describe("ResumableUploadBanner", () => {
  const mockSession: PersistedUploadSession = {
    sessionId: "sess-banner-1",
    conversationId: "conv-1",
    fileName: "video-quirurgico.mp4",
    fileSize: 150 * 1024 * 1024,
    fileType: "video/mp4",
    lastModified: 1700000000000,
    createdAt: Date.now(),
  };

  it("renderiza el nombre del archivo, tamaño formateado y descripción", () => {
    render(
      <ResumableUploadBanner
        session={mockSession}
        onSelectFile={vi.fn()}
        onDiscard={vi.fn()}
      />,
    );

    expect(screen.getByText("Subida interrumpida detectada")).toBeInTheDocument();
    expect(screen.getByText("video-quirurgico.mp4")).toBeInTheDocument();
    expect(screen.getByText(/150 MB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seleccionar archivo" })).toBeInTheDocument();
  });

  it("muestra error de discrepancia si mismatchError está presente", () => {
    render(
      <ResumableUploadBanner
        session={mockSession}
        onSelectFile={vi.fn()}
        onDiscard={vi.fn()}
        mismatchError="El archivo seleccionado no coincide con el original."
      />,
    );

    expect(
      screen.getByText("El archivo seleccionado no coincide con el original."),
    ).toBeInTheDocument();
  });

  it("llama a onDiscard al pulsar el botón de descarte o la cruz", () => {
    const onDiscard = vi.fn();
    render(
      <ResumableUploadBanner
        session={mockSession}
        onSelectFile={vi.fn()}
        onDiscard={onDiscard}
      />,
    );

    const discardBtn = screen.getByRole("button", { name: "Descartar sesión" });
    fireEvent.click(discardBtn);
    expect(onDiscard).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByLabelText("Descartar subida pendiente");
    fireEvent.click(closeBtn);
    expect(onDiscard).toHaveBeenCalledTimes(2);
  });

  it("invoca onSelectFile cuando el usuario selecciona un archivo en el input", () => {
    const onSelectFile = vi.fn();
    render(
      <ResumableUploadBanner
        session={mockSession}
        onSelectFile={onSelectFile}
        onDiscard={vi.fn()}
      />,
    );

    const file = new File(["bytes"], "video-quirurgico.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText("Seleccionar archivo para reanudar");

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(onSelectFile).toHaveBeenCalledWith(file);
  });
});

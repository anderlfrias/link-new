import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttachmentErrorModal } from "./AttachmentErrorModal";

describe("AttachmentErrorModal", () => {
  it("renders size-limit error modal and calls onAccept when accepted", () => {
    const onAccept = vi.fn();
    render(
      <AttachmentErrorModal
        fileName="video.mp4"
        reason={{ kind: "size-limit" }}
        maxUploadSizeMb={25}
        onAccept={onAccept}
      />,
    );

    expect(screen.getByText("Archivo demasiado grande")).toBeInTheDocument();
    expect(screen.getByText(/supera el tamaño máximo permitido.*\(25 MB\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("renders too-many-files error modal", () => {
    render(
      <AttachmentErrorModal
        reason={{ kind: "too-many-files", limit: 3, attemptedCount: 5 }}
        onAccept={vi.fn()}
      />,
    );

    expect(screen.getByText("Demasiados archivos")).toBeInTheDocument();
    expect(screen.getByText(/Elegiste 5 archivos, pero un mensaje admite como máximo 3/)).toBeInTheDocument();
  });

  it("renders unsupported-type error modal", () => {
    render(
      <AttachmentErrorModal
        fileName="script.sh"
        reason={{ kind: "unsupported-type", mimeType: "application/x-sh" }}
        onAccept={vi.fn()}
      />,
    );

    expect(screen.getByText("Tipo de archivo no permitido")).toBeInTheDocument();
    expect(screen.getByText(/el tipo de archivo \(application\/x-sh\) no está permitido/)).toBeInTheDocument();
  });
});

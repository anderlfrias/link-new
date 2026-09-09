import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteFileConfirmModal } from "./DeleteFileConfirmModal";
import type { AdminFileListItem } from "@/features/admin/types/admin-files.types";

describe("DeleteFileConfirmModal", () => {
  const sampleFile: AdminFileListItem = {
    id: "f-123",
    originalName: "estudio-clinico.pdf",
    mimeType: "application/pdf",
    extension: "pdf",
    url: "http://localhost:4000/uploads/estudio-clinico.pdf",
    size: 1024,
    createdAt: "2026-09-09T00:00:00.000Z",
    createdBy: { id: "u-1", name: "Dr. Clinico", email: "clinico@test.com" },
    usage: {
      avatarOfUserCount: 0,
      groupImageOfConversationCount: 1,
      messageAttachmentCount: 2,
    },
  };

  it("renders modal with file name, warning, and usage list", () => {
    render(
      <DeleteFileConfirmModal
        file={sampleFile}
        pending={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText("Eliminar archivo permanentemente")).toBeInTheDocument();
    expect(screen.getByText("estudio-clinico.pdf")).toBeInTheDocument();
    expect(screen.getByText("Foto de 1 grupo")).toBeInTheDocument();
    expect(screen.getByText("Adjunto en 2 mensajes")).toBeInTheDocument();
  });

  it("calls onCancel and onConfirm when buttons are clicked", async () => {
    const handleCancel = vi.fn();
    const handleConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <DeleteFileConfirmModal
        file={sampleFile}
        pending={false}
        error={null}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(handleCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Eliminar definitivamente" }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it("displays error message and disables buttons when pending is true", () => {
    render(
      <DeleteFileConfirmModal
        file={sampleFile}
        pending={true}
        error="No se pudo eliminar el archivo en disco"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText("No se pudo eliminar el archivo en disco"),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Eliminar definitivamente/i }),
    ).toBeDisabled();
  });
});

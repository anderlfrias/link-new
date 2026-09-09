import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminFileRow } from "./AdminFileRow";
import type { AdminFileListItem } from "@/features/admin/types/admin-files.types";

vi.mock("@/features/files/components/FileTypeIcon", () => ({
  FileTypeIcon: () => <div data-testid="file-type-icon" />,
}));

describe("AdminFileRow", () => {
  const sampleFile: AdminFileListItem = {
    id: "file-123",
    originalName: "presupuesto.pdf",
    mimeType: "application/pdf",
    extension: "pdf",
    url: "http://localhost:4000/uploads/presupuesto.pdf",
    size: 204800,
    createdAt: "2026-09-09T10:00:00.000Z",
    createdBy: {
      id: "u-1",
      name: "Juan Perez",
      email: "juan@test.com",
    },
    usage: {
      avatarOfUserCount: 0,
      groupImageOfConversationCount: 0,
      messageAttachmentCount: 1,
    },
  };

  it("renders file details, formatted size, uploader, and usage badges", () => {
    render(<AdminFileRow file={sampleFile} onDelete={vi.fn()} />);

    expect(screen.getByText("presupuesto.pdf")).toBeInTheDocument();
    expect(screen.getByText(/200 KB/i)).toBeInTheDocument();
    expect(screen.getByText(/Juan Perez · juan@test.com/i)).toBeInTheDocument();
    expect(screen.getByText("Adjunto en 1 mensaje")).toBeInTheDocument();
  });

  it("renders 'Sin uso' badge when file has no usage", () => {
    const unusedFile: AdminFileListItem = {
      ...sampleFile,
      usage: {
        avatarOfUserCount: 0,
        groupImageOfConversationCount: 0,
        messageAttachmentCount: 0,
      },
    };

    render(<AdminFileRow file={unusedFile} onDelete={vi.fn()} />);
    expect(screen.getByText("Sin uso")).toBeInTheDocument();
  });

  it("calls onDelete when delete button is clicked", async () => {
    const handleDelete = vi.fn();
    const user = userEvent.setup();

    render(<AdminFileRow file={sampleFile} onDelete={handleDelete} />);

    const deleteBtn = screen.getByRole("button", {
      name: "Eliminar presupuesto.pdf",
    });
    await user.click(deleteBtn);

    expect(handleDelete).toHaveBeenCalledWith(sampleFile);
  });
});

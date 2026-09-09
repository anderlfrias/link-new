import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminFilesPanel } from "./AdminFilesPanel";
import { useAdminFiles } from "@/features/admin/hooks/use-admin-files";
import { useDeleteAdminFile } from "@/features/admin/hooks/use-delete-admin-file";

vi.mock("@/features/admin/hooks/use-admin-files", () => ({
  useAdminFiles: vi.fn(),
}));

vi.mock("@/features/admin/hooks/use-delete-admin-file", () => ({
  useDeleteAdminFile: vi.fn(),
}));

vi.mock("@/features/files/components/FileTypeIcon", () => ({
  FileTypeIcon: () => <div data-testid="file-type-icon" />,
}));

describe("AdminFilesPanel", () => {
  const mockRemoveFile = vi.fn();
  const mockRefetch = vi.fn();
  const mockRemove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDeleteAdminFile).mockReturnValue({
      remove: mockRemove,
      pending: false,
      error: null,
    });
  });

  it("renders files and allows deleting a file via confirmation modal", async () => {
    const mockFile = {
      id: "f-1",
      originalName: "estudio.png",
      mimeType: "image/png",
      extension: "png",
      url: "http://localhost:4000/uploads/estudio.png",
      size: 51200,
      createdAt: "2026-09-09T00:00:00.000Z",
      createdBy: { id: "u-1", name: "Ana", email: "ana@test.com" },
      usage: { avatarOfUserCount: 0, groupImageOfConversationCount: 0, messageAttachmentCount: 0 },
    };

    vi.mocked(useAdminFiles).mockReturnValue({
      files: [mockFile],
      status: "ready",
      error: null,
      hasMore: false,
      loadingMore: false,
      loadMore: vi.fn(),
      totalCount: 1,
      totalSize: 51200,
      refetch: mockRefetch,
      removeFile: mockRemoveFile,
    });

    mockRemove.mockResolvedValueOnce(true);

    const user = userEvent.setup();
    render(<AdminFilesPanel />);

    expect(screen.getByText("estudio.png")).toBeInTheDocument();

    // Click delete
    await user.click(screen.getByRole("button", { name: "Eliminar estudio.png" }));

    // Confirmation modal should appear
    expect(screen.getByText("Eliminar archivo permanentemente")).toBeInTheDocument();

    // Confirm deletion
    await user.click(screen.getByRole("button", { name: "Eliminar definitivamente" }));

    expect(mockRemove).toHaveBeenCalledWith("f-1");
    expect(mockRemoveFile).toHaveBeenCalledWith("f-1");
  });
});

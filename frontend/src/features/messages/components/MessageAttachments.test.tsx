import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageAttachments } from "./MessageAttachments";
import { useImageLightbox } from "@/features/messages/providers/image-lightbox-provider";
import { downloadFile } from "@/utils/download-file";
import type { MessageFile } from "@/features/messages/types/message.types";

vi.mock("@/features/messages/providers/image-lightbox-provider", () => ({
  useImageLightbox: vi.fn(),
}));

vi.mock("@/utils/download-file", () => ({
  downloadFile: vi.fn(),
}));

describe("MessageAttachments", () => {
  const mockOpenLightbox = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useImageLightbox).mockReturnValue({ open: mockOpenLightbox });
  });

  it("returns null when files array is empty", () => {
    const { container } = render(<MessageAttachments files={[]} isOwn={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders deleted file message when file.deletedAt is set", () => {
    const files: MessageFile[] = [
      {
        id: "mf-1",
        messageId: "m-1",
        fileId: "f-1",
        createdAt: "2026-09-09T10:00:00Z",
        file: {
          id: "f-1",
          path: "uploads/old.pdf",
          originalName: "reporte.pdf",
          mimeType: "application/pdf",
          extension: "pdf",
          size: 1024,
          deletedAt: "2026-09-09T11:00:00Z",
        } as any,
      },
    ];

    render(<MessageAttachments files={files} isOwn={false} />);

    expect(screen.getByText("reporte.pdf")).toBeInTheDocument();
    expect(screen.getByText("Este archivo ya no está disponible: fue eliminado.")).toBeInTheDocument();
  });

  it("renders image attachment and opens lightbox on click", () => {
    const files: MessageFile[] = [
      {
        id: "mf-2",
        messageId: "m-1",
        fileId: "f-2",
        createdAt: "2026-09-09T10:00:00Z",
        file: {
          id: "f-2",
          path: "uploads/foto.jpg",
          originalName: "foto.jpg",
          mimeType: "image/jpeg",
          extension: "jpg",
          size: 2048,
          deletedAt: null,
        } as any,
      },
    ];

    render(<MessageAttachments files={files} isOwn={false} />);

    const imgBtn = screen.getByLabelText("Ver imagen foto.jpg");
    fireEvent.click(imgBtn);

    expect(mockOpenLightbox).toHaveBeenCalledWith({
      url: expect.stringContaining("foto.jpg"),
      name: "foto.jpg",
    });
  });

  it("renders downloadable generic file and calls downloadFile on click", () => {
    const files: MessageFile[] = [
      {
        id: "mf-3",
        messageId: "m-1",
        fileId: "f-3",
        createdAt: "2026-09-09T10:00:00Z",
        file: {
          id: "f-3",
          path: "uploads/data.csv",
          originalName: "data.csv",
          mimeType: "text/csv",
          extension: "csv",
          size: 512,
          deletedAt: null,
        } as any,
      },
    ];

    render(<MessageAttachments files={files} isOwn={false} />);

    const fileBtn = screen.getByRole("button");
    expect(screen.getByText("data.csv")).toBeInTheDocument();
    expect(screen.getByText("512 B")).toBeInTheDocument();

    fireEvent.click(fileBtn);
    expect(downloadFile).toHaveBeenCalledWith(expect.stringContaining("data.csv"), "data.csv");
  });

  it("uses signed file.url for image lightbox and download", () => {
    const files: MessageFile[] = [
      {
        id: "mf-signed",
        messageId: "m-1",
        fileId: "f-signed",
        createdAt: "2026-09-09T10:00:00Z",
        file: {
          id: "f-signed",
          originalName: "foto.png",
          mimeType: "image/png",
          extension: "png",
          size: 1024,
          url: "/api/v1/files/f-signed/content?t=hmac-123",
          deletedAt: null,
        } as any,
      },
    ];

    render(<MessageAttachments files={files} isOwn={false} />);
    const imgBtn = screen.getByLabelText("Ver imagen foto.png");
    fireEvent.click(imgBtn);

    expect(mockOpenLightbox).toHaveBeenCalledWith({
      url: "http://localhost:4000/api/v1/files/f-signed/content?t=hmac-123",
      name: "foto.png",
    });
  });
});

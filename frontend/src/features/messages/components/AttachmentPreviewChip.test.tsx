import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttachmentPreviewChip } from "./AttachmentPreviewChip";
import type { PendingAttachment } from "@/features/messages/hooks/use-message-attachments";

describe("AttachmentPreviewChip", () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders file name and size for normal attachment", () => {
    const file = new File(["test-data"], "documento.pdf", { type: "application/pdf" });
    const attachment: PendingAttachment = {
      localId: "loc-1",
      file,
      status: "done",
    };
    const onRemove = vi.fn();

    render(<AttachmentPreviewChip attachment={attachment} onRemove={onRemove} />);

    expect(screen.getByText("documento.pdf")).toBeInTheDocument();
    expect(screen.getByText("9 B")).toBeInTheDocument();

    const removeBtn = screen.getByLabelText("Quitar adjunto");
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("renders image preview when file is an image", () => {
    const file = new File(["fake-img"], "foto.png", { type: "image/png" });
    const attachment: PendingAttachment = {
      localId: "loc-2",
      file,
      status: "done",
    };

    const { container } = render(
      <AttachmentPreviewChip attachment={attachment} onRemove={vi.fn()} />,
    );

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(file);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "blob:mock-url");
  });

  it("displays error message and handles retry button", () => {
    const file = new File(["test-data"], "archivo.zip", { type: "application/zip" });
    const attachment: PendingAttachment = {
      localId: "loc-3",
      file,
      status: "error",
      error: "Archivo demasiado grande",
    };
    const onRetry = vi.fn();

    render(
      <AttachmentPreviewChip
        attachment={attachment}
        onRemove={vi.fn()}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Archivo demasiado grande")).toBeInTheDocument();

    const retryBtn = screen.getByLabelText("Reintentar subida");
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("displays progress and handles pause button while uploading", () => {
    const file = new File([new Uint8Array(20 * 1024 * 1024)], "video.mp4", {
      type: "video/mp4",
    });
    const attachment: PendingAttachment = {
      localId: "loc-4",
      file,
      status: "uploading",
      progress: {
        loadedBytes: 10 * 1024 * 1024,
        totalBytes: 20 * 1024 * 1024,
        percentage: 50,
      },
    };
    const onPause = vi.fn();

    render(
      <AttachmentPreviewChip
        attachment={attachment}
        onRemove={vi.fn()}
        onPause={onPause}
      />,
    );

    expect(screen.getByText(/50%/)).toBeInTheDocument();

    const pauseBtn = screen.getByLabelText("Pausar subida");
    fireEvent.click(pauseBtn);
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("displays paused state and handles resume button", () => {
    const file = new File([new Uint8Array(20 * 1024 * 1024)], "video.mp4", {
      type: "video/mp4",
    });
    const attachment: PendingAttachment = {
      localId: "loc-5",
      file,
      status: "paused",
      progress: {
        loadedBytes: 8 * 1024 * 1024,
        totalBytes: 20 * 1024 * 1024,
        percentage: 40,
      },
    };
    const onResume = vi.fn();

    render(
      <AttachmentPreviewChip
        attachment={attachment}
        onRemove={vi.fn()}
        onResume={onResume}
      />,
    );

    expect(screen.getByText(/Pausado • 40%/)).toBeInTheDocument();

    const resumeBtn = screen.getByLabelText("Reanudar subida");
    fireEvent.click(resumeBtn);
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});

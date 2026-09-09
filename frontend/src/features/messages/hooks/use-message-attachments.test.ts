import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMessageAttachments } from "./use-message-attachments";
import { useAuth } from "@/providers/auth-provider";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { uploadFile } from "@/features/files/api/files.api";
import { compressImage } from "@/utils/compress-image";
import { createMockSession, createMockPublicSettings } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/providers/public-settings-provider", () => ({
  usePublicSettings: vi.fn(),
}));

vi.mock("@/features/files/api/files.api", () => ({
  uploadFile: vi.fn(),
}));

vi.mock("@/utils/compress-image", () => ({
  compressImage: vi.fn((file) => Promise.resolve(file)),
  IMAGE_COMPRESSION_PRESETS: { message: {} },
}));

describe("useMessageAttachments", () => {
  const mockSession = createMockSession({ token: "attach-token" });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
    });
    vi.mocked(usePublicSettings).mockReturnValue(createMockPublicSettings({ maxFilesPerMessage: 5 }));
  });

  it("adds and uploads files successfully", async () => {
    const file = new File(["test content"], "doc.txt", { type: "text/plain" });
    vi.mocked(uploadFile).mockResolvedValueOnce({
      id: "f-1",
      path: "uploads/doc.txt",
      size: 12,
      mimeType: "text/plain",
      extension: "txt",
    } as any);

    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    act(() => {
      result.current.addFiles([file]);
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0].status).toBe("uploading");
    expect(result.current.isUploading).toBe(true);

    await waitFor(() => {
      expect(result.current.attachments[0].status).toBe("done");
    });

    expect(uploadFile).toHaveBeenCalledWith("attach-token", file, "conv-1");
    expect(result.current.fileIds).toEqual(["f-1"]);
    expect(result.current.isUploading).toBe(false);
  });

  it("handles upload error and classifies unsupported-type", async () => {
    const file = new File(["exe content"], "malware.exe", { type: "application/x-msdownload" });
    vi.mocked(uploadFile).mockRejectedValueOnce(
      new Error('File type "application/x-msdownload" is not allowed'),
    );

    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    act(() => {
      result.current.addFiles([file]);
    });

    await waitFor(() => {
      expect(result.current.attachments[0].status).toBe("error");
    });

    expect(result.current.validationErrors).toHaveLength(1);
    expect(result.current.validationErrors[0].reason).toEqual({
      kind: "unsupported-type",
      mimeType: "application/x-msdownload",
    });
  });

  it("handles upload error and classifies size-limit", async () => {
    const file = new File(["huge"], "huge.zip", { type: "application/zip" });
    vi.mocked(uploadFile).mockRejectedValueOnce(new Error("File exceeds the maximum allowed size of 25MB"));

    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    act(() => {
      result.current.addFiles([file]);
    });

    await waitFor(() => {
      expect(result.current.attachments[0].status).toBe("error");
    });

    expect(result.current.validationErrors[0].reason).toEqual({ kind: "size-limit" });
  });

  it("enforces maxFilesPerMessage limit with too-many-files error", () => {
    vi.mocked(usePublicSettings).mockReturnValue(createMockPublicSettings({ maxFilesPerMessage: 2 }));
    const files = [
      new File(["1"], "1.txt", { type: "text/plain" }),
      new File(["2"], "2.txt", { type: "text/plain" }),
      new File(["3"], "3.txt", { type: "text/plain" }),
    ];

    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    act(() => {
      result.current.addFiles(files);
    });

    // Only 2 accepted
    expect(result.current.attachments).toHaveLength(2);
    expect(result.current.validationErrors[0].reason).toEqual({
      kind: "too-many-files",
      limit: 2,
      attemptedCount: 3,
    });
  });

  it("removes attachment and matching validation error", () => {
    const file = new File(["test"], "test.txt", { type: "text/plain" });
    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    act(() => {
      result.current.addFiles([file]);
    });

    const localId = result.current.attachments[0].localId;

    act(() => {
      result.current.removeAttachment(localId);
    });

    expect(result.current.attachments).toHaveLength(0);
  });

  it("resets all attachments and errors", () => {
    const file = new File(["test"], "test.txt", { type: "text/plain" });
    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    act(() => {
      result.current.addFiles([file]);
    });

    expect(result.current.attachments).toHaveLength(1);

    act(() => {
      result.current.reset();
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.validationErrors).toHaveLength(0);
  });
});

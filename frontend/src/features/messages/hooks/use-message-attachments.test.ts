import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useMessageAttachments } from "./use-message-attachments";
import { useAuth } from "@/providers/auth-provider";
import { usePublicSettings } from "@/providers/public-settings-provider";
import { uploadFile } from "@/features/files/api/files.api";
import { abortUpload } from "@/features/files/api/uploads.api";
import { ChunkedUploader } from "@/features/files/lib/chunked-uploader";
import {
  getUploadSession,
  removeUploadSession,
  type PersistedUploadSession,
} from "@/features/files/lib/upload-persistence";
import { compressImage } from "@/utils/compress-image";
import { createMockSession, createMockPublicSettings } from "@/test/test-utils";

vi.mock("@/features/files/api/uploads.api", () => ({
  abortUpload: vi.fn().mockResolvedValue({ id: "abort-id", status: "ABORTED" }),
}));

vi.mock("@/features/files/lib/upload-persistence", () => ({
  getUploadSession: vi.fn().mockReturnValue(null),
  removeUploadSession: vi.fn(),
  saveUploadSession: vi.fn(),
  clearExpiredSessions: vi.fn(),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/providers/public-settings-provider", () => ({
  usePublicSettings: vi.fn(),
}));

vi.mock("@/features/files/api/files.api", () => ({
  uploadFile: vi.fn().mockResolvedValue({
    id: "f-default",
    originalName: "file.txt",
    size: 10,
    mimeType: "text/plain",
    extension: "txt",
    url: "/api/v1/files/f-default/content",
    createdAt: "2026-09-10",
  }),
}));

vi.mock("@/features/files/lib/chunked-uploader", () => {
  const MockChunkedUploader = vi.fn().mockImplementation(function (options: any) {
    return {
      start: vi.fn().mockImplementation(async () => {
        options.onProgress?.({
          loadedBytes: 10 * 1024 * 1024,
          totalBytes: options.file.size,
          percentage: 50,
        });
        return {
          id: "chunked-id-1",
          originalName: options.file.name,
          mimeType: options.file.type,
          extension: "dat",
          size: options.file.size,
          url: "/api/v1/files/chunked-id-1/content?t=sig",
          createdAt: "2026-09-10T12:00:00.000Z",
        };
      }),
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
      getStatus: vi.fn().mockReturnValue("uploading"),
    };
  });
  return { ChunkedUploader: MockChunkedUploader };
});

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
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });
    vi.mocked(usePublicSettings).mockReturnValue(
      createMockPublicSettings({ maxFilesPerMessage: 5 }),
    );
  });

  it("agrega y sube archivos por camino directo si tamaño <= 16 MiB", async () => {
    const file = new File(["test content"], "doc.txt", { type: "text/plain" });
    vi.mocked(uploadFile).mockResolvedValueOnce({
      id: "f-1",
      originalName: "doc.txt",
      size: 12,
      mimeType: "text/plain",
      extension: "txt",
      url: "/api/v1/files/f-1/content",
      createdAt: "2026-09-10",
    });

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
    expect(ChunkedUploader).not.toHaveBeenCalled();
    expect(result.current.fileIds).toEqual(["f-1"]);
    expect(result.current.isUploading).toBe(false);
  });

  it("utiliza ChunkedUploader para archivos > 16 MiB", async () => {
    const hugeBytes = 20 * 1024 * 1024; // 20 MiB > 16 MiB
    const file = new File([new Uint8Array(hugeBytes)], "huge-video.mp4", { type: "video/mp4" });

    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    act(() => {
      result.current.addFiles([file]);
    });

    expect(ChunkedUploader).toHaveBeenCalledWith(
      expect.objectContaining({
        file,
        token: "attach-token",
        conversationId: "conv-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.attachments[0].status).toBe("done");
    });

    expect(uploadFile).not.toHaveBeenCalled();
    expect(result.current.fileIds).toEqual(["chunked-id-1"]);
    expect(result.current.attachments[0].progress?.percentage).toBe(50);
  });

  it("permite pausar y reanudar adjuntos chunked", async () => {
    const hugeBytes = 25 * 1024 * 1024;
    const file = new File([new Uint8Array(hugeBytes)], "movie.mkv", { type: "video/x-matroska" });

    let capturedOptions: any;
    let mockStartPromiseResolve: any;
    vi.mocked(ChunkedUploader).mockImplementationOnce(function (options: any) {
      capturedOptions = options;
      return {
        start: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            mockStartPromiseResolve = resolve;
          });
        }),
        pause: vi.fn(),
        resume: vi.fn(),
        cancel: vi.fn(),
        getStatus: vi.fn().mockReturnValue("uploading"),
      } as any;
    });

    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    act(() => {
      result.current.addFiles([file]);
    });

    const localId = result.current.attachments[0].localId;

    // Pausar
    act(() => {
      result.current.pauseAttachment(localId);
    });
    expect(result.current.attachments[0].status).toBe("paused");

    // Reanudar
    act(() => {
      result.current.resumeAttachment(localId);
    });
    expect(result.current.attachments[0].status).toBe("uploading");

    // Completar
    act(() => {
      mockStartPromiseResolve?.({
        id: "chunked-done-1",
        originalName: "movie.mkv",
        size: hugeBytes,
        mimeType: "video/x-matroska",
        extension: "mkv",
        url: "/url",
        createdAt: "2026-09-10",
      });
    });

    await waitFor(() => {
      expect(result.current.attachments[0].status).toBe("done");
    });
  });

  it("removeSentAttachments solo retira los adjuntos que fueron enviados (§8.3)", async () => {
    const file1 = new File(["file 1"], "f1.txt", { type: "text/plain" });
    const file2 = new File(["file 2"], "f2.txt", { type: "text/plain" });

    vi.mocked(uploadFile)
      .mockResolvedValueOnce({
        id: "f-1",
        originalName: "f1.txt",
        size: 6,
        mimeType: "text/plain",
        extension: "txt",
        url: "/url/1",
        createdAt: "2026-09-10",
      })
      .mockResolvedValueOnce({
        id: "f-2",
        originalName: "f2.txt",
        size: 6,
        mimeType: "text/plain",
        extension: "txt",
        url: "/url/2",
        createdAt: "2026-09-10",
      });

    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    act(() => {
      result.current.addFiles([file1, file2]);
    });

    await waitFor(() => {
      expect(result.current.attachments.every((a) => a.status === "done")).toBe(true);
    });

    expect(result.current.attachments).toHaveLength(2);

    // Supongamos que se envía un mensaje que solo incluye "f-1"
    act(() => {
      result.current.removeSentAttachments(["f-1"]);
    });

    // "f-1" fue removido, "f-2" sigue en la bandeja
    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0].uploaded?.id).toBe("f-2");
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
    vi.mocked(uploadFile).mockRejectedValueOnce(
      new Error("File exceeds the maximum allowed size of 25MB"),
    );

    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    act(() => {
      result.current.addFiles([file]);
    });

    await waitFor(() => {
      expect(result.current.attachments[0].status).toBe("error");
    });

    expect(result.current.validationErrors).toEqual([
      expect.objectContaining({ reason: { kind: "size-limit" } }),
    ]);
  });

  it("enforces maxFilesPerMessage limit with too-many-files error", () => {
    vi.mocked(usePublicSettings).mockReturnValue(
      createMockPublicSettings({ maxFilesPerMessage: 2 }),
    );
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

  it("detecta sesión reanudable existente para la conversación", () => {
    const mockSessionData: PersistedUploadSession = {
      sessionId: "session-persisted-1",
      conversationId: "conv-1",
      fileName: "large-video.mp4",
      fileSize: 30 * 1024 * 1024,
      fileType: "video/mp4",
      lastModified: 1700000000000,
      createdAt: Date.now() - 5000,
    };
    vi.mocked(getUploadSession).mockReturnValueOnce(mockSessionData);

    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    expect(getUploadSession).toHaveBeenCalledWith("conv-1");
    expect(result.current.resumableSession).toEqual(mockSessionData);
    expect(result.current.resumableMismatchError).toBeNull();
  });

  it("resumeSessionWithFile rechaza archivo que no coincide con la sesión", () => {
    const mockSessionData: PersistedUploadSession = {
      sessionId: "session-persisted-2",
      conversationId: "conv-1",
      fileName: "target.mp4",
      fileSize: 30 * 1024 * 1024,
      fileType: "video/mp4",
      lastModified: 1700000000000,
      createdAt: Date.now() - 5000,
    };
    vi.mocked(getUploadSession).mockReturnValue(mockSessionData);

    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    // Archivo con nombre distinto
    const wrongNameFile = new File([new Uint8Array(30 * 1024 * 1024)], "wrong.mp4", {
      type: "video/mp4",
    });
    Object.defineProperty(wrongNameFile, "lastModified", { value: 1700000000000 });

    let success = false;
    act(() => {
      success = result.current.resumeSessionWithFile(wrongNameFile);
    });

    expect(success).toBe(false);
    expect(result.current.resumableMismatchError).toContain("no coincide");
    expect(result.current.attachments).toHaveLength(0);
    expect(ChunkedUploader).not.toHaveBeenCalled();
  });

  it("resumeSessionWithFile acepta archivo coincidente y arranca ChunkedUploader con existingSessionId", async () => {
    const mockSessionData: PersistedUploadSession = {
      sessionId: "session-persisted-3",
      conversationId: "conv-1",
      fileName: "target.mp4",
      fileSize: 25 * 1024 * 1024,
      fileType: "video/mp4",
      lastModified: 1700000000000,
      createdAt: Date.now() - 5000,
    };
    vi.mocked(getUploadSession).mockReturnValue(mockSessionData);

    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    const matchingFile = new File([new Uint8Array(25 * 1024 * 1024)], "target.mp4", {
      type: "video/mp4",
    });
    Object.defineProperty(matchingFile, "lastModified", { value: 1700000000000 });

    let success = false;
    act(() => {
      success = result.current.resumeSessionWithFile(matchingFile);
    });

    expect(success).toBe(true);
    expect(result.current.resumableSession).toBeNull();
    expect(result.current.resumableMismatchError).toBeNull();
    expect(result.current.attachments).toHaveLength(1);
    expect(ChunkedUploader).toHaveBeenCalledWith(
      expect.objectContaining({
        file: matchingFile,
        token: "attach-token",
        conversationId: "conv-1",
        existingSessionId: "session-persisted-3",
      }),
    );

    await waitFor(() => {
      expect(result.current.attachments[0].status).toBe("done");
    });
  });

  it("discardResumableSession aborta en backend y elimina de persistencia", () => {
    const mockSessionData: PersistedUploadSession = {
      sessionId: "session-to-discard",
      conversationId: "conv-1",
      fileName: "target.mp4",
      fileSize: 25 * 1024 * 1024,
      fileType: "video/mp4",
      lastModified: 1700000000000,
      createdAt: Date.now() - 5000,
    };
    vi.mocked(getUploadSession).mockReturnValue(mockSessionData);

    const { result } = renderHook(() => useMessageAttachments("conv-1"));

    act(() => {
      result.current.discardResumableSession();
    });

    expect(abortUpload).toHaveBeenCalledWith("attach-token", "session-to-discard");
    expect(removeUploadSession).toHaveBeenCalledWith("session-to-discard");
    expect(result.current.resumableSession).toBeNull();
  });
});

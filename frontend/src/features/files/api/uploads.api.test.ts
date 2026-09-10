import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initiateUpload,
  getUploadStatus,
  getPartUrls,
  completeUpload,
  abortUpload,
} from "./uploads.api";
import { apiRequest } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("uploads.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initiateUpload envía POST /v1/uploads con los metadatos requeridos", async () => {
    const mockResponse = {
      uploadSessionId: "session-123",
      partSize: 8 * 1024 * 1024,
      totalParts: 5,
      expiresAt: "2026-09-11T12:00:00.000Z",
    };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockResponse);

    const input = {
      name: "large-video.mp4",
      size: 40 * 1024 * 1024,
      mimeType: "video/mp4",
      conversationId: "conv-456",
    };

    const result = await initiateUpload("token-abc", input);

    expect(result).toEqual(mockResponse);
    expect(apiRequest).toHaveBeenCalledWith("/v1/uploads", {
      method: "POST",
      token: "token-abc",
      body: input,
    });
  });

  it("getUploadStatus solicita el estado por ID de sesión", async () => {
    const mockResponse = {
      id: "session-123",
      status: "UPLOADING",
      originalName: "large-video.mp4",
      declaredSize: 40 * 1024 * 1024,
      partSize: 8 * 1024 * 1024,
      totalParts: 5,
      parts: [{ partNumber: 1, size: 8 * 1024 * 1024, eTag: '"etag-1"' }],
      expiresAt: "2026-09-11T12:00:00.000Z",
    };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockResponse);

    const result = await getUploadStatus("token-abc", "session-123");

    expect(result).toEqual(mockResponse);
    expect(apiRequest).toHaveBeenCalledWith("/v1/uploads/session-123", {
      method: "GET",
      token: "token-abc",
    });
  });

  it("getPartUrls solicita URLs presignadas para las partes indicadas", async () => {
    const mockUrls = [
      { partNumber: 1, url: "https://storage.link/part-1" },
      { partNumber: 2, url: "https://storage.link/part-2" },
    ];
    vi.mocked(apiRequest).mockResolvedValueOnce(mockUrls);

    const result = await getPartUrls("token-abc", "session-123", [1, 2]);

    expect(result).toEqual(mockUrls);
    expect(apiRequest).toHaveBeenCalledWith("/v1/uploads/session-123/part-urls", {
      method: "POST",
      token: "token-abc",
      body: { partNumbers: [1, 2] },
    });
  });

  it("completeUpload envía POST /complete con o sin checksum", async () => {
    const mockStoredFile = {
      id: "stored-789",
      originalName: "large-video.mp4",
      mimeType: "video/mp4",
      extension: "mp4",
      size: 40 * 1024 * 1024,
      url: "/api/v1/files/stored-789/content?t=sig",
      createdAt: "2026-09-10T12:00:00.000Z",
    };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockStoredFile);

    const result = await completeUpload("token-abc", "session-123", { checksum: "hash123" });

    expect(result).toEqual(mockStoredFile);
    expect(apiRequest).toHaveBeenCalledWith("/v1/uploads/session-123/complete", {
      method: "POST",
      token: "token-abc",
      body: { checksum: "hash123" },
    });
  });

  it("abortUpload envía DELETE para cancelar la sesión", async () => {
    const mockResponse = { id: "session-123", status: "ABORTED" };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockResponse);

    const result = await abortUpload("token-abc", "session-123");

    expect(result).toEqual(mockResponse);
    expect(apiRequest).toHaveBeenCalledWith("/v1/uploads/session-123", {
      method: "DELETE",
      token: "token-abc",
    });
  });
});

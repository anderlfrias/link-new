import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadFile, getFile, deleteFile } from "./files.api";
import { apiRequest } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("files.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploadFile envía FormData con el archivo y conversationId opcional", async () => {
    const file = new File(["contenido"], "documento.pdf", { type: "application/pdf" });
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: "file-1" } as any);

    const result = await uploadFile("token-123", file, "conv-1");

    expect(result).toEqual({ id: "file-1" });
    expect(apiRequest).toHaveBeenCalledWith("/v1/files", {
      method: "POST",
      token: "token-123",
      body: expect.any(FormData),
    });

    const calledBody = vi.mocked(apiRequest).mock.calls[0][1]?.body as FormData;
    expect(calledBody.get("file")).toBe(file);
    expect(calledBody.get("conversationId")).toBe("conv-1");
  });

  it("getFile solicita el archivo por id", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: "file-2" } as any);

    const result = await getFile("token-123", "file-2");

    expect(result).toEqual({ id: "file-2" });
    expect(apiRequest).toHaveBeenCalledWith("/v1/files/file-2", {
      token: "token-123",
    });
  });

  it("deleteFile envía DELETE por id", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: "file-3" });

    const result = await deleteFile("token-123", "file-3");

    expect(result).toEqual({ id: "file-3" });
    expect(apiRequest).toHaveBeenCalledWith("/v1/files/file-3", {
      method: "DELETE",
      token: "token-123",
    });
  });
});

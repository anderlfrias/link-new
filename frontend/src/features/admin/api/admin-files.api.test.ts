import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAdminFiles, deleteAdminFile, getAdminFileStats } from "./admin-files.api";
import { apiRequest } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("admin-files.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listAdminFiles sends GET request to /v1/admin/files with token and query", async () => {
    const mockResponse = { files: [], totalCount: 0, totalSize: 0 };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockResponse);

    const query = { type: "image" as const, search: "foto", limit: 20 };
    const result = await listAdminFiles("adm-token", query);

    expect(apiRequest).toHaveBeenCalledWith("/v1/admin/files", {
      token: "adm-token",
      query: {
        before: undefined,
        limit: 20,
        type: "image",
        uploader: undefined,
        from: undefined,
        to: undefined,
        search: "foto",
      },
    });
    expect(result).toBe(mockResponse);
  });

  it("deleteAdminFile sends DELETE request to /v1/admin/files/:fileId", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: "file-99" });

    const result = await deleteAdminFile("adm-token", "file-99");

    expect(apiRequest).toHaveBeenCalledWith("/v1/admin/files/file-99", {
      method: "DELETE",
      token: "adm-token",
    });
    expect(result).toEqual({ id: "file-99" });
  });

  it("getAdminFileStats sends GET request to /v1/admin/files/stats", async () => {
    const mockStats = {
      localCount: 12,
      s3Count: 88,
      totalCount: 100,
      migrationEnabled: true,
      migrationBatchSize: 50,
      migrationIntervalMinutes: 60,
    };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockStats);

    const result = await getAdminFileStats("adm-token");

    expect(apiRequest).toHaveBeenCalledWith("/v1/admin/files/stats", {
      token: "adm-token",
    });
    expect(result).toEqual(mockStats);
  });
});


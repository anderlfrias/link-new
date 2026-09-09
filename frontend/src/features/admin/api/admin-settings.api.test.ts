import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAdminSettings, updateAdminSettings } from "./admin-settings.api";
import { apiRequest } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("admin-settings.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getAdminSettings sends GET request to /v1/admin/settings with token", async () => {
    const mockSettings = { maxUploadSizeMb: 50 };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockSettings);

    const result = await getAdminSettings("token-123");

    expect(apiRequest).toHaveBeenCalledWith("/v1/admin/settings", {
      token: "token-123",
    });
    expect(result).toBe(mockSettings);
  });

  it("updateAdminSettings sends PATCH request to /v1/admin/settings with body and token", async () => {
    const mockSettings = { maxUploadSizeMb: 100 };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockSettings);

    const patch = { maxUploadSizeMb: 100 };
    const result = await updateAdminSettings("token-123", patch);

    expect(apiRequest).toHaveBeenCalledWith("/v1/admin/settings", {
      method: "PATCH",
      token: "token-123",
      body: patch,
    });
    expect(result).toBe(mockSettings);
  });
});

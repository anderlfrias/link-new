import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPublicSettings } from "./public-settings.api";
import { apiRequest } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("public-settings.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getPublicSettings llama a /v1/settings/public con el token", async () => {
    const mockSettings = {
      maxUploadSizeMb: 32,
      chunkedUploads: false,
    };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockSettings);

    const res = await getPublicSettings("test-token");
    expect(apiRequest).toHaveBeenCalledWith("/v1/settings/public", {
      token: "test-token",
    });
    expect(res).toEqual(mockSettings);
  });
});

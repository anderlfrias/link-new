import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchGiphy, getTrendingGiphy, importGiphyAsset } from "./giphy.api";
import { apiRequest } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("giphy.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searchGiphy envía query params con kind, q, limit y offset", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce([{ id: "g-1", title: "funny" }] as any);

    const result = await searchGiphy("tok-1", "gifs", "cats", { limit: 10, offset: 20 });

    expect(result).toEqual([{ id: "g-1", title: "funny" }]);
    expect(apiRequest).toHaveBeenCalledWith("/v1/giphy/search", {
      token: "tok-1",
      query: { kind: "gifs", q: "cats", limit: 10, offset: 20 },
    });
  });

  it("getTrendingGiphy envía kind y limit", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce([{ id: "g-trend" }] as any);

    const result = await getTrendingGiphy("tok-1", "stickers", { limit: 15 });

    expect(result).toEqual([{ id: "g-trend" }]);
    expect(apiRequest).toHaveBeenCalledWith("/v1/giphy/trending", {
      token: "tok-1",
      query: { kind: "stickers", limit: 15 },
    });
  });

  it("importGiphyAsset hace POST con kind, giphyId y originalUrl", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: "file-imported" } as any);

    const result = await importGiphyAsset("tok-1", "gifs", "g-123", "https://giphy.com/orig.gif");

    expect(result).toEqual({ id: "file-imported" });
    expect(apiRequest).toHaveBeenCalledWith("/v1/giphy/import", {
      method: "POST",
      token: "tok-1",
      body: { kind: "gifs", giphyId: "g-123", originalUrl: "https://giphy.com/orig.gif" },
    });
  });
});

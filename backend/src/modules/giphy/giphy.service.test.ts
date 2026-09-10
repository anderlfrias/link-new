import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import env from "../../config/env";
import { storage } from "../../storage";
import { BadRequestError, ForbiddenError, ServiceUnavailableError } from "../../utils/errors";
import * as FileRepository from "../files/file.repository";
import * as SettingsService from "../settings/settings.service";
import { getTrendingGiphy, importGiphyAsset, searchGiphy } from "./giphy.service";

vi.mock("../../storage", () => ({
  storage: {
    save: vi.fn(),
    getPublicUrl: vi.fn((p: string) => `/uploads/${p}`),
  },
}));

vi.mock("../settings/settings.service", () => ({
  getSettings: vi.fn(),
}));

vi.mock("../files/file.repository", () => ({
  createStoredFile: vi.fn(),
}));

describe("giphy.service", () => {
  const originalFetch = global.fetch;
  const originalGiphyApiKey = env.GIPHY_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    env.GIPHY_API_KEY = "test-giphy-api-key";
    vi.mocked(SettingsService.getSettings).mockResolvedValue({
      allowStickersAndGifs: true,
      maxUploadSizeMb: 10,
    } as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    env.GIPHY_API_KEY = originalGiphyApiKey;
    vi.unstubAllGlobals();
  });

  describe("feature disabled invariant", () => {
    it("throws ForbiddenError when allowStickersAndGifs is false in settings", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        allowStickersAndGifs: false,
      } as any);

      await expect(searchGiphy("gifs", "cats")).rejects.toThrow(ForbiddenError);
      await expect(getTrendingGiphy("gifs")).rejects.toThrow(ForbiddenError);
      await expect(
        importGiphyAsset("u-1", "gifs", "123", "https://media.giphy.com/media/123/giphy.gif"),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("configuration invariant", () => {
    it("throws ServiceUnavailableError when GIPHY_API_KEY is not configured", async () => {
      env.GIPHY_API_KEY = undefined as any;

      await expect(searchGiphy("gifs", "cats")).rejects.toThrow(
        new ServiceUnavailableError("GIFs and stickers are not configured on this server"),
      );
      await expect(getTrendingGiphy("stickers")).rejects.toThrow(
        new ServiceUnavailableError("GIFs and stickers are not configured on this server"),
      );
    });
  });

  describe("searchGiphy", () => {
    it("calls Giphy search endpoint with clamped limit and maps valid search results", async () => {
      const mockGiphyResponse = {
        data: [
          {
            id: "gif-1",
            title: "Cat Jumping",
            images: {
              fixed_width: { url: "https://media.giphy.com/preview.gif", width: "200", height: "150" },
              original: { url: "https://media.giphy.com/original.gif" },
            },
          },
          // Missing preview should be filtered out
          {
            id: "gif-incomplete",
            title: "Incomplete",
            images: {},
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockGiphyResponse,
      });
      vi.stubGlobal("fetch", mockFetch);

      const results = await searchGiphy("gifs", "cats", { limit: 100, offset: 10 });

      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("https://api.giphy.com/v1/gifs/search");
      expect(callUrl).toContain("q=cats");
      expect(callUrl).toContain("limit=50"); // clamped from 100 to MAX_SEARCH_LIMIT (50)
      expect(callUrl).toContain("offset=10");
      expect(callUrl).toContain("api_key=test-giphy-api-key");

      expect(results).toEqual([
        {
          id: "gif-1",
          title: "Cat Jumping",
          previewUrl: "https://media.giphy.com/preview.gif",
          originalUrl: "https://media.giphy.com/original.gif",
          width: 200,
          height: 150,
        },
      ]);
    });

    it("throws ServiceUnavailableError when Giphy responds with HTTP error", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        clone: () => ({
          json: async () => ({ meta: { msg: "Invalid authentication credentials" } }),
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(searchGiphy("gifs", "cats")).rejects.toThrow(
        /Giphy returned HTTP 403/i,
      );
    });

    it("throws ServiceUnavailableError when network fetch fails", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
      vi.stubGlobal("fetch", mockFetch);

      await expect(searchGiphy("stickers", "dance")).rejects.toThrow(
        new ServiceUnavailableError("Could not reach Giphy"),
      );
    });
  });

  describe("getTrendingGiphy", () => {
    it("calls Giphy trending endpoint and maps results", async () => {
      const mockGiphyResponse = {
        data: [
          {
            id: "sticker-1",
            title: "Trending Sticker",
            images: {
              fixed_width: { url: "https://media.giphy.com/stk-preview.webp", width: "100", height: "100" },
              original: { url: "https://media.giphy.com/stk-original.webp" },
            },
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockGiphyResponse,
      });
      vi.stubGlobal("fetch", mockFetch);

      const results = await getTrendingGiphy("stickers");

      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain("https://api.giphy.com/v1/stickers/trending");
      expect(callUrl).toContain("limit=24"); // default limit
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("sticker-1");
    });
  });

  describe("importGiphyAsset - SSRF & security host validation invariant", () => {
    it("rejects non-https URLs", async () => {
      await expect(
        importGiphyAsset("u-1", "gifs", "123", "http://media0.giphy.com/media/123/giphy.gif"),
      ).rejects.toThrow(
        new BadRequestError("originalUrl must be an https URL on a giphy.com host"),
      );
    });

    it("rejects external non-giphy domains", async () => {
      await expect(
        importGiphyAsset("u-1", "gifs", "123", "https://attacker.com/malicious.gif"),
      ).rejects.toThrow(
        new BadRequestError("originalUrl must be an https URL on a giphy.com host"),
      );
    });

    it("rejects domain spoofing and subdomains of attacker domains", async () => {
      await expect(
        importGiphyAsset("u-1", "gifs", "123", "https://media.giphy.com.attacker.com/fake.gif"),
      ).rejects.toThrow(
        new BadRequestError("originalUrl must be an https URL on a giphy.com host"),
      );

      await expect(
        importGiphyAsset("u-1", "gifs", "123", "https://notgiphy.com/fake.gif"),
      ).rejects.toThrow(
        new BadRequestError("originalUrl must be an https URL on a giphy.com host"),
      );
    });

    it("rejects invalid or malformed URL strings", async () => {
      await expect(
        importGiphyAsset("u-1", "gifs", "123", "invalid-url"),
      ).rejects.toThrow(
        new BadRequestError("originalUrl must be an https URL on a giphy.com host"),
      );
    });

    it("rejects downloaded assets that do not have an image/* content-type", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "application/octet-stream" }),
        arrayBuffer: async () => Buffer.from("not-an-image"),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        importGiphyAsset("u-1", "gifs", "123", "https://media0.giphy.com/media/123/giphy.gif"),
      ).rejects.toThrow(new BadRequestError("Unexpected Giphy asset content type"));
    });

    it("rejects downloaded assets that exceed maxUploadSizeMb", async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({
        allowStickersAndGifs: true,
        maxUploadSizeMb: 1, // 1 MB limit
      } as any);

      const oversizedBuffer = Buffer.alloc(2 * 1024 * 1024); // 2 MB
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "image/gif" }),
        arrayBuffer: async () => oversizedBuffer,
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        importGiphyAsset("u-1", "gifs", "123", "https://media0.giphy.com/media/123/giphy.gif"),
      ).rejects.toThrow(/File exceeds the maximum allowed size of 1MB/);
    });

    it("throws ServiceUnavailableError when asset download fails or network errors", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Timeout downloading"));
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        importGiphyAsset("u-1", "gifs", "123", "https://media0.giphy.com/media/123/giphy.gif"),
      ).rejects.toThrow(
        new ServiceUnavailableError("Could not download the selected Giphy asset"),
      );
    });

    it("throws ServiceUnavailableError when asset download HTTP status is not ok", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        importGiphyAsset("u-1", "gifs", "123", "https://media0.giphy.com/media/123/giphy.gif"),
      ).rejects.toThrow(
        new ServiceUnavailableError("Could not download the selected Giphy asset"),
      );
    });

    it("successfully downloads, stores, and saves gif asset from genuine giphy CDN", async () => {
      const gifBuffer = Buffer.from("GIF89a...");
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "image/gif; charset=utf-8" }),
        arrayBuffer: async () => gifBuffer,
      });
      vi.stubGlobal("fetch", mockFetch);

      vi.mocked(storage.save).mockResolvedValue({
        path: "giphy/gifs/2026/09/mock-saved.gif",
        size: gifBuffer.length,
      });

      const mockStoredFile = {
        id: "file-giphy-1",
        originalName: "gif-123.gif",
        storedName: "mock-uuid.gif",
        path: "giphy/gifs/2026/09/mock-saved.gif",
        mimeType: "image/gif",
        extension: "gif",
        size: gifBuffer.length,
        checksum: "mock-sha256",
        createdById: "u-1",
        deletedAt: null,
        deletedById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(FileRepository.createStoredFile).mockResolvedValue(mockStoredFile as any);

      const result = await importGiphyAsset(
        "u-1",
        "gifs",
        "123",
        "https://media4.giphy.com/media/123/giphy.gif",
      );

      expect(storage.save).toHaveBeenCalledWith(gifBuffer, expect.stringMatching(/^giphy\/gifs\/\d{4}\/\d{2}\/.*\.gif$/));
      expect(FileRepository.createStoredFile).toHaveBeenCalledWith(
        expect.objectContaining({
          originalName: "gif-123.gif",
          mimeType: "image/gif",
          extension: "gif",
          createdById: "u-1",
          // FileRepository.createStoredFile espera bigint (StoredFile.size
          // en Prisma) — importGiphyAsset debe convertir el number de storage.save().
          size: BigInt(gifBuffer.length),
        }),
      );
      expect(result.id).toBe("file-giphy-1");
      expect(result.originalName).toBe("gif-123.gif");
    });
  });
});

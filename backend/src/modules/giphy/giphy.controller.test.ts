import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError } from "../../utils/errors";
import { createMockNext, createMockRequest, createMockResponse } from "../../test/http-mocks";
import * as GiphyController from "./giphy.controller";
import * as GiphyService from "./giphy.service";

vi.mock("./giphy.service", () => ({
  searchGiphy: vi.fn(),
  getTrendingGiphy: vi.fn(),
  importGiphyAsset: vi.fn(),
}));

describe("giphy.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("search", () => {
    it("calls searchGiphy with valid kind and query, returning results", async () => {
      const mockResults = [{ id: "1", title: "dance" }];
      vi.mocked(GiphyService.searchGiphy).mockResolvedValue(mockResults as any);

      const req = createMockRequest({
        query: { kind: "gifs", q: "happy", limit: "15", offset: "30" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await GiphyController.search(req, res, next);

      expect(GiphyService.searchGiphy).toHaveBeenCalledWith("gifs", "happy", {
        limit: 15,
        offset: 30,
      });
      expect(res.json).toHaveBeenCalledWith(mockResults);
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects invalid kind with BadRequestError", async () => {
      const req = createMockRequest({
        query: { kind: "invalid-kind", q: "happy" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await GiphyController.search(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it("rejects missing or empty query q with BadRequestError", async () => {
      const req = createMockRequest({
        query: { kind: "gifs", q: "   " },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await GiphyController.search(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it("forwards service error to next", async () => {
      const error = new Error("Service error");
      vi.mocked(GiphyService.searchGiphy).mockRejectedValue(error);

      const req = createMockRequest({
        query: { kind: "gifs", q: "fail" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await GiphyController.search(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe("trending", () => {
    it("calls getTrendingGiphy with valid kind and responds with results", async () => {
      const mockResults = [{ id: "stk-1", title: "sticker" }];
      vi.mocked(GiphyService.getTrendingGiphy).mockResolvedValue(mockResults as any);

      const req = createMockRequest({
        query: { kind: "stickers", limit: "20" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await GiphyController.trending(req, res, next);

      expect(GiphyService.getTrendingGiphy).toHaveBeenCalledWith("stickers", { limit: 20 });
      expect(res.json).toHaveBeenCalledWith(mockResults);
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects invalid kind in trending with BadRequestError", async () => {
      const req = createMockRequest({
        query: { kind: "audio" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await GiphyController.trending(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it("forwards service error to next in trending", async () => {
      const error = new Error("Giphy down");
      vi.mocked(GiphyService.getTrendingGiphy).mockRejectedValue(error);

      const req = createMockRequest({
        query: { kind: "gifs" },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await GiphyController.trending(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe("importAsset", () => {
    it("calls importGiphyAsset with current user and body params, responding 201", async () => {
      const mockFile = { id: "stored-f-1", url: "/uploads/giphy/1.gif" };
      vi.mocked(GiphyService.importGiphyAsset).mockResolvedValue(mockFile as any);

      const req = createMockRequest({
        user: { internalUserId: "u-internal-1" } as any,
        body: {
          kind: "gifs",
          giphyId: "g-123",
          originalUrl: "https://media.giphy.com/g-123.gif",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await GiphyController.importAsset(req, res, next);

      expect(GiphyService.importGiphyAsset).toHaveBeenCalledWith(
        "u-internal-1",
        "gifs",
        "g-123",
        "https://media.giphy.com/g-123.gif",
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockFile);
      expect(next).not.toHaveBeenCalled();
    });

    it("forwards service error to next in importAsset", async () => {
      const error = new Error("Import failed");
      vi.mocked(GiphyService.importGiphyAsset).mockRejectedValue(error);

      const req = createMockRequest({
        user: { internalUserId: "u-internal-1" } as any,
        body: {
          kind: "stickers",
          giphyId: "s-123",
          originalUrl: "https://media.giphy.com/s-123.webp",
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await GiphyController.importAsset(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});

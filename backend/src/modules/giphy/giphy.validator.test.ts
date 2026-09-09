import { describe, expect, it } from "vitest";
import { importGiphyAssetSchema } from "./giphy.validator";

describe("giphy.validator", () => {
  describe("importGiphyAssetSchema", () => {
    it("validates valid payload for gifs", async () => {
      const payload = {
        kind: "gifs",
        giphyId: "abc123xyz",
        originalUrl: "https://media.giphy.com/media/abc123xyz/giphy.gif",
      };

      const result = await importGiphyAssetSchema.validate(payload);
      expect(result).toMatchObject(payload);
    });

    it("validates valid payload for stickers", async () => {
      const payload = {
        kind: "stickers",
        giphyId: "sticker456",
        originalUrl: "https://media0.giphy.com/media/sticker456/200.webp",
      };

      const result = await importGiphyAssetSchema.validate(payload);
      expect(result).toMatchObject(payload);
    });

    it("rejects invalid kind", async () => {
      await expect(
        importGiphyAssetSchema.validate({
          kind: "clips",
          giphyId: "123",
          originalUrl: "https://media.giphy.com/media/123/giphy.gif",
        }),
      ).rejects.toThrow();
    });

    it("rejects invalid URL format for originalUrl", async () => {
      await expect(
        importGiphyAssetSchema.validate({
          kind: "gifs",
          giphyId: "123",
          originalUrl: "not-a-valid-url",
        }),
      ).rejects.toThrow();
    });

    it("rejects missing required fields", async () => {
      await expect(
        importGiphyAssetSchema.validate({
          kind: "gifs",
          originalUrl: "https://media.giphy.com/media/123/giphy.gif",
        }),
      ).rejects.toThrow();

      await expect(
        importGiphyAssetSchema.validate({
          giphyId: "123",
          originalUrl: "https://media.giphy.com/media/123/giphy.gif",
        }),
      ).rejects.toThrow();
    });
  });
});

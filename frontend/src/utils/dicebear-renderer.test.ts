import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderDiceBearDataUri,
  renderDiceBearSvg,
  svgStringToPngBlob,
} from "./dicebear-renderer";

vi.mock("@dicebear/core", () => ({
  createAvatar: vi.fn((_style, options) => ({
    toString: () => `<svg data-seed="${options.seed}"></svg>`,
    toDataUri: () => `data:image/svg+xml;utf8,<svg data-seed="${options.seed}"></svg>`,
  })),
}));

describe("dicebear-renderer", () => {
  const dummyStyle: any = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("renderDiceBearSvg", () => {
    it("returns SVG string generated with provided seed and options", () => {
      const svg = renderDiceBearSvg(dummyStyle, {
        seed: "user-123",
        backgroundColor: "#ff0000",
        size: 128,
      });

      expect(svg).toContain('<svg data-seed="user-123"></svg>');
    });
  });

  describe("renderDiceBearDataUri", () => {
    it("returns data URI string generated with provided seed", () => {
      const dataUri = renderDiceBearDataUri(dummyStyle, {
        seed: "user-456",
      });

      expect(dataUri).toContain("data:image/svg+xml");
      expect(dataUri).toContain("user-456");
    });
  });

  describe("svgStringToPngBlob", () => {
    it("rasterizes SVG string to PNG Blob using Canvas", async () => {
      window.URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-svg");
      window.URL.revokeObjectURL = vi.fn();

      const mockPngBlob = new Blob([new Uint8Array(100)], { type: "image/png" });

      // Mock Image
      class MockImage {
        onload: () => void = () => {};
        onerror: () => void = () => {};
        set src(_val: string) {
          setTimeout(() => this.onload(), 0);
        }
      }
      vi.stubGlobal("Image", MockImage);

      // Mock Canvas
      const mockContext = {
        clearRect: vi.fn(),
        drawImage: vi.fn(),
      };
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockContext as any);
      vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback: any) => {
        callback(mockPngBlob);
      });

      const blob = await svgStringToPngBlob("<svg></svg>", 256);

      expect(blob).toBe(mockPngBlob);
      expect(mockContext.drawImage).toHaveBeenCalled();
      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/mock-svg");
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { compressImage, IMAGE_COMPRESSION_PRESETS } from "./compress-image";

describe("compress-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports avatar and message presets with expected dimensions and qualities", () => {
    expect(IMAGE_COMPRESSION_PRESETS.avatar).toEqual({ maxDimension: 512, quality: 0.85 });
    expect(IMAGE_COMPRESSION_PRESETS.message).toEqual({ maxDimension: 1920, quality: 0.8 });
  });

  it("returns original file untouched for GIF, SVG, and non-image files", async () => {
    const gifFile = new File(["gif content"], "cat.gif", { type: "image/gif" });
    const resGif = await compressImage(gifFile, "cat.gif", IMAGE_COMPRESSION_PRESETS.avatar);
    expect(resGif).toBe(gifFile);

    const svgFile = new File(["<svg></svg>"], "icon.svg", { type: "image/svg+xml" });
    const resSvg = await compressImage(svgFile, "icon.svg", IMAGE_COMPRESSION_PRESETS.avatar);
    expect(resSvg).toBe(svgFile);

    const pdfFile = new File(["pdf content"], "doc.pdf", { type: "application/pdf" });
    const resPdf = await compressImage(pdfFile, "doc.pdf", IMAGE_COMPRESSION_PRESETS.message);
    expect(resPdf).toBe(pdfFile);
  });

  it("compresses JPEG image to WebP when compressed size is smaller", async () => {
    const originalFile = new File([new Uint8Array(1000)], "photo.jpg", { type: "image/jpeg" });

    const mockBitmap = {
      width: 1024,
      height: 768,
      close: vi.fn(),
    };
    window.createImageBitmap = vi.fn().mockResolvedValue(mockBitmap);

    const mockCompressedBlob = new Blob([new Uint8Array(500)], { type: "image/webp" });

    const mockContext = {
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockContext as any);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback: any) => {
      callback(mockCompressedBlob);
    });

    const result = await compressImage(originalFile, "photo.jpg", IMAGE_COMPRESSION_PRESETS.avatar);

    expect(window.createImageBitmap).toHaveBeenCalledWith(originalFile);
    expect(mockBitmap.close).toHaveBeenCalled();
    expect(result.name).toBe("photo.webp");
    expect(result.type).toBe("image/webp");
  });

  it("returns original file if compression result is larger than original", async () => {
    const originalFile = new File([new Uint8Array(200)], "small.png", { type: "image/png" });

    const mockBitmap = {
      width: 100,
      height: 100,
      close: vi.fn(),
    };
    window.createImageBitmap = vi.fn().mockResolvedValue(mockBitmap);

    // Compressed blob larger than original (e.g. 500 > 200)
    const mockCompressedBlob = new Blob([new Uint8Array(500)], { type: "image/webp" });

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as any);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback: any) => {
      callback(mockCompressedBlob);
    });

    const result = await compressImage(originalFile, "small.png", IMAGE_COMPRESSION_PRESETS.avatar);
    expect(result).toBe(originalFile);
  });

  it("returns original file when createImageBitmap throws an error", async () => {
    const originalFile = new File(["data"], "corrupted.jpg", { type: "image/jpeg" });
    window.createImageBitmap = vi.fn().mockRejectedValue(new Error("Unsupported format"));

    const result = await compressImage(originalFile, "corrupted.jpg", IMAGE_COMPRESSION_PRESETS.avatar);
    expect(result).toBe(originalFile);
  });
});

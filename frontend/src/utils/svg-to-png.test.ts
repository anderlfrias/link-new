import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { svgElementToPngBlob } from "./svg-to-png";

describe("svg-to-png", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rasterizes SVGSVGElement to PNG Blob", async () => {
    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-svg-elem");
    window.URL.revokeObjectURL = vi.fn();

    const mockPngBlob = new Blob([new Uint8Array(200)], { type: "image/png" });

    class MockImage {
      onload: () => void = () => {};
      onerror: () => void = () => {};
      set src(_val: string) {
        setTimeout(() => this.onload(), 0);
      }
    }
    vi.stubGlobal("Image", MockImage);

    const mockContext = {
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockContext as any);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback: any) => {
      callback(mockPngBlob);
    });

    const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgElement.setAttribute("width", "100");
    svgElement.setAttribute("height", "100");

    const result = await svgElementToPngBlob(svgElement, 128);

    expect(result).toBe(mockPngBlob);
    expect(mockContext.drawImage).toHaveBeenCalled();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/mock-svg-elem");
  });
});

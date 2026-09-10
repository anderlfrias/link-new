import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDownloadUrl, downloadFile } from "./download-file";

describe("download-file", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    window.open = vi.fn();
    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-blob");
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("buildDownloadUrl agrega download=1 a endpoints de /files/:id/content", () => {
    expect(
      buildDownloadUrl("http://localhost:4000/api/v1/files/f-1/content?t=token"),
    ).toBe("http://localhost:4000/api/v1/files/f-1/content?t=token&download=1");

    expect(
      buildDownloadUrl("http://localhost:4000/api/v1/files/f-1/content"),
    ).toBe("http://localhost:4000/api/v1/files/f-1/content?download=1");

    expect(buildDownloadUrl("http://external.com/photo.jpg")).toBe(
      "http://external.com/photo.jpg",
    );
  });

  it("descarga nativa sin bufferizar en memoria para archivos de la API (/files/:id/content)", async () => {
    global.fetch = vi.fn();
    let clickedHref = "";
    let clickedDownload = "";
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedHref = this.href;
      clickedDownload = this.download;
    });

    await downloadFile("http://localhost:4000/api/v1/files/f-1/content?t=token", "archivo.pdf");

    // No debe haber llamado a fetch (sin buffering en RAM)
    expect(global.fetch).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(clickedHref).toBe("http://localhost:4000/api/v1/files/f-1/content?t=token&download=1");
    expect(clickedDownload).toBe("archivo.pdf");
    expect(window.open).not.toHaveBeenCalled();

    clickSpy.mockRestore();
  });

  it("downloads external file via blob and anchor click when fetch succeeds", async () => {
    const mockBlob = new Blob(["content"], { type: "application/pdf" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => mockBlob,
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadFile("http://example.com/external.pdf", "manual.pdf");

    expect(global.fetch).toHaveBeenCalledWith("http://example.com/external.pdf");
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    expect(clickSpy).toHaveBeenCalled();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/mock-blob");
    expect(window.open).not.toHaveBeenCalled();

    clickSpy.mockRestore();
  });

  it("falls back to window.open when external fetch fails or errors", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("CORS/Network error"));

    await downloadFile("http://example.com/external.pdf", "manual.pdf");

    expect(window.open).toHaveBeenCalledWith(
      "http://example.com/external.pdf",
      "_blank",
      "noopener,noreferrer",
    );
  });
});

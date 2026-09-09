import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "./download-file";

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

  it("downloads file via blob and anchor click when fetch succeeds", async () => {
    const mockBlob = new Blob(["content"], { type: "application/pdf" });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => mockBlob,
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadFile("http://localhost:4000/uploads/doc.pdf", "manual.pdf");

    expect(global.fetch).toHaveBeenCalledWith("http://localhost:4000/uploads/doc.pdf");
    expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    expect(clickSpy).toHaveBeenCalled();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/mock-blob");
    expect(window.open).not.toHaveBeenCalled();

    clickSpy.mockRestore();
  });

  it("falls back to window.open when fetch fails or errors", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("CORS/Network error"));

    await downloadFile("http://localhost:4000/uploads/doc.pdf", "manual.pdf");

    expect(window.open).toHaveBeenCalledWith(
      "http://localhost:4000/uploads/doc.pdf",
      "_blank",
      "noopener,noreferrer",
    );
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { copyTextToClipboard, copyImageToClipboard, convertImageBlobToPng, extractImageFilesFromClipboard } from "./clipboard";

describe("clipboard utils", () => {
  const originalClipboard = navigator.clipboard;
  const originalClipboardItem = (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem = originalClipboardItem;
    globalThis.fetch = originalFetch;
  });

  describe("copyTextToClipboard", () => {
    it("devuelve false si el texto está vacío", async () => {
      const result = await copyTextToClipboard("");
      expect(result).toBe(false);
    });

    it("usa navigator.clipboard.writeText si está disponible", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        configurable: true,
        writable: true,
      });

      const result = await copyTextToClipboard("Hola mundo");
      expect(result).toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith("Hola mundo");
    });

    it("usa document.execCommand('copy') como fallback si writeText falla", async () => {
      const writeTextMock = vi.fn().mockRejectedValue(new Error("Permiso denegado"));
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextMock },
        configurable: true,
        writable: true,
      });

      const execCommandMock = vi.fn().mockReturnValue(true);
      document.execCommand = execCommandMock;

      const result = await copyTextToClipboard("Texto de prueba fallback");
      expect(result).toBe(true);
      expect(execCommandMock).toHaveBeenCalledWith("copy");
    });
  });

  describe("convertImageBlobToPng", () => {
    it("retorna el mismo blob directamente si ya es image/png", async () => {
      const pngBlob = new Blob(["fake png"], { type: "image/png" });
      const result = await convertImageBlobToPng(pngBlob);
      expect(result).toBe(pngBlob);
      expect(result.type).toBe("image/png");
    });

    it("convierte un blob que no sea PNG usando canvas si createImageBitmap está disponible", async () => {
      const webpBlob = new Blob(["fake webp"], { type: "image/webp" });

      const mockBitmap = {
        width: 100,
        height: 80,
        close: vi.fn(),
      };
      (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap = vi.fn().mockResolvedValue(mockBitmap);

      const mockPngBlob = new Blob(["converted png"], { type: "image/png" });
      const mockCtx = {
        drawImage: vi.fn(),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue(mockCtx),
        toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
          callback(mockPngBlob);
        }),
      };

      vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
        if (tagName === "canvas") return mockCanvas as unknown as HTMLElement;
        return document.createElement(tagName);
      });

      const result = await convertImageBlobToPng(webpBlob);
      expect(result).toBe(mockPngBlob);
      expect(mockCtx.drawImage).toHaveBeenCalledWith(mockBitmap, 0, 0);
      expect(mockBitmap.close).toHaveBeenCalled();
    });
  });

  describe("copyImageToClipboard", () => {
    it("devuelve false si no se proporciona URL", async () => {
      const result = await copyImageToClipboard("");
      expect(result).toBe(false);
    });

    it("descarga la imagen, la convierte a PNG y escribe a navigator.clipboard.write", async () => {
      const pngBlob = new Blob(["image data"], { type: "image/png" });
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(pngBlob),
      } as unknown as Response);

      const writeMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { write: writeMock },
        configurable: true,
        writable: true,
      });

      class MockClipboardItem {
        types: string[];
        data: Record<string, Blob>;
        constructor(items: Record<string, Blob>) {
          this.data = items;
          this.types = Object.keys(items);
        }
      }
      (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem = MockClipboardItem;

      const result = await copyImageToClipboard("http://localhost:3000/uploads/test.png");
      expect(result).toBe(true);
      expect(writeMock).toHaveBeenCalledTimes(1);
      const writtenItems = writeMock.mock.calls[0][0];
      expect(writtenItems[0]).toBeInstanceOf(MockClipboardItem);
      expect(writtenItems[0].types).toContain("image/png");
    });

    it("devuelve false y captura el error si la llamada a fetch falla", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      const result = await copyImageToClipboard("http://localhost:3000/uploads/notfound.png");
      expect(result).toBe(false);
    });
  });

  describe("extractImageFilesFromClipboard", () => {
    it("devuelve array vacío si clipboardData es null o undefined", () => {
      expect(extractImageFilesFromClipboard(null)).toEqual([]);
      expect(extractImageFilesFromClipboard(undefined as unknown as DataTransfer)).toEqual([]);
    });

    it("devuelve array vacío si los datos son solo de texto", () => {
      const mockClipboardData = {
        items: [
          {
            kind: "string",
            type: "text/plain",
            getAsFile: () => null,
          },
          {
            kind: "string",
            type: "text/html",
            getAsFile: () => null,
          },
        ],
        files: [],
      } as unknown as DataTransfer;

      const result = extractImageFilesFromClipboard(mockClipboardData);
      expect(result).toEqual([]);
    });

    it("extrae archivos de imagen a partir de clipboardData.items y normaliza el nombre", () => {
      const mockPngFile = new File(["fake png data"], "captura.png", { type: "image/png" });
      const mockClipboardData = {
        items: [
          {
            kind: "file",
            type: "image/png",
            getAsFile: () => mockPngFile,
          },
        ],
        files: [],
      } as unknown as DataTransfer;

      const result = extractImageFilesFromClipboard(mockClipboardData);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("captura.png");
      expect(result[0].type).toBe("image/png");
    });

    it("asigna extensión adecuada si el archivo de items viene con nombre 'blob' o sin extensión", () => {
      const blobFile = new File(["fake data"], "blob", { type: "image/jpeg" });
      const mockClipboardData = {
        items: [
          {
            kind: "file",
            type: "image/jpeg",
            getAsFile: () => blobFile,
          },
        ],
        files: [],
      } as unknown as DataTransfer;

      const result = extractImageFilesFromClipboard(mockClipboardData);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("imagen.jpg");
      expect(result[0].type).toBe("image/jpeg");
    });

    it("extrae imágenes desde clipboardData.files como fallback si items no tiene imágenes", () => {
      const mockJpgFile = new File(["fake jpg"], "foto.jpg", { type: "image/jpeg" });
      const mockPdfFile = new File(["fake pdf"], "documento.pdf", { type: "application/pdf" });

      const mockClipboardData = {
        items: [],
        files: [mockPdfFile, mockJpgFile],
      } as unknown as DataTransfer;

      const result = extractImageFilesFromClipboard(mockClipboardData);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("foto.jpg");
      expect(result[0].type).toBe("image/jpeg");
    });
  });
});


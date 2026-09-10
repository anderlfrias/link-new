import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChunkedUploader } from "./chunked-uploader";
import type { UploadedFile } from "@/features/files/types/file.types";

interface MockXhrInstance {
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  status: number;
  upload: {
    onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  onabort: (() => void) | null;
  sentBlob?: Blob;
  requestUrl?: string;
}

function createMockXhrFactory(instances: MockXhrInstance[] = []) {
  return () => {
    const xhr: MockXhrInstance = {
      open: vi.fn((_method: string, url: string) => {
        xhr.requestUrl = url;
      }),
      send: vi.fn((blob: Blob) => {
        xhr.sentBlob = blob;
      }),
      abort: vi.fn(() => {
        if (xhr.onabort) xhr.onabort();
      }),
      setRequestHeader: vi.fn(),
      status: 200,
      upload: {
        onprogress: null,
      },
      onload: null,
      onerror: null,
      ontimeout: null,
      onabort: null,
    };
    instances.push(xhr);
    return xhr as unknown as XMLHttpRequest;
  };
}

describe("ChunkedUploader", () => {
  let mockApi: any;
  const mockStoredFile: UploadedFile = {
    id: "stored-123",
    originalName: "bigfile.dat",
    mimeType: "application/octet-stream",
    extension: "dat",
    size: 20 * 1024 * 1024,
    url: "/api/v1/files/stored-123/content?t=sig",
    createdAt: "2026-09-10T12:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      initiateUpload: vi.fn().mockResolvedValue({
        uploadSessionId: "session-abc",
        partSize: 8 * 1024 * 1024,
        totalParts: 3,
        expiresAt: "2026-09-11T12:00:00.000Z",
      }),
      getPartUrls: vi.fn().mockImplementation((_token, _id, partNumbers: number[]) => {
        return Promise.resolve(
          partNumbers.map((p) => ({ partNumber: p, url: `https://storage.link/part-${p}` })),
        );
      }),
      completeUpload: vi.fn().mockResolvedValue(mockStoredFile),
      abortUpload: vi.fn().mockResolvedValue({ id: "session-abc", status: "ABORTED" }),
      getUploadStatus: vi.fn().mockResolvedValue({
        id: "session-abc",
        status: "UPLOADING",
        parts: [],
      }),
    };
  });

  it("particiona exactamente el archivo, incluyendo la última parte parcial", async () => {
    const totalBytes = 20 * 1024 * 1024; // 20 MiB -> partes: 8 MiB, 8 MiB, 4 MiB
    const file = new File([new Uint8Array(totalBytes)], "test.dat");

    const xhrInstances: MockXhrInstance[] = [];
    const createXhr = createMockXhrFactory(xhrInstances);

    const uploader = new ChunkedUploader({
      file,
      token: "test-token",
      api: mockApi,
      createXhr,
      concurrency: 1, // Concurrencia 1 para procesar en orden
    });

    const uploadPromise = uploader.start();

    // Esperar a que se inicie y se dispare la primera parte
    await vi.waitFor(() => expect(xhrInstances.length).toBe(1));

    // Parte 1 (8 MiB)
    expect(xhrInstances[0].sentBlob?.size).toBe(8 * 1024 * 1024);
    expect(xhrInstances[0].requestUrl).toBe("https://storage.link/part-1");
    xhrInstances[0].status = 200;
    xhrInstances[0].onload?.();

    // Esperar Parte 2 (8 MiB)
    await vi.waitFor(() => expect(xhrInstances.length).toBe(2));
    expect(xhrInstances[1].sentBlob?.size).toBe(8 * 1024 * 1024);
    expect(xhrInstances[1].requestUrl).toBe("https://storage.link/part-2");
    xhrInstances[1].status = 200;
    xhrInstances[1].onload?.();

    // Esperar Parte 3 (4 MiB residual)
    await vi.waitFor(() => expect(xhrInstances.length).toBe(3));
    expect(xhrInstances[2].sentBlob?.size).toBe(4 * 1024 * 1024);
    expect(xhrInstances[2].requestUrl).toBe("https://storage.link/part-3");
    xhrInstances[2].status = 200;
    xhrInstances[2].onload?.();

    const result = await uploadPromise;
    expect(result).toEqual(mockStoredFile);
    expect(mockApi.completeUpload).toHaveBeenCalledWith("test-token", "session-abc");
    expect(uploader.getStatus()).toBe("done");
  });

  it("respeta la concurrencia máxima de 4 partes en paralelo", async () => {
    const totalBytes = 80 * 1024 * 1024; // 10 partes de 8 MiB
    const file = new File([new Uint8Array(totalBytes)], "large.dat");

    mockApi.initiateUpload.mockResolvedValueOnce({
      uploadSessionId: "session-10-parts",
      partSize: 8 * 1024 * 1024,
      totalParts: 10,
      expiresAt: "2026-09-11T12:00:00.000Z",
    });

    const xhrInstances: MockXhrInstance[] = [];
    const createXhr = createMockXhrFactory(xhrInstances);

    const uploader = new ChunkedUploader({
      file,
      token: "test-token",
      api: mockApi,
      createXhr,
      concurrency: 4,
    });

    void uploader.start();

    // Esperar a que se lancen los workers
    await vi.waitFor(() => expect(xhrInstances.length).toBe(4));

    // Verificar que nunca se abran más de 4 antes de que complete alguna
    expect(xhrInstances.length).toBe(4);

    // Completar la parte 1
    xhrInstances[0].status = 200;
    xhrInstances[0].onload?.();

    // Ahora debería haberse lanzado la 5ta parte
    await vi.waitFor(() => expect(xhrInstances.length).toBe(5));
  });

  it("maneja re-presign inmediato cuando una parte responde 403 (URL expirada)", async () => {
    const file = new File([new Uint8Array(8 * 1024 * 1024)], "single.dat");
    mockApi.initiateUpload.mockResolvedValueOnce({
      uploadSessionId: "session-403",
      partSize: 8 * 1024 * 1024,
      totalParts: 1,
      expiresAt: "2026-09-11T12:00:00.000Z",
    });

    const xhrInstances: MockXhrInstance[] = [];
    const createXhr = createMockXhrFactory(xhrInstances);

    const uploader = new ChunkedUploader({
      file,
      token: "test-token",
      api: mockApi,
      createXhr,
      baseRetryDelayMs: 10,
    });

    void uploader.start();

    await vi.waitFor(() => expect(xhrInstances.length).toBe(1));

    // La primera llamada a getPartUrls fue realizada
    expect(mockApi.getPartUrls).toHaveBeenCalledTimes(1);

    // Simulamos respuesta 403
    xhrInstances[0].status = 403;
    xhrInstances[0].onload?.();

    // Debe reintentar solicitando una nueva URL presignada para la parte 1
    await vi.waitFor(() => expect(mockApi.getPartUrls).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(xhrInstances.length).toBe(2));

    // Completar la segunda instancia con 200
    xhrInstances[1].status = 200;
    xhrInstances[1].onload?.();

    await vi.waitFor(() => expect(uploader.getStatus()).toBe("done"));
  });

  it("reintenta con backoff ante errores de red y falla al agotar reintentos", async () => {
    const file = new File([new Uint8Array(8 * 1024 * 1024)], "error.dat");
    mockApi.initiateUpload.mockResolvedValueOnce({
      uploadSessionId: "session-err",
      partSize: 8 * 1024 * 1024,
      totalParts: 1,
      expiresAt: "2026-09-11T12:00:00.000Z",
    });

    const xhrInstances: MockXhrInstance[] = [];
    const createXhr = createMockXhrFactory(xhrInstances);

    const uploader = new ChunkedUploader({
      file,
      token: "test-token",
      api: mockApi,
      createXhr,
      maxRetries: 2,
      baseRetryDelayMs: 10,
    });

    const uploadPromise = uploader.start();

    // Intento 1: falla con error de red
    await vi.waitFor(() => expect(xhrInstances.length).toBe(1));
    xhrInstances[0].onerror?.();

    // Intento 2: falla con 500
    await vi.waitFor(() => expect(xhrInstances.length).toBe(2));
    xhrInstances[1].status = 500;
    xhrInstances[1].onload?.();

    // Intento 3 (excede maxRetries = 2): falla
    await vi.waitFor(() => expect(xhrInstances.length).toBe(3));
    xhrInstances[2].onerror?.();

    await expect(uploadPromise).rejects.toThrow(/failed after 2 retries/);
    expect(uploader.getStatus()).toBe("error");
  });

  it("pausa la subida abortando peticiones en vuelo y la reanuda correctamente", async () => {
    const file = new File([new Uint8Array(16 * 1024 * 1024)], "pause.dat");
    mockApi.initiateUpload.mockResolvedValueOnce({
      uploadSessionId: "session-pause",
      partSize: 8 * 1024 * 1024,
      totalParts: 2,
      expiresAt: "2026-09-11T12:00:00.000Z",
    });

    const xhrInstances: MockXhrInstance[] = [];
    const createXhr = createMockXhrFactory(xhrInstances);

    const uploader = new ChunkedUploader({
      file,
      token: "test-token",
      api: mockApi,
      createXhr,
      concurrency: 1,
    });

    void uploader.start();

    // Esperar inicio de parte 1
    await vi.waitFor(() => expect(xhrInstances.length).toBe(1));

    // Pausar
    uploader.pause();
    expect(uploader.getStatus()).toBe("paused");
    expect(xhrInstances[0].abort).toHaveBeenCalled();

    // Reanudar
    void uploader.resume();
    await vi.waitFor(() => expect(uploader.getStatus()).toBe("uploading"));

    // Se debe volver a lanzar la parte 1
    await vi.waitFor(() => expect(xhrInstances.length).toBe(2));

    // Completar parte 1
    xhrInstances[1].status = 200;
    xhrInstances[1].onload?.();

    // Esperar parte 2
    await vi.waitFor(() => expect(xhrInstances.length).toBe(3));
    xhrInstances[2].status = 200;
    xhrInstances[2].onload?.();

    await vi.waitFor(() => expect(uploader.getStatus()).toBe("done"));
  });

  it("cancela la subida abortando peticiones y llamando a abortUpload", async () => {
    const file = new File([new Uint8Array(16 * 1024 * 1024)], "cancel.dat");
    mockApi.initiateUpload.mockResolvedValueOnce({
      uploadSessionId: "session-cancel",
      partSize: 8 * 1024 * 1024,
      totalParts: 2,
      expiresAt: "2026-09-11T12:00:00.000Z",
    });

    const xhrInstances: MockXhrInstance[] = [];
    const createXhr = createMockXhrFactory(xhrInstances);

    const uploader = new ChunkedUploader({
      file,
      token: "test-token",
      api: mockApi,
      createXhr,
      concurrency: 2,
    });

    const uploadPromise = uploader.start();

    await vi.waitFor(() => expect(xhrInstances.length).toBe(2));

    await uploader.cancel();

    expect(uploader.getStatus()).toBe("canceled");
    expect(xhrInstances[0].abort).toHaveBeenCalled();
    expect(xhrInstances[1].abort).toHaveBeenCalled();
    expect(mockApi.abortUpload).toHaveBeenCalledWith("test-token", "session-cancel");

    await expect(uploadPromise).rejects.toThrow("Upload canceled by user");
  });

  it("calcula y reporta progreso suave mediante onprogress de XHR", async () => {
    const file = new File([new Uint8Array(16 * 1024 * 1024)], "progress.dat");
    mockApi.initiateUpload.mockResolvedValueOnce({
      uploadSessionId: "session-prog",
      partSize: 8 * 1024 * 1024,
      totalParts: 2,
      expiresAt: "2026-09-11T12:00:00.000Z",
    });

    const xhrInstances: MockXhrInstance[] = [];
    const createXhr = createMockXhrFactory(xhrInstances);

    const progressReports: any[] = [];
    const uploader = new ChunkedUploader({
      file,
      token: "test-token",
      api: mockApi,
      createXhr,
      concurrency: 1,
      onProgress: (p) => progressReports.push(p),
    });

    void uploader.start();

    await vi.waitFor(() => expect(xhrInstances.length).toBe(1));

    // Simular progreso en vuelo de la parte 1 (4 MiB de 8 MiB)
    xhrInstances[0].upload.onprogress?.({
      lengthComputable: true,
      loaded: 4 * 1024 * 1024,
      total: 8 * 1024 * 1024,
    });

    const latest = progressReports[progressReports.length - 1];
    expect(latest.loadedBytes).toBe(4 * 1024 * 1024);
    expect(latest.percentage).toBe(25); // 4 MiB de 16 MiB = 25%
  });
});

import type { UploadedFile } from "@/features/files/types/file.types";
import {
  initiateUpload as defaultInitiateUpload,
  getUploadStatus as defaultGetUploadStatus,
  getPartUrls as defaultGetPartUrls,
  completeUpload as defaultCompleteUpload,
  abortUpload as defaultAbortUpload,
} from "@/features/files/api/uploads.api";

export type ChunkedUploadStatus =
  | "idle"
  | "initiating"
  | "uploading"
  | "retrying"
  | "paused"
  | "resuming"
  | "completing"
  | "done"
  | "error"
  | "canceled";

export interface ChunkedUploadProgress {
  loadedBytes: number;
  totalBytes: number;
  percentage: number;
  partNumber?: number;
  totalParts?: number;
}

export interface ChunkedUploaderApi {
  initiateUpload: typeof defaultInitiateUpload;
  getPartUrls: typeof defaultGetPartUrls;
  completeUpload: typeof defaultCompleteUpload;
  abortUpload: typeof defaultAbortUpload;
  getUploadStatus: typeof defaultGetUploadStatus;
}

export interface ChunkedUploaderOptions {
  file: File;
  token: string;
  conversationId?: string;
  concurrency?: number;
  partBatchSize?: number;
  maxRetries?: number;
  baseRetryDelayMs?: number;
  onProgress?: (progress: ChunkedUploadProgress) => void;
  onStatusChange?: (status: ChunkedUploadStatus) => void;
  onError?: (error: Error) => void;
  onSuccess?: (file: UploadedFile) => void;
  api?: Partial<ChunkedUploaderApi>;
  createXhr?: () => XMLHttpRequest;
}

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_PART_BATCH_SIZE = 20;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_RETRY_DELAY_MS = 1000;

export class ChunkedUploader {
  private file: File;
  private token: string;
  private conversationId?: string;
  private concurrency: number;
  private partBatchSize: number;
  private maxRetries: number;
  private baseRetryDelayMs: number;

  private onProgress?: (progress: ChunkedUploadProgress) => void;
  private onStatusChange?: (status: ChunkedUploadStatus) => void;
  private onError?: (error: Error) => void;
  private onSuccess?: (file: UploadedFile) => void;

  private api: ChunkedUploaderApi;
  private createXhr: () => XMLHttpRequest;

  private status: ChunkedUploadStatus = "idle";
  private sessionId: string | null = null;
  private partSize = 8 * 1024 * 1024;
  private totalParts = 0;

  private pendingParts: number[] = [];
  private activeWorkers = 0;
  private activeXhrs = new Map<number, XMLHttpRequest>();
  private inFlightBytes = new Map<number, number>();
  private completedParts = new Map<number, number>();
  private partUrls = new Map<number, string>();
  private partRetries = new Map<number, number>();

  private isPaused = false;
  private isCanceled = false;
  private isCompleting = false;

  private resolvePromise?: (value: UploadedFile) => void;
  private rejectPromise?: (reason: Error) => void;
  private completionPromise?: Promise<UploadedFile>;

  constructor(options: ChunkedUploaderOptions) {
    this.file = options.file;
    this.token = options.token;
    this.conversationId = options.conversationId;
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    this.partBatchSize = options.partBatchSize ?? DEFAULT_PART_BATCH_SIZE;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? DEFAULT_BASE_RETRY_DELAY_MS;

    this.onProgress = options.onProgress;
    this.onStatusChange = options.onStatusChange;
    this.onError = options.onError;
    this.onSuccess = options.onSuccess;

    this.api = {
      initiateUpload: options.api?.initiateUpload ?? defaultInitiateUpload,
      getPartUrls: options.api?.getPartUrls ?? defaultGetPartUrls,
      completeUpload: options.api?.completeUpload ?? defaultCompleteUpload,
      abortUpload: options.api?.abortUpload ?? defaultAbortUpload,
      getUploadStatus: options.api?.getUploadStatus ?? defaultGetUploadStatus,
    };

    this.createXhr =
      options.createXhr ??
      (() => {
        if (typeof XMLHttpRequest !== "undefined") {
          return new XMLHttpRequest();
        }
        throw new Error("XMLHttpRequest is not available in current environment");
      });
  }

  public getStatus(): ChunkedUploadStatus {
    return this.status;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public getProgress(): ChunkedUploadProgress {
    return this.computeProgress();
  }

  private setStatus(newStatus: ChunkedUploadStatus): void {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.onStatusChange?.(newStatus);
  }

  private computeProgress(partNumber?: number): ChunkedUploadProgress {
    let completedLoaded = 0;
    for (const size of this.completedParts.values()) {
      completedLoaded += size;
    }

    let inFlightLoaded = 0;
    for (const bytes of this.inFlightBytes.values()) {
      inFlightLoaded += bytes;
    }

    const loadedBytes = Math.min(this.file.size, completedLoaded + inFlightLoaded);
    const percentage =
      this.file.size === 0 ? 100 : Math.min(100, Math.round((loadedBytes / this.file.size) * 100));

    return {
      loadedBytes,
      totalBytes: this.file.size,
      percentage,
      partNumber,
      totalParts: this.totalParts,
    };
  }

  private emitProgress(partNumber?: number): void {
    const progress = this.computeProgress(partNumber);
    this.onProgress?.(progress);
  }

  public start(): Promise<UploadedFile> {
    if (this.completionPromise && this.status !== "idle") {
      return this.completionPromise;
    }

    this.isPaused = false;
    this.isCanceled = false;
    this.isCompleting = false;

    this.completionPromise = new Promise<UploadedFile>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;

      this.initiateAndRun().catch((err) => {
        this.handleFatalError(err instanceof Error ? err : new Error(String(err)));
      });
    });

    return this.completionPromise;
  }

  private async initiateAndRun(): Promise<void> {
    this.setStatus("initiating");

    const session = await this.api.initiateUpload(this.token, {
      name: this.file.name,
      size: this.file.size,
      mimeType: this.file.type || "application/octet-stream",
      conversationId: this.conversationId,
    });

    this.sessionId = session.uploadSessionId;
    this.partSize = session.partSize;
    this.totalParts = session.totalParts;

    this.pendingParts = Array.from({ length: this.totalParts }, (_, i) => i + 1);
    this.completedParts.clear();
    this.inFlightBytes.clear();
    this.partUrls.clear();
    this.partRetries.clear();

    this.setStatus("uploading");
    this.emitProgress();
    this.pumpQueue();
  }

  private pumpQueue(): void {
    if (this.isPaused || this.isCanceled || this.isCompleting) {
      return;
    }

    if (this.pendingParts.length === 0) {
      if (this.activeWorkers === 0 && this.completedParts.size === this.totalParts) {
        void this.completeSession();
      }
      return;
    }

    while (this.activeWorkers < this.concurrency && this.pendingParts.length > 0) {
      const partNumber = this.pendingParts.shift();
      if (partNumber === undefined) break;

      this.activeWorkers++;
      void this.executeUploadPart(partNumber);
    }
  }

  private async executeUploadPart(partNumber: number): Promise<void> {
    if (this.isPaused || this.isCanceled) {
      this.activeWorkers--;
      this.pendingParts.unshift(partNumber);
      return;
    }

    try {
      // 1. Obtener URL presignada si no está en cache
      let url = this.partUrls.get(partNumber);
      if (!url) {
        await this.fetchPartUrlsBatch(partNumber);
        url = this.partUrls.get(partNumber);
        if (!url) {
          throw new Error(`Failed to obtain presigned URL for part ${partNumber}`);
        }
      }

      if (this.isPaused || this.isCanceled) {
        this.activeWorkers--;
        this.pendingParts.unshift(partNumber);
        return;
      }

      // 2. Particionar slice del archivo
      const start = (partNumber - 1) * this.partSize;
      const end = Math.min(start + this.partSize, this.file.size);
      const chunk = this.file.slice(start, end);

      // 3. Subir vía XHR con progreso
      await this.uploadChunkXhr(partNumber, url, chunk);

      // Parte exitosa
      this.completedParts.set(partNumber, chunk.size);
      this.inFlightBytes.delete(partNumber);
      this.activeXhrs.delete(partNumber);
      this.partRetries.delete(partNumber);
      this.activeWorkers--;

      this.emitProgress(partNumber);
      this.pumpQueue();
    } catch (error) {
      this.handlePartError(partNumber, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async fetchPartUrlsBatch(triggerPartNumber: number): Promise<void> {
    if (!this.sessionId) throw new Error("Upload session ID is missing");

    const neededParts: number[] = [triggerPartNumber];
    for (const p of this.pendingParts) {
      if (!this.partUrls.has(p) && !neededParts.includes(p)) {
        neededParts.push(p);
        if (neededParts.length >= this.partBatchSize) break;
      }
    }

    const items = await this.api.getPartUrls(this.token, this.sessionId, neededParts);
    for (const item of items) {
      this.partUrls.set(item.partNumber, item.url);
    }
  }

  private uploadChunkXhr(partNumber: number, url: string, chunk: Blob): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const xhr = this.createXhr();
      this.activeXhrs.set(partNumber, xhr);

      xhr.open("PUT", url);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && !this.isPaused && !this.isCanceled) {
          this.inFlightBytes.set(partNumber, event.loaded);
          this.emitProgress(partNumber);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else if (xhr.status === 403) {
          // URL presignada expirada o desfase de reloj -> forzar re-presign
          this.partUrls.delete(partNumber);
          reject(new Error(`Presigned URL expired or forbidden for part ${partNumber} (403)`));
        } else {
          reject(new Error(`Upload failed for part ${partNumber} with HTTP ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error(`Network error uploading part ${partNumber}`));
      };

      xhr.ontimeout = () => {
        reject(new Error(`Timeout uploading part ${partNumber}`));
      };

      xhr.onabort = () => {
        reject(new Error(`Upload aborted for part ${partNumber}`));
      };

      xhr.send(chunk);
    });
  }

  private handlePartError(partNumber: number, error: Error): void {
    this.inFlightBytes.delete(partNumber);
    this.activeXhrs.delete(partNumber);

    if (this.isPaused || this.isCanceled) {
      return;
    }

    this.activeWorkers = Math.max(0, this.activeWorkers - 1);

    const is403 = error.message.includes("(403)");
    const currentRetries = this.partRetries.get(partNumber) ?? 0;

    if (currentRetries < this.maxRetries) {
      const nextRetry = currentRetries + 1;
      this.partRetries.set(partNumber, nextRetry);
      this.setStatus("retrying");

      // Si fue 403, no aplicar backoff largo porque ya invalidamos la URL
      const delay = is403
        ? 200
        : Math.min(10000, this.baseRetryDelayMs * Math.pow(2, currentRetries) + Math.random() * 200);

      setTimeout(() => {
        if (!this.isPaused && !this.isCanceled) {
          if (!this.pendingParts.includes(partNumber)) {
            this.pendingParts.unshift(partNumber);
          }
          this.setStatus("uploading");
          this.pumpQueue();
        }
      }, delay);
    } else {
      this.handleFatalError(
        new Error(`Part ${partNumber} failed after ${this.maxRetries} retries: ${error.message}`),
      );
    }
  }

  private async completeSession(): Promise<void> {
    if (this.isCompleting || this.isCanceled || this.isPaused || !this.sessionId) return;
    this.isCompleting = true;
    this.setStatus("completing");

    try {
      const storedFile = await this.api.completeUpload(this.token, this.sessionId);
      this.setStatus("done");
      this.onSuccess?.(storedFile);
      this.resolvePromise?.(storedFile);
    } catch (err) {
      this.handleFatalError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private handleFatalError(error: Error): void {
    if (this.status === "error" || this.status === "canceled") return;
    this.setStatus("error");
    this.abortAllActiveXhrs();
    this.onError?.(error);
    this.rejectPromise?.(error);
  }

  private abortAllActiveXhrs(): void {
    const xhrs = Array.from(this.activeXhrs.values());
    this.activeXhrs.clear();
    this.inFlightBytes.clear();
    this.activeWorkers = 0;

    for (const xhr of xhrs) {
      try {
        xhr.abort();
      } catch {
        // Ignorar errores al abortar
      }
    }
  }

  public pause(): void {
    if (this.isPaused || this.isCanceled || this.status === "done" || this.status === "error") {
      return;
    }

    this.isPaused = true;

    // Recolectar las partes en vuelo para volver a encolarlas
    const inFlightPartNumbers = Array.from(this.activeXhrs.keys());
    this.abortAllActiveXhrs();

    const newPending = new Set(this.pendingParts);
    for (const partNumber of inFlightPartNumbers) {
      if (!this.completedParts.has(partNumber)) {
        newPending.add(partNumber);
      }
    }
    this.pendingParts = Array.from(newPending).sort((a, b) => a - b);

    this.setStatus("paused");
  }

  public async resume(): Promise<UploadedFile> {
    if (!this.isPaused || this.isCanceled) {
      if (this.completionPromise) return this.completionPromise;
      return this.start();
    }

    this.setStatus("resuming");
    this.isPaused = false;

    // Sincronización con backend / storage (§8.5, Fase 7 prep)
    if (this.sessionId) {
      try {
        const status = await this.api.getUploadStatus(this.token, this.sessionId);
        if (status.parts && status.parts.length > 0) {
          for (const p of status.parts) {
            this.completedParts.set(p.partNumber, p.size);
          }
          this.pendingParts = this.pendingParts.filter((p) => !this.completedParts.has(p));
        }
      } catch {
        // Si falla la consulta de status, continuamos con las partes locales conocidas
      }
    }

    this.setStatus("uploading");
    this.emitProgress();
    this.pumpQueue();

    return this.completionPromise!;
  }

  public async cancel(): Promise<void> {
    if (this.isCanceled) return;
    this.isCanceled = true;
    this.isPaused = false;

    this.abortAllActiveXhrs();
    this.setStatus("canceled");

    if (this.sessionId) {
      try {
        await this.api.abortUpload(this.token, this.sessionId);
      } catch {
        // Silenciar error en aborto de sesión
      }
    }

    const cancelError = new Error("Upload canceled by user");
    this.rejectPromise?.(cancelError);
  }
}

import { createReadStream } from "fs";
import fs from "fs/promises";
import path from "path";
import { BadRequestError } from "../utils/errors";
import {
  MultipartUploadPart,
  SavedFile,
  StorageFileStats,
  StoragePart,
  StorageProvider,
} from "./storage.types";

const UPLOADS_ROOT = path.join(__dirname, "..", "..", "uploads");

/// Proveedor `FileProvider.LOCAL`: guarda archivos en disco bajo `backend/uploads/`.
/// Todo acceso valida contención de directorio (S15) contra path traversal.
export class LocalDiskStorage implements StorageProvider {
  private readonly rootDir: string;

  constructor(rootDir: string = UPLOADS_ROOT) {
    this.rootDir = path.resolve(rootDir);
  }

  /// Resuelve la ruta absoluta asegurando que no escape de `rootDir` (defensa en profundidad S15).
  resolveSafePath(relativePath: string): string {
    const resolved = path.resolve(this.rootDir, relativePath);
    const normalizedRoot = this.rootDir.endsWith(path.sep) ? this.rootDir : `${this.rootDir}${path.sep}`;
    if (!resolved.startsWith(normalizedRoot) && resolved !== this.rootDir) {
      throw new BadRequestError("Path traversal detected in storage path");
    }
    return resolved;
  }

  getAbsolutePath(relativePath: string): string {
    return this.resolveSafePath(relativePath);
  }

  async save(buffer: Buffer, relativePath: string): Promise<SavedFile> {
    const absolutePath = this.resolveSafePath(relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);
    return { path: relativePath, size: buffer.length };
  }

  async delete(relativePath: string): Promise<void> {
    const absolutePath = this.resolveSafePath(relativePath);
    await fs.rm(absolutePath, { force: true });
  }

  getPublicUrl(relativePath: string): string {
    return `/uploads/${relativePath.split(path.sep).join("/")}`;
  }

  async createReadStream(
    relativePath: string,
    options?: { start?: number; end?: number },
  ): Promise<NodeJS.ReadableStream> {
    const absolutePath = this.resolveSafePath(relativePath);
    return createReadStream(absolutePath, options);
  }

  async stat(relativePath: string): Promise<StorageFileStats> {
    const absolutePath = this.resolveSafePath(relativePath);
    const stats = await fs.stat(absolutePath);
    return { size: stats.size };
  }

  async createMultipartUpload(): Promise<string> {
    throw new BadRequestError("Multipart upload is only supported for S3 storage");
  }

  async getPresignedPartUploadUrl(): Promise<string> {
    throw new BadRequestError("Multipart upload is only supported for S3 storage");
  }

  async listParts(): Promise<StoragePart[]> {
    throw new BadRequestError("Multipart upload is only supported for S3 storage");
  }

  async completeMultipartUpload(): Promise<void> {
    throw new BadRequestError("Multipart upload is only supported for S3 storage");
  }

  async abortMultipartUpload(): Promise<void> {
    throw new BadRequestError("Multipart upload is only supported for S3 storage");
  }
}

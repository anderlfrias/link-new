import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import env from "../config/env";
import { SavedFile, StorageFileStats, StorageProvider } from "./storage.types";

export interface S3StorageConfig {
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

/// Proveedor de almacenamiento S3 compatible con SeaweedFS S3 gateway, MinIO y AWS S3.
/// Implementa `StorageProvider` para soportar lectura unificada, guardado y borrado (§6, §7).
export class S3Storage implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3StorageConfig = {}) {
    this.bucket = config.bucket ?? env.S3_BUCKET;
    const endpoint = config.endpoint ?? env.S3_ENDPOINT;
    const region = config.region ?? env.S3_REGION;
    const accessKeyId = config.accessKeyId ?? env.S3_ACCESS_KEY_ID;
    const secretAccessKey = config.secretAccessKey ?? env.S3_SECRET_ACCESS_KEY;
    const forcePathStyle = config.forcePathStyle ?? env.S3_FORCE_PATH_STYLE;

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    });
  }

  /// Normaliza keys para S3 (sin backslashes de Windows ni leading slashes).
  private normalizeKey(relativePath: string): string {
    return relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  }

  async save(buffer: Buffer, relativePath: string): Promise<SavedFile> {
    const key = this.normalizeKey(relativePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
      }),
    );
    return {
      path: key,
      size: buffer.length,
    };
  }

  async delete(relativePath: string): Promise<void> {
    const key = this.normalizeKey(relativePath);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async stat(relativePath: string): Promise<StorageFileStats> {
    const key = this.normalizeKey(relativePath);
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    return {
      size: response.ContentLength ?? 0,
    };
  }

  async createReadStream(
    relativePath: string,
    options?: { start?: number; end?: number },
  ): Promise<NodeJS.ReadableStream> {
    const key = this.normalizeKey(relativePath);
    const range =
      options?.start != null && options?.end != null
        ? `bytes=${options.start}-${options.end}`
        : undefined;

    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: range,
      }),
    );

    return response.Body as NodeJS.ReadableStream;
  }

  getPublicUrl(relativePath: string): string {
    const key = this.normalizeKey(relativePath);
    return `/api/v1/files/${key}`;
  }

  /// Genera una URL presignada temporal para descarga o visualización directa (§4.5, §11).
  /// Permite inyectar `ResponseContentDisposition` y `ResponseContentType` para preservar
  /// la sanitización RFC 5987 y el forzado de `attachment` para tipos no seguros (ej. SVGs).
  async getPresignedDownloadUrl(
    relativePath: string,
    expiresInSeconds = 300,
    responseContentDisposition?: string,
    responseContentType?: string,
  ): Promise<string> {
    const key = this.normalizeKey(relativePath);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: responseContentDisposition,
      ResponseContentType: responseContentType,
    });

    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  getClient(): S3Client {
    return this.client;
  }

  getBucket(): string {
    return this.bucket;
  }
}

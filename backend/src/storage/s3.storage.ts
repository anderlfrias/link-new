import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  ListPartsCommandOutput,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import env from "../config/env";
import {
  MultipartUploadPart,
  SavedFile,
  StorageFileStats,
  StoragePart,
  StorageProvider,
} from "./storage.types";

export interface S3StorageConfig {
  endpoint?: string;
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

/// Proveedor de almacenamiento S3 compatible con SeaweedFS S3 gateway, MinIO y AWS S3.
/// Implementa `StorageProvider` para soportar lectura unificada, guardado, borrado y multipart (§4, §6, §7).
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
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
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

  async saveStream(
    stream: NodeJS.ReadableStream,
    relativePath: string,
    options?: { size?: number; mimeType?: string },
  ): Promise<SavedFile> {
    const key = this.normalizeKey(relativePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: stream as any,
        ContentLength: options?.size,
        ContentType: options?.mimeType,
      }),
    );
    return {
      path: key,
      size: options?.size ?? 0,
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

  /// Inicia una subida multipart en S3 y retorna el uploadId asignado (§4.3).
  async createMultipartUpload(relativePath: string, mimeType: string): Promise<string> {
    const key = this.normalizeKey(relativePath);
    const response = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimeType,
      }),
    );
    if (!response.UploadId) {
      throw new Error("Failed to create multipart upload: no uploadId returned");
    }
    return response.UploadId;
  }

  /// Genera una URL presignada PUT para transferir una parte específica (TTL default 15 min).
  async getPresignedPartUploadUrl(
    relativePath: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds = 900,
  ): Promise<string> {
    const key = this.normalizeKey(relativePath);
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /// Consulta las partes subidas al storage — fuente de verdad autoritativa (§4.3, §5.3).
  async listParts(relativePath: string, uploadId: string): Promise<StoragePart[]> {
    const key = this.normalizeKey(relativePath);
    const parts: StoragePart[] = [];
    let partNumberMarker: string | undefined = undefined;
    let isTruncated = true;

    while (isTruncated) {
      const response: ListPartsCommandOutput = await this.client.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: partNumberMarker,
        }),
      );

      for (const part of response.Parts ?? []) {
        if (part.PartNumber != null && part.ETag) {
          parts.push({
            partNumber: part.PartNumber,
            size: part.Size ?? 0,
            eTag: part.ETag,
          });
        }
      }

      isTruncated = response.IsTruncated ?? false;
      partNumberMarker = response.NextPartNumberMarker ? String(response.NextPartNumberMarker) : undefined;
    }

    return parts;
  }

  /// Ensambla las partes en S3 a partir del listado ordenado (§4.3).
  async completeMultipartUpload(
    relativePath: string,
    uploadId: string,
    parts: MultipartUploadPart[],
  ): Promise<void> {
    const key = this.normalizeKey(relativePath);
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({
            PartNumber: p.partNumber,
            ETag: p.eTag,
          })),
        },
      }),
    );
  }

  /// Aborta la subida multipart en S3 y libera el espacio ocupado por partes incompletas (§4.3, §5.5).
  async abortMultipartUpload(relativePath: string, uploadId: string): Promise<void> {
    const key = this.normalizeKey(relativePath);
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }

  getClient(): S3Client {
    return this.client;
  }

  getBucket(): string {
    return this.bucket;
  }
}

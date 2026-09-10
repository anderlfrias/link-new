/// Interfaz común que debe implementar cualquier proveedor de almacenamiento
/// físico (disco local, S3, MinIO, ...), para que el resto del sistema guarde
/// y lea archivos sin importar dónde viven realmente (ver backend/README.md,
/// "Gestión de Archivos").
export interface SavedFile {
  /// Ruta relativa dentro del proveedor (ej. "chat/550e8400.pdf"), lo único
  /// que se guarda en `StoredFile.path` — nunca una ruta absoluta ni una URL.
  path: string;
  size: number;
}

export interface StorageFileStats {
  size: number;
}

export interface StoragePart {
  partNumber: number;
  size: number;
  eTag: string;
}

export interface MultipartUploadPart {
  partNumber: number;
  eTag: string;
}

export interface StorageProvider {
  save(buffer: Buffer, relativePath: string): Promise<SavedFile>;
  saveStream?(
    stream: NodeJS.ReadableStream,
    relativePath: string,
    options?: { size?: number; mimeType?: string },
  ): Promise<SavedFile>;
  delete(relativePath: string): Promise<void>;
  /// Construye la URL pública a partir de la ruta relativa. Solo este método
  /// sabe cómo se sirve un archivo (estático en disco, bucket firmado, CDN, ...).
  getPublicUrl(relativePath: string): string;
  /// Crea un stream de lectura para servir o migrar contenido sin cargarlo entero en RAM.
  createReadStream(relativePath: string, options?: { start?: number; end?: number }): Promise<NodeJS.ReadableStream>;
  /// Obtiene metadatos físicos del archivo (tamaño en bytes).
  stat(relativePath: string): Promise<StorageFileStats>;

  /// Inicia una subida multipart y retorna el uploadId asignado por el storage.
  createMultipartUpload?(relativePath: string, mimeType: string): Promise<string>;
  /// Genera una URL presignada PUT para transferir una parte específica.
  getPresignedPartUploadUrl?(
    relativePath: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds?: number,
  ): Promise<string>;
  /// Lista las partes subidas hasta el momento (fuente autoritativa de verdad).
  listParts?(relativePath: string, uploadId: string): Promise<StoragePart[]>;
  /// Ensambla las partes en el storage.
  completeMultipartUpload?(
    relativePath: string,
    uploadId: string,
    parts: MultipartUploadPart[],
  ): Promise<void>;
  /// Aborta la sesión multipart y libera las partes almacenadas.
  abortMultipartUpload?(relativePath: string, uploadId: string): Promise<void>;
}

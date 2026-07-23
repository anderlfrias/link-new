export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/// Forma pública de un `StoredFile`. Nunca expone `path`/`storedName` (rutas
/// físicas): `url` es lo único que un cliente necesita, y la construye el
/// proveedor de almacenamiento (`src/storage`) a partir de la ruta relativa.
export interface StoredFileResponse {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  url: string;
  createdAt: Date;
}

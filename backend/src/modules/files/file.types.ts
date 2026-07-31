export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/// Señal de request explícita: distingue una nota de voz grabada de un
/// adjunto genérico, ya que solo la primera tiene un límite de duración
/// (`AppSettings.maxVoiceNoteDurationSeconds`). No se persiste en `StoredFile`
/// — el archivo se guarda igual sea cual sea el `kind`.
export type UploadKind = "file" | "voice_note";

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

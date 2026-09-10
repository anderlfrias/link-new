import { FileProvider } from "@prisma/client";

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
  deletedAt: Date | null;
}

/// Categoría de archivo para el filtro de tipo del panel de admin — deriva de
/// `mimeType`, no se persiste. "other" = ni imagen ni audio.
export type StoredFileCategory = "image" | "audio" | "other";

/// Filtros del listado admin (`GET /v1/admin/files`). Todos opcionales — sin
/// ninguno, lista todo `StoredFile` activo.
export interface AdminFileFilters {
  type?: StoredFileCategory;
  /// Contains, case-insensitive, contra `createdBy.name` OR `createdBy.email`.
  uploader?: string;
  /// Contains, case-insensitive, contra `originalName`.
  search?: string;
  from?: Date;
  to?: Date;
}

export interface AdminFileListOptions {
  beforeId?: string;
  limit?: number;
}

/// Dónde está en uso actualmente un archivo — ver `ConversationGroupSettings`-
/// style reverse relations en `StoredFile` (`avatarOfUsers`, `imageOfConversations`,
/// `messageFiles`). Todo en cero = huérfano, candidato obvio a borrar.
export interface AdminFileUsage {
  avatarOfUserCount: number;
  groupImageOfConversationCount: number;
  messageAttachmentCount: number;
}

export interface AdminFileListItem extends StoredFileResponse {
  provider: FileProvider;
  createdBy: { id: string; name: string; email: string } | null;
  usage: AdminFileUsage;
}

export interface AdminFileListResult {
  files: AdminFileListItem[];
  /// Agregados sobre TODOS los archivos que matchean el filtro, no solo la
  /// página actual — para el resumen de espacio usado en la UI.
  totalCount: number;
  totalSize: number;
}

export interface FileStorageStatsResponse {
  localCount: number;
  s3Count: number;
  totalCount: number;
  migrationEnabled: boolean;
  migrationBatchSize: number;
  migrationIntervalMinutes: number;
}

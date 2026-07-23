import { LocalDiskStorage } from "./local-disk.storage";
import { StorageProvider } from "./storage.types";

/// Único punto de entrada de `src/storage`. Hoy solo existe `FileProvider.LOCAL`
/// (ver el enum en prisma/schema.prisma), así que `storage` es siempre
/// `LocalDiskStorage`. Cuando exista un segundo proveedor (S3, MinIO), este
/// archivo decide cuál instanciar (ej. según `StoredFile.provider` o config),
/// sin que ningún otro módulo necesite cambiar — todos importan `storage`
/// desde acá, nunca una clase concreta directamente.
export const storage: StorageProvider = new LocalDiskStorage();

export * from "./storage.types";

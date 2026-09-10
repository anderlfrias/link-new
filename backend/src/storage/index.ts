import { FileProvider } from "@prisma/client";
import { LocalDiskStorage } from "./local-disk.storage";
import { StorageProvider } from "./storage.types";

const localStorageInstance = new LocalDiskStorage();

/// Resuelve el proveedor adecuado para lectura y borrado según `file.provider` (ver §7.2).
export function getProvider(provider: FileProvider): StorageProvider {
  switch (provider) {
    case FileProvider.LOCAL:
      return localStorageInstance;
    case FileProvider.S3:
      // Se implementará en la Fase 3 con S3Storage.
      throw new Error("S3 storage provider is not yet configured (Phase 3)");
    default:
      return localStorageInstance;
  }
}

/// Resuelve el proveedor configurado para escrituras nuevas (ver §7.2).
export function getWriteProvider(): { provider: FileProvider; storage: StorageProvider } {
  return { provider: FileProvider.LOCAL, storage: localStorageInstance };
}

/// Singleton retrocompatible para módulos existentes antes de migrar a getProvider/getWriteProvider.
export const storage: StorageProvider = localStorageInstance;

export * from "./storage.types";


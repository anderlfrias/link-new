import { FileProvider } from "@prisma/client";
import env from "../config/env";
import { LocalDiskStorage } from "./local-disk.storage";
import { S3Storage } from "./s3.storage";
import { StorageProvider } from "./storage.types";

const localStorageInstance = new LocalDiskStorage();
let s3StorageInstance: S3Storage | null = null;

function getS3Instance(): S3Storage {
  if (!s3StorageInstance) {
    s3StorageInstance = new S3Storage();
  }
  return s3StorageInstance;
}

/// Resuelve el proveedor adecuado para lectura y borrado según `file.provider` (ver §7.2).
export function getProvider(provider: FileProvider): StorageProvider {
  switch (provider) {
    case FileProvider.LOCAL:
      return localStorageInstance;
    case FileProvider.S3:
      return getS3Instance();
    default:
      return localStorageInstance;
  }
}

/// Resuelve el proveedor configurado para escrituras nuevas según STORAGE_WRITE_PROVIDER (ver §7.2).
export function getWriteProvider(): { provider: FileProvider; storage: StorageProvider } {
  if (env.STORAGE_WRITE_PROVIDER === "S3") {
    return { provider: FileProvider.S3, storage: getS3Instance() };
  }
  return { provider: FileProvider.LOCAL, storage: localStorageInstance };
}

/// Singleton retrocompatible para módulos existentes antes de migrar a getProvider/getWriteProvider.
export const storage: StorageProvider = localStorageInstance;

export * from "./local-disk.storage";
export * from "./s3.storage";
export * from "./storage.types";

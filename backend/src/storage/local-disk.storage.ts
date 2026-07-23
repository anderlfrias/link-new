import fs from "fs/promises";
import path from "path";
import { SavedFile, StorageProvider } from "./storage.types";

const UPLOADS_ROOT = path.join(__dirname, "..", "..", "uploads");

/// Proveedor `FileProvider.LOCAL`: guarda archivos en disco, bajo
/// `backend/uploads/`, y los sirve vía el `express.static("/uploads", ...)`
/// montado en app.ts. `relativePath` siempre lo construye `file.service.ts`
/// (nunca un valor del cliente), así que no hay riesgo de path traversal aquí.
export class LocalDiskStorage implements StorageProvider {
  async save(buffer: Buffer, relativePath: string): Promise<SavedFile> {
    const absolutePath = path.join(UPLOADS_ROOT, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);
    return { path: relativePath, size: buffer.length };
  }

  async delete(relativePath: string): Promise<void> {
    const absolutePath = path.join(UPLOADS_ROOT, relativePath);
    await fs.rm(absolutePath, { force: true });
  }

  getPublicUrl(relativePath: string): string {
    return `/uploads/${relativePath.split(path.sep).join("/")}`;
  }
}

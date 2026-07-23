import { FileProvider } from "@prisma/client";
import { prisma } from "../../config/prisma";

export function createStoredFile(data: {
  originalName: string;
  storedName: string;
  path: string;
  mimeType: string;
  extension: string;
  size: number;
  checksum: string;
  createdById: string;
}) {
  return prisma.storedFile.create({
    data: { ...data, provider: FileProvider.LOCAL },
  });
}

export function findActiveById(id: string) {
  return prisma.storedFile.findFirst({ where: { id, deletedAt: null } });
}

/// Borrado lógico únicamente — igual que `Conversation`/`Message` en el resto
/// del sistema. No borra el archivo físico: la limpieza de archivos huérfanos
/// en disco es un job de background (`src/workers`) que todavía no existe.
export function softDelete(id: string) {
  return prisma.storedFile.update({ where: { id }, data: { deletedAt: new Date() } });
}

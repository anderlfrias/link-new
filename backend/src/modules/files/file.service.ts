import { createHash, randomUUID } from "crypto";
import path from "path";
import { StoredFile } from "@prisma/client";
import { ALLOWED_MIME_TYPES } from "../../constants/allowed-file-types.constant";
import { storage } from "../../storage";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import * as FileRepository from "./file.repository";
import { StoredFileResponse, UploadedFile } from "./file.types";

/// La extensión del nombre original es solo un indicio, nunca se confía en
/// ella para construir la ruta física: si no es alfanumérica simple, se cae
/// al mapeo por mime type (ver ALLOWED_MIME_TYPES), y si tampoco hay match,
/// a "bin". Esto es lo que hace seguro construir `relativePath` sin validar
/// path traversal en storage: el nombre físico siempre lo generamos nosotros.
function safeExtension(originalName: string, mimeType: string): string {
  const fromName = path.extname(originalName).replace(".", "").toLowerCase();
  if (/^[a-z0-9]{1,10}$/.test(fromName)) {
    return fromName;
  }
  return ALLOWED_MIME_TYPES[mimeType]?.extension ?? "bin";
}

function toResponse(file: StoredFile): StoredFileResponse {
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    extension: file.extension,
    size: file.size,
    url: storage.getPublicUrl(file.path),
    createdAt: file.createdAt,
  };
}

export async function uploadFile(currentUserId: string, upload: UploadedFile): Promise<StoredFileResponse> {
  if (!ALLOWED_MIME_TYPES[upload.mimetype]) {
    throw new BadRequestError(`File type not allowed: ${upload.mimetype}`);
  }

  const extension = safeExtension(upload.originalname, upload.mimetype);
  const storedName = `${randomUUID()}.${extension}`;
  const checksum = createHash("sha256").update(upload.buffer).digest("hex");

  const saved = await storage.save(upload.buffer, `chat/${storedName}`);

  const file = await FileRepository.createStoredFile({
    originalName: upload.originalname,
    storedName,
    path: saved.path,
    mimeType: upload.mimetype,
    extension,
    size: saved.size,
    checksum,
    createdById: currentUserId,
  });

  return toResponse(file);
}

export async function getFile(fileId: string): Promise<StoredFileResponse> {
  const file = await FileRepository.findActiveById(fileId);
  if (!file) {
    throw new NotFoundError("File not found");
  }
  return toResponse(file);
}

export async function deleteFile(currentUserId: string, fileId: string): Promise<{ id: string }> {
  const file = await FileRepository.findActiveById(fileId);
  if (!file) {
    throw new NotFoundError("File not found");
  }
  if (file.createdById !== currentUserId) {
    throw new ForbiddenError("Only the uploader can delete this file");
  }

  await FileRepository.softDelete(fileId);
  return { id: fileId };
}

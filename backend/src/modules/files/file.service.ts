import { createHash, randomUUID } from "crypto";
import path from "path";
import { StoredFile } from "@prisma/client";
import { ALLOWED_MIME_TYPES } from "../../constants/allowed-file-types.constant";
import { storage } from "../../storage";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { isConversationMember } from "../conversations/conversation.repository";
import * as FileRepository from "./file.repository";
import { StoredFileResponse, UploadedFile } from "./file.types";

/// Con `conversationId`, namespacea el archivo bajo esa conversación y el
/// año/mes actual (`chat/<conversationId>/<yyyy>/<mm>/...`), para no acumular
/// miles de archivos sueltos en una sola carpeta plana. Sin `conversationId`
/// (subidas que todavía no tienen un destino conocido, ej. futuro avatar de
/// usuario) cae a `chat/<yyyy>/<mm>/...`.
function buildStorageDir(conversationId?: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return conversationId ? `chat/${conversationId}/${yyyy}/${mm}` : `chat/${yyyy}/${mm}`;
}

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

/// Exportada para que otros módulos que ya tienen un `StoredFile` en mano
/// (ej. messages, al listar los archivos compartidos de una conversación)
/// arme la misma forma pública sin duplicar la lógica de `url`.
export function toStoredFileResponse(file: StoredFile): StoredFileResponse {
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

export async function uploadFile(
  currentUserId: string,
  upload: UploadedFile,
  conversationId?: string,
): Promise<StoredFileResponse> {
  if (!ALLOWED_MIME_TYPES[upload.mimetype]) {
    throw new BadRequestError(`File type not allowed: ${upload.mimetype}`);
  }
  if (conversationId && !(await isConversationMember(conversationId, currentUserId))) {
    throw new ForbiddenError("You are not a member of this conversation");
  }

  const extension = safeExtension(upload.originalname, upload.mimetype);
  const storedName = `${randomUUID()}.${extension}`;
  const checksum = createHash("sha256").update(upload.buffer).digest("hex");

  const saved = await storage.save(upload.buffer, `${buildStorageDir(conversationId)}/${storedName}`);

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

  return toStoredFileResponse(file);
}

export async function getFile(fileId: string): Promise<StoredFileResponse> {
  const file = await FileRepository.findActiveById(fileId);
  if (!file) {
    throw new NotFoundError("File not found");
  }
  return toStoredFileResponse(file);
}

export async function getFileChecksum(fileId: string): Promise<string | null> {
  const file = await FileRepository.findActiveById(fileId);
  return file?.checksum ?? null;
}

/// Usado por el módulo auth para cachear la foto de perfil de EXTERNAL_AUTH como
/// `StoredFile` (ver auth.service.ts `syncProfilePicture`). No pasa por
/// `ALLOWED_MIME_TYPES` como `uploadFile` — EXTERNAL_AUTH puede devolver cualquier
/// tipo de imagen, y este flujo no viene de un formulario del usuario.
export async function storeAvatar(userId: string, buffer: Buffer, mimeType: string): Promise<StoredFileResponse> {
  const subtype = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const extension = ALLOWED_MIME_TYPES[mimeType]?.extension ?? subtype ?? "bin";
  const storedName = `${randomUUID()}.${extension}`;
  const checksum = createHash("sha256").update(buffer).digest("hex");

  const saved = await storage.save(buffer, `avatars/${userId}/${storedName}`);

  const file = await FileRepository.createStoredFile({
    originalName: `avatar.${extension}`,
    storedName,
    path: saved.path,
    mimeType,
    extension,
    size: saved.size,
    checksum,
    createdById: userId,
  });

  return toStoredFileResponse(file);
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

import { createHash, randomUUID } from "crypto";
import path from "path";
import { parseBuffer } from "music-metadata";
import { FileTypeRestrictionMode, StoredFile } from "@prisma/client";
import { ALLOWED_MIME_TYPES } from "../../constants/allowed-file-types.constant";
import { storage } from "../../storage";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { isConversationMember } from "../conversations/conversation.repository";
import * as SettingsService from "../settings/settings.service";
import * as FileRepository from "./file.repository";
import {
  AdminFileFilters,
  AdminFileListOptions,
  AdminFileListResult,
  StoredFileResponse,
  UploadedFile,
  UploadKind,
} from "./file.types";

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

/// `pattern` es una entrada de `AppSettings.fileTypeList`: un mime type exacto
/// ("application/pdf") o un wildcard de tipo ("audio/*", "video/*" — ver
/// FILE_TYPE_CATEGORIES). Comparar con `===` a secas (como antes) nunca
/// entiende el wildcard, y tampoco protege contra guardar por error un valor
/// que no es un mime type (ej. una extensión ".pdf") — eso queda bloqueado en
/// settings.validator.ts, esto de acá es sobre cómo interpretar un valor ya
/// validado.
function matchesFileTypePattern(pattern: string, mimeType: string): boolean {
  if (pattern.endsWith("/*")) {
    return mimeType.startsWith(pattern.slice(0, -1));
  }
  return pattern === mimeType;
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
    // StoredFile.size es bigint en Prisma (ver schema.prisma) — la API
    // pública lo mantiene number (Number.MAX_SAFE_INTEGER son ~9 PB, sobra).
    size: Number(file.size),
    url: storage.getPublicUrl(file.path),
    createdAt: file.createdAt,
  };
}

/// Sin allowlist de tipo MIME por defecto: adjuntos de mensaje aceptan
/// cualquier tipo de archivo (csv, exe, lo que sea), a diferencia del avatar
/// (`auth.route.ts`, que sí exige `image/*` — ese es un caso distinto, no un
/// adjunto). Un admin puede activar un allowlist/blocklist en runtime (ver
/// `AppSettings.fileTypeRestrictionMode`, ../settings/README.md).
///
/// El límite de tamaño real y editable en runtime es `AppSettings.maxUploadSizeMb`
/// — se valida acá, no en el `multer` de `file.route.ts` (ese solo aplica un
/// techo de seguridad fijo, no editable). Cuando `kind === "voice_note"`,
/// también se valida `AppSettings.maxVoiceNoteDurationSeconds` contra la
/// duración real del audio (calculada acá, nunca confiada del cliente).
export async function uploadFile(
  currentUserId: string,
  upload: UploadedFile,
  conversationId?: string,
  kind: UploadKind = "file",
): Promise<StoredFileResponse> {
  if (conversationId && !(await isConversationMember(conversationId, currentUserId))) {
    throw new ForbiddenError("You are not a member of this conversation");
  }

  const settings = await SettingsService.getSettings();

  if (upload.buffer.length > settings.maxUploadSizeMb * 1024 * 1024) {
    throw new BadRequestError(`File exceeds the maximum allowed size of ${settings.maxUploadSizeMb}MB`);
  }

  if (settings.fileTypeRestrictionMode === FileTypeRestrictionMode.ALLOWLIST) {
    if (!settings.fileTypeList.some((pattern) => matchesFileTypePattern(pattern, upload.mimetype))) {
      throw new BadRequestError(`File type "${upload.mimetype}" is not allowed`);
    }
  } else if (settings.fileTypeRestrictionMode === FileTypeRestrictionMode.BLOCKLIST) {
    if (settings.fileTypeList.some((pattern) => matchesFileTypePattern(pattern, upload.mimetype))) {
      throw new BadRequestError(`File type "${upload.mimetype}" is blocked`);
    }
  }

  if (kind === "voice_note") {
    if (!upload.mimetype.startsWith("audio/")) {
      throw new BadRequestError('Voice notes must have an "audio/*" mime type');
    }
    const { format } = await parseBuffer(upload.buffer, upload.mimetype);
    if (format.duration && format.duration > settings.maxVoiceNoteDurationSeconds) {
      throw new BadRequestError(
        `Voice note exceeds the maximum allowed duration of ${settings.maxVoiceNoteDurationSeconds}s`,
      );
    }
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
    size: BigInt(saved.size),
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
    size: BigInt(saved.size),
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

const ADMIN_FILES_DEFAULT_PAGE_SIZE = 50;
const ADMIN_FILES_MAX_PAGE_SIZE = 100;

/// Panel de admin de gestión de storage — lista TODO `StoredFile` activo
/// (avatares, fotos de grupo, adjuntos por igual), con dónde está en uso cada
/// uno. Ver backend/src/modules/files/README.md, "Gestión de storage (admin)".
export async function listFilesForAdmin(
  filters: AdminFileFilters,
  options: AdminFileListOptions,
): Promise<AdminFileListResult> {
  const limit = Math.min(Math.max(options.limit ?? ADMIN_FILES_DEFAULT_PAGE_SIZE, 1), ADMIN_FILES_MAX_PAGE_SIZE);

  const [rows, aggregate] = await Promise.all([
    FileRepository.listFilesForAdmin(filters, { beforeId: options.beforeId, limit }),
    FileRepository.aggregateFilesForAdmin(filters),
  ]);

  const files = rows.map((file) => ({
    ...toStoredFileResponse(file),
    createdBy: file.createdBy
      ? { id: file.createdBy.id, name: file.createdBy.name, email: file.createdBy.email }
      : null,
    usage: {
      avatarOfUserCount: file._count.avatarOfUsers,
      groupImageOfConversationCount: file._count.imageOfConversations,
      messageAttachmentCount: file._count.messageFiles,
    },
  }));

  // aggregate._sum.size es bigint | null (mismo motivo que toStoredFileResponse)
  // — sin convertir, JSON.stringify explota al responder este endpoint.
  return { files, totalCount: aggregate._count, totalSize: Number(aggregate._sum.size ?? 0) };
}

/// A diferencia de `deleteFile` (borrado lógico, solo el dueño): esta es la
/// vía admin, sin chequeo de ownership (el único gate es `requireRoles(ADMIN_ROLE)`
/// en la ruta) y SÍ borra el archivo físico. La fila de `StoredFile` nunca se
/// borra ni pierde su `id` — solo se marca `deletedAt`, para que cualquier
/// referencia existente (`avatarFileId`, `imageFileId`, `MessageFile`) siga
/// apuntando a metadata válida (nombre, tamaño) aunque el contenido ya no exista.
export async function adminDeleteFile(fileId: string): Promise<{ id: string }> {
  const file = await FileRepository.findActiveById(fileId);
  if (!file) {
    throw new NotFoundError("File not found");
  }

  // Un archivo físico ya ausente (borrado a mano, inconsistencia del
  // provider, ...) se trata como ya-efectivamente-borrado: no debe bloquear
  // la limpieza a nivel de base. `LocalDiskStorage.delete` usa `force: true`
  // y no lanza por ENOENT, así que este catch es una red de seguridad para
  // errores reales de IO (permisos, disco no montado, futuro provider remoto).
  try {
    await storage.delete(file.path);
  } catch (error) {
    console.error(`[files] adminDeleteFile: failed to delete physical file for ${fileId}`, error);
  }

  await FileRepository.softDelete(fileId);
  return { id: fileId };
}

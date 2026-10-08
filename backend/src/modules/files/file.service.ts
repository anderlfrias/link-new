import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import path from "path";
import { parseBuffer } from "music-metadata";
import { AppSettings, AuditAction, FileTypeRestrictionMode, StoredFile } from "@prisma/client";
import { ALLOWED_MIME_TYPES } from "../../constants/allowed-file-types.constant";
import { ADMIN_ROLE } from "../../constants/roles.constant";
import env from "../../config/env";
import { prisma } from "../../config/prisma";
import { getLogger } from "../../config/request-context";
import { getProvider, getWriteProvider, storage } from "../../storage";
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from "../../utils/errors";
import { isConversationMember } from "../conversations/conversation.repository";
import * as AuditRepository from "../audit/audit.repository";
import * as AuditService from "../audit/audit.service";
import * as SettingsService from "../settings/settings.service";
import * as FileRepository from "./file.repository";
import {
  AVATAR_IMAGE_MIME_TYPES,
  SIGNATURE_BYTES,
  areCompatible,
  detectMimeFromSignature,
} from "./file-signature";
import {
  AdminFileFilters,
  AdminFileListOptions,
  AdminFileListResult,
  FileStorageStatsResponse,
  StoredFileResponse,
  UploadedFile,
  UploadKind,
} from "./file.types";

/// Con `conversationId`, namespacea el archivo bajo esa conversación y el
/// año/mes actual (`chat/<conversationId>/<yyyy>/<mm>/...`), para no acumular
/// miles de archivos sueltos en una sola carpeta plana. Sin `conversationId`
/// (subidas que todavía no tienen un destino conocido, ej. futuro avatar de
/// usuario) cae a `chat/<yyyy>/<mm>/...`.
export function buildStorageDir(conversationId?: string): string {
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
export function matchesFileTypePattern(pattern: string, mimeType: string): boolean {
  if (pattern.endsWith("/*")) {
    return mimeType.startsWith(pattern.slice(0, -1));
  }
  return pattern === mimeType;
}

/// Aplica la restricción de tipos de archivo de `AppSettings` (allowlist/blocklist).
///
/// `declared` es el tipo que dice el cliente y `detected` el que revelan los
/// primeros bytes (`detectMimeFromSignature`), o `null` si no se reconoce (o aún
/// no se leyó el contenido). Si no hay `detected` o es coherente con `declared`,
/// se evalúa solo `declared`, como siempre. Si no coinciden, el archivo miente
/// sobre su tipo: con ALLOWLIST tienen que estar permitidos los dos, y con
/// BLOCKLIST alcanza con que uno esté bloqueado. Así un ejecutable declarado
/// como PDF no pasa una blocklist de ejecutables, ni una allowlist de PDF.
export function assertFileTypeAllowed(
  settings: Pick<AppSettings, "fileTypeRestrictionMode" | "fileTypeList">,
  declared: string,
  detected: string | null,
): void {
  const types = detected !== null && !areCompatible(declared, detected) ? [declared, detected] : [declared];

  if (settings.fileTypeRestrictionMode === FileTypeRestrictionMode.ALLOWLIST) {
    for (const type of types) {
      if (!settings.fileTypeList.some((pattern) => matchesFileTypePattern(pattern, type))) {
        throw new BadRequestError(`File type "${type}" is not allowed`);
      }
    }
  } else if (settings.fileTypeRestrictionMode === FileTypeRestrictionMode.BLOCKLIST) {
    for (const type of types) {
      if (settings.fileTypeList.some((pattern) => matchesFileTypePattern(pattern, type))) {
        throw new BadRequestError(`File type "${type}" is blocked`);
      }
    }
  }
}

/// La extensión del nombre original es solo un indicio, nunca se confía en
/// ella para construir la ruta física: si no es alfanumérica simple, se cae
/// al mapeo por mime type (ver ALLOWED_MIME_TYPES), y si tampoco hay match,
/// a "bin". Esto es lo que hace seguro construir `relativePath` sin validar
/// path traversal en storage: el nombre físico siempre lo generamos nosotros.
export function safeExtension(originalName: string, mimeType: string): string {
  const fromName = path.extname(originalName).replace(".", "").toLowerCase();
  if (/^[a-z0-9]{1,10}$/.test(fromName)) {
    return fromName;
  }
  return ALLOWED_MIME_TYPES[mimeType]?.extension ?? "bin";
}

function getSigningSecret(): string {
  // Sin secreto propio, el de sesión: nunca el de un proveedor externo.
  return env.FILE_URL_SIGNING_SECRET || env.auth.sessionSecret;
}

/// Genera un token HMAC con expiración para acceder a un archivo específico (TTL default 1 hora).
export function generateFileToken(fileId: string, userId?: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const uid = userId ?? "anonymous";
  const data = `${fileId}:${uid}:${exp}`;
  const sig = createHmac("sha256", getSigningSecret()).update(data).digest("base64url");
  const payload = Buffer.from(JSON.stringify({ u: uid, e: exp })).toString("base64url");
  return `${payload}.${sig}`;
}

/// Verifica el token HMAC de una URL de archivo, comprobando expiración y firma criptográfica.
export function verifyFileToken(fileId: string, token: string): { userId: string } {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new UnauthorizedError("Invalid token format");
  }
  const [payloadB64, sig] = parts;
  let parsed: { u: string; e: number };
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
  } catch {
    throw new UnauthorizedError("Invalid token payload");
  }
  const { u: userId, e: exp } = parsed;
  if (!userId || typeof exp !== "number") {
    throw new UnauthorizedError("Malformed token payload");
  }
  if (Math.floor(Date.now() / 1000) > exp) {
    throw new UnauthorizedError("Token expired");
  }
  const expectedData = `${fileId}:${userId}:${exp}`;
  const expectedSig = createHmac("sha256", getSigningSecret()).update(expectedData).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new UnauthorizedError("Invalid token signature");
  }
  return { userId };
}

/// Evalúa si un usuario tiene permiso para acceder a un archivo (§5.4).
export async function canAccessFile(
  userId: string,
  fileId: string,
  userRoles: string[] = [],
): Promise<boolean> {
  if (userRoles.includes(ADMIN_ROLE)) {
    return true;
  }
  return FileRepository.checkUserFileAccess(userId, fileId);
}

/// Construye la cabecera Content-Disposition con RFC 5987 y allowlist inline sin SVG (S6, S7).
export function buildContentDisposition(
  originalName: string,
  mimeType: string,
  forceDownload = false,
): string {
  const isInlineAllowed =
    !forceDownload &&
    (mimeType.startsWith("audio/") ||
      mimeType === "video/mp4" ||
      ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mimeType));

  const dispositionType = isInlineAllowed ? "inline" : "attachment";

  const rawClean = (originalName || "")
    .replace(/[\x00-\x1f\x7f"\\;]/g, "_")
    .replace(/[^\x20-\x7e]/g, "_");

  const sanitizedAscii = rawClean.replace(/[_.\s]/g, "").length > 0 ? rawClean : "archivo";

  const effectiveName =
    originalName && originalName.replace(/[\x00-\x1f\x7f]/g, "").trim() ? originalName : "archivo";
  const encodedUtf8 = encodeURIComponent(effectiveName)
    .replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

  return `${dispositionType}; filename="${sanitizedAscii}"; filename*=UTF-8''${encodedUtf8}`;
}

/// Exportada para que otros módulos que ya tienen un `StoredFile` en mano
/// (ej. messages, al listar los archivos compartidos de una conversación)
/// armen la misma forma pública sin duplicar la lógica de `url`.
export function toStoredFileResponse(file: StoredFile, currentUserId?: string): StoredFileResponse {
  const token = generateFileToken(file.id, currentUserId ?? file.createdById ?? undefined);
  return {
    id: file.id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    extension: file.extension,
    // StoredFile.size es bigint en Prisma (ver schema.prisma) — la API
    // pública lo mantiene number (Number.MAX_SAFE_INTEGER son ~9 PB, sobra).
    size: Number(file.size),
    url: `/api/v1/files/${file.id}/content?t=${token}`,
    createdAt: file.createdAt,
    deletedAt: file.deletedAt,
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

  // El tipo real, según el contenido, además del que declara el cliente.
  assertFileTypeAllowed(
    settings,
    upload.mimetype,
    detectMimeFromSignature(upload.buffer.subarray(0, SIGNATURE_BYTES)),
  );

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

  const { provider, storage: writeStorage } = getWriteProvider();
  const saved = await writeStorage.save(upload.buffer, `${buildStorageDir(conversationId)}/${storedName}`);

  const file = await FileRepository.createStoredFile({
    originalName: upload.originalname,
    storedName,
    path: saved.path,
    mimeType: upload.mimetype,
    extension,
    size: BigInt(saved.size),
    checksum,
    createdById: currentUserId,
    provider,
  });

  return toStoredFileResponse(file, currentUserId);
}

export async function getFile(
  fileId: string,
  currentUserId?: string,
  userRoles: string[] = [],
): Promise<StoredFileResponse> {
  const file = await FileRepository.findActiveById(fileId);
  if (!file) {
    throw new NotFoundError("File not found");
  }
  if (currentUserId && !(await canAccessFile(currentUserId, fileId, userRoles))) {
    throw new ForbiddenError("You do not have access to this file");
  }
  return toStoredFileResponse(file, currentUserId);
}

export async function getFileChecksum(fileId: string): Promise<string | null> {
  const file = await FileRepository.findActiveById(fileId);
  return file?.checksum ?? null;
}

/// Usado por el módulo auth para cachear la foto de perfil del proveedor externo como
/// `StoredFile` (ver auth.service.ts `setAvatarFromProvider`). No pasa por
/// `ALLOWED_MIME_TYPES` como `uploadFile` — el proveedor puede devolver cualquier
/// tipo de imagen, y este flujo no viene de un formulario del usuario.
export async function storeAvatar(userId: string, buffer: Buffer, mimeType: string): Promise<StoredFileResponse> {
  // Un avatar se sirve sin autenticación: tiene que ser una imagen de verdad (PNG,
  // JPEG, GIF o WebP), no cualquier cosa declarada como `image/*`.
  const detected = detectMimeFromSignature(buffer.subarray(0, SIGNATURE_BYTES));
  if (!detected || !AVATAR_IMAGE_MIME_TYPES.includes(detected)) {
    throw new BadRequestError("The file is not a valid image");
  }

  const subtype = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const extension = ALLOWED_MIME_TYPES[mimeType]?.extension ?? subtype ?? "bin";
  const storedName = `${randomUUID()}.${extension}`;
  const checksum = createHash("sha256").update(buffer).digest("hex");

  const { provider, storage: writeStorage } = getWriteProvider();
  const saved = await writeStorage.save(buffer, `avatars/${userId}/${storedName}`);

  const file = await FileRepository.createStoredFile({
    originalName: `avatar.${extension}`,
    storedName,
    path: saved.path,
    mimeType,
    extension,
    size: BigInt(saved.size),
    checksum,
    createdById: userId,
    provider,
  });

  return toStoredFileResponse(file, userId);
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
    provider: file.provider,
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
    const fileProvider = getProvider(file.provider);
    await fileProvider.delete(file.path);
  } catch (error) {
    getLogger().error({ fileId, err: error }, "failed to delete physical file");
  }

  const [deleted] = await prisma.$transaction([
    FileRepository.softDelete(fileId),
    AuditRepository.createOperation(
      AuditService.buildAuditData({
        action: AuditAction.ADMIN_DELETE_FILE,
        targetType: "StoredFile",
        targetId: fileId,
        metadata: { provider: file.provider, sizeBytes: Number(file.size), mimeType: file.mimeType },
      }),
    ),
  ]);

  return { id: fileId };
}

/// Retorna estadísticas de almacenamiento (LOCAL vs S3) y estado de migración para el panel admin (§7.4).
export async function getFileStorageStats(): Promise<FileStorageStatsResponse> {
  const [counts, settings] = await Promise.all([
    FileRepository.countFilesByProvider(),
    SettingsService.getSettings(),
  ]);

  return {
    localCount: counts.local,
    s3Count: counts.s3,
    totalCount: counts.total,
    migrationEnabled: settings.fileMigrationEnabled,
    migrationBatchSize: settings.fileMigrationBatchSize,
    migrationIntervalMinutes: settings.fileMigrationIntervalMinutes,
  };
}


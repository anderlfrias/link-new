import { randomUUID } from "crypto";
import path from "path";
import { FileProvider, FileTypeRestrictionMode, FileUploadStatus } from "@prisma/client";
import { ADMIN_ROLE } from "../../constants/roles.constant";
import { getProvider } from "../../storage";
import type { StorageProvider } from "../../storage";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
} from "../../utils/errors";
import { isConversationMember } from "../conversations/conversation.repository";
import * as FileRepository from "../files/file.repository";
import { SIGNATURE_BYTES, detectMimeFromSignature } from "../files/file-signature";
import {
  assertFileTypeAllowed,
  buildStorageDir,
  safeExtension,
  toStoredFileResponse,
} from "../files/file.service";
import { StoredFileResponse } from "../files/file.types";
import * as SettingsService from "../settings/settings.service";
import * as UploadRepository from "./upload.repository";
import {
  CompleteUploadInput,
  GetPartUrlsInput,
  InitiateUploadInput,
  InitiateUploadResponse,
  PartUrlItem,
  UploadStatusPart,
  UploadStatusResponse,
} from "./upload.types";

export const PART_SIZE = 8 * 1024 * 1024; // 8 MiB por parte (§4.4)
export const MAX_PART_URLS_BATCH = 20; // Lotes de hasta 20 URLs (§4.4)
export const PART_URL_EXPIRES_IN_SECONDS = 15 * 60; // 15 minutos de TTL (§4.4)
export const UPLOAD_SESSION_TTL_HOURS = 24; // Sesión vive 24 horas antes de expirar
export const MAX_ACTIVE_UPLOADS_PER_USER = 5; // Máximo de sesiones activas simultáneas (S5)

/// Los primeros `bytes` de un objeto, para reconocer su tipo real. Pide un rango
/// (`Range`) y corta la lectura: nunca baja el archivo entero.
async function readHead(
  provider: Pick<StorageProvider, "createReadStream">,
  objectKey: string,
  bytes: number,
): Promise<Buffer> {
  const stream = await provider.createReadStream(objectKey, { start: 0, end: bytes - 1 });
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    const buffer = Buffer.from(chunk);
    chunks.push(buffer);
    total += buffer.length;
    if (total >= bytes) break;
  }
  (stream as { destroy?: () => void }).destroy?.();
  return Buffer.concat(chunks).subarray(0, bytes);
}

/// Inicia una sesión de subida multipart en S3 y crea el registro PENDING en Postgres (§4.3).
export async function initiateUpload(
  userId: string,
  input: InitiateUploadInput,
): Promise<InitiateUploadResponse> {
  if (input.conversationId && !(await isConversationMember(input.conversationId, userId))) {
    throw new ForbiddenError("You are not a member of this conversation");
  }

  const settings = await SettingsService.getSettings();

  if (input.size > settings.maxUploadSizeMb * 1024 * 1024) {
    throw new BadRequestError(`File exceeds the maximum allowed size of ${settings.maxUploadSizeMb}MB`);
  }

  // Todavía no hay bytes que mirar: acá solo vale el tipo declarado. El contenido
  // real se verifica al completar la subida (`completeUpload`).
  assertFileTypeAllowed(settings, input.mimeType, null);

  // Mitigación S5: limitar sesiones activas por usuario para prevenir agotamiento de disco/recursos
  const activeCount = await UploadRepository.countActiveUploadsByUser(userId);
  if (activeCount >= MAX_ACTIVE_UPLOADS_PER_USER) {
    throw new ConflictError(
      `Alcanzaste el límite de subidas activas concurrentes (máximo ${MAX_ACTIVE_UPLOADS_PER_USER}). Esperá a que terminen o cancelalas antes de iniciar otra.`,
    );
  }

  const ext = safeExtension(input.name, input.mimeType);
  const dir = buildStorageDir(input.conversationId);
  const objectKey = `${dir}/${randomUUID()}.${ext}`;

  const s3 = getProvider(FileProvider.S3);
  if (!s3.createMultipartUpload) {
    throw new ServiceUnavailableError("Multipart storage provider is unavailable");
  }

  const externalUploadId = await s3.createMultipartUpload(objectKey, input.mimeType);

  const totalParts = Math.max(1, Math.ceil(input.size / PART_SIZE));
  const expiresAt = new Date(Date.now() + UPLOAD_SESSION_TTL_HOURS * 60 * 60 * 1000);

  const upload = await UploadRepository.createUpload({
    provider: FileProvider.S3,
    objectKey,
    externalUploadId,
    originalName: input.name,
    mimeType: input.mimeType,
    extension: ext,
    declaredSize: BigInt(input.size),
    partSize: PART_SIZE,
    totalParts,
    createdById: userId,
    conversationId: input.conversationId ?? null,
    expiresAt,
  });

  return {
    uploadSessionId: upload.id,
    partSize: PART_SIZE,
    totalParts,
    expiresAt,
  };
}

/// Obtiene el estado actual de una sesión y las partes subidas según ListParts (§4.3, §5.3).
export async function getUploadStatus(
  uploadId: string,
  userId: string,
  userRoles: string[] = [],
): Promise<UploadStatusResponse> {
  const upload = await UploadRepository.findById(uploadId);
  if (!upload) {
    throw new NotFoundError("Upload session not found");
  }

  // Mitigación S11: verificar propiedad o rol admin
  if (upload.createdById !== userId && !userRoles.includes(ADMIN_ROLE)) {
    throw new ForbiddenError("You do not have permission to access this upload session");
  }

  let parts: UploadStatusPart[] = [];
  if (
    (upload.status === FileUploadStatus.PENDING || upload.status === FileUploadStatus.UPLOADING) &&
    upload.externalUploadId
  ) {
    const s3 = getProvider(upload.provider);
    if (s3.listParts) {
      parts = await s3.listParts(upload.objectKey, upload.externalUploadId);
    }
  }

  return {
    id: upload.id,
    status: upload.status,
    originalName: upload.originalName,
    declaredSize: Number(upload.declaredSize),
    partSize: upload.partSize,
    totalParts: upload.totalParts,
    parts,
    expiresAt: upload.expiresAt,
  };
}

/// Genera URLs presignadas para un lote de números de parte (TTL 15 min, max 20 partes) (§4.3, §4.4).
export async function getPartUrls(
  uploadId: string,
  userId: string,
  userRoles: string[] = [],
  input: GetPartUrlsInput,
): Promise<PartUrlItem[]> {
  const upload = await UploadRepository.findById(uploadId);
  if (!upload) {
    throw new NotFoundError("Upload session not found");
  }

  // Mitigación S11: verificar propiedad o rol admin
  if (upload.createdById !== userId && !userRoles.includes(ADMIN_ROLE)) {
    throw new ForbiddenError("You do not have permission to access this upload session");
  }

  if (upload.status !== FileUploadStatus.PENDING && upload.status !== FileUploadStatus.UPLOADING) {
    throw new BadRequestError("Upload session is not active");
  }

  if (upload.expiresAt < new Date()) {
    throw new BadRequestError("Upload session has expired");
  }

  if (input.partNumbers.length > MAX_PART_URLS_BATCH) {
    throw new BadRequestError(`Cannot request more than ${MAX_PART_URLS_BATCH} part URLs per batch`);
  }

  for (const partNumber of input.partNumbers) {
    if (partNumber < 1 || partNumber > upload.totalParts) {
      throw new BadRequestError(`Part number ${partNumber} is out of range (1..${upload.totalParts})`);
    }
  }

  if (upload.status === FileUploadStatus.PENDING) {
    await UploadRepository.updateStatus(upload.id, FileUploadStatus.UPLOADING);
  }

  const s3 = getProvider(upload.provider);
  if (!s3.getPresignedPartUploadUrl || !upload.externalUploadId) {
    throw new ServiceUnavailableError("Multipart storage provider is unavailable");
  }

  const partUrls = await Promise.all(
    input.partNumbers.map(async (partNumber) => {
      const url = await s3.getPresignedPartUploadUrl!(
        upload.objectKey,
        upload.externalUploadId!,
        partNumber,
        PART_URL_EXPIRES_IN_SECONDS,
      );
      return { partNumber, url };
    }),
  );

  return partUrls;
}

/// Completa la subida multipart, ejecuta HeadObject para verificación S1 y crea el StoredFile (§4.3).
export async function completeUpload(
  uploadId: string,
  userId: string,
  userRoles: string[] = [],
  input: CompleteUploadInput,
): Promise<StoredFileResponse> {
  const upload = await UploadRepository.findById(uploadId);
  if (!upload) {
    throw new NotFoundError("Upload session not found");
  }

  // Mitigación S11: verificar propiedad o rol admin
  if (upload.createdById !== userId && !userRoles.includes(ADMIN_ROLE)) {
    throw new ForbiddenError("You do not have permission to access this upload session");
  }

  if (upload.status !== FileUploadStatus.PENDING && upload.status !== FileUploadStatus.UPLOADING) {
    throw new BadRequestError("Upload session is not active");
  }

  if (upload.expiresAt < new Date()) {
    throw new BadRequestError("Upload session has expired");
  }

  const s3 = getProvider(upload.provider);
  if (!s3.listParts || !s3.completeMultipartUpload || !upload.externalUploadId) {
    throw new ServiceUnavailableError("Multipart storage provider is unavailable");
  }

  // Consultar partes autoritativas del storage (fuente de verdad indiscutible)
  const parts = await s3.listParts(upload.objectKey, upload.externalUploadId);

  if (parts.length !== upload.totalParts) {
    throw new BadRequestError(
      `Missing parts: received ${parts.length} parts, expected ${upload.totalParts}`,
    );
  }

  const partsMap = new Map(parts.map((p) => [p.partNumber, p.eTag]));
  const sortedParts: Array<{ partNumber: number; eTag: string }> = [];

  for (let i = 1; i <= upload.totalParts; i++) {
    const eTag = partsMap.get(i);
    if (!eTag) {
      throw new BadRequestError(`Missing part ${i}`);
    }
    sortedParts.push({ partNumber: i, eTag });
  }

  // Ensamblar multipart en el storage
  await s3.completeMultipartUpload(upload.objectKey, upload.externalUploadId, sortedParts);

  // =========================================================================
  // INVARIANTE CRÍTICO S1: HeadObject obligatorio para verificar tamaño real.
  // El cliente solo declara un tamaño; si el objeto ensamblado excede el límite
  // configurado en AppSettings, se borra de inmediato con DeleteObject y se rechaza.
  // =========================================================================
  const stats = await s3.stat(upload.objectKey);
  const realSize = stats.size;

  const settings = await SettingsService.getSettings();
  const maxBytes = settings.maxUploadSizeMb * 1024 * 1024;

  if (realSize > maxBytes || realSize <= 0) {
    // Borrado físico inmediato para mitigar abuso/exceso
    try {
      await s3.delete(upload.objectKey);
    } catch {
      // Ignorar error secundario de borrado pero registrar estado FAILED
    }

    await UploadRepository.updateStatus(upload.id, FileUploadStatus.FAILED, {
      closedAt: new Date(),
    });

    throw new BadRequestError(
      `File exceeds maximum allowed size of ${settings.maxUploadSizeMb}MB (actual size: ${realSize} bytes)`,
    );
  }

  // El tipo declarado se validó al iniciar; ahora que el objeto está armado, también
  // el real, según sus primeros bytes. Si miente, se borra igual que si excediera
  // el tamaño.
  try {
    assertFileTypeAllowed(
      settings,
      upload.mimeType,
      detectMimeFromSignature(await readHead(s3, upload.objectKey, SIGNATURE_BYTES)),
    );
  } catch (error) {
    if (error instanceof BadRequestError) {
      try {
        await s3.delete(upload.objectKey);
      } catch {
        // Ignorar error secundario de borrado pero registrar estado FAILED
      }
      await UploadRepository.updateStatus(upload.id, FileUploadStatus.FAILED, {
        closedAt: new Date(),
      });
    }
    throw error;
  }

  // Crear StoredFile definitivo con provider=S3
  const storedFile = await FileRepository.createStoredFile({
    originalName: upload.originalName,
    storedName: path.basename(upload.objectKey),
    path: upload.objectKey,
    mimeType: upload.mimeType,
    extension: upload.extension,
    size: BigInt(realSize),
    provider: upload.provider,
    checksum: input.checksum ?? null,
    createdById: upload.createdById,
  });

  // Marcar sesión como COMPLETED
  await UploadRepository.markCompleted(upload.id, storedFile.id, input.checksum ?? null);

  return toStoredFileResponse(storedFile, userId);
}

/// Cancela una sesión multipart, llama a AbortMultipartUpload y pasa el estado a ABORTED (§4.3).
export async function abortUpload(
  uploadId: string,
  userId: string,
  userRoles: string[] = [],
): Promise<{ message: string }> {
  const upload = await UploadRepository.findById(uploadId);
  if (!upload) {
    throw new NotFoundError("Upload session not found");
  }

  // Mitigación S11: verificar propiedad o rol admin
  if (upload.createdById !== userId && !userRoles.includes(ADMIN_ROLE)) {
    throw new ForbiddenError("You do not have permission to access this upload session");
  }

  if (upload.status === FileUploadStatus.COMPLETED) {
    throw new BadRequestError("Cannot abort an already completed upload");
  }

  if (upload.status === FileUploadStatus.ABORTED) {
    return { message: "Upload session already aborted" };
  }

  const s3 = getProvider(upload.provider);
  if (s3.abortMultipartUpload && upload.externalUploadId) {
    try {
      await s3.abortMultipartUpload(upload.objectKey, upload.externalUploadId);
    } catch {
      // Continuar para cerrar la sesión localmente
    }
  }

  await UploadRepository.updateStatus(upload.id, FileUploadStatus.ABORTED, {
    closedAt: new Date(),
  });

  return { message: "Upload session aborted successfully" };
}

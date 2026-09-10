import { FileProvider, FileUpload, FileUploadStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";

export function createUpload(data: {
  provider: FileProvider;
  objectKey: string;
  externalUploadId: string;
  originalName: string;
  mimeType: string;
  extension: string;
  declaredSize: bigint;
  partSize: number;
  totalParts: number;
  createdById: string;
  conversationId?: string | null;
  expiresAt: Date;
}): Promise<FileUpload> {
  return prisma.fileUpload.create({
    data: {
      provider: data.provider,
      objectKey: data.objectKey,
      externalUploadId: data.externalUploadId,
      originalName: data.originalName,
      mimeType: data.mimeType,
      extension: data.extension,
      declaredSize: data.declaredSize,
      partSize: data.partSize,
      totalParts: data.totalParts,
      status: FileUploadStatus.PENDING,
      createdById: data.createdById,
      conversationId: data.conversationId ?? null,
      expiresAt: data.expiresAt,
    },
  });
}

export function findById(id: string): Promise<FileUpload | null> {
  return prisma.fileUpload.findUnique({
    where: { id },
  });
}

export function updateStatus(
  id: string,
  status: FileUploadStatus,
  extra?: {
    closedAt?: Date | null;
    clientChecksum?: string | null;
    storedFileId?: string | null;
  },
): Promise<FileUpload> {
  return prisma.fileUpload.update({
    where: { id },
    data: {
      status,
      ...extra,
    },
  });
}

export function countActiveUploadsByUser(userId: string): Promise<number> {
  return prisma.fileUpload.count({
    where: {
      createdById: userId,
      status: {
        in: [FileUploadStatus.PENDING, FileUploadStatus.UPLOADING],
      },
      expiresAt: {
        gt: new Date(),
      },
    },
  });
}

export function markCompleted(
  id: string,
  storedFileId: string,
  clientChecksum: string | null,
): Promise<FileUpload> {
  return prisma.fileUpload.update({
    where: { id },
    data: {
      status: FileUploadStatus.COMPLETED,
      storedFileId,
      clientChecksum,
      closedAt: new Date(),
    },
  });
}

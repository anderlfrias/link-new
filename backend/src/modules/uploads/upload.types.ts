import { FileUploadStatus } from "@prisma/client";

export interface InitiateUploadInput {
  name: string;
  size: number;
  mimeType: string;
  conversationId?: string;
}

export interface InitiateUploadResponse {
  uploadSessionId: string;
  partSize: number;
  totalParts: number;
  expiresAt: Date;
}

export interface PartUrlItem {
  partNumber: number;
  url: string;
}

export interface UploadStatusPart {
  partNumber: number;
  size: number;
  eTag: string;
}

export interface UploadStatusResponse {
  id: string;
  status: FileUploadStatus;
  originalName: string;
  declaredSize: number;
  partSize: number;
  totalParts: number;
  parts: UploadStatusPart[];
  expiresAt: Date;
}

export interface GetPartUrlsInput {
  partNumbers: number[];
}

export interface CompleteUploadInput {
  checksum?: string;
}

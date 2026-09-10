import type { UploadedFile } from "./file.types";

export type FileUploadStatus =
  | "PENDING"
  | "UPLOADING"
  | "COMPLETED"
  | "ABORTED"
  | "EXPIRED"
  | "FAILED";

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
  expiresAt: string;
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
  expiresAt: string;
}

export interface CompleteUploadInput {
  checksum?: string;
}

export type CompleteUploadResponse = UploadedFile;

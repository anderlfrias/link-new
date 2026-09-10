import { FileProvider } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/env", () => ({
  default: {
    STORAGE_WRITE_PROVIDER: "LOCAL",
    S3_ENDPOINT: "http://seaweedfs:8333",
    S3_REGION: "us-east-1",
    S3_BUCKET: "test-bucket",
    S3_FORCE_PATH_STYLE: true,
  },
}));

vi.mock("./s3.storage", () => {
  return {
    S3Storage: vi.fn().mockImplementation(function (this: any) {
      this.type = "S3Storage";
      return this;
    }),
  };
});

import env from "../config/env";
import { getProvider, getWriteProvider, storage } from "./index";
import { LocalDiskStorage } from "./local-disk.storage";
import { S3Storage } from "./s3.storage";

describe("storage index resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (env as any).STORAGE_WRITE_PROVIDER = "LOCAL";
  });

  it("getProvider devuelve LocalDiskStorage para FileProvider.LOCAL", () => {
    const provider = getProvider(FileProvider.LOCAL);
    expect(provider).toBeInstanceOf(LocalDiskStorage);
  });

  it("getProvider devuelve S3Storage para FileProvider.S3", () => {
    const provider = getProvider(FileProvider.S3);
    expect(provider).toBeInstanceOf(S3Storage);
  });

  it("getWriteProvider devuelve FileProvider.LOCAL cuando STORAGE_WRITE_PROVIDER es LOCAL", () => {
    (env as any).STORAGE_WRITE_PROVIDER = "LOCAL";
    const writeProvider = getWriteProvider();
    expect(writeProvider.provider).toBe(FileProvider.LOCAL);
    expect(writeProvider.storage).toBeInstanceOf(LocalDiskStorage);
  });

  it("getWriteProvider devuelve FileProvider.S3 cuando STORAGE_WRITE_PROVIDER es S3", () => {
    (env as any).STORAGE_WRITE_PROVIDER = "S3";
    const writeProvider = getWriteProvider();
    expect(writeProvider.provider).toBe(FileProvider.S3);
    expect(writeProvider.storage).toBeInstanceOf(S3Storage);
  });

  it("storage exportado es una instancia de LocalDiskStorage", () => {
    expect(storage).toBeInstanceOf(LocalDiskStorage);
  });
});

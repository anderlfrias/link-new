import { FileProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { getProvider, getWriteProvider, storage } from "./index";
import { LocalDiskStorage } from "./local-disk.storage";

describe("storage index resolver", () => {
  it("getProvider devuelve LocalDiskStorage para FileProvider.LOCAL", () => {
    const provider = getProvider(FileProvider.LOCAL);
    expect(provider).toBeInstanceOf(LocalDiskStorage);
  });

  it("getProvider lanza error si FileProvider.S3 se solicita antes de Fase 3", () => {
    expect(() => getProvider(FileProvider.S3)).toThrow("S3 storage provider is not yet configured (Phase 3)");
  });

  it("getWriteProvider devuelve FileProvider.LOCAL y su instancia", () => {
    const writeProvider = getWriteProvider();
    expect(writeProvider.provider).toBe(FileProvider.LOCAL);
    expect(writeProvider.storage).toBeInstanceOf(LocalDiskStorage);
  });

  it("storage exportado es una instancia de LocalDiskStorage", () => {
    expect(storage).toBeInstanceOf(LocalDiskStorage);
  });
});

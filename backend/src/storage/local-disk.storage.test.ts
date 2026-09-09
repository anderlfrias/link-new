import fs from "fs";
import fsPromises from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDiskStorage } from "./local-disk.storage";

describe("LocalDiskStorage", () => {
  let tempDir: string;
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-storage-test-"));
    storage = new LocalDiskStorage(tempDir);
  });

  afterEach(async () => {
    if (tempDir && fs.existsSync(tempDir)) {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("guarda un archivo creando subdirectorios y devuelve la ruta relativa y tamaño", async () => {
    const buffer = Buffer.from("Contenido de prueba");
    const relativePath = path.join("sub", "folder", "test.txt");

    const saved = await storage.save(buffer, relativePath);

    expect(saved.path).toBe(relativePath);
    expect(saved.size).toBe(buffer.length);

    const fullPath = path.join(tempDir, relativePath);
    expect(fs.existsSync(fullPath)).toBe(true);
    const readContent = await fsPromises.readFile(fullPath, "utf-8");
    expect(readContent).toBe("Contenido de prueba");
  });

  it("elimina un archivo existente del disco", async () => {
    const buffer = Buffer.from("Archivo a eliminar");
    const relativePath = "delete-me.txt";

    await storage.save(buffer, relativePath);
    const fullPath = path.join(tempDir, relativePath);
    expect(fs.existsSync(fullPath)).toBe(true);

    await storage.delete(relativePath);
    expect(fs.existsSync(fullPath)).toBe(false);
  });

  it("delete no lanza error si el archivo no existe", async () => {
    await expect(storage.delete("no-existe.txt")).resolves.not.toThrow();
  });

  it("getPublicUrl normaliza separadores a '/' y prefija con /uploads/", () => {
    const rel = path.join("chat", "123", "foto.png");
    const url = storage.getPublicUrl(rel);

    expect(url).toBe("/uploads/chat/123/foto.png");
  });
});

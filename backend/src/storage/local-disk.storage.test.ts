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

  it("stat devuelve el tamaño en bytes del archivo existente", async () => {
    const buffer = Buffer.from("Datos para stat");
    const relativePath = "stat-test.txt";
    await storage.save(buffer, relativePath);

    const fileStat = await storage.stat(relativePath);
    expect(fileStat.size).toBe(buffer.length);
  });

  it("createReadStream lee los bytes del archivo correctamente", async () => {
    const buffer = Buffer.from("Stream de prueba");
    const relativePath = "stream-test.txt";
    await storage.save(buffer, relativePath);

    const stream = await storage.createReadStream(relativePath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString("utf-8")).toBe("Stream de prueba");
  });

  it("getAbsolutePath devuelve la ruta absoluta y previene path traversal (S15)", async () => {
    const safePath = storage.getAbsolutePath("chat/archivo.txt");
    expect(safePath).toBe(path.resolve(tempDir, "chat/archivo.txt"));

    expect(() => storage.getAbsolutePath("../../../etc/passwd")).toThrow("Path traversal detected");
    await expect(storage.save(Buffer.from("x"), "../evil.txt")).rejects.toThrow("Path traversal detected");
  });
});


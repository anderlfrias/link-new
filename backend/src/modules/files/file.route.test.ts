import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middlewares/error.middleware";
import * as fileRepository from "./file.repository";
import fileRouter, { adminFileRouter } from "./file.route";
import * as FileService from "./file.service";

// LARGE_FILES_PLAN.md Fase 1 (B2/S13, S14): este archivo cubre justo lo que
// file.controller.test.ts NO puede — la mecánica de wiring del router real
// (multer + el nuevo rate limiter), no la lógica del handler (esa ya está
// cubierta con mocks livianos en file.controller.test.ts).

import fs from "fs";
import os from "os";
import path from "path";

const { tempFilePath, tempDir } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsLib = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const osLib = require("os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pathLib = require("path");
  const dir = fsLib.mkdtempSync(pathLib.join(osLib.tmpdir(), "route-test-"));
  const file = pathLib.join(dir, "test.txt");
  fsLib.writeFileSync(file, "contenido de prueba para range");
  return { tempFilePath: file, tempDir: dir };
});

vi.mock("./file.service", () => ({
  uploadFile: vi.fn(),
  getFile: vi.fn(),
  deleteFile: vi.fn(),
  listFilesForAdmin: vi.fn(),
  adminDeleteFile: vi.fn(),
  getFileStorageStats: vi.fn(),
  verifyFileToken: vi.fn(),
  canAccessFile: vi.fn(),
  buildContentDisposition: vi.fn((name: string, mime: string) => `inline; filename="${name}"`),
}));

vi.mock("./file.repository", () => ({
  findActiveById: vi.fn(),
  isAvatarFile: vi.fn(),
}));

vi.mock("../../storage", () => ({
  getProvider: vi.fn((provider?: string) => {
    if (provider === "S3") {
      return {
        getPresignedDownloadUrl: vi.fn().mockResolvedValue("https://s3.example.com/link-files/file.png?sig=123"),
      };
    }
    return {
      getAbsolutePath: vi.fn(() => tempFilePath),
    };
  }),
  getWriteProvider: vi.fn(() => ({
    provider: "LOCAL",
    storage: { save: vi.fn() },
  })),
  LocalDiskStorage: vi.fn(),
  S3Storage: vi.fn(),
}));

vi.mock("../auth/jwt", () => ({
  verifyToken: vi.fn((token: string) => {
    if (token.startsWith("admin-token:")) {
      const id = token.slice("admin-token:".length);
      return { id: `ext-${id}`, email: `${id}@example.com`, roles: ["admin"] };
    }
    if (token.startsWith("user-token:")) {
      const id = token.slice("user-token:".length);
      return { id: `ext-${id}`, email: `${id}@example.com`, roles: ["user"] };
    }
    throw new Error("Unknown token");
  }),
  mapTokenToUser: vi.fn((payload: any) => ({
    id: payload.id,
    email: payload.email,
    roles: payload.roles,
  })),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn((args: any) =>
        Promise.resolve({ id: `internal-${args.where.email}`, email: args.where.email }),
      ),
    },
  },
}));

function buildTestApp() {
  const app = express();
  app.use("/files", fileRouter);
  app.use("/admin/files", adminFileRouter);
  app.use(errorHandler);
  return app;
}

// Cada test usa un usuario distinto (mismo mecanismo que uniqueKey() en
// rate-limit.middleware.test.ts) para no compartir cupo del rate limiter
// entre tests de este archivo.
let uniqueSuffix = 0;
function tokenForFreshUser(): string {
  uniqueSuffix += 1;
  return `user-token:route-test-${uniqueSuffix}`;
}

describe("file.route (wiring: multer + rate limit)", () => {
  const app = buildTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza un body por encima del techo absoluto (32MB) con 400, sin llamar a FileService", async () => {
    const oversized = Buffer.alloc(33 * 1024 * 1024, "a");

    const res = await request(app)
      .post("/files")
      .set("Authorization", `Bearer ${tokenForFreshUser()}`)
      .attach("file", oversized, "big.bin");

    expect(res.status).toBe(400);
    expect(FileService.uploadFile).not.toHaveBeenCalled();
  }, 20000);

  it("acepta un body por debajo del techo absoluto y llega al controller", async () => {
    vi.mocked(FileService.uploadFile).mockResolvedValue({ id: "f-1", originalName: "small.txt" } as any);

    const res = await request(app)
      .post("/files")
      .set("Authorization", `Bearer ${tokenForFreshUser()}`)
      .attach("file", Buffer.from("contenido chico"), "small.txt");

    expect(res.status).toBe(201);
    expect(FileService.uploadFile).toHaveBeenCalled();
  });

  it("el rate limiter de subidas está montado en POST / (headers RateLimit-* presentes)", async () => {
    vi.mocked(FileService.uploadFile).mockResolvedValue({ id: "f-1" } as any);

    const res = await request(app)
      .post("/files")
      .set("Authorization", `Bearer ${tokenForFreshUser()}`)
      .attach("file", Buffer.from("x"), "x.txt");

    expect(res.status).toBe(201);
    expect(res.headers["ratelimit-limit"]).toBe("60");
    expect(res.headers["ratelimit-remaining"]).toBe("59");
  });

  it("el rate limiter corta ANTES de multer: una subida sobre-tamaño ya bloqueada no llega a FileService", async () => {
    const token = tokenForFreshUser();
    vi.mocked(FileService.uploadFile).mockResolvedValue({ id: "f-1" } as any);

    for (let i = 0; i < 60; i++) {
      await request(app).post("/files").set("Authorization", `Bearer ${token}`).attach("file", Buffer.from("x"), "x.txt");
    }
    vi.mocked(FileService.uploadFile).mockClear();

    const blocked = await request(app)
      .post("/files")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("x"), "x.txt");

    expect(blocked.status).toBe(429);
    expect(FileService.uploadFile).not.toHaveBeenCalled();
  }, 20000);
});

describe("GET /files/:id/content", () => {
  const app = buildTestApp();

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockFile = {
    id: "f-123",
    originalName: "test.txt",
    mimeType: "text/plain",
    size: 29,
    path: "2026/09/test.txt",
    provider: "LOCAL",
    createdById: "u-owner",
  };

  it("retorna 404 si el archivo no existe o está eliminado", async () => {
    vi.mocked(fileRepository.findActiveById).mockResolvedValue(null);

    const res = await request(app).get("/files/not-found/content?t=valid-token");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no encontrado/i);
  });

  it("retorna 401 si no se envía token HMAC, ni Bearer JWT, y no es avatar público", async () => {
    vi.mocked(fileRepository.findActiveById).mockResolvedValue(mockFile as any);
    vi.mocked(fileRepository.isAvatarFile).mockResolvedValue(false);

    const res = await request(app).get("/files/f-123/content");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/autenticaci/i);
  });

  it("retorna 401 si el token HMAC en ?t= es inválido", async () => {
    vi.mocked(fileRepository.findActiveById).mockResolvedValue(mockFile as any);
    vi.mocked(FileService.verifyFileToken).mockReturnValue(null);

    const res = await request(app).get("/files/f-123/content?t=invalid-hmac");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/inválido o expirado/i);
  });

  it("retorna 403 si el usuario del token HMAC no tiene acceso (canAccessFile = false)", async () => {
    vi.mocked(fileRepository.findActiveById).mockResolvedValue(mockFile as any);
    vi.mocked(FileService.verifyFileToken).mockReturnValue({ userId: "u-intruder", fileId: "f-123" });
    vi.mocked(FileService.canAccessFile).mockResolvedValue(false);

    const res = await request(app).get("/files/f-123/content?t=valid-hmac");
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/permiso/i);
  });

  it("retorna 200 con streaming y headers si el token HMAC es válido y tiene acceso", async () => {
    vi.mocked(fileRepository.findActiveById).mockResolvedValue(mockFile as any);
    vi.mocked(FileService.verifyFileToken).mockReturnValue({ userId: "u-owner", fileId: "f-123" });
    vi.mocked(FileService.canAccessFile).mockResolvedValue(true);
    vi.mocked(FileService.buildContentDisposition).mockReturnValue('inline; filename="test.txt"');

    const res = await request(app).get("/files/f-123/content?t=valid-hmac");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.headers["content-disposition"]).toBe('inline; filename="test.txt"');
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(res.headers["accept-ranges"]).toBe("bytes");
    expect(res.text).toBe("contenido de prueba para range");
  });

  it("soporta Range request retornando 206 Partial Content", async () => {
    vi.mocked(fileRepository.findActiveById).mockResolvedValue(mockFile as any);
    vi.mocked(FileService.verifyFileToken).mockReturnValue({ userId: "u-owner", fileId: "f-123" });
    vi.mocked(FileService.canAccessFile).mockResolvedValue(true);

    const res = await request(app)
      .get("/files/f-123/content?t=valid-hmac")
      .set("Range", "bytes=0-8");

    expect(res.status).toBe(206);
    expect(res.headers["content-range"]).toMatch(/^bytes 0-8\/\d+$/);
    expect(res.text).toBe("contenido");
  });

  it("permite acceso mediante header Authorization Bearer sin HMAC token", async () => {
    vi.mocked(fileRepository.findActiveById).mockResolvedValue(mockFile as any);
    vi.mocked(FileService.canAccessFile).mockResolvedValue(true);

    const res = await request(app)
      .get("/files/f-123/content")
      .set("Authorization", "Bearer user-token:alice");

    expect(res.status).toBe(200);
    expect(res.text).toBe("contenido de prueba para range");
    expect(FileService.canAccessFile).toHaveBeenCalledWith(
      "internal-alice@example.com",
      "f-123",
      ["user"],
    );
  });

  it("permite acceso anónimo sin tokens si el archivo es un avatar público", async () => {
    vi.mocked(fileRepository.findActiveById).mockResolvedValue(mockFile as any);
    vi.mocked(fileRepository.isAvatarFile).mockResolvedValue(true);

    const res = await request(app).get("/files/f-123/content");

    expect(res.status).toBe(200);
    expect(res.text).toBe("contenido de prueba para range");
  });

  it("responde 302 Found redirigiendo a la URL presignada cuando file.provider es S3", async () => {
    const s3File = {
      ...mockFile,
      id: "f-s3-1",
      provider: "S3",
    };
    vi.mocked(fileRepository.findActiveById).mockResolvedValue(s3File as any);
    vi.mocked(FileService.verifyFileToken).mockReturnValue({ userId: "u-owner", fileId: "f-s3-1" });
    vi.mocked(FileService.canAccessFile).mockResolvedValue(true);

    const res = await request(app).get("/files/f-s3-1/content?t=valid-hmac");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://s3.example.com/link-files/file.png?sig=123");
  });

  it("GET /admin/files/stats responde estadísticas de almacenamiento para administradores", async () => {
    vi.mocked(FileService.getFileStorageStats).mockResolvedValue({
      localCount: 15,
      s3Count: 85,
      totalCount: 100,
      migrationEnabled: true,
      migrationBatchSize: 50,
      migrationIntervalMinutes: 60,
    });

    const res = await request(app)
      .get("/admin/files/stats")
      .set("Authorization", "Bearer admin-token:admin-user");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      localCount: 15,
      s3Count: 85,
      totalCount: 100,
      migrationEnabled: true,
      migrationBatchSize: 50,
      migrationIntervalMinutes: 60,
    });
  });

  it("incluye cabeceras de seguridad nosniff y CSP sandbox en GET /files/:id/content (§9.1 S6)", async () => {
    vi.mocked(fileRepository.findActiveById).mockResolvedValue(mockFile as any);
    vi.mocked(FileService.verifyFileToken).mockReturnValue({ userId: "u-owner", fileId: "f-123" });
    vi.mocked(FileService.canAccessFile).mockResolvedValue(true);

    const res = await request(app).get("/files/f-123/content?t=valid-hmac");

    expect(res.status).toBe(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBe("default-src 'none'; sandbox");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});

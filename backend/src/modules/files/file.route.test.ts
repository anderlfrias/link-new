import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middlewares/error.middleware";
import fileRouter from "./file.route";
import * as FileService from "./file.service";

// LARGE_FILES_PLAN.md Fase 1 (B2/S13, S14): este archivo cubre justo lo que
// file.controller.test.ts NO puede — la mecánica de wiring del router real
// (multer + el nuevo rate limiter), no la lógica del handler (esa ya está
// cubierta con mocks livianos en file.controller.test.ts).

vi.mock("./file.service", () => ({
  uploadFile: vi.fn(),
  getFile: vi.fn(),
  deleteFile: vi.fn(),
  listFilesForAdmin: vi.fn(),
  adminDeleteFile: vi.fn(),
}));

vi.mock("../auth/jwt", () => ({
  verifyToken: vi.fn((token: string) => {
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

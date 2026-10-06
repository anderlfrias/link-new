import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileProvider, FileUploadStatus } from "@prisma/client";
import { errorHandler } from "../../middlewares/error.middleware";
import uploadRouter from "./upload.route";
import * as UploadService from "./upload.service";

vi.mock("./upload.service", () => ({
  initiateUpload: vi.fn(),
  getUploadStatus: vi.fn(),
  getPartUrls: vi.fn(),
  completeUpload: vi.fn(),
  abortUpload: vi.fn(),
}));

vi.mock("../auth/jwt", () => {
  const verifyToken = vi.fn((token: string) => {
    if (token.startsWith("user-token:")) {
      const id = token.slice("user-token:".length);
      return { id: `ext-${id}`, email: `${id}@example.com`, roles: ["user"] };
    }
    throw new Error("Unknown token");
  });
  const mapTokenToUser = vi.fn((payload: any) => ({
    id: payload.id,
    email: payload.email,
    roles: payload.roles,
  }));
  return {
    verifyToken,
    mapTokenToUser,
    // Los middlewares usan el verificador único (LOCAL_AUTH_PLAN.md, Fase 4):
    // en modo external-auth equivale a verificar el JWT de EXTERNAL_AUTH y mapearlo.
    verifyAccessToken: vi.fn((token: string) => ({
      mode: "external-auth",
      user: mapTokenToUser(verifyToken(token)),
      mustChangePassword: false,
    })),
  };
});

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn((args: any) =>
        Promise.resolve({ id: `internal-${args.where.email}`, email: args.where.email, status: "ACTIVE" }),
      ),
    },
  },
}));

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/uploads", uploadRouter);
  app.use(errorHandler);
  return app;
}

let uniqueSuffix = 0;
function tokenForFreshUser(): string {
  uniqueSuffix += 1;
  return `user-token:route-test-${uniqueSuffix}`;
}

describe("upload.route (wiring y endpoints HTTP)", () => {
  const app = buildTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /uploads", () => {
    it("responde 401 si no se envía cabecera de autenticación", async () => {
      const res = await request(app).post("/uploads").send({
        name: "test.mp4",
        size: 50000000,
        mimeType: "video/mp4",
      });

      expect(res.status).toBe(401);
    });

    it("responde 400 si el body no cumple con el schema de validación", async () => {
      const res = await request(app)
        .post("/uploads")
        .set("Authorization", `Bearer ${tokenForFreshUser()}`)
        .send({
          name: "",
          size: -10,
          mimeType: "invalid",
        });

      expect(res.status).toBe(400);
      expect(UploadService.initiateUpload).not.toHaveBeenCalled();
    });

    it("responde 201 y delega a UploadService.initiateUpload si el body es válido", async () => {
      vi.mocked(UploadService.initiateUpload).mockResolvedValue({
        uploadSessionId: "session-123",
        partSize: 8388608,
        totalParts: 3,
        expiresAt: new Date(),
      });

      const res = await request(app)
        .post("/uploads")
        .set("Authorization", `Bearer ${tokenForFreshUser()}`)
        .send({
          name: "video.mp4",
          size: 24 * 1024 * 1024,
          mimeType: "video/mp4",
        });

      expect(res.status).toBe(201);
      expect(res.body.uploadSessionId).toBe("session-123");
      expect(UploadService.initiateUpload).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ name: "video.mp4" }),
      );
    });
  });

  describe("GET /uploads/:id", () => {
    it("responde 200 con el estado de la sesión", async () => {
      vi.mocked(UploadService.getUploadStatus).mockResolvedValue({
        id: "session-123",
        status: FileUploadStatus.UPLOADING,
        originalName: "video.mp4",
        declaredSize: 25165824,
        partSize: 8388608,
        totalParts: 3,
        parts: [{ partNumber: 1, size: 8388608, eTag: "etag1" }],
        expiresAt: new Date(),
      });

      const res = await request(app)
        .get("/uploads/session-123")
        .set("Authorization", `Bearer ${tokenForFreshUser()}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("session-123");
      expect(res.body.status).toBe(FileUploadStatus.UPLOADING);
      expect(res.body.parts).toHaveLength(1);
    });
  });

  describe("POST /uploads/:id/part-urls", () => {
    it("responde 400 si partNumbers es inválido o excede 20 partes", async () => {
      const res = await request(app)
        .post("/uploads/session-123/part-urls")
        .set("Authorization", `Bearer ${tokenForFreshUser()}`)
        .send({ partNumbers: [0, -1] });

      expect(res.status).toBe(400);
      expect(UploadService.getPartUrls).not.toHaveBeenCalled();
    });

    it("responde 200 y devuelve las URLs presignadas solicitadas", async () => {
      vi.mocked(UploadService.getPartUrls).mockResolvedValue([
        { partNumber: 1, url: "https://s3.example.com/part-1" },
        { partNumber: 2, url: "https://s3.example.com/part-2" },
      ]);

      const res = await request(app)
        .post("/uploads/session-123/part-urls")
        .set("Authorization", `Bearer ${tokenForFreshUser()}`)
        .send({ partNumbers: [1, 2] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { partNumber: 1, url: "https://s3.example.com/part-1" },
        { partNumber: 2, url: "https://s3.example.com/part-2" },
      ]);
    });
  });

  describe("POST /uploads/:id/complete", () => {
    it("responde 200 y devuelve el StoredFileResponse tras completar", async () => {
      vi.mocked(UploadService.completeUpload).mockResolvedValue({
        id: "file-999",
        originalName: "video.mp4",
        mimeType: "video/mp4",
        extension: "mp4",
        size: 24000000,
        url: "/api/v1/files/file-999/content?t=token",
        createdAt: new Date(),
        deletedAt: null,
      });

      const res = await request(app)
        .post("/uploads/session-123/complete")
        .set("Authorization", `Bearer ${tokenForFreshUser()}`)
        .send({ checksum: "sha256-abc" });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("file-999");
      expect(res.body.url).toContain("/api/v1/files/file-999/content");
    });
  });

  describe("DELETE /uploads/:id", () => {
    it("responde 200 al cancelar la subida", async () => {
      vi.mocked(UploadService.abortUpload).mockResolvedValue({
        message: "Upload session aborted successfully",
      });

      const res = await request(app)
        .delete("/uploads/session-123")
        .set("Authorization", `Bearer ${tokenForFreshUser()}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Upload session aborted successfully");
      expect(UploadService.abortUpload).toHaveBeenCalledWith("session-123", expect.any(String), expect.any(Array));
    });
  });
});

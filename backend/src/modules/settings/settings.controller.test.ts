import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middlewares/error.middleware";
import { createMockNext, createMockRequest, createMockResponse } from "../../test/http-mocks";
import * as SettingsController from "./settings.controller";
import { adminSettingsRouter, publicSettingsRouter } from "./settings.route";
import * as SettingsService from "./settings.service";

vi.mock("./settings.service", () => ({
  getSettings: vi.fn(),
  getPublicSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

// El verificador de sesión solo da la identidad del token: los roles salen de la
// base (mock de prisma, abajo), igual que en producción.
vi.mock("../auth/jwt", () => ({
  verifyAccessToken: vi.fn((token: string) => {
    if (token !== "admin-token" && token !== "user-token") throw new Error("Unknown token");
    const id = token === "admin-token" ? "admin-1" : "user-1";
    return {
      mustChangePassword: false,
      iat: Math.floor(Date.now() / 1000),
      user: {
        id: id,
        email: `${id}@example.com`,
        username: null,
        fullName: "",
        roles: [],
        permissions: [],
        app: "link",
        exp: 0,
        authProvider: "external-auth",
      },
    };
  }),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        email: `${where.id}@example.com`,
        name: "X",
        username: null,
        status: "ACTIVE",
        roles: where.id === "admin-1" ? ["admin", "user"] : ["user"],
        tokensValidAfter: null,
      })),
    },
  },
}));

describe("settings.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handler unit tests", () => {
    it("getSettings: returns settings JSON on success", async () => {
      const mockSettings = { id: "singleton", maxUploadSizeMb: 50 } as any;
      vi.mocked(SettingsService.getSettings).mockResolvedValue(mockSettings);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await SettingsController.getSettings(req, res, next);

      expect(SettingsService.getSettings).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockSettings);
      expect(next).not.toHaveBeenCalled();
    });

    it("getSettings: calls next with error when service throws", async () => {
      const error = new Error("DB Error");
      vi.mocked(SettingsService.getSettings).mockRejectedValue(error);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await SettingsController.getSettings(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it("getPublicSettings: returns public DTO JSON on success", async () => {
      const mockPublic = { maxUploadSizeMb: 50, allowGroupDelete: true } as any;
      vi.mocked(SettingsService.getPublicSettings).mockResolvedValue(mockPublic);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await SettingsController.getPublicSettings(req, res, next);

      expect(SettingsService.getPublicSettings).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockPublic);
      expect(next).not.toHaveBeenCalled();
    });

    it("getPublicSettings: calls next with error when service throws", async () => {
      const error = new Error("Fetch Error");
      vi.mocked(SettingsService.getPublicSettings).mockRejectedValue(error);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await SettingsController.getPublicSettings(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it("updateSettings: calls service with req.body and returns updated settings", async () => {
      const updatePayload = { maxUploadSizeMb: 100 };
      const updated = { id: "singleton", maxUploadSizeMb: 100 } as any;
      vi.mocked(SettingsService.updateSettings).mockResolvedValue(updated);

      const req = createMockRequest({ body: updatePayload });
      const res = createMockResponse();
      const next = createMockNext();

      await SettingsController.updateSettings(req, res, next);

      expect(SettingsService.updateSettings).toHaveBeenCalledWith(updatePayload);
      expect(res.json).toHaveBeenCalledWith(updated);
      expect(next).not.toHaveBeenCalled();
    });

    it("updateSettings: calls next with error when service throws", async () => {
      const error = new Error("Update Error");
      vi.mocked(SettingsService.updateSettings).mockRejectedValue(error);

      const req = createMockRequest({ body: { maxUploadSizeMb: 10 } });
      const res = createMockResponse();
      const next = createMockNext();

      await SettingsController.updateSettings(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe("route authorization and middleware guards", () => {
    function buildTestApp() {
      const app = express();
      app.use(express.json());
      app.use("/admin/settings", adminSettingsRouter);
      app.use("/settings/public", publicSettingsRouter);
      app.use(errorHandler);
      return app;
    }

    const app = buildTestApp();

    // `attachInternalUser` lee la duración de sesión de los ajustes en cada request.
    beforeEach(() => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue({ localSessionTtlHours: 12 } as any);
    });

    it("GET /settings/public rejects unauthenticated requests with 401", async () => {
      const res = await request(app).get("/settings/public");
      expect(res.status).toBe(401);
    });

    it("GET /settings/public accepts regular authenticated non-admin users with 200", async () => {
      vi.mocked(SettingsService.getPublicSettings).mockResolvedValue({
        maxUploadSizeMb: 50,
        chunkedUploads: true,
        maxVoiceNoteDurationSeconds: 120,
        maxGroupMembers: 100,
        maxFilesPerMessage: 10,
        allowMessageEdit: true,
        messageEditTimeLimitMinutes: 15,
        allowMessageDeleteForEveryone: true,
        messageDeleteForEveryoneTimeLimitMinutes: 60,
        allowConversationDelete: true,
        allowGroupDelete: true,
        allowStickersAndGifs: true,
      });

      const res = await request(app)
        .get("/settings/public")
        .set("Authorization", "Bearer user-token");

      expect(res.status).toBe(200);
      expect(res.body.maxUploadSizeMb).toBe(50);
    });

    it("GET /admin/settings rejects unauthenticated requests with 401", async () => {
      const res = await request(app).get("/admin/settings");
      expect(res.status).toBe(401);
    });

    it("GET /admin/settings rejects authenticated non-admin users with 403 (Insufficient role)", async () => {
      const res = await request(app)
        .get("/admin/settings")
        .set("Authorization", "Bearer user-token");

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Insufficient role/i);
    });

    it("GET /admin/settings allows authenticated admin users with 200", async () => {
      const mockAdminSettings = {
        id: "singleton",
        maxUploadSizeMb: 50,
        whoCanCreateGroups: "ALL_MEMBERS",
        localSessionTtlHours: 12,
      } as any;
      vi.mocked(SettingsService.getSettings).mockResolvedValue(mockAdminSettings);

      const res = await request(app)
        .get("/admin/settings")
        .set("Authorization", "Bearer admin-token");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("singleton");
    });

    it("PATCH /admin/settings rejects non-admin users with 403", async () => {
      const res = await request(app)
        .patch("/admin/settings")
        .set("Authorization", "Bearer user-token")
        .send({ maxUploadSizeMb: 60 });

      expect(res.status).toBe(403);
    });

    it("PATCH /admin/settings validates body and rejects invalid empty payload with 400", async () => {
      const res = await request(app)
        .patch("/admin/settings")
        .set("Authorization", "Bearer admin-token")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/At least one setting is required/i);
    });

    it("PATCH /admin/settings updates settings for admin with valid payload", async () => {
      const updated = { id: "singleton", maxUploadSizeMb: 75 } as any;
      vi.mocked(SettingsService.updateSettings).mockResolvedValue(updated);

      const res = await request(app)
        .patch("/admin/settings")
        .set("Authorization", "Bearer admin-token")
        .send({ maxUploadSizeMb: 75 });

      expect(res.status).toBe(200);
      expect(res.body.maxUploadSizeMb).toBe(75);
      expect(SettingsService.updateSettings).toHaveBeenCalledWith({ maxUploadSizeMb: 75 });
    });
  });
});

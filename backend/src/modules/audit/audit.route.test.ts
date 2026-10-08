import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middlewares/error.middleware";
import { adminAuditRouter } from "./audit.route";
import * as AuditService from "./audit.service";

vi.mock("./audit.service", () => ({
  listAuditLogs: vi.fn(),
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
        authProvider: "external-test",
      },
    };
  }),
}));

vi.mock("../settings/settings.service", () => ({
  getSettings: vi.fn().mockResolvedValue({ localSessionTtlHours: 12 }),
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

function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/admin/audit-logs", adminAuditRouter);
  app.use(errorHandler);
  return app;
}

describe("audit.route", () => {
  const app = buildTestApp();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza peticiones sin token con 401", async () => {
    const res = await request(app).get("/admin/audit-logs");
    expect(res.status).toBe(401);
  });

  it("rechaza usuarios autenticados sin rol admin con 403", async () => {
    const res = await request(app)
      .get("/admin/audit-logs")
      .set("Authorization", "Bearer user-token");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Insufficient role/i);
  });

  it("permite a administradores con 200 y devuelve el shape de respuesta esperado", async () => {
    const mockResponse = {
      items: [
        {
          id: "log-1",
          action: "LOGIN",
          createdAt: "2026-09-10T12:00:00.000Z",
          actor: { id: "u-1", email: "admin@example.com", name: "Admin" },
          conversationId: null,
          conversationName: null,
          messageId: null,
          targetType: null,
          targetId: null,
          metadata: null,
          ip: "127.0.0.1",
          userAgent: "Supertest",
          requestId: "req-1",
        },
      ],
      nextCursor: null,
    };

    vi.mocked(AuditService.listAuditLogs).mockResolvedValue(mockResponse as any);

    const res = await request(app)
      .get("/admin/audit-logs")
      .set("Authorization", "Bearer admin-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockResponse);
    expect(AuditService.listAuditLogs).toHaveBeenCalled();
  });
});

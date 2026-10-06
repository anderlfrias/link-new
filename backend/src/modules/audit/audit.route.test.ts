import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middlewares/error.middleware";
import { adminAuditRouter } from "./audit.route";
import * as AuditService from "./audit.service";

vi.mock("./audit.service", () => ({
  listAuditLogs: vi.fn(),
}));

vi.mock("../auth/jwt", () => {
  const verifyToken = vi.fn((token: string) => {
    if (token === "admin-token") {
      return { id: "ext-admin", email: "admin@example.com", roles: ["admin", "user"] };
    }
    if (token === "user-token") {
      return { id: "ext-user", email: "user@example.com", roles: ["user"] };
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
      findUnique: vi.fn().mockResolvedValue({
        id: "internal-uuid-1",
        email: "user@example.com",
        status: "ACTIVE",
      }),
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

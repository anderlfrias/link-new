import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middlewares/error.middleware";
import { useLocalAuth } from "../../test/auth-mode";
import { BadRequestError } from "../../utils/errors";

vi.mock("./auth.service", () => ({}));

vi.mock("./local-auth.service", () => ({
  loginWithLocalAccount: vi.fn(),
  changeOwnPassword: vi.fn(),
  getPublicAuthConfig: vi.fn(),
}));

vi.mock("../audit/audit.service", () => ({ record: vi.fn() }));

vi.mock("../settings/settings.service", () => ({
  getSettings: vi.fn().mockResolvedValue({ localSessionTtlHours: 12 }),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: "user-1",
        email: "ana@example.com",
        name: "Ana",
        username: null,
        status: "ACTIVE",
        roles: [],
        tokensValidAfter: null,
      }),
    },
  },
}));

import authRouter from "./auth.route";
import { signSessionToken } from "./jwt";
import * as LocalAuthService from "./local-auth.service";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  app.use(errorHandler);
  return app;
}

function localToken(mustChangePassword: boolean): string {
  return signSessionToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword });
}

// Cada test usa un usuario distinto para no compartir el cupo del rate limiter
// de cambio de contraseña (es por internalUserId y vive en memoria).
const app = buildApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /auth/config", () => {
  it("es público: responde sin token", async () => {
    vi.mocked(LocalAuthService.getPublicAuthConfig).mockResolvedValue({ mode: "external-auth" });

    const res = await request(app).get("/auth/config");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mode: "external-auth" });
  });
});

describe("PATCH /auth/password", () => {
  it("en modo external-auth no existe: 404 aunque la sesión sea válida", async () => {
    const res = await request(app)
      .patch("/auth/password")
      .set("Authorization", `Bearer ${localToken(false)}`)
      .send({ currentPassword: "a", newPassword: "b" });

    expect(res.status).toBe(404);
    expect(LocalAuthService.changeOwnPassword).not.toHaveBeenCalled();
  });

  describe("en modo local", () => {
    useLocalAuth();

    it("sin token -> 401", async () => {
      const res = await request(app).patch("/auth/password").send({ currentPassword: "a", newPassword: "b" });

      expect(res.status).toBe(401);
    });

    it("acepta el token restringido (pcr): es el único lugar donde sirve (invariante 8)", async () => {
      vi.mocked(LocalAuthService.changeOwnPassword).mockResolvedValue({ token: "nuevo-token", exp: 123 });

      const res = await request(app)
        .patch("/auth/password")
        .set("Authorization", `Bearer ${localToken(true)}`)
        .send({ currentPassword: "temporal-123", newPassword: "una contraseña nueva" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ token: "nuevo-token", exp: 123 });
      expect(LocalAuthService.changeOwnPassword).toHaveBeenCalledWith("user-1", "temporal-123", "una contraseña nueva");
    });

    it("contraseña actual incorrecta -> 400 con code, nunca 401 (invariante 11)", async () => {
      vi.mocked(LocalAuthService.changeOwnPassword).mockRejectedValue(
        new BadRequestError("La contraseña actual no es correcta.", "invalid_current_password"),
      );

      const res = await request(app)
        .patch("/auth/password")
        .set("Authorization", `Bearer ${localToken(false)}`)
        .send({ currentPassword: "mal", newPassword: "una contraseña nueva" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "La contraseña actual no es correcta.", code: "invalid_current_password" });
    });

    it("la política incumplida devuelve la lista de reglas", async () => {
      vi.mocked(LocalAuthService.changeOwnPassword).mockRejectedValue(
        new BadRequestError("No cumple", "password_policy", { rules: ["min_length"] }),
      );

      const res = await request(app)
        .patch("/auth/password")
        .set("Authorization", `Bearer ${localToken(false)}`)
        .send({ currentPassword: "actual", newPassword: "corta" });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "No cumple", code: "password_policy", rules: ["min_length"] });
    });

    it("valida el body: sin newPassword -> 400 sin llegar al servicio", async () => {
      const res = await request(app)
        .patch("/auth/password")
        .set("Authorization", `Bearer ${localToken(false)}`)
        .send({ currentPassword: "actual" });

      expect(res.status).toBe(400);
      expect(LocalAuthService.changeOwnPassword).not.toHaveBeenCalled();
    });

    it("con un token restringido, el resto de la API responde 403 password_change_required", async () => {
      const res = await request(app)
        .patch("/auth/profile")
        .set("Authorization", `Bearer ${localToken(true)}`)
        .send({ name: "Ana" });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("password_change_required");
    });
  });
});

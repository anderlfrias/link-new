import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middlewares/error.middleware";
import { useExternalProvider, useLocalAuth } from "../../test/auth-mode";

vi.mock("./account-admin.service", () => ({
  updateUserAccount: vi.fn(),
  createLocalUser: vi.fn(),
  resetLocalPassword: vi.fn(),
  unlockLocalUser: vi.fn(),
}));

vi.mock("./user.service", () => ({
  listUsers: vi.fn(),
  listUsersForAdmin: vi.fn(),
}));

vi.mock("../settings/settings.service", () => ({
  getSettings: vi.fn().mockResolvedValue({ localSessionTtlHours: 12 }),
}));

// Tokens de prueba: "<rol>-token" es un admin o un usuario común, en el modo
// que esté activo. Los roles salen de la base (roles), no del token.
vi.mock("../auth/jwt", () => ({
  verifyAccessToken: vi.fn((token: string) => {
    const role = token.split("-")[0];
    if (role !== "admin" && role !== "user") throw new Error("Unknown token");
    return {
      iat: Math.floor(Date.now() / 1000),
      mustChangePassword: false,
      user: {
        id: `${role}-1`,
        email: `${role}@example.com`,
        username: null,
        fullName: "",
        roles: [],
        exp: 0,
        authProvider: "external-test",
      },
    };
  }),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async (args: { where: { email?: string; id?: string } }) => {
        const key = args.where.email ?? args.where.id ?? "";
        const isAdmin = key.startsWith("admin");
        return {
          id: isAdmin ? "admin-1" : "user-1",
          email: isAdmin ? "admin@example.com" : "user@example.com",
          name: "X",
          username: null,
          status: "ACTIVE",
          roles: isAdmin ? ["admin"] : [],
          tokensValidAfter: null,
        };
      }),
    },
  },
}));

import * as AccountAdminService from "./account-admin.service";
import { adminUserRouter } from "./user.route";

const app = express();
app.use(express.json());
app.use("/admin/users", adminUserRouter);
app.use(errorHandler);

beforeEach(() => {
  vi.mocked(AccountAdminService.updateUserAccount).mockReset();
  vi.mocked(AccountAdminService.createLocalUser).mockReset();
  vi.mocked(AccountAdminService.resetLocalPassword).mockReset();
  vi.mocked(AccountAdminService.unlockLocalUser).mockReset();
});

describe("admin users routes — con un proveedor de autenticación externo", () => {
  useExternalProvider();

  it("un usuario sin rol admin -> 403", async () => {
    const res = await request(app).patch("/admin/users/u-2").set("Authorization", "Bearer user-token").send({ status: "INACTIVE" });

    expect(res.status).toBe(403);
  });

  it("PATCH /:id solo acepta status: desactivar el acceso al chat", async () => {
    vi.mocked(AccountAdminService.updateUserAccount).mockResolvedValue({ id: "u-2", status: "INACTIVE" } as any);

    const res = await request(app).patch("/admin/users/u-2").set("Authorization", "Bearer admin-token").send({ status: "INACTIVE" });

    expect(res.status).toBe(200);
    expect(AccountAdminService.updateUserAccount).toHaveBeenCalledWith({ userId: "admin-1", via: "panel" }, "u-2", {
      status: "INACTIVE",
    });
  });

  it("PATCH /:id con datos de la cuenta y sin status -> 400 (los administra el proveedor)", async () => {
    const res = await request(app).patch("/admin/users/u-2").set("Authorization", "Bearer admin-token").send({ name: "Otro" });

    expect(res.status).toBe(400);
    expect(AccountAdminService.updateUserAccount).not.toHaveBeenCalled();
  });

  it.each([
    ["post", "/admin/users"],
    ["post", "/admin/users/u-2/password-reset"],
    ["post", "/admin/users/u-2/unlock"],
  ])("%s %s no existe con un proveedor externo (404)", async (method, path) => {
    const res = await (request(app) as any)[method](path).set("Authorization", "Bearer admin-token").send({});

    expect(res.status).toBe(404);
  });
});

describe("admin users routes — modo local", () => {
  useLocalAuth();

  it("POST / crea la cuenta y devuelve la temporal (201)", async () => {
    vi.mocked(AccountAdminService.createLocalUser).mockResolvedValue({
      user: { id: "new-1" } as any,
      temporaryPassword: "Temp#2026-abcdEFGH",
    });

    const res = await request(app)
      .post("/admin/users")
      .set("Authorization", "Bearer admin-token")
      .send({ name: "Beto", email: " Beto@Example.com ", username: "Beto.Gomez", roles: ["admin"] });

    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword).toBe("Temp#2026-abcdEFGH");
    expect(AccountAdminService.createLocalUser).toHaveBeenCalledWith(
      { userId: "admin-1", via: "panel" },
      { name: "Beto", email: "beto@example.com", username: "beto.gomez", roles: ["admin"] },
    );
  });

  it.each([
    [{ name: "Beto", email: "no-es-un-correo" }],
    [{ name: "Beto", email: "beto@example.com", username: "a" }],
    [{ name: "Beto", email: "beto@example.com", username: "con@arroba" }],
    [{ name: "Beto", email: "beto@example.com", roles: ["superadmin"] }],
    [{ email: "beto@example.com" }],
  ])("POST / valida formato de email y username y roles conocidos: %j -> 400", async (body) => {
    const res = await request(app).post("/admin/users").set("Authorization", "Bearer admin-token").send(body);

    expect(res.status).toBe(400);
    expect(AccountAdminService.createLocalUser).not.toHaveBeenCalled();
  });

  it("los roles salen de la base: un usuario sin admin en roles -> 403", async () => {
    const res = await request(app).post("/admin/users").set("Authorization", "Bearer user-token").send({ name: "B", email: "b@example.com" });

    expect(res.status).toBe(403);
  });

  it("PATCH /:id acepta los datos de la cuenta", async () => {
    vi.mocked(AccountAdminService.updateUserAccount).mockResolvedValue({ id: "u-2" } as any);

    const res = await request(app)
      .patch("/admin/users/u-2")
      .set("Authorization", "Bearer admin-token")
      .send({ name: "Otro", username: "", roles: [] });

    expect(res.status).toBe(200);
    expect(AccountAdminService.updateUserAccount).toHaveBeenCalledWith({ userId: "admin-1", via: "panel" }, "u-2", {
      name: "Otro",
      username: null,
      roles: [],
    });
  });

  it("POST /:id/password-reset devuelve la temporal y POST /:id/unlock responde 204", async () => {
    vi.mocked(AccountAdminService.resetLocalPassword).mockResolvedValue({ temporaryPassword: "Temp#2026-abcdEFGH" });

    const reset = await request(app).post("/admin/users/u-2/password-reset").set("Authorization", "Bearer admin-token").send({});
    const unlock = await request(app).post("/admin/users/u-2/unlock").set("Authorization", "Bearer admin-token").send();

    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ temporaryPassword: "Temp#2026-abcdEFGH" });
    expect(unlock.status).toBe(204);
    expect(AccountAdminService.unlockLocalUser).toHaveBeenCalledWith({ userId: "admin-1", via: "panel" }, "u-2");
  });
});

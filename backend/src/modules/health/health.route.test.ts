import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "../../config/prisma";
import healthRouter from "./health.route";

function buildApp() {
  const app = express();
  app.use("/health", healthRouter);
  return app;
}

describe("GET /health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("responde 200 y { status: ok } con la base disponible", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    const res = await request(buildApp()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("responde 503 y { status: unavailable } con la base caída, sin filtrar el error", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(
      new Error("Can't reach database server at `postgres.internal:5432` (user link, password hunter2)"),
    );

    const res = await request(buildApp()).get("/health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "unavailable" });
    // Es una ruta pública: nada del error ni de la base llega al cuerpo.
    expect(res.text).not.toContain("postgres.internal");
    expect(res.text).not.toContain("hunter2");
  });

  it("no requiere autenticación", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as any);

    const res = await request(buildApp()).get("/health").set("Authorization", "");

    expect(res.status).toBe(200);
  });
});

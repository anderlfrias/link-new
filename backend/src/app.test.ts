import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
  WebPushError: class WebPushError extends Error {},
}));

vi.mock("./modules/files/file.repository", () => ({
  findActiveById: vi.fn().mockResolvedValue(null),
}));

import app from "./app";

describe("app smoke test", () => {
  it("GET / returns 200 with 'Backend is running'", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toBe("Backend is running");
  });

  it("GET /api/v1/conversations without authorization header returns 401 Unauthorized", async () => {
    const res = await request(app).get("/api/v1/conversations");
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/files/:id/content contains 'Cross-Origin-Resource-Policy: cross-origin' header", async () => {
    const res = await request(app).get("/api/v1/files/non-existent-test-file/content");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});

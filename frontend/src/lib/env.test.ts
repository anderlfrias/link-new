import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("env", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("exports configured apiUrl and socketUrl when environment variables are present", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
    process.env.NEXT_PUBLIC_SOCKET_URL = "https://socket.example.test";

    const { env } = await import("./env");

    expect(env.apiUrl).toBe("https://api.example.test");
    expect(env.socketUrl).toBe("https://socket.example.test");
  });

  it("throws error when NEXT_PUBLIC_API_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_SOCKET_URL = "https://socket.example.test";

    await expect(import("./env")).rejects.toThrow("Falta la variable de entorno NEXT_PUBLIC_API_URL");
  });

  it("throws error when NEXT_PUBLIC_SOCKET_URL is missing", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test";
    delete process.env.NEXT_PUBLIC_SOCKET_URL;

    await expect(import("./env")).rejects.toThrow("Falta la variable de entorno NEXT_PUBLIC_SOCKET_URL");
  });
});

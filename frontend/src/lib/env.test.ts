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
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.org";
    process.env.NEXT_PUBLIC_SOCKET_URL = "https://socket.example.org";

    const { env } = await import("./env");

    expect(env.apiUrl).toBe("https://api.example.org");
    expect(env.socketUrl).toBe("https://socket.example.org");
  });

  it("throws error when NEXT_PUBLIC_API_URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_SOCKET_URL = "https://socket.example.org";

    await expect(import("./env")).rejects.toThrow("Falta la variable de entorno NEXT_PUBLIC_API_URL");
  });

  it("throws error when NEXT_PUBLIC_SOCKET_URL is missing", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.org";
    delete process.env.NEXT_PUBLIC_SOCKET_URL;

    await expect(import("./env")).rejects.toThrow("Falta la variable de entorno NEXT_PUBLIC_SOCKET_URL");
  });
});

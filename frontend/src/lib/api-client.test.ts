import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/types/api.types";
import { apiRequest } from "./api-client";

describe("api-client", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("builds URL with serialized query parameters and omits undefined values", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    global.fetch = mockFetch;

    await apiRequest("/test", {
      query: {
        page: 1,
        search: "hello",
        filter: undefined,
      },
    });

    expect(mockFetch).toHaveBeenCalled();
    const callUrl = mockFetch.mock.calls[0][0] as string;
    expect(callUrl).toContain("http://localhost:4000/test");
    expect(callUrl).toContain("page=1");
    expect(callUrl).toContain("search=hello");
    expect(callUrl).not.toContain("filter");
  });

  it("sends JSON body with Content-Type application/json by default", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1 }),
    });
    global.fetch = mockFetch;

    const body = { title: "Nuevo post" };
    await apiRequest("/posts", { method: "POST", body });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:4000/posts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(body),
      }),
    );
  });

  it("sends FormData as-is without setting manual Content-Type", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ uploaded: true }),
    });
    global.fetch = mockFetch;

    const formData = new FormData();
    formData.append("file", "dummy-content");

    await apiRequest("/upload", { method: "POST", body: formData });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:4000/upload",
      expect.objectContaining({
        method: "POST",
        headers: {}, // No Content-Type set for FormData
        body: formData,
      }),
    );
  });

  it("attaches Authorization header when token is provided, omits when not", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    global.fetch = mockFetch;

    // With token
    await apiRequest("/secure", { token: "secret-token-123" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:4000/secure",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token-123",
        }),
      }),
    );

    // Without token
    await apiRequest("/public");
    const headers = mockFetch.mock.calls[1][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });

  it("throws ApiError with error message from json body when response is not ok", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: "El nombre es obligatorio" }),
    });
    global.fetch = mockFetch;

    await expect(apiRequest("/invalid")).rejects.toThrow(ApiError);
    await expect(apiRequest("/invalid")).rejects.toMatchObject({
      status: 400,
      message: "El nombre es obligatorio",
    });
  });

  it("throws ApiError with statusText when error body is not valid JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: async () => {
        throw new Error("Invalid JSON");
      },
    });
    global.fetch = mockFetch;

    await expect(apiRequest("/server-error")).rejects.toMatchObject({
      status: 502,
      message: "Bad Gateway",
    });
  });

  it("returns undefined when response status is 204 No Content", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });
    global.fetch = mockFetch;

    const result = await apiRequest("/no-content", { method: "DELETE" });
    expect(result).toBeUndefined();
  });

  it("returns blob when responseType is 'blob'", async () => {
    const mockBlob = new Blob(["image-bytes"], { type: "image/png" });
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => mockBlob,
    });
    global.fetch = mockFetch;

    const result = await apiRequest("/image", { responseType: "blob" });
    expect(result).toBe(mockBlob);
  });
});

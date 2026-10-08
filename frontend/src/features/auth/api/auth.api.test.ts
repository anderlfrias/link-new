import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  changePassword,
  getAuthConfig,
  login,
  getProfilePicture,
  updateProfilePicture,
  deleteProfilePicture,
  updateProfile,
  updateNotificationSoundPreference,
  updateUserPreferences,
} from "./auth.api";
import { apiRequest } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("auth.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("login sends POST to /v1/auth/login with credentials", async () => {
    const mockResponse = { token: "token-abc", user: { username: "carlos" } };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockResponse);

    const result = await login({ user: "carlos", password: "password123" });

    expect(apiRequest).toHaveBeenCalledWith("/v1/auth/login", {
      method: "POST",
      body: { user: "carlos", password: "password123" },
    });
    expect(result).toEqual(mockResponse);
  });

  it("getProfilePicture sends GET to /v1/auth/profile/picture with blob responseType", async () => {
    const mockBlob = new Blob(["image-bytes"], { type: "image/png" });
    vi.mocked(apiRequest).mockResolvedValueOnce(mockBlob);

    const result = await getProfilePicture("token-abc");

    expect(apiRequest).toHaveBeenCalledWith("/v1/auth/profile/picture", {
      token: "token-abc",
      responseType: "blob",
    });
    expect(result).toBe(mockBlob);
  });

  it("updateProfilePicture sends PUT to /v1/auth/profile/picture with FormData body", async () => {
    const mockFile = { id: "file-1", originalName: "avatar.png" };
    vi.mocked(apiRequest).mockResolvedValueOnce(mockFile);

    const blob = new Blob(["test"], { type: "image/png" });
    const result = await updateProfilePicture("token-abc", blob, "my-avatar.png");

    expect(apiRequest).toHaveBeenCalledWith(
      "/v1/auth/profile/picture",
      expect.objectContaining({
        method: "PUT",
        token: "token-abc",
        body: expect.any(FormData),
      }),
    );
    expect(result).toEqual(mockFile);
  });

  it("deleteProfilePicture sends DELETE to /v1/auth/profile/picture", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(undefined);

    await deleteProfilePicture("token-abc");

    expect(apiRequest).toHaveBeenCalledWith("/v1/auth/profile/picture", {
      method: "DELETE",
      token: "token-abc",
    });
  });

  it("updateProfile sends PATCH to /v1/auth/profile with name body", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ name: "Carlos New" });

    const result = await updateProfile("token-abc", "Carlos New");

    expect(apiRequest).toHaveBeenCalledWith("/v1/auth/profile", {
      method: "PATCH",
      token: "token-abc",
      body: { name: "Carlos New" },
    });
    expect(result).toEqual({ name: "Carlos New" });
  });

  it("updateNotificationSoundPreference sends PATCH to /v1/auth/profile/preferences", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ notificationSoundEnabled: false });

    const result = await updateNotificationSoundPreference("token-abc", false);

    expect(apiRequest).toHaveBeenCalledWith("/v1/auth/profile/preferences", {
      method: "PATCH",
      token: "token-abc",
      body: { notificationSoundEnabled: false },
    });
    expect(result).toEqual({ notificationSoundEnabled: false });
  });

  it("updateUserPreferences sends PATCH to /v1/auth/profile/preferences", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      notificationSoundEnabled: true,
      language: "en",
    });

    const result = await updateUserPreferences("token-abc", { language: "en" });

    expect(apiRequest).toHaveBeenCalledWith("/v1/auth/profile/preferences", {
      method: "PATCH",
      token: "token-abc",
      body: { language: "en" },
    });
    expect(result).toEqual({ notificationSoundEnabled: true, language: "en" });
  });

  it("getAuthConfig pide GET /v1/auth/config sin token", async () => {
    const config = {
      provider: { id: "test-provider", displayName: "Test Provider", external: true },
      capabilities: { passwordChange: false, accountManagement: "status-only" },
    };
    vi.mocked(apiRequest).mockResolvedValue(config);

    await expect(getAuthConfig()).resolves.toEqual(config);
    expect(apiRequest).toHaveBeenCalledWith("/v1/auth/config");
  });

  it("changePassword manda PATCH /v1/auth/password con el token y las dos contraseñas", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ token: "nuevo", exp: 1 });

    await changePassword("tok", "actual", "nueva");

    expect(apiRequest).toHaveBeenCalledWith("/v1/auth/password", {
      method: "PATCH",
      token: "tok",
      body: { currentPassword: "actual", newPassword: "nueva" },
    });
  });
});

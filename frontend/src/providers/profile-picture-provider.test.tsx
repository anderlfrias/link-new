import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfilePictureProvider, useProfilePicture } from "./profile-picture-provider";
import { useAuth } from "@/providers/auth-provider";
import { getProfilePicture } from "@/features/auth/api/auth.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/auth/api/auth.api", () => ({
  getProfilePicture: vi.fn(),
}));

function ProfilePictureConsumer() {
  const { url, refresh } = useProfilePicture();
  return (
    <div>
      <span data-testid="url">{url ?? "none"}</span>
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}

describe("ProfilePictureProvider and useProfilePicture", () => {
  const origCreateObjectURL = URL.createObjectURL;
  const origRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn().mockReturnValue("blob:http://localhost/mock-pic-1");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
  });

  it("provides null url when unauthenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    render(
      <ProfilePictureProvider>
        <ProfilePictureConsumer />
      </ProfilePictureProvider>,
    );

    expect(screen.getByTestId("url").textContent).toBe("none");
    expect(getProfilePicture).not.toHaveBeenCalled();
  });

  it("fetches profile picture blob and sets object URL when authenticated", async () => {
    const mockSession = createMockSession({ token: "pic-token-1" });
    const mockBlob = new Blob(["fake-image-bytes"], { type: "image/png" });

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    vi.mocked(getProfilePicture).mockResolvedValueOnce(mockBlob);

    render(
      <ProfilePictureProvider>
        <ProfilePictureConsumer />
      </ProfilePictureProvider>,
    );

    expect(getProfilePicture).toHaveBeenCalledWith("pic-token-1");

    await waitFor(() => {
      expect(screen.getByTestId("url").textContent).toBe("blob:http://localhost/mock-pic-1");
    });
    expect(URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
  });

  it("handles fetch failure gracefully by setting url to null", async () => {
    const mockSession = createMockSession();

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    vi.mocked(getProfilePicture).mockRejectedValueOnce(new Error("404 Not Found"));

    render(
      <ProfilePictureProvider>
        <ProfilePictureConsumer />
      </ProfilePictureProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("url").textContent).toBe("none");
    });
  });

  it("refresh triggers refetch of profile picture", async () => {
    const mockSession = createMockSession();
    const mockBlob1 = new Blob(["image1"], { type: "image/png" });
    const mockBlob2 = new Blob(["image2"], { type: "image/png" });

    vi.mocked(useAuth).mockReturnValue({
      session: mockSession,
      status: "authenticated",
      login: vi.fn(),
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });

    vi.mocked(getProfilePicture)
      .mockResolvedValueOnce(mockBlob1)
      .mockResolvedValueOnce(mockBlob2);

    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce("blob:http://localhost/mock-pic-1")
      .mockReturnValueOnce("blob:http://localhost/mock-pic-2");

    const user = userEvent.setup();
    render(
      <ProfilePictureProvider>
        <ProfilePictureConsumer />
      </ProfilePictureProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("url").textContent).toBe("blob:http://localhost/mock-pic-1");
    });

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(screen.getByTestId("url").textContent).toBe("blob:http://localhost/mock-pic-2");
    });

    expect(getProfilePicture).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/mock-pic-1");
  });

  it("throws error when useProfilePicture is called outside ProfilePictureProvider", () => {
    expect(() => render(<ProfilePictureConsumer />)).toThrow(
      "useProfilePicture debe usarse dentro de <ProfilePictureProvider>",
    );
  });
});

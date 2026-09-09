import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useProfilePicture } from "./use-profile-picture";
import * as ProfilePictureProviderModule from "@/providers/profile-picture-provider";

describe("useProfilePicture", () => {
  it("re-exports useProfilePicture from profile-picture-provider", () => {
    const mockVal = { url: "blob:http://localhost/123", refresh: vi.fn() };
    vi.spyOn(ProfilePictureProviderModule, "useProfilePicture").mockReturnValue(mockVal);

    const { result } = renderHook(() => useProfilePicture());
    expect(result.current).toBe(mockVal);
  });
});

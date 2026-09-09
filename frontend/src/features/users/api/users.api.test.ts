import { describe, it, expect, vi, beforeEach } from "vitest";
import { listUsers } from "./users.api";
import { apiRequest } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("users.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listUsers llama a /v1/users con token y search opcional", async () => {
    const mockUsers = [
      { id: "u-1", name: "Ana Gomez", email: "ana@test.com", avatarFile: null },
    ];
    vi.mocked(apiRequest).mockResolvedValueOnce(mockUsers);

    const res = await listUsers("token-abc", "ana");
    expect(apiRequest).toHaveBeenCalledWith("/v1/users", {
      token: "token-abc",
      query: { search: "ana" },
    });
    expect(res).toEqual(mockUsers);
  });
});

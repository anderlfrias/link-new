import { describe, it, expect, vi, beforeEach } from "vitest";
import { getVapidPublicKey, subscribePush, unsubscribePush } from "./push.api";
import { apiRequest } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("push.api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getVapidPublicKey obtiene la clave pública", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ publicKey: "vapid-pub-key" });

    const result = await getVapidPublicKey("tok-1");

    expect(result).toEqual({ publicKey: "vapid-pub-key" });
    expect(apiRequest).toHaveBeenCalledWith("/v1/push/vapid-public-key", { token: "tok-1" });
  });

  it("subscribePush envía POST con la suscripción", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(undefined);

    const subscription = {
      endpoint: "https://push.example.com/ep-1",
      keys: { p256dh: "key-dh", auth: "key-auth" },
    };
    await subscribePush("tok-1", subscription);

    expect(apiRequest).toHaveBeenCalledWith("/v1/push/subscribe", {
      method: "POST",
      token: "tok-1",
      body: subscription,
    });
  });

  it("unsubscribePush envía POST con el endpoint", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce(undefined);

    await unsubscribePush("tok-1", "https://push.example.com/ep-1");

    expect(apiRequest).toHaveBeenCalledWith("/v1/push/unsubscribe", {
      method: "POST",
      token: "tok-1",
      body: { endpoint: "https://push.example.com/ep-1" },
    });
  });
});

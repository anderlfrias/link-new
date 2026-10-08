import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unsubscribePush } from "@/features/notifications/api/push.api";
import { teardownPushSubscription } from "./push-teardown";

vi.mock("@/features/notifications/api/push.api", () => ({
  unsubscribePush: vi.fn(),
}));

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

describe("teardownPushSubscription", () => {
  const browserUnsubscribe = vi.fn();
  const getSubscription = vi.fn();
  const getRegistration = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).PushManager = class {};
    browserUnsubscribe.mockResolvedValue(true);
    getSubscription.mockResolvedValue({ endpoint: ENDPOINT, unsubscribe: browserUnsubscribe });
    getRegistration.mockResolvedValue({ pushManager: { getSubscription } });
    vi.mocked(unsubscribePush).mockResolvedValue(undefined);

    Object.defineProperty(navigator, "serviceWorker", {
      writable: true,
      configurable: true,
      value: { getRegistration },
    });
  });

  afterEach(() => {
    delete (window as any).PushManager;
    delete (navigator as any).serviceWorker;
  });

  it("avisa al backend y da de baja la suscripción del navegador", async () => {
    await teardownPushSubscription("token-123");

    expect(unsubscribePush).toHaveBeenCalledWith("token-123", ENDPOINT);
    expect(browserUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("sin token solo da de baja la suscripción del navegador", async () => {
    await teardownPushSubscription(null);

    expect(unsubscribePush).not.toHaveBeenCalled();
    expect(browserUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("no hace nada si el navegador no soporta push", async () => {
    delete (window as any).PushManager;

    await expect(teardownPushSubscription("token-123")).resolves.toBeUndefined();

    expect(getRegistration).not.toHaveBeenCalled();
    expect(unsubscribePush).not.toHaveBeenCalled();
  });

  it("no hace nada si no hay service worker registrado o suscripción", async () => {
    getRegistration.mockResolvedValueOnce(undefined);
    await teardownPushSubscription("token-123");

    getSubscription.mockResolvedValueOnce(null);
    await teardownPushSubscription("token-123");

    expect(unsubscribePush).not.toHaveBeenCalled();
    expect(browserUnsubscribe).not.toHaveBeenCalled();
  });

  it("no tira si el backend falla, y igual da de baja la suscripción del navegador", async () => {
    vi.mocked(unsubscribePush).mockRejectedValue(new Error("network down"));

    await expect(teardownPushSubscription("token-123")).resolves.toBeUndefined();

    expect(browserUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it("no tira si el navegador falla al leer la suscripción", async () => {
    getRegistration.mockRejectedValue(new Error("sw error"));

    await expect(teardownPushSubscription("token-123")).resolves.toBeUndefined();
  });
});

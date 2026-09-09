import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePushNotifications, isPushSupported } from "./use-push-notifications";
import { getVapidPublicKey, subscribePush } from "@/features/notifications/api/push.api";

const mockUseAuth = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/features/notifications/api/push.api", () => ({
  getVapidPublicKey: vi.fn(),
  subscribePush: vi.fn(),
}));

describe("usePushNotifications", () => {
  const originalNavigator = { ...navigator };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      session: { token: "token-123" },
    });

    // Setup browser APIs on window and navigator
    (window as any).PushManager = class {};
    (window as any).Notification = {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };

    const mockPushManager = {
      getSubscription: vi.fn().mockResolvedValue({
        endpoint: "https://push.example.com/sub-1",
        toJSON: () => ({
          endpoint: "https://push.example.com/sub-1",
          keys: { p256dh: "key-1", auth: "auth-1" },
        }),
      }),
      subscribe: vi.fn().mockResolvedValue({
        endpoint: "https://push.example.com/sub-2",
        toJSON: () => ({
          endpoint: "https://push.example.com/sub-2",
          keys: { p256dh: "key-2", auth: "auth-2" },
        }),
      }),
    };

    const mockRegistration = {
      pushManager: mockPushManager,
    };

    Object.defineProperty(navigator, "serviceWorker", {
      writable: true,
      configurable: true,
      value: {
        register: vi.fn().mockResolvedValue(mockRegistration),
        ready: Promise.resolve(mockRegistration),
      },
    });

    vi.mocked(getVapidPublicKey).mockResolvedValue({ publicKey: "aGVsbG8" });
    vi.mocked(subscribePush).mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete (window as any).PushManager;
    delete (window as any).Notification;
  });

  it("isPushSupported devuelve true cuando las APIs están presentes", () => {
    expect(isPushSupported()).toBe(true);
  });

  it("inicializa el estado de permiso desde Notification.permission", () => {
    (window as any).Notification.permission = "denied";
    const { result } = renderHook(() => usePushNotifications());

    expect(result.current.permission).toBe("denied");
    expect(result.current.isSupported).toBe(true);
  });

  it("requestPermission solicita permiso al usuario y registra suscripción si es concedido", async () => {
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect((window as any).Notification.requestPermission).toHaveBeenCalled();
    expect(result.current.permission).toBe("granted");
    expect(subscribePush).toHaveBeenCalledWith("token-123", {
      endpoint: "https://push.example.com/sub-1",
      keys: { p256dh: "key-1", auth: "auth-1" },
    });
  });
});

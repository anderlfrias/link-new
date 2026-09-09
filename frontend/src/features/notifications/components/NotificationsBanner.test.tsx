import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationsBanner } from "./NotificationsBanner";

const mockUsePushNotifications = vi.fn();
vi.mock("@/features/notifications/hooks/use-push-notifications", () => ({
  usePushNotifications: () => mockUsePushNotifications(),
}));

describe("NotificationsBanner", () => {
  const requestPermission = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no renderiza nada si no está soportado o permiso es granted o null", () => {
    mockUsePushNotifications.mockReturnValue({
      permission: "granted",
      isSupported: true,
      requestPermission,
    });
    const { container: grantedContainer } = render(<NotificationsBanner />);
    expect(grantedContainer.firstChild).toBeNull();

    mockUsePushNotifications.mockReturnValue({
      permission: null,
      isSupported: true,
      requestPermission,
    });
    const { container: nullContainer } = render(<NotificationsBanner />);
    expect(nullContainer.firstChild).toBeNull();

    mockUsePushNotifications.mockReturnValue({
      permission: "default",
      isSupported: false,
      requestPermission,
    });
    const { container: unsupportedContainer } = render(<NotificationsBanner />);
    expect(unsupportedContainer.firstChild).toBeNull();
  });

  it("renderiza banner para activar notificaciones y permite activar o cerrar", async () => {
    const user = userEvent.setup();
    mockUsePushNotifications.mockReturnValue({
      permission: "default",
      isSupported: true,
      requestPermission,
    });

    render(<NotificationsBanner />);

    expect(screen.getByText(/Activá las notificaciones/i)).toBeInTheDocument();
    const activateBtn = screen.getByRole("button", { name: "Activar" });
    await user.click(activateBtn);
    expect(requestPermission).toHaveBeenCalledTimes(1);

    const closeBtn = screen.getByRole("button", { name: "Cerrar aviso" });
    await user.click(closeBtn);
    expect(screen.queryByText(/Activá las notificaciones/i)).not.toBeInTheDocument();
  });

  it("muestra mensaje de bloqueo sin botón de activar cuando el permiso es denied", () => {
    mockUsePushNotifications.mockReturnValue({
      permission: "denied",
      isSupported: true,
      requestPermission,
    });

    render(<NotificationsBanner />);

    expect(screen.getByText(/Las notificaciones están bloqueadas/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activar" })).not.toBeInTheDocument();
  });
});

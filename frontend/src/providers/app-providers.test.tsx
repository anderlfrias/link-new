import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppProviders } from "./app-providers";
import { useTheme } from "./theme-provider";
import { useAuth } from "./auth-provider";
import { useSocket } from "./socket-provider";

vi.mock("@/lib/socket-client", () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
}));

function SmokeConsumer() {
  const { theme } = useTheme();
  const { status } = useAuth();
  const { connected } = useSocket();
  return (
    <div>
      <span data-testid="child">App Ready</span>
      <span data-testid="theme">{theme}</span>
      <span data-testid="auth-status">{status}</span>
      <span data-testid="socket-connected">{String(connected)}</span>
    </div>
  );
}

describe("AppProviders", () => {
  it("renders children wrapped in all application providers without crashing", () => {
    render(
      <AppProviders>
        <SmokeConsumer />
      </AppProviders>,
    );

    expect(screen.getByTestId("child").textContent).toBe("App Ready");
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(screen.getByTestId("socket-connected").textContent).toBe("false");
  });
});

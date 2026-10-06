import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/features/auth/api/auth.api", () => ({
  getAuthConfig: vi.fn(),
}));

import { getAuthConfig } from "@/features/auth/api/auth.api";
import { AuthConfigProvider, useAuthConfig } from "./auth-config-provider";

function Consumer() {
  const { config } = useAuthConfig();
  return <span data-testid="mode">{config?.mode ?? "sin-config"}</span>;
}

describe("AuthConfigProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pide la configuración pública una sola vez al montarse", async () => {
    vi.mocked(getAuthConfig).mockResolvedValue({ mode: "external-auth" });

    render(
      <AuthConfigProvider>
        <Consumer />
        <Consumer />
      </AuthConfigProvider>,
    );

    await waitFor(() => expect(screen.getAllByTestId("mode")[0]).toHaveTextContent("external-auth"));
    expect(getAuthConfig).toHaveBeenCalledTimes(1);
  });

  it("si el backend no responde, la config queda en null y la app sigue", async () => {
    vi.mocked(getAuthConfig).mockRejectedValue(new Error("down"));

    render(
      <AuthConfigProvider>
        <Consumer />
      </AuthConfigProvider>,
    );

    await waitFor(() => expect(getAuthConfig).toHaveBeenCalled());
    expect(screen.getByTestId("mode")).toHaveTextContent("sin-config");
  });

  it("sin provider, el hook devuelve config null (componentes probados por separado)", () => {
    render(<Consumer />);

    expect(screen.getByTestId("mode")).toHaveTextContent("sin-config");
  });
});

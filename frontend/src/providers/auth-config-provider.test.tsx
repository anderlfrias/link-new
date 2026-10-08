import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createMockAuthConfig } from "@/test/test-utils";

vi.mock("@/features/auth/api/auth.api", () => ({
  getAuthConfig: vi.fn(),
}));

import { getAuthConfig } from "@/features/auth/api/auth.api";
import {
  AuthConfigProvider,
  deriveAuthCapabilities,
  useAuthCapabilities,
  useAuthConfig,
} from "./auth-config-provider";

function Consumer() {
  const { config } = useAuthConfig();
  return <span data-testid="provider">{config?.provider.id ?? "sin-config"}</span>;
}

function CapabilitiesConsumer() {
  return <span data-testid="capabilities">{JSON.stringify(useAuthCapabilities())}</span>;
}

describe("AuthConfigProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pide la configuración pública una sola vez al montarse", async () => {
    vi.mocked(getAuthConfig).mockResolvedValue(createMockAuthConfig("external"));

    render(
      <AuthConfigProvider>
        <Consumer />
        <Consumer />
      </AuthConfigProvider>,
    );

    await waitFor(() => expect(screen.getAllByTestId("provider")[0]).toHaveTextContent("test-provider"));
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
    expect(screen.getByTestId("provider")).toHaveTextContent("sin-config");
  });

  it("sin provider, el hook devuelve config null (componentes probados por separado)", () => {
    render(<Consumer />);

    expect(screen.getByTestId("provider")).toHaveTextContent("sin-config");
  });

  it("useAuthCapabilities sigue a la configuración que llega", async () => {
    vi.mocked(getAuthConfig).mockResolvedValue(createMockAuthConfig("local"));

    render(
      <AuthConfigProvider>
        <CapabilitiesConsumer />
      </AuthConfigProvider>,
    );

    expect(JSON.parse(screen.getByTestId("capabilities").textContent!)).toMatchObject({ loaded: false });
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId("capabilities").textContent!)).toEqual({
        loaded: true,
        passwordChange: true,
        accountManagement: "full",
        providerName: null,
      }),
    );
  });
});

describe("deriveAuthCapabilities", () => {
  it("con cuentas locales: contraseña y cuentas completas, sin nombre de proveedor externo", () => {
    expect(deriveAuthCapabilities(createMockAuthConfig("local"))).toEqual({
      loaded: true,
      passwordChange: true,
      accountManagement: "full",
      providerName: null,
    });
  });

  it("con un proveedor externo: sin cambio de contraseña, cuentas de solo estado, y el nombre del proveedor", () => {
    expect(deriveAuthCapabilities(createMockAuthConfig("external"))).toEqual({
      loaded: true,
      passwordChange: false,
      accountManagement: "status-only",
      providerName: "Test Provider",
    });
  });

  it("sin configuración (cargando, o el backend no respondió) muestra lo mínimo", () => {
    expect(deriveAuthCapabilities(null)).toEqual({
      loaded: false,
      passwordChange: false,
      accountManagement: "status-only",
      providerName: null,
    });
  });

  it("decide por las capacidades, no por el id del proveedor: un proveedor externo con cuentas completas las muestra", () => {
    const config = createMockAuthConfig("external", {
      capabilities: { passwordChange: true, accountManagement: "full" },
    });

    expect(deriveAuthCapabilities(config)).toMatchObject({ passwordChange: true, accountManagement: "full" });
  });
});

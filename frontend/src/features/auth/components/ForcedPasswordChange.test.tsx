import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { createMockSession } from "@/test/test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/features/auth/api/auth.api", () => ({
  login: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock("@/lib/socket-client", () => ({
  disconnectSocket: vi.fn(),
}));

const mockRefresh = vi.fn();
vi.mock("@/providers/auth-config-provider", () => ({
  useAuthConfig: () => ({
    config: {
      provider: { id: "local", displayName: "LINK", external: false },
      capabilities: { passwordChange: true, accountManagement: "full" },
      passwordPolicy: {
        minLength: 12,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: false,
        requireNumber: false,
        requireSymbol: false,
        historyCount: 3,
      },
    },
    refresh: mockRefresh,
  }),
}));

import { changePassword } from "@/features/auth/api/auth.api";

/// Representa a la app: como SocketProvider, conecta el socket en cuanto hay
/// una sesión, con su token.
const connectSocket = vi.fn();
function FakeApp() {
  const { session } = useAuth();
  useEffect(() => {
    if (session) connectSocket(session.token);
  }, [session]);
  return <p>La app</p>;
}

function renderWithStoredSession(reason: "reset" | "expired" | "policy" | null, mustChangePassword = true) {
  const session = createMockSession({
    user: { ...createMockSession().user, authProvider: "local", mustChangePassword, mustChangePasswordReason: reason },
  });
  window.localStorage.setItem("link:session", JSON.stringify(session));
  render(
    <AuthProvider>
      <FakeApp />
    </AuthProvider>,
  );
}

describe("Cambio de contraseña obligatorio (AuthProvider + ForcedPasswordChange)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("con un token restringido la app no se monta, y con ella tampoco el socket", async () => {
    renderWithStoredSession("reset");

    expect(await screen.findByRole("heading", { name: "Cambiá tu contraseña" })).toBeInTheDocument();
    expect(screen.queryByText("La app")).not.toBeInTheDocument();
    expect(connectSocket).not.toHaveBeenCalled();
  });

  it.each([
    ["reset", "Un administrador restableció tu contraseña. Elegí una nueva para continuar.", "Contraseña temporal"],
    ["expired", "Tu contraseña venció. Elegí una nueva para continuar.", "Contraseña actual"],
    ["policy", "Tu contraseña no cumple la política de contraseñas vigente. Elegí una nueva para continuar.", "Contraseña actual"],
  ] as const)("explica el motivo %s", async (reason, text, currentLabel) => {
    renderWithStoredSession(reason);

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByLabelText(currentLabel)).toBeInTheDocument();
  });

  it("muestra las reglas de la política vigente, incluido el historial", async () => {
    renderWithStoredSession("policy");

    expect(await screen.findByText("Al menos 12 caracteres")).toBeInTheDocument();
    expect(screen.getByText("Una letra mayúscula")).toBeInTheDocument();
    expect(screen.getByText("No puede ser ninguna de tus últimas 3 contraseñas")).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("al cambiarla, guarda el token nuevo y recién ahí monta la app", async () => {
    vi.mocked(changePassword).mockResolvedValue({ token: "token-nuevo", exp: Math.floor(Date.now() / 1000) + 3600 });
    renderWithStoredSession("reset");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("Contraseña temporal"), "Temporal#2026");
    await user.type(screen.getByLabelText("Contraseña nueva"), "Una Clave Nueva 2026");
    await user.type(screen.getByLabelText("Repetí la contraseña nueva"), "Una Clave Nueva 2026");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    expect(await screen.findByText("La app")).toBeInTheDocument();
    expect(connectSocket).toHaveBeenCalledWith("token-nuevo");
    expect(connectSocket).not.toHaveBeenCalledWith("mock-jwt-token");
    const stored = JSON.parse(window.localStorage.getItem("link:session")!);
    expect(stored.token).toBe("token-nuevo");
    expect(stored.user).toMatchObject({ mustChangePassword: false, mustChangePasswordReason: null });
  });

  it("sin cambio obligatorio la app se monta normalmente", async () => {
    renderWithStoredSession(null, false);

    await waitFor(() => expect(screen.getByText("La app")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Cambiá tu contraseña" })).not.toBeInTheDocument();
  });
});

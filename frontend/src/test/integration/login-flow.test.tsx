import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { AuthProvider, useAuth } from "@/providers/auth-provider";
import { login as loginRequest } from "@/features/auth/api/auth.api";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/features/auth/api/auth.api", () => ({
  login: vi.fn(),
}));

vi.mock("@/lib/socket-client", () => ({
  disconnectSocket: vi.fn(),
}));

function AuthStatusDisplay() {
  const { session, status } = useAuth();
  return (
    <div>
      <span data-testid="auth-status">{status}</span>
      <span data-testid="auth-user">{session?.user.fullName ?? "no-user"}</span>
    </div>
  );
}

describe("Flujo clave: Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("LoginForm completo -> submit -> llama a auth.api.ts -> actualiza estado en auth-provider", async () => {
    const user = userEvent.setup();
    const mockAuthResponse = {
      token: "jwt-token-123",
      user: {
        id: "xu-1",
        internalUserId: "internal-u-1",
        email: "doctor@example.com",
        username: "rdoctor",
        fullName: "Dr. Roberto",
        roles: ["USER"],
        permissions: [],
        app: "chat-interno",
        exp: Math.floor(Date.now() / 1000) + 3600,
        notificationSoundEnabled: true,
      },
    };

    vi.mocked(loginRequest).mockResolvedValueOnce(mockAuthResponse);

    render(
      <AuthProvider>
        <AuthStatusDisplay />
        <LoginForm />
      </AuthProvider>,
    );

    // Estado inicial
    expect(screen.getByTestId("auth-status")).toHaveTextContent("unauthenticated");
    expect(screen.getByTestId("auth-user")).toHaveTextContent("no-user");

    // Escribir credenciales
    const userInput = screen.getByPlaceholderText("Usuario");
    const passInput = screen.getByPlaceholderText("Contraseña");
    await user.type(userInput, "rdoctor");
    await user.type(passInput, "Password123!");

    // Enviar formulario
    const submitBtn = screen.getByRole("button", { name: "Ingresar" });
    await user.click(submitBtn);

    // Verifica que auth.api fue llamado con las credenciales
    expect(loginRequest).toHaveBeenCalledWith({
      user: "rdoctor",
      password: "Password123!",
    });

    // Verifica que auth-provider actualizó su estado en vivo
    expect(screen.getByTestId("auth-status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("auth-user")).toHaveTextContent("Dr. Roberto");

    // Redirige al home
    expect(mockPush).toHaveBeenCalledWith("/");

    // Persiste en localStorage
    const saved = JSON.parse(window.localStorage.getItem("chat-interno:session") || "{}");
    expect(saved.token).toBe("jwt-token-123");
    expect(saved.user.username).toBe("rdoctor");
  });
});

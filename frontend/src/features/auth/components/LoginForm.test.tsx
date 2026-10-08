import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./LoginForm";
import { useAuth } from "@/providers/auth-provider";
import { I18nProvider } from "@/i18n";
import { useRouter } from "next/navigation";
import { ApiError } from "@/types/api.types";
import { deriveAuthCapabilities } from "@/providers/auth-config-provider";
import { createMockAuthConfig } from "@/test/test-utils";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

// Qué muestra el login lo decide `GET /auth/config`: cada test elige el proveedor.
const mockCapabilities = vi.fn();
vi.mock("@/providers/auth-config-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/providers/auth-config-provider")>()),
  useAuthCapabilities: () => mockCapabilities(),
}));

describe("LoginForm", () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCapabilities.mockReturnValue(deriveAuthCapabilities(null));
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: mockLogin,
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
      expireSession: vi.fn(),
      completePasswordChange: vi.fn(),
    });
  });

  it("renders username and password inputs, and submit button", () => {
    render(<LoginForm />);

    expect(screen.getByPlaceholderText("Usuario o correo electrónico")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeInTheDocument();
  });

  it("renders in English when locale is set to en", () => {
    render(
      <I18nProvider initialLocale="en">
        <LoginForm />
      </I18nProvider>,
    );

    expect(screen.getByPlaceholderText("Username or email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("toggles password visibility when eye icon button is clicked", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const passwordInput = screen.getByPlaceholderText("Contraseña");
    expect(passwordInput).toHaveAttribute("type", "password");

    const toggleBtn = screen.getByRole("button", { name: "Mostrar contraseña" });
    await user.click(toggleBtn);

    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ocultar contraseña" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("submits credentials and redirects to / on successful login", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce(undefined);

    render(<LoginForm />);

    await user.type(screen.getByPlaceholderText("Usuario o correo electrónico"), "carlos");
    await user.type(screen.getByPlaceholderText("Contraseña"), "secret123");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(mockLogin).toHaveBeenCalledWith({
      user: "carlos",
      password: "secret123",
    });
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("displays ApiError message on failed login (e.g. 403 generic credential error invariant)", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(
      new ApiError(403, "Usuario o contraseña incorrectos"),
    );

    render(<LoginForm />);

    await user.type(screen.getByPlaceholderText("Usuario o correo electrónico"), "carlos");
    await user.type(screen.getByPlaceholderText("Contraseña"), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(
      screen.getByText("Usuario o contraseña incorrectos"),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("displays generic fallback error message when unknown error occurs", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error("Network disconnect"));

    render(<LoginForm />);

    await user.type(screen.getByPlaceholderText("Usuario o correo electrónico"), "carlos");
    await user.type(screen.getByPlaceholderText("Contraseña"), "pass");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(
      screen.getByText("No se pudo iniciar sesión. Intentá de nuevo."),
    ).toBeInTheDocument();
  });

  describe("según el proveedor de autenticación (LOCAL_AUTH_PLAN.md, Fase 9)", () => {
    it("sin configuración cargada pide usuario o correo, sin la ayuda de contraseña olvidada", () => {
      render(<LoginForm />);

      expect(screen.getByLabelText("Usuario o correo electrónico")).toBeInTheDocument();
      expect(screen.queryByText(/Olvidaste tu contraseña/)).not.toBeInTheDocument();
    });

    it("con un proveedor externo pide usuario o correo, sin la ayuda de contraseña olvidada", () => {
      mockCapabilities.mockReturnValue(deriveAuthCapabilities(createMockAuthConfig("external")));

      render(<LoginForm />);

      expect(screen.getByLabelText("Usuario o correo electrónico")).toBeInTheDocument();
      expect(screen.queryByText(/Olvidaste tu contraseña/)).not.toBeInTheDocument();
    });

    it("con cuentas locales suma la ayuda: la contraseña la restablece un administrador", () => {
      mockCapabilities.mockReturnValue(deriveAuthCapabilities(createMockAuthConfig("local")));

      render(<LoginForm />);

      expect(screen.getByLabelText("Usuario o correo electrónico")).toBeInTheDocument();
      expect(screen.getByText("¿Olvidaste tu contraseña? Pedile a un administrador que la restablezca.")).toBeInTheDocument();
    });
  });
});

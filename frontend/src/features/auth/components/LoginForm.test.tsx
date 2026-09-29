import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./LoginForm";
import { useAuth } from "@/providers/auth-provider";
import { I18nProvider } from "@/i18n";
import { useRouter } from "next/navigation";
import { ApiError } from "@/types/api.types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

describe("LoginForm", () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      status: "unauthenticated",
      login: mockLogin,
      logout: vi.fn(),
      updateSessionUser: vi.fn(),
    });
  });

  it("renders username and password inputs, and submit button", () => {
    render(<LoginForm />);

    expect(screen.getByPlaceholderText("Usuario")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeInTheDocument();
  });

  it("renders in English when locale is set to en", () => {
    render(
      <I18nProvider initialLocale="en">
        <LoginForm />
      </I18nProvider>,
    );

    expect(screen.getByPlaceholderText("Username")).toBeInTheDocument();
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

    await user.type(screen.getByPlaceholderText("Usuario"), "carlos");
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

    await user.type(screen.getByPlaceholderText("Usuario"), "carlos");
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

    await user.type(screen.getByPlaceholderText("Usuario"), "carlos");
    await user.type(screen.getByPlaceholderText("Contraseña"), "pass");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(
      screen.getByText("No se pudo iniciar sesión. Intentá de nuevo."),
    ).toBeInTheDocument();
  });
});

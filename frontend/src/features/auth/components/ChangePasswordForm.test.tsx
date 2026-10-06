import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/types/api.types";
import type { PasswordPolicy } from "@/features/auth/types/auth.types";

const mockExpireSession = vi.fn();
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ session: { token: "tok-1", user: {} }, expireSession: mockExpireSession }),
}));

vi.mock("@/features/auth/api/auth.api", () => ({
  changePassword: vi.fn(),
}));

import { changePassword } from "@/features/auth/api/auth.api";
import { ChangePasswordForm } from "./ChangePasswordForm";

const POLICY: PasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: false,
  requireLowercase: false,
  requireNumber: true,
  requireSymbol: false,
  historyCount: 0,
};

async function fill(current: string, next: string, confirm = next) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Contraseña actual"), current);
  await user.type(screen.getByLabelText("Contraseña nueva"), next);
  await user.type(screen.getByLabelText("Repetí la contraseña nueva"), confirm);
  return user;
}

describe("ChangePasswordForm", () => {
  const onChanged = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderForm(policy: PasswordPolicy | null = POLICY) {
    render(<ChangePasswordForm policy={policy} currentPasswordLabel="Contraseña actual" onChanged={onChanged} />);
  }

  it("muestra en vivo las reglas de la política y habilita el envío recién cuando se cumplen", async () => {
    renderForm();
    const submit = screen.getByRole("button", { name: "Cambiar contraseña" });

    await fill("actual-123", "sin numeros largos");
    expect(submit).toBeDisabled();
    expect(document.querySelector('[data-rule="number"]')).toHaveAttribute("data-met", "false");
    expect(document.querySelector('[data-rule="min_length"]')).toHaveAttribute("data-met", "true");
    expect(screen.getByText("Al menos 12 caracteres")).toBeInTheDocument();
    expect(screen.getByText("Tiene que ser distinta de la actual")).toBeInTheDocument();
  });

  it("no envía si las contraseñas nuevas no coinciden", async () => {
    renderForm();

    await fill("actual-123", "una clave nueva 2026", "otra cosa 2026 distinta");

    expect(screen.getByText("Las contraseñas nuevas no coinciden.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar contraseña" })).toBeDisabled();
  });

  it("con todo bien, cambia la contraseña y entrega el token nuevo", async () => {
    vi.mocked(changePassword).mockResolvedValue({ token: "nuevo", exp: 123 });
    renderForm();

    const user = await fill("actual-123", "una clave nueva 2026");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith({ token: "nuevo", exp: 123 }));
    expect(changePassword).toHaveBeenCalledWith("tok-1", "actual-123", "una clave nueva 2026");
  });

  it("una contraseña actual incorrecta muestra el error y NO cierra la sesión", async () => {
    vi.mocked(changePassword).mockRejectedValue(
      new ApiError(400, "La contraseña actual no es correcta.", "invalid_current_password"),
    );
    renderForm();

    const user = await fill("mal-escrita", "una clave nueva 2026");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña actual no es correcta.");
    expect(mockExpireSession).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("traduce los rechazos por código (repetida, política)", async () => {
    vi.mocked(changePassword).mockRejectedValueOnce(new ApiError(400, "x", "password_reused"));
    renderForm();

    const user = await fill("actual-123", "una clave nueva 2026");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Tiene que ser distinta de la actual");
  });

  it("sin política conocida no muestra reglas y deja que el backend valide", async () => {
    vi.mocked(changePassword).mockRejectedValue(new ApiError(400, "x", "password_policy", { error: "x", rules: ["min_length"] }));
    renderForm(null);

    expect(screen.queryByText("La contraseña nueva tiene que tener:")).not.toBeInTheDocument();
    const user = await fill("actual", "corta");
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La contraseña nueva no cumple la política de contraseñas.");
  });
});

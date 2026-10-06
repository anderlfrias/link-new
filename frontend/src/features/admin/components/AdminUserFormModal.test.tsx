import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminUserFormModal } from "./AdminUserFormModal";

type FormProps = Parameters<typeof AdminUserFormModal>[0];

function renderForm(props: Partial<FormProps> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(
    <AdminUserFormModal mode="create" pending={false} error={null} onSubmit={onSubmit} onClose={onClose} {...props} />,
  );
  return { onSubmit, onClose };
}

describe("AdminUserFormModal", () => {
  it("keeps submit disabled until name and email are filled", async () => {
    const user = userEvent.setup();
    renderForm();
    const submit = screen.getByRole("button", { name: "Crear" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Nombre"), "Ana");
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    expect(submit).toBeEnabled();
    expect(screen.getByText(/Se genera una contraseña temporal/)).toBeInTheDocument();
  });

  it("normalizes the email and username and sends the admin role when checked", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText("Nombre"), "  Ana Ruiz ");
    await user.type(screen.getByLabelText("Correo electrónico"), "Ana@Example.COM");
    await user.type(screen.getByLabelText("Nombre de usuario (opcional)"), "Ana.Ruiz");
    await user.click(screen.getByRole("checkbox", { name: "Administrador de la instalación" }));
    await user.click(screen.getByRole("button", { name: "Crear" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Ana Ruiz",
      email: "ana@example.com",
      username: "ana.ruiz",
      roles: ["admin"],
    });
  });

  it("rejects an invalid email or a username with invalid characters", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText("Nombre"), "Ana");
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@");
    expect(screen.getByText("Correo inválido.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Correo electrónico"));
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.type(screen.getByLabelText("Nombre de usuario (opcional)"), "ana@ruiz");
    expect(screen.getByText(/El usuario debe tener de 3 a 32 caracteres/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sends username null when editing removes it", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm({
      mode: "edit",
      initialValues: { name: "Ana", email: "ana@example.com", username: "ana", isAdmin: false },
    });
    expect(screen.getByRole("dialog", { name: "Editar cuenta" })).toBeInTheDocument();
    expect(screen.queryByText(/Se genera una contraseña temporal/)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Nombre de usuario (opcional)"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Ana", email: "ana@example.com", username: null, roles: [] });
  });

  it("shows the error and disables the admin toggle when asked", () => {
    renderForm({ error: "Ese correo ya está en uso.", disableAdminToggle: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Ese correo ya está en uso.");
    expect(screen.getByRole("checkbox", { name: "Administrador de la instalación" })).toBeDisabled();
  });

  it("does not submit twice while pending", () => {
    renderForm({
      pending: true,
      mode: "edit",
      initialValues: { name: "Ana", email: "ana@example.com", username: "", isAdmin: false },
    });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("closes on cancel", async () => {
    const user = userEvent.setup();
    const { onClose } = renderForm();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

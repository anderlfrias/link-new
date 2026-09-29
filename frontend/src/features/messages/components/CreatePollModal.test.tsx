import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatePollModal } from "./CreatePollModal";
import { I18nProvider } from "@/i18n";

describe("CreatePollModal", () => {
  it("no renderiza nada cuando isOpen es false", () => {
    const { container } = render(
      <CreatePollModal isOpen={false} onClose={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renderiza el formulario con dos opciones iniciales cuando isOpen es true", () => {
    render(<CreatePollModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Crear encuesta" })).toBeInTheDocument();
    expect(screen.getByLabelText("Pregunta")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Opción 1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Opción 2")).toBeInTheDocument();
    expect(screen.getByText("Permitir varias respuestas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear encuesta" })).toBeDisabled();
  });

  it("permite agregar y eliminar opciones respetando el mínimo de 2", async () => {
    const user = userEvent.setup();
    render(<CreatePollModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />);

    // Inicialmente 2 opciones, no hay botones de eliminar
    expect(screen.queryByLabelText("Eliminar opción 1")).not.toBeInTheDocument();

    // Agregar opción 3
    const addButton = screen.getByRole("button", { name: /Agregar opción/i });
    await user.click(addButton);

    expect(screen.getByPlaceholderText("Opción 3")).toBeInTheDocument();
    // Ahora que hay 3 opciones, los botones de eliminar deben estar presentes
    expect(screen.getByLabelText("Eliminar opción 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Eliminar opción 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Eliminar opción 3")).toBeInTheDocument();

    // Eliminar la opción 2
    await user.click(screen.getByLabelText("Eliminar opción 2"));
    expect(screen.queryByPlaceholderText("Opción 3")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Eliminar opción 1")).not.toBeInTheDocument();
  });

  it("muestra error al intentar enviar opciones duplicadas", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreatePollModal isOpen={true} onClose={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Pregunta"), "¿Qué comemos?");
    await user.type(screen.getByPlaceholderText("Opción 1"), "Pizza");
    await user.type(screen.getByPlaceholderText("Opción 2"), "pizza");

    const submitBtn = screen.getByRole("button", { name: "Crear encuesta" });
    await user.click(submitBtn);

    expect(screen.getByText("Las opciones no pueden ser iguales entre sí.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("llama a onSubmit con los datos correctos al enviar encuesta válida", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<CreatePollModal isOpen={true} onClose={onClose} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Pregunta"), "¿Reunión hoy?");
    await user.type(screen.getByPlaceholderText("Opción 1"), "Sí");
    await user.type(screen.getByPlaceholderText("Opción 2"), "No");

    // Marcar permitir varias respuestas
    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    const submitBtn = screen.getByRole("button", { name: "Crear encuesta" });
    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      question: "¿Reunión hoy?",
      options: ["Sí", "No"],
      allowMultiple: true,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("llama a onClose al presionar Cancelar o la X", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreatePollModal isOpen={true} onClose={onClose} onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByLabelText("Cerrar modal"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renderiza correctamente en inglés cuando el locale es en", () => {
    render(
      <I18nProvider initialLocale="en">
        <CreatePollModal isOpen={true} onClose={vi.fn()} onSubmit={vi.fn()} />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Create poll" })).toBeInTheDocument();
    expect(screen.getByLabelText("Question")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Option 1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Option 2")).toBeInTheDocument();
    expect(screen.getByText("Allow multiple answers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create poll" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});

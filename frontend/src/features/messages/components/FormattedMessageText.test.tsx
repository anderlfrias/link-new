import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FormattedMessageText } from "./FormattedMessageText";

describe("FormattedMessageText", () => {
  it("renderiza texto normal sin enlaces si no contiene URLs, correos ni teléfonos", () => {
    const { container } = render(<FormattedMessageText content="Hola doctor, buenos días" />);
    expect(container.textContent).toBe("Hola doctor, buenos días");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renderiza enlaces con target blank y rel noopener para URLs", () => {
    render(<FormattedMessageText content="Visita https://example.org/portal para más detalles" />);

    const link = screen.getByRole("link", { name: "https://example.org/portal" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.org/portal");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("title", "Abrir enlace: https://example.org/portal");
  });

  it("renderiza enlaces mailto para correos electrónicos", () => {
    render(<FormattedMessageText content="Escribe a soporte@example.org para ayuda" />);

    const link = screen.getByRole("link", { name: "soporte@example.org" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "mailto:soporte@example.org");
    expect(link).toHaveAttribute("title", "Enviar correo a: soporte@example.org");
  });

  it("renderiza enlaces tel para números telefónicos", () => {
    render(<FormattedMessageText content="Comunícate al (809) 588-4444" />);

    const link = screen.getByRole("link", { name: "(809) 588-4444" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "tel:8095884444");
    expect(link).toHaveAttribute("title", "Llamar a: (809) 588-4444");
  });

  it("detiene la propagación del evento click al hacer clic en un enlace", () => {
    const parentClickHandler = vi.fn();
    render(
      <div onClick={parentClickHandler}>
        <FormattedMessageText content="Enlace: https://example.org" />
      </div>,
    );

    const link = screen.getByRole("link", { name: "https://example.org" });
    fireEvent.click(link);

    expect(parentClickHandler).not.toHaveBeenCalled();
  });

  it("aplica estilos adaptados para burbujas propias vs ajenas", () => {
    const { rerender } = render(
      <FormattedMessageText content="Visita https://example.org" isOwn={true} />,
    );
    let link = screen.getByRole("link");
    expect(link.className).toContain("text-white");

    rerender(<FormattedMessageText content="Visita https://example.org" isOwn={false} />);
    link = screen.getByRole("link");
    expect(link.className).toContain("text-brand-blue");
  });
});

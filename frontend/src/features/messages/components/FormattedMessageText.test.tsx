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
    render(<FormattedMessageText content="Visita https://example.com/portal para más detalles" />);

    const link = screen.getByRole("link", { name: "https://example.com/portal" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com/portal");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("title", "Abrir enlace: https://example.com/portal");
  });

  it("renderiza enlaces mailto para correos electrónicos", () => {
    render(<FormattedMessageText content="Escribe a soporte@example.com para ayuda" />);

    const link = screen.getByRole("link", { name: "soporte@example.com" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "mailto:soporte@example.com");
    expect(link).toHaveAttribute("title", "Enviar correo a: soporte@example.com");
  });

  it("renderiza enlaces tel para números telefónicos", () => {
    render(<FormattedMessageText content="Comunícate al (809) 555-0100" />);

    const link = screen.getByRole("link", { name: "(809) 555-0100" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "tel:8095550100");
    expect(link).toHaveAttribute("title", "Llamar a: (809) 555-0100");
  });

  it("detiene la propagación del evento click al hacer clic en un enlace", () => {
    const parentClickHandler = vi.fn();
    render(
      <div onClick={parentClickHandler}>
        <FormattedMessageText content="Enlace: https://example.com" />
      </div>,
    );

    const link = screen.getByRole("link", { name: "https://example.com" });
    fireEvent.click(link);

    expect(parentClickHandler).not.toHaveBeenCalled();
  });

  it("aplica estilos adaptados para burbujas propias vs ajenas", () => {
    const { rerender } = render(
      <FormattedMessageText content="Visita https://example.com" isOwn={true} />,
    );
    let link = screen.getByRole("link");
    expect(link.className).toContain("text-white");

    rerender(<FormattedMessageText content="Visita https://example.com" isOwn={false} />);
    link = screen.getByRole("link");
    expect(link.className).toContain("text-brand-blue");
  });

  it("resalta coincidencias con la etiqueta mark cuando se proporciona searchQuery", () => {
    const { container } = render(
      <FormattedMessageText content="Hola a todos, reunión hoy a las 3pm" searchQuery="reunión" />,
    );

    const mark = container.querySelector("mark");
    expect(mark).toBeInTheDocument();
    expect(mark?.textContent).toBe("reunión");
  });

  it("resalta coincidencias de manera insensible a mayúsculas y minúsculas", () => {
    const { container } = render(
      <FormattedMessageText content="INFORMACIÓN importante sobre el caso" searchQuery="información" />,
    );

    const mark = container.querySelector("mark");
    expect(mark).toBeInTheDocument();
    expect(mark?.textContent).toBe("INFORMACIÓN");
  });

  it("no altera el texto ni agrega mark si searchQuery está vacío o solo contiene espacios", () => {
    const { container } = render(
      <FormattedMessageText content="Mensaje de prueba" searchQuery="   " />,
    );

    expect(container.querySelector("mark")).toBeNull();
    expect(container.textContent).toBe("Mensaje de prueba");
  });
});

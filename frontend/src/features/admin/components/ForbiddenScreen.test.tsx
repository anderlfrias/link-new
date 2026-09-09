import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForbiddenScreen } from "./ForbiddenScreen";

describe("ForbiddenScreen", () => {
  it("renders forbidden message and link back to chat", () => {
    render(<ForbiddenScreen />);

    expect(
      screen.getByText("No tenés permisos para ver esta página."),
    ).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /Volver al chat/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });
});

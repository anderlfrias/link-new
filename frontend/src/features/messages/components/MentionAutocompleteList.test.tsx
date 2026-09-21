import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MentionAutocompleteList, type MentionCandidate } from "./MentionAutocompleteList";

describe("MentionAutocompleteList", () => {
  const mockCandidates: MentionCandidate[] = [
    { id: "u-1", name: "Ana Gomez", username: "anag" },
    { id: "u-2", name: "Carlos Perez", username: "cperez" },
    { id: "u-3", name: "David sin username", username: null },
  ];

  it("no renderiza nada si candidates está vacío", () => {
    const { container } = render(
      <MentionAutocompleteList
        candidates={[]}
        selectedIndex={0}
        onSelect={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renderiza la lista de candidatos mostrando solo @usuario y no el nombre completo", () => {
    render(
      <MentionAutocompleteList
        candidates={mockCandidates}
        selectedIndex={0}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("@anag")).toBeInTheDocument();
    expect(screen.getByText("@cperez")).toBeInTheDocument();
    expect(screen.getByText("@David_sin_username")).toBeInTheDocument();

    expect(screen.queryByText("Ana Gomez")).not.toBeInTheDocument();
    expect(screen.queryByText("Carlos Perez")).not.toBeInTheDocument();
    expect(screen.queryByText("David sin username")).not.toBeInTheDocument();
  });

  it("marca aria-selected en el elemento seleccionado según selectedIndex", () => {
    render(
      <MentionAutocompleteList
        candidates={mockCandidates}
        selectedIndex={1}
        onSelect={vi.fn()}
      />,
    );

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[2]).toHaveAttribute("aria-selected", "false");
  });

  it("llama a onSelect al hacer click (mouseDown) en un candidato", () => {
    const handleSelect = vi.fn();
    render(
      <MentionAutocompleteList
        candidates={mockCandidates}
        selectedIndex={0}
        onSelect={handleSelect}
      />,
    );

    const options = screen.getAllByRole("option");
    fireEvent.mouseDown(options[1]);

    expect(handleSelect).toHaveBeenCalledWith(mockCandidates[1]);
  });
});

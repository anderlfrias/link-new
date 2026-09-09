import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("renders user initial and deterministic background color when no image is provided", () => {
    const { container } = render(<Avatar name="Carlos Mendoza" />);

    expect(screen.getByText("C")).toBeInTheDocument();
    const span = container.querySelector("span");
    expect(span?.className).toMatch(/bg-brand-/);
  });

  it("renders '?' when name is empty whitespace", () => {
    render(<Avatar name="   " />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("renders custom icon with precedence over imageUrl", () => {
    render(
      <Avatar
        name="Saved Messages"
        imageUrl="https://example.com/pic.jpg"
        icon={<span data-testid="custom-icon">Bookmark</span>}
      />,
    );

    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders img element when imageUrl is provided", () => {
    render(<Avatar name="Alice" imageUrl="https://example.com/alice.jpg" />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/alice.jpg");
    expect(img).toHaveAttribute("alt", "Alice");
  });

  it("falls back to initials when imageUrl fails to load (onError)", () => {
    render(<Avatar name="Alice" imageUrl="https://example.com/broken.jpg" />);

    const img = screen.getByRole("img");
    fireEvent.error(img);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("applies requested size classes", () => {
    const { container, rerender } = render(<Avatar name="Bob" size="sm" />);
    expect(container.querySelector("span")?.className).toContain("h-8 w-8");

    rerender(<Avatar name="Bob" size="lg" />);
    expect(container.querySelector("span")?.className).toContain("h-12 w-12");

    rerender(<Avatar name="Bob" size="xl" />);
    expect(container.querySelector("span")?.className).toContain("h-24 w-24");
  });
});

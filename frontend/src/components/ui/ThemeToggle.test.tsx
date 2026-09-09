import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./ThemeToggle";
import { useTheme } from "@/providers/theme-provider";

vi.mock("@/providers/theme-provider", () => ({
  useTheme: vi.fn(),
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders moon icon and correct label in light mode", () => {
    vi.mocked(useTheme).mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
      toggleTheme: vi.fn(),
    });

    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: "Cambiar a modo oscuro" });
    expect(button).toBeInTheDocument();
    expect(button.querySelector(".tabler-icon-moon")).toBeInTheDocument();
  });

  it("renders sun icon and correct label in dark mode", () => {
    vi.mocked(useTheme).mockReturnValue({
      theme: "dark",
      setTheme: vi.fn(),
      toggleTheme: vi.fn(),
    });

    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: "Cambiar a modo claro" });
    expect(button).toBeInTheDocument();
    expect(button.querySelector(".tabler-icon-sun")).toBeInTheDocument();
  });

  it("calls toggleTheme when clicked", async () => {
    const toggleTheme = vi.fn();
    vi.mocked(useTheme).mockReturnValue({
      theme: "light",
      setTheme: vi.fn(),
      toggleTheme,
    });

    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button"));
    expect(toggleTheme).toHaveBeenCalledTimes(1);
  });
});

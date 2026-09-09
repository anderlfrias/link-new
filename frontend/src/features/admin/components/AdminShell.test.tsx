import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminShell } from "./AdminShell";
import { usePathname } from "next/navigation";
import { ADMIN_NAV_ITEMS } from "@/features/admin/constants/admin-nav.constant";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("@/components/ui/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

describe("AdminShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nav items and children, highlighting active path", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/settings");

    render(
      <AdminShell>
        <div data-testid="admin-content">Admin Content Here</div>
      </AdminShell>,
    );

    expect(screen.getByRole("link", { name: "Volver al chat" })).toHaveAttribute("href", "/");
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("admin-content")).toBeInTheDocument();

    for (const item of ADMIN_NAV_ITEMS) {
      const link = screen.getByRole("link", { name: item.label });
      expect(link).toHaveAttribute("href", item.href);
      if (item.href === "/admin/settings") {
        expect(link.className).toContain("text-brand-blue");
      }
    }
  });
});

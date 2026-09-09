import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactRow } from "./ContactRow";
import type { DirectoryUser } from "@/features/users/types/user.types";

describe("ContactRow", () => {
  const sampleUser: DirectoryUser = {
    id: "u-1",
    name: "Dr. Roberto Gomez",
    email: "rgomez@example.com",
    avatarFileId: null,
    avatarFile: null,
    status: "ACTIVE",
  };

  it("renderiza nombre y email del usuario", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<ContactRow user={sampleUser} onClick={onClick} />);

    expect(screen.getByText("Dr. Roberto Gomez")).toBeInTheDocument();
    expect(screen.getByText("rgomez@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renderiza estado seleccionado y respeta disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { rerender } = render(
      <ContactRow user={sampleUser} onClick={onClick} selected={false} disabled={true} />,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();

    // Re-render con selected={true}
    rerender(<ContactRow user={sampleUser} onClick={onClick} selected={true} />);
    // El span de check con bg-brand-blue está presente
    expect(button.querySelector(".bg-brand-blue")).toBeInTheDocument();
  });
});

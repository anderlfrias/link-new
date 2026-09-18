import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageReactionsList } from "./MessageReactionsList";
import type { MessageReaction } from "@/features/messages/types/message.types";

describe("MessageReactionsList", () => {
  it("no renderiza nada si reactions está vacío o undefined", () => {
    const { container } = render(
      <MessageReactionsList currentUserId="user-1" onToggleReaction={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("agrupa reacciones por emoji y muestra el conteo", () => {
    const reactions: MessageReaction[] = [
      { id: "r-1", messageId: "m-1", userId: "user-1", userName: "Yo", emoji: "👍", createdAt: "2026-09-18" },
      { id: "r-2", messageId: "m-1", userId: "user-2", userName: "Ana", emoji: "👍", createdAt: "2026-09-18" },
      { id: "r-3", messageId: "m-1", userId: "user-3", userName: "Pedro", emoji: "❤️", createdAt: "2026-09-18" },
    ];

    render(
      <MessageReactionsList
        reactions={reactions}
        currentUserId="user-1"
        onToggleReaction={vi.fn()}
      />,
    );

    expect(screen.getByText("👍")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("❤️")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("llama a onToggleReaction al hacer clic en una píldora de reacción", () => {
    const onToggleReaction = vi.fn();
    const reactions: MessageReaction[] = [
      { id: "r-1", messageId: "m-1", userId: "user-2", userName: "Ana", emoji: "😂", createdAt: "2026-09-18" },
    ];

    render(
      <MessageReactionsList
        reactions={reactions}
        currentUserId="user-1"
        onToggleReaction={onToggleReaction}
      />,
    );

    const btn = screen.getByRole("button", { name: /😂/ });
    fireEvent.click(btn);

    expect(onToggleReaction).toHaveBeenCalledWith("😂");
  });

  it("muestra 'Vos' en el tooltip para la reacción del usuario actual", () => {
    const reactions: MessageReaction[] = [
      { id: "r-1", messageId: "m-1", userId: "user-me", userName: "Mi Nombre", emoji: "🎉", createdAt: "2026-09-18" },
      { id: "r-2", messageId: "m-1", userId: "user-other", userName: "Carlos", emoji: "🎉", createdAt: "2026-09-18" },
    ];

    render(
      <MessageReactionsList
        reactions={reactions}
        currentUserId="user-me"
        onToggleReaction={vi.fn()}
      />,
    );

    const btn = screen.getByRole("button", { name: /🎉/ });
    expect(btn).toHaveAttribute("title", "Vos, Carlos");
  });
});

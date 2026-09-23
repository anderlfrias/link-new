import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PollMessageCard } from "./PollMessageCard";
import type { Poll } from "@/features/messages/types/message.types";

const mockPollSingle: Poll = {
  id: "poll-1",
  messageId: "msg-1",
  question: "¿Qué tecnología preferís?",
  allowMultiple: false,
  totalVotes: 3,
  createdAt: "2026-09-23T10:00:00.000Z",
  options: [
    {
      id: "opt-1",
      pollId: "poll-1",
      text: "React",
      order: 0,
      voteCount: 2,
      votes: [
        { id: "v-1", optionId: "opt-1", userId: "u-1", userName: "Yo", createdAt: "2026-09-23T10:01:00Z" },
        { id: "v-2", optionId: "opt-1", userId: "u-2", userName: "Otro", createdAt: "2026-09-23T10:02:00Z" },
      ],
    },
    {
      id: "opt-2",
      pollId: "poll-1",
      text: "Vue",
      order: 1,
      voteCount: 1,
      votes: [
        { id: "v-3", optionId: "opt-2", userId: "u-3", userName: "Tercero", createdAt: "2026-09-23T10:03:00Z" },
      ],
    },
    {
      id: "opt-3",
      pollId: "poll-1",
      text: "Svelte",
      order: 2,
      voteCount: 0,
      votes: [],
    },
  ],
};

const mockPollMultiple: Poll = {
  ...mockPollSingle,
  id: "poll-2",
  allowMultiple: true,
  question: "¿Cuáles usamos?",
};

describe("PollMessageCard", () => {
  it("renderiza la pregunta, el badge de selección única y las opciones con sus porcentajes", () => {
    render(
      <PollMessageCard
        poll={mockPollSingle}
        isOwn={false}
        currentUserId="u-1"
        footer={<span>10:30</span>}
      />,
    );

    expect(screen.getByText("¿Qué tecnología preferís?")).toBeInTheDocument();
    expect(screen.getByText("Selección única")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("Vue")).toBeInTheDocument();
    expect(screen.getByText("Svelte")).toBeInTheDocument();

    // Porcentajes: 2 de 3 = 67%, 1 de 3 = 33%, 0 de 3 = 0%
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
    expect(screen.getByText("(1)")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();

    // Footer
    expect(screen.getByText("3 votos")).toBeInTheDocument();
    expect(screen.getByText("10:30")).toBeInTheDocument();
  });

  it("muestra badge de selección múltiple cuando allowMultiple es true", () => {
    render(
      <PollMessageCard
        poll={mockPollMultiple}
        isOwn={false}
        currentUserId="u-1"
        footer={<span>10:30</span>}
      />,
    );

    expect(screen.getByText("Selección múltiple")).toBeInTheDocument();
  });

  it("marca la opción como votada (aria-pressed=true) cuando el usuario actual votó por ella", () => {
    render(
      <PollMessageCard
        poll={mockPollSingle}
        isOwn={false}
        currentUserId="u-1"
        footer={<span>10:30</span>}
      />,
    );

    const reactButton = screen.getByRole("button", { name: /React/i });
    expect(reactButton).toHaveAttribute("aria-pressed", "true");

    const vueButton = screen.getByRole("button", { name: /Vue/i });
    expect(vueButton).toHaveAttribute("aria-pressed", "false");
  });

  it("llama a onVote con el optionId al hacer clic sobre una opción", async () => {
    const user = userEvent.setup();
    const onVote = vi.fn();
    render(
      <PollMessageCard
        poll={mockPollSingle}
        isOwn={false}
        currentUserId="u-1"
        onVote={onVote}
        footer={<span>10:30</span>}
      />,
    );

    const svelteButton = screen.getByRole("button", { name: /Svelte/i });
    await user.click(svelteButton);

    expect(onVote).toHaveBeenCalledWith("opt-3");
  });
});

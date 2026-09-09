import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VoiceNotePlayer } from "./VoiceNotePlayer";
import { downloadFile } from "@/utils/download-file";

vi.mock("@/utils/download-file", () => ({
  downloadFile: vi.fn(),
}));

describe("VoiceNotePlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
  });

  it("renders play button, duration slider and download button", () => {
    render(<VoiceNotePlayer url="https://example.com/audio.webm" filename="nota.webm" isOwn={false} />);

    expect(screen.getByLabelText("Reproducir nota de voz")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toBeInTheDocument();
    expect(screen.getByLabelText("Descargar nota.webm")).toBeInTheDocument();
  });

  it("toggles play and pause on button click", () => {
    render(<VoiceNotePlayer url="https://example.com/audio.webm" filename="nota.webm" isOwn={false} />);

    const playBtn = screen.getByLabelText("Reproducir nota de voz");
    fireEvent.click(playBtn);

    expect(window.HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(screen.getByLabelText("Pausar nota de voz")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Pausar nota de voz"));
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(screen.getByLabelText("Reproducir nota de voz")).toBeInTheDocument();
  });

  it("triggers downloadFile when download button is clicked", () => {
    render(<VoiceNotePlayer url="https://example.com/audio.webm" filename="nota.webm" isOwn={true} />);

    const downloadBtn = screen.getByLabelText("Descargar nota.webm");
    fireEvent.click(downloadBtn);

    expect(downloadFile).toHaveBeenCalledWith("https://example.com/audio.webm", "nota.webm");
  });
});

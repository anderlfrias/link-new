import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FileTypeIcon } from "./FileTypeIcon";

describe("FileTypeIcon", () => {
  it("renderiza ícono correspondiente a pdf, audio, video y genérico", () => {
    const { container: pdfContainer } = render(<FileTypeIcon mimeType="application/pdf" size={24} />);
    expect(pdfContainer.querySelector("svg")).toBeInTheDocument();

    const { container: audioContainer } = render(<FileTypeIcon mimeType="audio/mpeg" />);
    expect(audioContainer.querySelector("svg")).toBeInTheDocument();

    const { container: videoContainer } = render(<FileTypeIcon mimeType="video/mp4" />);
    expect(videoContainer.querySelector("svg")).toBeInTheDocument();

    const { container: genericContainer } = render(<FileTypeIcon mimeType="application/octet-stream" />);
    expect(genericContainer.querySelector("svg")).toBeInTheDocument();
  });
});

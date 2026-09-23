import { describe, it, expect } from "vitest";
import { formatSingleMessageContent, formatMessagesForCopy } from "./format-messages-copy";
import type { Message } from "@/features/messages/types/message.types";

function createMockMsg(overrides: Partial<Message>): Message {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "u-1",
    type: "TEXT",
    content: "Hola mundo",
    replyToId: null,
    forwardedFromId: null,
    editedAt: null,
    deletedAt: null,
    deletedById: null,
    createdAt: "2026-09-21T10:30:00Z",
    sender: { id: "u-1", name: "Carlos", email: "carlos@example.com", avatarFileId: null },
    files: [],
    receipts: [],
    replyTo: null,
    forwardedFrom: null,
    ...overrides,
  };
}

describe("format-messages-copy", () => {
  it("formats single text message content directly", () => {
    const msg = createMockMsg({ content: "Texto simple" });
    expect(formatSingleMessageContent(msg)).toBe("Texto simple");
    expect(formatMessagesForCopy([msg], "u-1")).toBe("Texto simple");
  });

  it("formats contact message properly", () => {
    const contactPayload = JSON.stringify({
      userId: "u-99",
      name: "Ana Gomez",
      username: "anagomez",
      phone: "+54 9 11 1234-5678",
    });
    const msg = createMockMsg({ type: "CONTACT", content: contactPayload });
    expect(formatSingleMessageContent(msg)).toBe("Contacto: Ana Gomez - @anagomez - +54 9 11 1234-5678");
  });

  it("handles deleted message", () => {
    const msg = createMockMsg({ deletedAt: "2026-09-21T10:35:00Z" });
    expect(formatSingleMessageContent(msg)).toBe("Mensaje eliminado");
  });

  it("handles message with files and no content", () => {
    const msg = createMockMsg({
      content: "",
      files: [
        {
          id: "mf-1",
          messageId: "msg-1",
          fileId: "f-1",
          createdAt: "2026-09-21T10:00:00Z",
          file: {
            id: "f-1",
            originalName: "documento.pdf",
            mimeType: "application/pdf",
            extension: "pdf",
            size: 1024,
            url: "/api/v1/files/f-1/content?t=abc",
            createdAt: "2026-09-21T10:00:00Z",
            deletedAt: null,
          },
        },
      ],
    });
    expect(formatSingleMessageContent(msg)).toBe("[Archivo adjunto: documento.pdf]");
  });

  it("handles sticker, voice note and image messages", () => {
    const stickerMsg = createMockMsg({ type: "STICKER", content: "", files: [{ id: "f", file: {} as any } as any] });
    expect(formatSingleMessageContent(stickerMsg)).toBe("[Sticker]");

    const voiceMsg = createMockMsg({
      content: "",
      files: [{ id: "f", file: { mimeType: "audio/webm" } as any } as any],
    });
    expect(formatSingleMessageContent(voiceMsg)).toBe("[Nota de voz]");

    const imgMsg = createMockMsg({
      content: "",
      files: [{ id: "f", file: { mimeType: "image/jpeg" } as any } as any],
    });
    expect(formatSingleMessageContent(imgMsg)).toBe("[Imagen]");
  });

  it("formats poll message properly with options and vote counts", () => {
    const pollMsg = createMockMsg({
      type: "POLL",
      content: "¿Adónde vamos?",
      poll: {
        id: "poll-1",
        messageId: "msg-1",
        question: "¿Adónde vamos?",
        allowMultiple: false,
        totalVotes: 3,
        createdAt: "2026-09-21T10:30:00Z",
        options: [
          { id: "opt-1", pollId: "poll-1", text: "Playa", order: 0, votes: [], voteCount: 2 },
          { id: "opt-2", pollId: "poll-1", text: "Montaña", order: 1, votes: [], voteCount: 1 },
        ],
      },
    });

    const formatted = formatSingleMessageContent(pollMsg);
    expect(formatted).toContain("📊 Encuesta: ¿Adónde vamos?");
    expect(formatted).toContain("• Playa (2)");
    expect(formatted).toContain("• Montaña (1)");
  });

  it("formats multiple messages in chronological order with sender names", () => {
    const msg1 = createMockMsg({
      id: "msg-1",
      senderId: "u-1",
      createdAt: "2026-09-21T10:30:00Z",
      content: "Primer mensaje",
      sender: { id: "u-1", name: "Carlos", email: "c@e.com", avatarFileId: null },
    });
    const msg2 = createMockMsg({
      id: "msg-2",
      senderId: "u-current",
      createdAt: "2026-09-21T10:31:00Z",
      content: "Mi respuesta",
      sender: { id: "u-current", name: "Yo Mismo", email: "yo@e.com", avatarFileId: null },
    });

    // Pasamos desordenados a propósito
    const result = formatMessagesForCopy([msg2, msg1], "u-current");
    const lines = result.split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("Carlos: Primer mensaje");
    expect(lines[1]).toContain("Yo: Mi respuesta");
  });

  it("returns empty string if messages array is empty", () => {
    expect(formatMessagesForCopy([], "u-1")).toBe("");
  });
});

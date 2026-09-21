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
          file: {
            id: "f-1",
            name: "documento.pdf",
            size: 1024,
            mimeType: "application/pdf",
            uploadedById: "u-1",
            createdAt: "2026-09-21T10:00:00Z",
            deletedAt: null,
          },
        },
      ],
    });
    expect(formatSingleMessageContent(msg)).toBe("[Archivo: documento.pdf]");
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

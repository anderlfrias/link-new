import { describe, expect, it } from "vitest";
import type { MessageType } from "@/features/messages/types/message.types";
import { isMessageForwardable } from "./message-forward";

describe("isMessageForwardable", () => {
  it.each<MessageType>(["TEXT", "STICKER", "CONTACT"])("permite reenviar un mensaje %s vigente", (type) => {
    expect(isMessageForwardable({ type, deletedAt: null })).toBe(true);
  });

  it.each<MessageType>(["CALL", "POLL", "SYSTEM"])("no permite reenviar un mensaje %s", (type) => {
    expect(isMessageForwardable({ type, deletedAt: null })).toBe(false);
  });

  it("no permite reenviar un mensaje borrado", () => {
    expect(isMessageForwardable({ type: "TEXT", deletedAt: "2026-09-09T09:05:00Z" })).toBe(false);
  });
});

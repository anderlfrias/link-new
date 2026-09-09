import { describe, expect, it } from "vitest";
import {
  getConversationAvatarUrl,
  getConversationDisplayName,
  getLastMessagePreviewText,
  getOtherMembers,
} from "./conversation-display";

describe("conversation-display", () => {
  const currentUserId = "u-me";

  const selfConversation: any = {
    id: "c-self",
    type: "SELF",
    members: [{ userId: "u-me", user: { name: "Me" } }],
  };

  const groupConversation: any = {
    id: "c-group",
    type: "GROUP",
    name: "Equipo Dev",
    imageFile: { path: "groups/dev.png" },
    members: [
      { userId: "u-me", user: { name: "Me" } },
      { userId: "u-alice", user: { name: "Alice" } },
      { userId: "u-bob", user: { name: "Bob" } },
    ],
  };

  const privateConversation: any = {
    id: "c-private",
    type: "PRIVATE",
    members: [
      { userId: "u-me", user: { name: "Me" } },
      { userId: "u-alice", user: { name: "Alice", avatarFile: { path: "avatars/alice.png" } } },
    ],
  };

  describe("getOtherMembers", () => {
    it("filters out current user from members list", () => {
      const others = getOtherMembers(groupConversation, currentUserId);
      expect(others.map((m) => m.userId)).toEqual(["u-alice", "u-bob"]);
    });

    it("returns empty array for self conversation", () => {
      const others = getOtherMembers(selfConversation, currentUserId);
      expect(others).toEqual([]);
    });
  });

  describe("getConversationDisplayName", () => {
    it("returns 'Mensajes guardados' for SELF chat", () => {
      expect(getConversationDisplayName(selfConversation, currentUserId)).toBe("Mensajes guardados");
    });

    it("returns group name or 'Grupo' for GROUP chat", () => {
      expect(getConversationDisplayName(groupConversation, currentUserId)).toBe("Equipo Dev");
      expect(getConversationDisplayName({ ...groupConversation, name: null }, currentUserId)).toBe("Grupo");
    });

    it("returns other member's name or 'Usuario' for PRIVATE chat", () => {
      expect(getConversationDisplayName(privateConversation, currentUserId)).toBe("Alice");
      const emptyPrivate: any = { type: "PRIVATE", members: [{ userId: "u-me" }] };
      expect(getConversationDisplayName(emptyPrivate, currentUserId)).toBe("Usuario");
    });
  });

  describe("getConversationAvatarUrl", () => {
    it("returns null for SELF chat", () => {
      expect(getConversationAvatarUrl(selfConversation, currentUserId)).toBeNull();
    });

    it("returns group image URL if present, or null if missing", () => {
      expect(getConversationAvatarUrl(groupConversation, currentUserId)).toBe(
        "http://localhost:4000/uploads/groups/dev.png",
      );
      expect(getConversationAvatarUrl({ ...groupConversation, imageFile: null }, currentUserId)).toBeNull();
    });

    it("returns other member's avatar URL if present, or null if missing", () => {
      expect(getConversationAvatarUrl(privateConversation, currentUserId)).toBe(
        "http://localhost:4000/uploads/avatars/alice.png",
      );
      const noAvatarPrivate: any = {
        type: "PRIVATE",
        members: [{ userId: "u-me" }, { userId: "u-bob", user: { name: "Bob", avatarFile: null } }],
      };
      expect(getConversationAvatarUrl(noAvatarPrivate, currentUserId)).toBeNull();
    });
  });

  describe("getLastMessagePreviewText", () => {
    it("returns 'Sin mensajes todavía' when lastMessagePreview is empty or null", () => {
      const item: any = { lastMessagePreview: null };
      expect(getLastMessagePreviewText(item, currentUserId)).toBe("Sin mensajes todavía");
    });

    it("prefixes with 'Tú: ' when sent by current user", () => {
      const item: any = {
        lastMessagePreview: "Hola grupo",
        lastMessageSenderId: currentUserId,
      };
      expect(getLastMessagePreviewText(item, currentUserId)).toBe("Tú: Hola grupo");
    });

    it("prefixes with sender name in GROUP when sent by another member", () => {
      const item: any = {
        type: "GROUP",
        lastMessagePreview: "¿Sale café?",
        lastMessageSenderId: "u-alice",
        members: [{ userId: "u-alice", user: { name: "Alice" } }],
      };
      expect(getLastMessagePreviewText(item, currentUserId)).toBe("Alice: ¿Sale café?");
    });

    it("returns raw preview text in PRIVATE chat when sent by the other person", () => {
      const item: any = {
        type: "PRIVATE",
        lastMessagePreview: "Listo, nos vemos",
        lastMessageSenderId: "u-alice",
      };
      expect(getLastMessagePreviewText(item, currentUserId)).toBe("Listo, nos vemos");
    });
  });
});

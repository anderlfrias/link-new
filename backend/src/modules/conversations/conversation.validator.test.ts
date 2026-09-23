import { ConversationType, GroupPermissionLevel } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  addMembersSchema,
  createConversationSchema,
  markReadSchema,
  setFavoriteSchema,
  setMemberAdminSchema,
  setPinnedSchema,
  updateConversationSchema,
  updateGroupSettingsSchema,
} from "./conversation.validator";

describe("conversation.validator", () => {
  describe("createConversationSchema", () => {
    it("valida payload correcto para grupo", async () => {
      const valid = {
        type: ConversationType.GROUP,
        memberIds: ["user-1", "user-2"],
        name: "Mi Grupo",
      };
      const result = await createConversationSchema.validate(valid);
      expect(result.name).toBe("Mi Grupo");
      expect(result.memberIds).toHaveLength(2);
    });

    it("rechaza si falta type o es inválido", async () => {
      await expect(
        createConversationSchema.validate({
          type: "INVALID_TYPE",
          memberIds: ["user-1"],
        }),
      ).rejects.toThrow();
    });

    it("rechaza si memberIds está vacío", async () => {
      await expect(
        createConversationSchema.validate({
          type: ConversationType.PRIVATE,
          memberIds: [],
        }),
      ).rejects.toThrow();
    });
  });

  describe("updateConversationSchema", () => {
    it("acepta si se provee al menos name", async () => {
      const result = await updateConversationSchema.validate({ name: "Nuevo Nombre" });
      expect(result.name).toBe("Nuevo Nombre");
    });

    it("acepta si se provee imageFileId nullable", async () => {
      const result = await updateConversationSchema.validate({ imageFileId: null });
      expect(result.imageFileId).toBeNull();
    });

    it("rechaza si ningún campo es enviado", async () => {
      await expect(updateConversationSchema.validate({})).rejects.toThrow(
        "name or imageFileId is required",
      );
    });
  });

  describe("addMembersSchema", () => {
    it("acepta array de userIds no vacío", async () => {
      const result = await addMembersSchema.validate({ userIds: ["user-3"] });
      expect(result.userIds).toEqual(["user-3"]);
    });

    it("rechaza array de userIds vacío", async () => {
      await expect(addMembersSchema.validate({ userIds: [] })).rejects.toThrow();
    });
  });

  describe("markReadSchema", () => {
    it("acepta payload con o sin lastReadMessageId", async () => {
      const withId = await markReadSchema.validate({ lastReadMessageId: "msg-123" });
      expect(withId.lastReadMessageId).toBe("msg-123");

      const empty = await markReadSchema.validate({});
      expect(empty).toBeDefined();
    });
  });

  describe("setMemberAdminSchema", () => {
    it("acepta valor booleano en isAdmin", async () => {
      const result = await setMemberAdminSchema.validate({ isAdmin: true });
      expect(result.isAdmin).toBe(true);
    });

    it("rechaza si falta isAdmin", async () => {
      await expect(setMemberAdminSchema.validate({})).rejects.toThrow();
    });
  });

  describe("setPinnedSchema", () => {
    it("acepta isPinned booleano", async () => {
      const result = await setPinnedSchema.validate({ isPinned: true });
      expect(result.isPinned).toBe(true);
    });

    it("rechaza si falta isPinned", async () => {
      await expect(setPinnedSchema.validate({})).rejects.toThrow();
    });
  });

  describe("setFavoriteSchema", () => {
    it("acepta isFavorite booleano", async () => {
      const result = await setFavoriteSchema.validate({ isFavorite: false });
      expect(result.isFavorite).toBe(false);
    });

    it("rechaza si falta isFavorite", async () => {
      await expect(setFavoriteSchema.validate({})).rejects.toThrow();
    });
  });

  describe("updateGroupSettingsSchema", () => {
    it("acepta cuando se envía al menos un setting válido", async () => {
      const result = await updateGroupSettingsSchema.validate({
        whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        maxGroupMembers: 50,
      });
      expect(result.whoCanAddMembers).toBe(GroupPermissionLevel.GROUP_ADMINS_ONLY);
      expect(result.maxGroupMembers).toBe(50);
    });

    it("rechaza si no se envía ningún setting", async () => {
      await expect(updateGroupSettingsSchema.validate({})).rejects.toThrow(
        "At least one setting is required",
      );
    });

    it("rechaza si maxGroupMembers es menor a 2", async () => {
      await expect(
        updateGroupSettingsSchema.validate({
          maxGroupMembers: 1,
        }),
      ).rejects.toThrow();
    });

    it("acepta whoCanLeaveGroup válido y rechaza valor inválido", async () => {
      const result = await updateGroupSettingsSchema.validate({
        whoCanLeaveGroup: GroupPermissionLevel.GROUP_ADMINS_ONLY,
      });
      expect(result.whoCanLeaveGroup).toBe(GroupPermissionLevel.GROUP_ADMINS_ONLY);

      await expect(
        updateGroupSettingsSchema.validate({
          whoCanLeaveGroup: "INVALID_LEVEL" as any,
        }),
      ).rejects.toThrow();
    });
  });
});

import { describe, expect, it } from "vitest";
import { ADMIN_ROLE } from "@/features/admin/constants/admin-role.constant";
import { canPerformGroupAction } from "./group-permissions";

describe("group-permissions", () => {
  const mockConversation: any = {
    id: "conv-1",
    createdById: "u-creator",
    members: [
      { userId: "u-creator", isAdmin: true },
      { userId: "u-admin", isAdmin: true },
      { userId: "u-regular", isAdmin: false },
    ],
  };

  describe("APP_ADMINS_ONLY", () => {
    it("returns true only if userRoles includes ADMIN_ROLE", () => {
      expect(canPerformGroupAction("APP_ADMINS_ONLY", mockConversation, "u-regular", [ADMIN_ROLE])).toBe(true);
      expect(canPerformGroupAction("APP_ADMINS_ONLY", mockConversation, "u-admin", ["user"])).toBe(false);
      expect(canPerformGroupAction("APP_ADMINS_ONLY", mockConversation, "u-creator", [])).toBe(false);
    });
  });

  describe("CREATOR_ONLY", () => {
    it("returns true only if currentUserId is conversation.createdById", () => {
      expect(canPerformGroupAction("CREATOR_ONLY", mockConversation, "u-creator", [])).toBe(true);
      expect(canPerformGroupAction("CREATOR_ONLY", mockConversation, "u-admin", [ADMIN_ROLE])).toBe(false);
    });
  });

  describe("GROUP_ADMINS_ONLY", () => {
    it("returns true if member is admin of the group, false otherwise", () => {
      expect(canPerformGroupAction("GROUP_ADMINS_ONLY", mockConversation, "u-admin", [])).toBe(true);
      expect(canPerformGroupAction("GROUP_ADMINS_ONLY", mockConversation, "u-creator", [])).toBe(true);
      expect(canPerformGroupAction("GROUP_ADMINS_ONLY", mockConversation, "u-regular", [])).toBe(false);
      expect(canPerformGroupAction("GROUP_ADMINS_ONLY", mockConversation, "u-non-member", [])).toBe(false);
    });
  });

  describe("ALL_MEMBERS", () => {
    it("returns true for any member", () => {
      expect(canPerformGroupAction("ALL_MEMBERS", mockConversation, "u-regular", [])).toBe(true);
      expect(canPerformGroupAction("ALL_MEMBERS", mockConversation, "u-admin", [])).toBe(true);
    });
  });
});

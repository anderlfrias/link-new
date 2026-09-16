import { FileTypeRestrictionMode, GroupPermissionLevel } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { updateSettingsSchema } from "./settings.validator";

describe("settings.validator", () => {
  describe("updateSettingsSchema", () => {
    it("accepts a valid single-field update", async () => {
      const result = await updateSettingsSchema.validate({ maxUploadSizeMb: 50 });
      expect(result.maxUploadSizeMb).toBe(50);
    });

    it("accepts valid mime types and wildcards in fileTypeList", async () => {
      const validPayload = {
        fileTypeRestrictionMode: FileTypeRestrictionMode.ALLOWLIST,
        fileTypeList: ["application/pdf", "image/*", "video/mp4", "audio/mpeg"],
      };
      const result = await updateSettingsSchema.validate(validPayload);
      expect(result.fileTypeList).toEqual(["application/pdf", "image/*", "video/mp4", "audio/mpeg"]);
    });

    it("rejects fileTypeList entries with file extensions or malformed mime types", async () => {
      await expect(
        updateSettingsSchema.validate({
          fileTypeList: [".pdf"],
        }),
      ).rejects.toThrow(/Each entry must be a mime type/);

      await expect(
        updateSettingsSchema.validate({
          fileTypeList: ["image/"],
        }),
      ).rejects.toThrow(/Each entry must be a mime type/);

      await expect(
        updateSettingsSchema.validate({
          fileTypeList: ["*/*"],
        }),
      ).rejects.toThrow(/Each entry must be a mime type/);
    });

    it("accepts null for nullable limit fields", async () => {
      const result = await updateSettingsSchema.validate({
        maxFilesPerMessage: null,
        messageRetentionDays: null,
        messageEditTimeLimitMinutes: null,
        messageDeleteForEveryoneTimeLimitMinutes: null,
        auditLogRetentionDays: null,
      });

      expect(result.maxFilesPerMessage).toBeNull();
      expect(result.messageRetentionDays).toBeNull();
      expect(result.messageEditTimeLimitMinutes).toBeNull();
      expect(result.messageDeleteForEveryoneTimeLimitMinutes).toBeNull();
      expect(result.auditLogRetentionDays).toBeNull();
    });

    it("accepts valid whoCanCreateGroups values (ALL_MEMBERS and APP_ADMINS_ONLY)", async () => {
      const res1 = await updateSettingsSchema.validate({
        whoCanCreateGroups: GroupPermissionLevel.ALL_MEMBERS,
      });
      expect(res1.whoCanCreateGroups).toBe(GroupPermissionLevel.ALL_MEMBERS);

      const res2 = await updateSettingsSchema.validate({
        whoCanCreateGroups: GroupPermissionLevel.APP_ADMINS_ONLY,
      });
      expect(res2.whoCanCreateGroups).toBe(GroupPermissionLevel.APP_ADMINS_ONLY);
    });

    it("rejects GROUP_ADMINS_ONLY for whoCanCreateGroups", async () => {
      await expect(
        updateSettingsSchema.validate({
          whoCanCreateGroups: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        }),
      ).rejects.toThrow();
    });

    it("rejects empty object without any setting provided", async () => {
      await expect(updateSettingsSchema.validate({})).rejects.toThrow(
        "At least one setting is required",
      );
    });

    it("rejects numbers below minimum constraints", async () => {
      await expect(
        updateSettingsSchema.validate({ maxUploadSizeMb: 0 }),
      ).rejects.toThrow();

      await expect(
        updateSettingsSchema.validate({ maxGroupMembers: 1 }),
      ).rejects.toThrow();

      await expect(
        updateSettingsSchema.validate({ maxVoiceNoteDurationSeconds: 0 }),
      ).rejects.toThrow();

      await expect(
        updateSettingsSchema.validate({ maxFilesPerMessage: 0 }),
      ).rejects.toThrow();

      await expect(
        updateSettingsSchema.validate({ messageRetentionDays: -1 }),
      ).rejects.toThrow();

      await expect(
        updateSettingsSchema.validate({ messageEditTimeLimitMinutes: 0 }),
      ).rejects.toThrow();

      await expect(
        updateSettingsSchema.validate({ messageDeleteForEveryoneTimeLimitMinutes: 0 }),
      ).rejects.toThrow();
    });

    it("rejects non-integer values where integers are required", async () => {
      await expect(
        updateSettingsSchema.validate({ maxUploadSizeMb: 10.5 }),
      ).rejects.toThrow();

      await expect(
        updateSettingsSchema.validate({ maxGroupMembers: 5.2 }),
      ).rejects.toThrow();
    });

    it("accepts valid boolean flags and permission levels", async () => {
      const payload = {
        allowConversationDelete: true,
        allowGroupDelete: false,
        allowGroupOverrideAddMembers: true,
        allowGroupOverrideRemoveMembers: false,
        allowGroupOverrideMaxGroupMembers: true,
        allowGroupOverrideChangeGroupInfo: false,
        allowGroupOverrideDeleteGroup: true,
        allowMessageEdit: true,
        allowMessageDeleteForEveryone: false,
        allowStickersAndGifs: true,
        whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanRemoveMembers: GroupPermissionLevel.ALL_MEMBERS,
        whoCanChangeGroupInfo: GroupPermissionLevel.APP_ADMINS_ONLY,
        whoCanDeleteGroup: GroupPermissionLevel.GROUP_ADMINS_ONLY,
      };

      const result = await updateSettingsSchema.validate(payload);
      expect(result).toMatchObject(payload);
    });

    it("rejects invalid permission levels", async () => {
      await expect(
        updateSettingsSchema.validate({
          whoCanAddMembers: "NON_EXISTENT_ROLE" as any,
        }),
      ).rejects.toThrow();
    });

    it("accepts valid file cleanup and lifecycle settings", async () => {
      const payload = {
        uploadCleanupEnabled: true,
        orphanFileRetentionHours: 48,
        softDeletedFilePurgeDays: 90,
        uploadCleanupDryRun: true,
      };

      const result = await updateSettingsSchema.validate(payload);
      expect(result).toMatchObject(payload);
    });

    it("accepts null for optional retention and purge limits", async () => {
      const payload = {
        orphanFileRetentionHours: null,
        softDeletedFilePurgeDays: null,
      };

      const result = await updateSettingsSchema.validate(payload);
      expect(result.orphanFileRetentionHours).toBeNull();
      expect(result.softDeletedFilePurgeDays).toBeNull();
    });

    it("accepts valid progressive file migration settings", async () => {
      const payload = {
        fileMigrationEnabled: true,
        fileMigrationBatchSize: 100,
        fileMigrationIntervalMinutes: 30,
        fileMigrationDeleteLocalAfterCommit: true,
      };

      const result = await updateSettingsSchema.validate(payload);
      expect(result).toMatchObject(payload);
    });

    it("rejects invalid progressive file migration settings constraints", async () => {
      await expect(
        updateSettingsSchema.validate({ fileMigrationBatchSize: 0 }),
      ).rejects.toThrow();

      await expect(
        updateSettingsSchema.validate({ fileMigrationBatchSize: 501 }),
      ).rejects.toThrow();

      await expect(
        updateSettingsSchema.validate({ fileMigrationIntervalMinutes: 0 }),
      ).rejects.toThrow();
    });

    it("accepts valid auditLogRetentionDays or null, and rejects non-positive or non-integers", async () => {
      const res1 = await updateSettingsSchema.validate({ auditLogRetentionDays: 90 });
      expect(res1.auditLogRetentionDays).toBe(90);

      const res2 = await updateSettingsSchema.validate({ auditLogRetentionDays: null });
      expect(res2.auditLogRetentionDays).toBeNull();

      await expect(
        updateSettingsSchema.validate({ auditLogRetentionDays: 0 }),
      ).rejects.toThrow();

      await expect(
        updateSettingsSchema.validate({ auditLogRetentionDays: -5 }),
      ).rejects.toThrow();

      await expect(
        updateSettingsSchema.validate({ auditLogRetentionDays: 15.5 }),
      ).rejects.toThrow();
    });
  });
});

import {
  AppSettings,
  AuditAction,
  ConversationGroupSettings,
  FileTypeRestrictionMode,
  GroupPermissionLevel,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as SettingsRepository from "./settings.repository";

vi.mock("./settings.repository", () => ({
  getOrCreate: vi.fn(),
  update: vi.fn(),
  SETTINGS_ID: "singleton",
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock("../audit/audit.repository", () => ({
  createOperation: vi.fn((data) => ({ __operation: "audit.create", data })),
}));

vi.mock("../audit/audit.service", () => ({
  buildAuditData: vi.fn((params) => ({ ...params, built: true })),
}));

import { prisma } from "../../config/prisma";
import * as AuditRepository from "../audit/audit.repository";
import * as AuditService from "../audit/audit.service";
import {
  _resetCacheForTesting,
  diffSettings,
  getGroupOverrideAllowedFlags,
  getPublicSettings,
  getSettings,
  resolveEffectiveGroupSettings,
  updateSettings,
} from "./settings.service";

describe("settings.service", () => {
  const defaultMockSettings: AppSettings = {
    id: "singleton",
    maxUploadSizeMb: 50,
    fileTypeRestrictionMode: FileTypeRestrictionMode.DISABLED,
    fileTypeList: [],
    maxFilesPerMessage: 10,
    allowConversationDelete: true,
    maxVoiceNoteDurationSeconds: 120,
    maxGroupMembers: 100,
    whoCanCreateGroups: GroupPermissionLevel.ALL_MEMBERS,
    whoCanAddMembers: GroupPermissionLevel.ALL_MEMBERS,
    whoCanRemoveMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
    whoCanChangeGroupInfo: GroupPermissionLevel.GROUP_ADMINS_ONLY,
    whoCanDeleteGroup: GroupPermissionLevel.GROUP_ADMINS_ONLY,
    allowGroupDelete: true,
    allowGroupOverrideAddMembers: true,
    allowGroupOverrideRemoveMembers: false,
    allowGroupOverrideMaxGroupMembers: true,
    allowGroupOverrideChangeGroupInfo: false,
    allowGroupOverrideDeleteGroup: true,
    messageRetentionDays: null,
    allowMessageEdit: true,
    messageEditTimeLimitMinutes: 15,
    allowMessageDeleteForEveryone: true,
    messageDeleteForEveryoneTimeLimitMinutes: 60,
    allowStickersAndGifs: true,
    uploadCleanupEnabled: false,
    orphanFileRetentionHours: 24,
    softDeletedFilePurgeDays: null,
    uploadCleanupDryRun: false,
    fileMigrationEnabled: false,
    fileMigrationBatchSize: 50,
    fileMigrationIntervalMinutes: 60,
    fileMigrationDeleteLocalAfterCommit: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _resetCacheForTesting();
  });

  describe("getSettings", () => {
    it("calls repository getOrCreate on cache miss and caches the result", async () => {
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(defaultMockSettings);

      const firstCall = await getSettings();
      expect(SettingsRepository.getOrCreate).toHaveBeenCalledTimes(1);
      expect(firstCall).toBe(defaultMockSettings);

      const secondCall = await getSettings();
      expect(SettingsRepository.getOrCreate).toHaveBeenCalledTimes(1);
      expect(secondCall).toBe(defaultMockSettings);
    });
  });

  describe("getPublicSettings", () => {
    it("exposes only the allowed public DTO fields and omits administrative/sensitive fields", async () => {
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(defaultMockSettings);

      const publicSettings = await getPublicSettings();

      expect(publicSettings).toEqual({
        maxUploadSizeMb: 50,
        maxVoiceNoteDurationSeconds: 120,
        maxGroupMembers: 100,
        maxFilesPerMessage: 10,
        allowMessageEdit: true,
        messageEditTimeLimitMinutes: 15,
        allowMessageDeleteForEveryone: true,
        messageDeleteForEveryoneTimeLimitMinutes: 60,
        allowConversationDelete: true,
        allowGroupDelete: true,
        allowStickersAndGifs: true,
      });

      const raw = publicSettings as any;
      expect(raw.id).toBeUndefined();
      expect(raw.fileTypeRestrictionMode).toBeUndefined();
      expect(raw.fileTypeList).toBeUndefined();
      expect(raw.whoCanCreateGroups).toBeUndefined();
      expect(raw.whoCanAddMembers).toBeUndefined();
      expect(raw.whoCanRemoveMembers).toBeUndefined();
      expect(raw.whoCanChangeGroupInfo).toBeUndefined();
      expect(raw.whoCanDeleteGroup).toBeUndefined();
      expect(raw.allowGroupOverrideAddMembers).toBeUndefined();
      expect(raw.allowGroupOverrideRemoveMembers).toBeUndefined();
      expect(raw.allowGroupOverrideMaxGroupMembers).toBeUndefined();
      expect(raw.allowGroupOverrideChangeGroupInfo).toBeUndefined();
      expect(raw.allowGroupOverrideDeleteGroup).toBeUndefined();
      expect(raw.messageRetentionDays).toBeUndefined();
      expect(raw.uploadCleanupEnabled).toBeUndefined();
      expect(raw.orphanFileRetentionHours).toBeUndefined();
      expect(raw.softDeletedFilePurgeDays).toBeUndefined();
      expect(raw.uploadCleanupDryRun).toBeUndefined();
      expect(raw.fileMigrationEnabled).toBeUndefined();
      expect(raw.fileMigrationBatchSize).toBeUndefined();
      expect(raw.fileMigrationIntervalMinutes).toBeUndefined();
      expect(raw.fileMigrationDeleteLocalAfterCommit).toBeUndefined();
      expect(raw.createdAt).toBeUndefined();
      expect(raw.updatedAt).toBeUndefined();
    });
  });

  describe("diffSettings", () => {
    it("devuelve solo los campos que cambiaron, con from y to correctos", () => {
      const before = { ...defaultMockSettings, maxUploadSizeMb: 50, allowGroupDelete: true };
      const diff = diffSettings(before, { maxUploadSizeMb: 100, allowGroupDelete: false });
      expect(diff).toEqual({
        maxUploadSizeMb: { from: 50, to: 100 },
        allowGroupDelete: { from: true, to: false },
      });
    });

    it("ignora los campos ausentes en input (una PATCH parcial no reporta el resto)", () => {
      const before = { ...defaultMockSettings, maxUploadSizeMb: 50, maxGroupMembers: 100 };
      const diff = diffSettings(before, { maxUploadSizeMb: 80 });
      expect(diff).toEqual({
        maxUploadSizeMb: { from: 50, to: 80 },
      });
    });

    it("devuelve objeto vacío si los valores son idénticos", () => {
      const before = { ...defaultMockSettings, maxUploadSizeMb: 50 };
      const diff = diffSettings(before, { maxUploadSizeMb: 50 });
      expect(diff).toEqual({});
    });
  });

  describe("updateSettings", () => {
    it("con un cambio real -> $transaction recibió 2 operaciones y refresca cache", async () => {
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(defaultMockSettings);
      const updatedMock: AppSettings = {
        ...defaultMockSettings,
        maxUploadSizeMb: 200,
        allowGroupDelete: false,
      };
      const mockOpUpdate = { __operation: "settings.update" };
      vi.mocked(SettingsRepository.update).mockReturnValue(mockOpUpdate as any);
      vi.mocked(prisma.$transaction).mockResolvedValue([updatedMock, {}]);

      const result = await updateSettings({ maxUploadSizeMb: 200, allowGroupDelete: false });

      expect(SettingsRepository.update).toHaveBeenCalledWith({
        maxUploadSizeMb: 200,
        allowGroupDelete: false,
      });
      expect(prisma.$transaction).toHaveBeenCalledWith([
        mockOpUpdate,
        expect.objectContaining({ __operation: "audit.create" }),
      ]);
      expect(AuditService.buildAuditData).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE_SETTINGS,
          targetType: "AppSettings",
          targetId: "singleton",
          metadata: {
            changed: {
              maxUploadSizeMb: { from: 50, to: 200 },
              allowGroupDelete: { from: true, to: false },
            },
          },
        }),
      );
      expect(result).toBe(updatedMock);

      // Cache reflejado
      const cachedResult = await getSettings();
      expect(cachedResult).toBe(updatedMock);
    });

    it("sin cambios reales -> no se llama a $transaction y devuelve el valor previo", async () => {
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(defaultMockSettings);

      const result = await updateSettings({ maxUploadSizeMb: 50 });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toBe(defaultMockSettings);
    });

    it("si la transacción rechaza -> updateSettings tira y getSettings sigue devolviendo el anterior", async () => {
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(defaultMockSettings);
      await getSettings();

      vi.mocked(SettingsRepository.update).mockReturnValue({} as any);
      vi.mocked(prisma.$transaction).mockRejectedValue(new Error("Transaction failed"));

      await expect(updateSettings({ maxUploadSizeMb: 999 })).rejects.toThrow("Transaction failed");

      // El cache no se corrompió
      const cachedResult = await getSettings();
      expect(cachedResult).toBe(defaultMockSettings);
    });
  });

  describe("resolveEffectiveGroupSettings", () => {
    it("returns global values for all 5 dimensions when group override is null", async () => {
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(defaultMockSettings);

      const effective = await resolveEffectiveGroupSettings(null);

      expect(effective).toEqual({
        whoCanAddMembers: defaultMockSettings.whoCanAddMembers,
        whoCanRemoveMembers: defaultMockSettings.whoCanRemoveMembers,
        maxGroupMembers: defaultMockSettings.maxGroupMembers,
        whoCanChangeGroupInfo: defaultMockSettings.whoCanChangeGroupInfo,
        whoCanDeleteGroup: defaultMockSettings.whoCanDeleteGroup,
      });
    });

    it("applies group override when allowGroupOverride flag is true and override value is present", async () => {
      const customSettings: AppSettings = {
        ...defaultMockSettings,
        allowGroupOverrideAddMembers: true,
        allowGroupOverrideRemoveMembers: true,
        allowGroupOverrideMaxGroupMembers: true,
        allowGroupOverrideChangeGroupInfo: true,
        allowGroupOverrideDeleteGroup: true,
      };
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(customSettings);

      const groupOverride: ConversationGroupSettings = {
        conversationId: "conv-1",
        updatedAt: new Date(),
        whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanRemoveMembers: GroupPermissionLevel.APP_ADMINS_ONLY,
        maxGroupMembers: 25,
        whoCanChangeGroupInfo: GroupPermissionLevel.ALL_MEMBERS,
        whoCanDeleteGroup: GroupPermissionLevel.APP_ADMINS_ONLY,
      };

      const effective = await resolveEffectiveGroupSettings(groupOverride);

      expect(effective).toEqual({
        whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanRemoveMembers: GroupPermissionLevel.APP_ADMINS_ONLY,
        maxGroupMembers: 25,
        whoCanChangeGroupInfo: GroupPermissionLevel.ALL_MEMBERS,
        whoCanDeleteGroup: GroupPermissionLevel.APP_ADMINS_ONLY,
      });
    });

    it("ignores group override and falls back to global value when allowGroupOverride flag is false", async () => {
      const customSettings: AppSettings = {
        ...defaultMockSettings,
        whoCanAddMembers: GroupPermissionLevel.ALL_MEMBERS,
        whoCanRemoveMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        maxGroupMembers: 100,
        whoCanChangeGroupInfo: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanDeleteGroup: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        // All override flags disabled globally:
        allowGroupOverrideAddMembers: false,
        allowGroupOverrideRemoveMembers: false,
        allowGroupOverrideMaxGroupMembers: false,
        allowGroupOverrideChangeGroupInfo: false,
        allowGroupOverrideDeleteGroup: false,
      };
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(customSettings);

      const groupOverride: ConversationGroupSettings = {
        conversationId: "conv-1",
        updatedAt: new Date(),
        whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanRemoveMembers: GroupPermissionLevel.APP_ADMINS_ONLY,
        maxGroupMembers: 15,
        whoCanChangeGroupInfo: GroupPermissionLevel.ALL_MEMBERS,
        whoCanDeleteGroup: GroupPermissionLevel.APP_ADMINS_ONLY,
      };

      const effective = await resolveEffectiveGroupSettings(groupOverride);

      // Global values MUST prevail
      expect(effective).toEqual({
        whoCanAddMembers: GroupPermissionLevel.ALL_MEMBERS,
        whoCanRemoveMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        maxGroupMembers: 100,
        whoCanChangeGroupInfo: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanDeleteGroup: GroupPermissionLevel.GROUP_ADMINS_ONLY,
      });
    });

    it("falls back to global value when override flag is true but specific override property is null", async () => {
      const customSettings: AppSettings = {
        ...defaultMockSettings,
        whoCanAddMembers: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 80,
        allowGroupOverrideAddMembers: true,
        allowGroupOverrideMaxGroupMembers: true,
      };
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(customSettings);

      const partialOverride: ConversationGroupSettings = {
        conversationId: "conv-2",
        updatedAt: new Date(),
        whoCanAddMembers: null,
        whoCanRemoveMembers: null,
        maxGroupMembers: null,
        whoCanChangeGroupInfo: null,
        whoCanDeleteGroup: null,
      };

      const effective = await resolveEffectiveGroupSettings(partialOverride);

      expect(effective.whoCanAddMembers).toBe(GroupPermissionLevel.ALL_MEMBERS);
      expect(effective.maxGroupMembers).toBe(80);
    });

    it("respects per-dimension mixed flags correctly", async () => {
      const mixedSettings: AppSettings = {
        ...defaultMockSettings,
        whoCanAddMembers: GroupPermissionLevel.ALL_MEMBERS,
        whoCanRemoveMembers: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 100,
        whoCanChangeGroupInfo: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanDeleteGroup: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        // Override allowed for AddMembers and MaxMembers only:
        allowGroupOverrideAddMembers: true,
        allowGroupOverrideRemoveMembers: false,
        allowGroupOverrideMaxGroupMembers: true,
        allowGroupOverrideChangeGroupInfo: false,
        allowGroupOverrideDeleteGroup: false,
      };
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(mixedSettings);

      const groupOverride: ConversationGroupSettings = {
        conversationId: "conv-3",
        updatedAt: new Date(),
        whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY, // allowed -> override wins
        whoCanRemoveMembers: GroupPermissionLevel.APP_ADMINS_ONLY, // not allowed -> global wins
        maxGroupMembers: 30, // allowed -> override wins
        whoCanChangeGroupInfo: GroupPermissionLevel.ALL_MEMBERS, // not allowed -> global wins
        whoCanDeleteGroup: GroupPermissionLevel.APP_ADMINS_ONLY, // not allowed -> global wins
      };

      const effective = await resolveEffectiveGroupSettings(groupOverride);

      expect(effective).toEqual({
        whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanRemoveMembers: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 30,
        whoCanChangeGroupInfo: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanDeleteGroup: GroupPermissionLevel.GROUP_ADMINS_ONLY,
      });
    });
  });

  describe("getGroupOverrideAllowedFlags", () => {
    it("returns exactly the 5 overridable dimension boolean flags reflecting current settings", async () => {
      const customSettings: AppSettings = {
        ...defaultMockSettings,
        allowGroupOverrideAddMembers: true,
        allowGroupOverrideRemoveMembers: false,
        allowGroupOverrideMaxGroupMembers: true,
        allowGroupOverrideChangeGroupInfo: false,
        allowGroupOverrideDeleteGroup: true,
      };
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(customSettings);

      const flags = await getGroupOverrideAllowedFlags();

      expect(flags).toEqual({
        whoCanAddMembers: true,
        whoCanRemoveMembers: false,
        maxGroupMembers: true,
        whoCanChangeGroupInfo: false,
        whoCanDeleteGroup: true,
      });
    });
  });
});

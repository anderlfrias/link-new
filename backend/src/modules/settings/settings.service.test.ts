import {
  AppSettings,
  ConversationGroupSettings,
  FileTypeRestrictionMode,
  GroupPermissionLevel,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as SettingsRepository from "./settings.repository";
import {
  _resetCacheForTesting,
  getGroupOverrideAllowedFlags,
  getPublicSettings,
  getSettings,
  resolveEffectiveGroupSettings,
  updateSettings,
} from "./settings.service";

vi.mock("./settings.repository", () => ({
  getOrCreate: vi.fn(),
  update: vi.fn(),
  SETTINGS_ID: "singleton",
}));

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
      expect(raw.createdAt).toBeUndefined();
      expect(raw.updatedAt).toBeUndefined();
    });
  });

  describe("updateSettings", () => {
    it("calls repository update and replaces the cached settings immediately", async () => {
      const updatedMock: AppSettings = {
        ...defaultMockSettings,
        maxUploadSizeMb: 200,
        allowGroupDelete: false,
      };

      vi.mocked(SettingsRepository.update).mockResolvedValue(updatedMock);

      const result = await updateSettings({ maxUploadSizeMb: 200, allowGroupDelete: false });

      expect(SettingsRepository.update).toHaveBeenCalledWith({
        maxUploadSizeMb: 200,
        allowGroupDelete: false,
      });
      expect(result).toBe(updatedMock);

      // Verify that getSettings uses the newly cached settings without calling getOrCreate
      const cachedResult = await getSettings();
      expect(SettingsRepository.getOrCreate).not.toHaveBeenCalled();
      expect(cachedResult).toBe(updatedMock);
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

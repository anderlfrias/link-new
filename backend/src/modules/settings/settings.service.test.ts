import {
  AppSettings,
  AuditAction,
  ConversationGroupSettings,
  FileTypeRestrictionMode,
  GroupPermissionLevel,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

import env from "../../config/env";
import { prisma } from "../../config/prisma";
import * as AuditRepository from "../audit/audit.repository";
import * as AuditService from "../audit/audit.service";
import {
  _resetCacheForTesting,
  diffSettings,
  getGroupOverrideAllowedFlags,
  getLocalAuthPolicy,
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
    whoCanLeaveGroup: GroupPermissionLevel.ALL_MEMBERS,
    allowGroupOverrideAddMembers: true,
    allowGroupOverrideRemoveMembers: false,
    allowGroupOverrideMaxGroupMembers: true,
    allowGroupOverrideChangeGroupInfo: false,
    allowGroupOverrideDeleteGroup: true,
    allowGroupOverrideLeaveGroup: false,
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
    auditLogRetentionDays: null,
    fileMigrationEnabled: false,
    fileMigrationBatchSize: 50,
    fileMigrationIntervalMinutes: 60,
    fileMigrationDeleteLocalAfterCommit: false,
    localSessionTtlHours: 12,
    passwordMinLength: 12,
    passwordRequireUppercase: false,
    passwordRequireLowercase: false,
    passwordRequireNumber: false,
    passwordRequireSymbol: false,
    passwordExpirationDays: null,
    passwordHistoryCount: 0,
    maxFailedLoginAttempts: null,
    lockoutDurationMinutes: 15,
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

    // Regresión: en una base nueva, los workers piden la configuración a la vez
    // al arrancar; con un upsert por llamado, dos competían por insertar la fila
    // singleton y el proceso se caía por unique constraint en el primer arranque.
    it("concurrent calls on a cold cache share a single getOrCreate", async () => {
      let release: (value: typeof defaultMockSettings) => void = () => {};
      vi.mocked(SettingsRepository.getOrCreate).mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }) as any,
      );

      const calls = [getSettings(), getSettings(), getSettings()];
      release(defaultMockSettings);
      const results = await Promise.all(calls);

      expect(SettingsRepository.getOrCreate).toHaveBeenCalledTimes(1);
      expect(results).toEqual([defaultMockSettings, defaultMockSettings, defaultMockSettings]);
    });

    it("when getOrCreate fails, every waiting caller gets the error and the next call retries", async () => {
      vi.mocked(SettingsRepository.getOrCreate)
        .mockRejectedValueOnce(new Error("db down"))
        .mockResolvedValueOnce(defaultMockSettings);

      await expect(Promise.all([getSettings(), getSettings()])).rejects.toThrow("db down");
      expect(SettingsRepository.getOrCreate).toHaveBeenCalledTimes(1);

      await expect(getSettings()).resolves.toBe(defaultMockSettings);
      expect(SettingsRepository.getOrCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe("getPublicSettings", () => {
    const originalGiphyApiKey = env.GIPHY_API_KEY;

    beforeEach(() => {
      env.GIPHY_API_KEY = "test-giphy-api-key";
    });

    afterEach(() => {
      env.GIPHY_API_KEY = originalGiphyApiKey;
    });

    it("reports GIFs and stickers as disabled when GIPHY_API_KEY is not configured, even if the admin toggle is on", async () => {
      env.GIPHY_API_KEY = undefined;
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(defaultMockSettings);

      const publicSettings = await getPublicSettings();

      expect(publicSettings.allowStickersAndGifs).toBe(false);
    });

    it("reports GIFs and stickers as disabled when the admin turned them off, even with GIPHY_API_KEY configured", async () => {
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue({ ...defaultMockSettings, allowStickersAndGifs: false });

      const publicSettings = await getPublicSettings();

      expect(publicSettings.allowStickersAndGifs).toBe(false);
    });

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
      expect(raw.auditLogRetentionDays).toBeUndefined();
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

    it("actualizar auditLogRetentionDays registra el cambio en el diff de auditoría", async () => {
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(defaultMockSettings);
      const updatedMock: AppSettings = {
        ...defaultMockSettings,
        auditLogRetentionDays: 90,
      };
      const mockOpUpdate = { __operation: "settings.update" };
      vi.mocked(SettingsRepository.update).mockReturnValue(mockOpUpdate as any);
      vi.mocked(prisma.$transaction).mockResolvedValue([updatedMock, {}]);

      const result = await updateSettings({ auditLogRetentionDays: 90 });

      expect(SettingsRepository.update).toHaveBeenCalledWith({ auditLogRetentionDays: 90 });
      expect(AuditService.buildAuditData).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.UPDATE_SETTINGS,
          metadata: {
            changed: {
              auditLogRetentionDays: { from: null, to: 90 },
            },
          },
        }),
      );
      expect(result).toBe(updatedMock);
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
        whoCanLeaveGroup: defaultMockSettings.whoCanLeaveGroup,
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
        allowGroupOverrideLeaveGroup: true,
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
        whoCanLeaveGroup: GroupPermissionLevel.GROUP_ADMINS_ONLY,
      };

      const effective = await resolveEffectiveGroupSettings(groupOverride);

      expect(effective).toEqual({
        whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanRemoveMembers: GroupPermissionLevel.APP_ADMINS_ONLY,
        maxGroupMembers: 25,
        whoCanChangeGroupInfo: GroupPermissionLevel.ALL_MEMBERS,
        whoCanDeleteGroup: GroupPermissionLevel.APP_ADMINS_ONLY,
        whoCanLeaveGroup: GroupPermissionLevel.GROUP_ADMINS_ONLY,
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
        whoCanLeaveGroup: GroupPermissionLevel.ALL_MEMBERS,
        // All override flags disabled globally:
        allowGroupOverrideAddMembers: false,
        allowGroupOverrideRemoveMembers: false,
        allowGroupOverrideMaxGroupMembers: false,
        allowGroupOverrideChangeGroupInfo: false,
        allowGroupOverrideDeleteGroup: false,
        allowGroupOverrideLeaveGroup: false,
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
        whoCanLeaveGroup: GroupPermissionLevel.GROUP_ADMINS_ONLY,
      };

      const effective = await resolveEffectiveGroupSettings(groupOverride);

      // Global values MUST prevail
      expect(effective).toEqual({
        whoCanAddMembers: GroupPermissionLevel.ALL_MEMBERS,
        whoCanRemoveMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        maxGroupMembers: 100,
        whoCanChangeGroupInfo: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanDeleteGroup: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanLeaveGroup: GroupPermissionLevel.ALL_MEMBERS,
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
        whoCanLeaveGroup: null,
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
        whoCanLeaveGroup: GroupPermissionLevel.ALL_MEMBERS,
        // Override allowed for AddMembers and MaxMembers only:
        allowGroupOverrideAddMembers: true,
        allowGroupOverrideRemoveMembers: false,
        allowGroupOverrideMaxGroupMembers: true,
        allowGroupOverrideChangeGroupInfo: false,
        allowGroupOverrideDeleteGroup: false,
        allowGroupOverrideLeaveGroup: false,
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
        whoCanLeaveGroup: GroupPermissionLevel.GROUP_ADMINS_ONLY, // not allowed -> global wins
      };

      const effective = await resolveEffectiveGroupSettings(groupOverride);

      expect(effective).toEqual({
        whoCanAddMembers: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanRemoveMembers: GroupPermissionLevel.ALL_MEMBERS,
        maxGroupMembers: 30,
        whoCanChangeGroupInfo: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanDeleteGroup: GroupPermissionLevel.GROUP_ADMINS_ONLY,
        whoCanLeaveGroup: GroupPermissionLevel.ALL_MEMBERS,
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
        allowGroupOverrideLeaveGroup: false,
      };
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue(customSettings);

      const flags = await getGroupOverrideAllowedFlags();

      expect(flags).toEqual({
        whoCanAddMembers: true,
        whoCanRemoveMembers: false,
        maxGroupMembers: true,
        whoCanChangeGroupInfo: false,
        whoCanDeleteGroup: true,
        whoCanLeaveGroup: false,
      });
    });
  });

  describe("getLocalAuthPolicy", () => {
    it("devuelve la política del modo local desde la configuración", async () => {
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue({
        ...defaultMockSettings,
        localSessionTtlHours: 8,
        passwordMinLength: 14,
        passwordRequireNumber: true,
      });

      await expect(getLocalAuthPolicy()).resolves.toEqual({
        sessionTtlHours: 8,
        minLength: 14,
        requireUppercase: false,
        requireLowercase: false,
        requireNumber: true,
        requireSymbol: false,
        expirationDays: null,
        historyCount: 0,
        maxFailedLoginAttempts: null,
        lockoutDurationMinutes: 15,
      });
    });

    it("aplica los pisos aunque la fila tenga valores fuera de rango (escritos a mano en la base)", async () => {
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue({
        ...defaultMockSettings,
        localSessionTtlHours: 0,
        passwordMinLength: 4,
      });

      const policy = await getLocalAuthPolicy();

      expect(policy.sessionTtlHours).toBe(1);
      expect(policy.minLength).toBe(8);
    });

    it("el bloqueo nunca rige con menos de 3 intentos, y el historial nunca pasa de 12", async () => {
      vi.mocked(SettingsRepository.getOrCreate).mockResolvedValue({
        ...defaultMockSettings,
        maxFailedLoginAttempts: 1,
        passwordHistoryCount: 40,
      });

      const policy = await getLocalAuthPolicy();

      expect(policy.maxFailedLoginAttempts).toBe(3);
      expect(policy.historyCount).toBe(12);
    });
  });
});

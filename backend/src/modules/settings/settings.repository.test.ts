import { beforeEach, describe, expect, it, vi } from "vitest";
import env from "../../config/env";
import { prisma } from "../../config/prisma";
import * as SettingsRepository from "./settings.repository";

vi.mock("../../config/prisma", () => ({
  prisma: {
    appSettings: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("settings.repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrCreate", () => {
    it("upserts the singleton settings record using env.MAX_UPLOAD_SIZE_MB on create", async () => {
      const mockSettings = {
        id: "singleton",
        maxUploadSizeMb: env.MAX_UPLOAD_SIZE_MB,
      } as any;

      vi.mocked(prisma.appSettings.upsert).mockResolvedValue(mockSettings);

      const result = await SettingsRepository.getOrCreate();

      expect(prisma.appSettings.upsert).toHaveBeenCalledWith({
        where: { id: SettingsRepository.SETTINGS_ID },
        update: {},
        create: {
          id: SettingsRepository.SETTINGS_ID,
          maxUploadSizeMb: env.MAX_UPLOAD_SIZE_MB,
        },
      });
      expect(result).toBe(mockSettings);
    });
  });

  describe("update", () => {
    it("updates the singleton settings record with provided data", async () => {
      const updateData = {
        maxUploadSizeMb: 100,
        allowGroupDelete: false,
      };
      const updatedSettings = {
        id: "singleton",
        ...updateData,
      } as any;

      vi.mocked(prisma.appSettings.update).mockResolvedValue(updatedSettings);

      const result = await SettingsRepository.update(updateData);

      expect(prisma.appSettings.update).toHaveBeenCalledWith({
        where: { id: SettingsRepository.SETTINGS_ID },
        data: updateData,
      });
      expect(result).toBe(updatedSettings);
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/messages/message.repository", () => ({
  softDeleteOlderThan: vi.fn(),
}));
vi.mock("../modules/settings/settings.service", () => ({
  getSettings: vi.fn(),
}));

import * as MessageRepository from "../modules/messages/message.repository";
import * as SettingsService from "../modules/settings/settings.service";
import { logger } from "../config/logger";
import { startMessageRetentionWorker } from "./message-retention.worker";

describe("startMessageRetentionWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("no borra nada si messageRetentionDays es null (deshabilitado por default)", async () => {
    vi.mocked(SettingsService.getSettings).mockResolvedValue({ messageRetentionDays: null } as any);

    startMessageRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(SettingsService.getSettings).toHaveBeenCalled();
    expect(MessageRepository.softDeleteOlderThan).not.toHaveBeenCalled();
  });

  it("corre el sweep inmediatamente al arrancar, sin esperar el primer intervalo", async () => {
    vi.mocked(SettingsService.getSettings).mockResolvedValue({ messageRetentionDays: 30 } as any);
    vi.mocked(MessageRepository.softDeleteOlderThan).mockResolvedValue(0);

    startMessageRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(MessageRepository.softDeleteOlderThan).toHaveBeenCalledTimes(1);
  });

  it("calcula el cutoffDate a partir de messageRetentionDays (días -> ms)", async () => {
    vi.setSystemTime(new Date("2026-09-09T12:00:00.000Z"));
    vi.mocked(SettingsService.getSettings).mockResolvedValue({ messageRetentionDays: 30 } as any);
    vi.mocked(MessageRepository.softDeleteOlderThan).mockResolvedValue(0);

    startMessageRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(MessageRepository.softDeleteOlderThan).toHaveBeenCalledWith(new Date("2026-08-10T12:00:00.000Z"));
  });

  it("vuelve a correr el sweep después de que pasa el intervalo configurado (1 hora)", async () => {
    vi.mocked(SettingsService.getSettings).mockResolvedValue({ messageRetentionDays: 30 } as any);
    vi.mocked(MessageRepository.softDeleteOlderThan).mockResolvedValue(0);

    startMessageRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);
    expect(MessageRepository.softDeleteOlderThan).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(MessageRepository.softDeleteOlderThan).toHaveBeenCalledTimes(2);
    expect(SettingsService.getSettings).toHaveBeenCalledTimes(2); // vuelve a leer settings en cada corrida, no cachea
  });

  it("loguea cuántos mensajes se borraron cuando el sweep efectivamente borra algo", async () => {
    vi.mocked(SettingsService.getSettings).mockResolvedValue({ messageRetentionDays: 7 } as any);
    vi.mocked(MessageRepository.softDeleteOlderThan).mockResolvedValue(5);
    const childLogger = { info: vi.fn() };
    vi.spyOn(logger, "child").mockReturnValue(childLogger as any);

    startMessageRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(childLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ deletedCount: 5 }),
      "messages retention sweep completed",
    );
  });

  it("no loguea nada si el sweep no borró ningún mensaje", async () => {
    vi.mocked(SettingsService.getSettings).mockResolvedValue({ messageRetentionDays: 7 } as any);
    vi.mocked(MessageRepository.softDeleteOlderThan).mockResolvedValue(0);
    const childLogger = { info: vi.fn() };
    vi.spyOn(logger, "child").mockReturnValue(childLogger as any);

    startMessageRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(childLogger.info).not.toHaveBeenCalled();
  });
});

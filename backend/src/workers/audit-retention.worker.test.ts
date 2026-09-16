import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/audit/audit.repository", () => ({
  deleteOlderThan: vi.fn(),
}));
vi.mock("../modules/settings/settings.service", () => ({
  getSettings: vi.fn(),
}));

import * as AuditRepository from "../modules/audit/audit.repository";
import * as SettingsService from "../modules/settings/settings.service";
import { logger } from "../config/logger";
import { runAuditRetentionSweep, startAuditRetentionWorker } from "./audit-retention.worker";

describe("audit-retention.worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("no borra nada si auditLogRetentionDays es null (deshabilitado por default)", async () => {
    vi.mocked(SettingsService.getSettings).mockResolvedValue({ auditLogRetentionDays: null } as any);

    startAuditRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(SettingsService.getSettings).toHaveBeenCalled();
    expect(AuditRepository.deleteOlderThan).not.toHaveBeenCalled();
  });

  it("corre el sweep inmediatamente al arrancar, sin esperar el primer intervalo", async () => {
    vi.mocked(SettingsService.getSettings).mockResolvedValue({ auditLogRetentionDays: 90 } as any);
    vi.mocked(AuditRepository.deleteOlderThan).mockResolvedValue(0);

    startAuditRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(AuditRepository.deleteOlderThan).toHaveBeenCalledTimes(1);
  });

  it("calcula el cutoffDate a partir de auditLogRetentionDays (días -> ms)", async () => {
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"));
    vi.mocked(SettingsService.getSettings).mockResolvedValue({ auditLogRetentionDays: 30 } as any);
    vi.mocked(AuditRepository.deleteOlderThan).mockResolvedValue(0);

    startAuditRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(AuditRepository.deleteOlderThan).toHaveBeenCalledWith(new Date("2026-08-17T12:00:00.000Z"));
  });

  it("vuelve a correr el sweep después de que pasa el intervalo configurado (24 horas)", async () => {
    vi.mocked(SettingsService.getSettings).mockResolvedValue({ auditLogRetentionDays: 60 } as any);
    vi.mocked(AuditRepository.deleteOlderThan).mockResolvedValue(0);

    startAuditRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);
    expect(AuditRepository.deleteOlderThan).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(AuditRepository.deleteOlderThan).toHaveBeenCalledTimes(2);
    expect(SettingsService.getSettings).toHaveBeenCalledTimes(2);
  });

  it("loguea cuántos registros de auditoría se borraron cuando el sweep efectivamente borra algo", async () => {
    vi.mocked(SettingsService.getSettings).mockResolvedValue({ auditLogRetentionDays: 90 } as any);
    vi.mocked(AuditRepository.deleteOlderThan).mockResolvedValue(42);
    const childLogger = { info: vi.fn() };
    vi.spyOn(logger, "child").mockReturnValue(childLogger as any);

    startAuditRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(childLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ deletedCount: 42 }),
      "audit logs purged by retention policy",
    );
  });

  it("no loguea nada si el sweep no borró ningún registro (deletedCount = 0)", async () => {
    vi.mocked(SettingsService.getSettings).mockResolvedValue({ auditLogRetentionDays: 90 } as any);
    vi.mocked(AuditRepository.deleteOlderThan).mockResolvedValue(0);
    const childLogger = { info: vi.fn() };
    vi.spyOn(logger, "child").mockReturnValue(childLogger as any);

    startAuditRetentionWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(childLogger.info).not.toHaveBeenCalled();
  });

  it("runAuditRetentionSweep directo retorna sin error si auditLogRetentionDays es null", async () => {
    vi.mocked(SettingsService.getSettings).mockResolvedValue({ auditLogRetentionDays: null } as any);

    await expect(runAuditRetentionSweep()).resolves.toBeUndefined();
    expect(AuditRepository.deleteOlderThan).not.toHaveBeenCalled();
  });

  it("si getSettings rechaza, el sweep propaga el error (no se traga el fallo)", async () => {
    const error = new Error("DB error");
    vi.mocked(SettingsService.getSettings).mockRejectedValue(error);

    await expect(runAuditRetentionSweep()).rejects.toThrow(error);
  });
});

import { apiRequest } from "@/lib/api-client";
import type { AdminSettings, UpdateAdminSettingsPayload } from "@/features/admin/types/admin-settings.types";

export function getAdminSettings(token: string): Promise<AdminSettings> {
  return apiRequest<AdminSettings>("/v1/admin/settings", { token });
}

export function updateAdminSettings(
  token: string,
  patch: UpdateAdminSettingsPayload,
): Promise<AdminSettings> {
  return apiRequest<AdminSettings>("/v1/admin/settings", { method: "PATCH", token, body: patch });
}

import { apiRequest } from "@/lib/api-client";
import type { PublicAppSettings } from "@/features/settings/types/public-settings.types";

export function getPublicSettings(token: string): Promise<PublicAppSettings> {
  return apiRequest<PublicAppSettings>("/v1/settings/public", { token });
}

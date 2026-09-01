/** Espejo de `PublicAppSettingsDTO` (backend/src/modules/settings/settings.types.ts)
 * — ver backend/API.md, sección 12.2. Subconjunto de solo lectura de `AppSettings`
 * expuesto a cualquier autenticado, no solo admins. */
export interface PublicAppSettings {
  maxUploadSizeMb: number;
  maxVoiceNoteDurationSeconds: number;
  maxGroupMembers: number;
  allowMessageEdit: boolean;
  messageEditTimeLimitMinutes: number | null;
  allowMessageDeleteForEveryone: boolean;
  messageDeleteForEveryoneTimeLimitMinutes: number | null;
}

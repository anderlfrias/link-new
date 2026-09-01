/** `limitMinutes: null` = sin límite (ver PublicAppSettingsDTO,
 * allowMessageEdit/allowMessageDeleteForEveryone). Solo para decidir si
 * mostrar la acción — el backend vuelve a chequear esto mismo en cada
 * PATCH/DELETE y es la única autoridad real (ver message.service.ts). */
export function isWithinMessageTimeLimit(createdAtIso: string, limitMinutes: number | null): boolean {
  if (limitMinutes == null) return true;
  const elapsedMinutes = (Date.now() - new Date(createdAtIso).getTime()) / 60_000;
  return elapsedMinutes <= limitMinutes;
}

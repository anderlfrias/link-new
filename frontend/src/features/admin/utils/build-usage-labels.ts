import type { AdminFileUsage } from "@/features/admin/types/admin-files.types";

export function buildUsageLabels(usage: AdminFileUsage): string[] {
  const labels: string[] = [];
  if (usage.avatarOfUserCount > 0) {
    labels.push(usage.avatarOfUserCount === 1 ? "Avatar de 1 usuario" : `Avatar de ${usage.avatarOfUserCount} usuarios`);
  }
  if (usage.groupImageOfConversationCount > 0) {
    labels.push(
      usage.groupImageOfConversationCount === 1
        ? "Foto de 1 grupo"
        : `Foto de ${usage.groupImageOfConversationCount} grupos`,
    );
  }
  if (usage.messageAttachmentCount > 0) {
    labels.push(
      usage.messageAttachmentCount === 1
        ? "Adjunto en 1 mensaje"
        : `Adjunto en ${usage.messageAttachmentCount} mensajes`,
    );
  }
  return labels;
}

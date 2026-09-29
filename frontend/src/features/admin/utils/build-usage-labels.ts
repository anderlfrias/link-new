import type { AdminFileUsage } from "@/features/admin/types/admin-files.types";

export interface UsageLabelsConfig {
  avatarSingle?: string;
  avatarMultiple?: (count: number) => string;
  groupImageSingle?: string;
  groupImageMultiple?: (count: number) => string;
  attachmentSingle?: string;
  attachmentMultiple?: (count: number) => string;
}

export function buildUsageLabels(usage: AdminFileUsage, config?: UsageLabelsConfig): string[] {
  const avatarSingle = config?.avatarSingle ?? "Avatar de 1 usuario";
  const avatarMultiple = config?.avatarMultiple ?? ((c: number) => `Avatar de ${c} usuarios`);
  const groupImageSingle = config?.groupImageSingle ?? "Foto de 1 grupo";
  const groupImageMultiple = config?.groupImageMultiple ?? ((c: number) => `Foto de ${c} grupos`);
  const attachmentSingle = config?.attachmentSingle ?? "Adjunto en 1 mensaje";
  const attachmentMultiple = config?.attachmentMultiple ?? ((c: number) => `Adjunto en ${c} mensajes`);

  const labels: string[] = [];
  if (usage.avatarOfUserCount > 0) {
    labels.push(usage.avatarOfUserCount === 1 ? avatarSingle : avatarMultiple(usage.avatarOfUserCount));
  }
  if (usage.groupImageOfConversationCount > 0) {
    labels.push(
      usage.groupImageOfConversationCount === 1
        ? groupImageSingle
        : groupImageMultiple(usage.groupImageOfConversationCount),
    );
  }
  if (usage.messageAttachmentCount > 0) {
    labels.push(
      usage.messageAttachmentCount === 1
        ? attachmentSingle
        : attachmentMultiple(usage.messageAttachmentCount),
    );
  }
  return labels;
}

import { describe, it, expect } from "vitest";
import { buildUsageLabels } from "./build-usage-labels";

describe("buildUsageLabels", () => {
  it("returns empty array when file is not used anywhere", () => {
    const labels = buildUsageLabels({
      avatarOfUserCount: 0,
      groupImageOfConversationCount: 0,
      messageAttachmentCount: 0,
    });
    expect(labels).toEqual([]);
  });

  it("returns singular labels when counts are 1", () => {
    const labels = buildUsageLabels({
      avatarOfUserCount: 1,
      groupImageOfConversationCount: 1,
      messageAttachmentCount: 1,
    });

    expect(labels).toEqual([
      "Avatar de 1 usuario",
      "Foto de 1 grupo",
      "Adjunto en 1 mensaje",
    ]);
  });

  it("returns plural labels when counts exceed 1", () => {
    const labels = buildUsageLabels({
      avatarOfUserCount: 3,
      groupImageOfConversationCount: 2,
      messageAttachmentCount: 15,
    });

    expect(labels).toEqual([
      "Avatar de 3 usuarios",
      "Foto de 2 grupos",
      "Adjunto en 15 mensajes",
    ]);
  });
});

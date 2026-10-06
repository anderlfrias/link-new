import { describe, expect, it } from "vitest";
import * as collection from "@dicebear/collection";
import { AVATAR_STYLES } from "@/constants/avatar-catalog";
import { getDiceBearAttribution } from "./dicebear-attribution";

describe("getDiceBearAttribution", () => {
  it("devuelve título, autor, fuente y licencia para un estilo CC BY 4.0", () => {
    expect(getDiceBearAttribution(collection.micah)).toEqual({
      title: "Avatar Illustration System",
      creator: "Micah Lanier",
      source: "https://www.figma.com/community/file/829741575478342595",
      licenseName: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    });
  });

  it("devuelve null para un estilo CC0 (no exige atribución)", () => {
    expect(getDiceBearAttribution(collection.lorelei)).toBeNull();
  });

  it("devuelve null para los estilos de uso libre propio (avataaars, bottts)", () => {
    expect(getDiceBearAttribution(collection.avataaars)).toBeNull();
    expect(getDiceBearAttribution(collection.bottts)).toBeNull();
  });

  it("devuelve null si el estilo no publica metadatos de licencia", () => {
    expect(getDiceBearAttribution({ ...collection.micah, meta: undefined })).toBeNull();
  });

  // Si DiceBear cambia la licencia de un estilo, este test avisa para revisar
  // THIRD_PARTY_NOTICES.md: la lista tiene que coincidir con lo que muestra la app.
  it("del catálogo de la app, exigen atribución exactamente los siete estilos CC BY 4.0", () => {
    const withAttribution = AVATAR_STYLES.filter((def) => getDiceBearAttribution(def.style) !== null)
      .map((def) => def.style.meta?.title)
      .sort();

    expect(withAttribution).toEqual(
      [
        "Adventurer",
        "Avatar Illustration System",
        "Croodles - Doodle your face",
        "Custom Avatar",
        "Dylan! The Avatar Generator",
        "Fun Emoji Set",
        "Personas by Draftbit",
      ].sort(),
    );
  });
});

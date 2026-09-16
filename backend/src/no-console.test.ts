import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/// Archivos con una excepción justificada y documentada en el propio archivo.
/// Agregar algo acá requiere el mismo comentario de por qué (ver env.ts).
const ALLOWED = new Set(["config/env.ts"]);

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

describe("prohibición de console.* en el backend", () => {
  it("no hay ningún console.* fuera de las excepciones declaradas", () => {
    const srcRoot = join(__dirname);
    const offenders: string[] = [];

    for (const file of collectSourceFiles(srcRoot)) {
      const rel = relative(srcRoot, file).replace(/\\/g, "/");
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/\bconsole\s*\./.test(line)) offenders.push(`${rel}:${i + 1}`);
        });
    }

    // El mensaje de fallo tiene que decir qué hacer, no solo que falló: este
    // test lo va a ver alguien que no leyó LOGGING_PLAN.md.
    expect(
      offenders,
      `Usá el logger de src/config/logger.ts (ver LOGGING_PLAN.md §3) en vez de console.*:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_AUTH_CONFIG, useAuthMode } from "../test/auth-mode";
import { NotFoundError } from "../utils/errors";

vi.mock("../modules/users/account-admin.service", () => ({
  bootstrapAdmin: vi.fn(),
  resetPasswordByEmail: vi.fn(),
}));

vi.mock("../config/prisma", () => ({ prisma: { $disconnect: vi.fn() } }));

// Logger espiado: la contraseña temporal no puede pasar nunca por acá (D18).
const loggedCalls: unknown[][] = [];
vi.mock("../config/logger", () => {
  const record =
    (level: string) =>
    (...args: unknown[]) => {
      loggedCalls.push([level, ...args]);
    };
  const fake = {
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    debug: record("debug"),
    child: () => fake,
  };
  return { logger: fake };
});

import * as AccountAdminService from "../modules/users/account-admin.service";
import { runAuthAdminCli } from "./auth-admin";

const TEMPORARY = "Temp#Clave-9xYz2026";

function captureOutput() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    output: { stdout: { write: (chunk: string) => stdout.push(chunk) }, stderr: { write: (chunk: string) => stderr.push(chunk) } },
    stdout: () => stdout.join(""),
    stderr: () => stderr.join(""),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  loggedCalls.length = 0;
});

describe("auth-admin CLI", () => {
  it("se niega a correr en modo external-auth", async () => {
    const io = captureOutput();

    const code = await runAuthAdminCli(["create-admin", "--email", "jefa@example.com"], io.output);

    expect(code).toBe(1);
    expect(io.stderr()).toMatch(/solo corre en modo local/);
    expect(AccountAdminService.bootstrapAdmin).not.toHaveBeenCalled();
  });

  describe("en modo local", () => {
    useAuthMode(LOCAL_AUTH_CONFIG);

    it("create-admin imprime la contraseña temporal una sola vez, solo por la salida del comando", async () => {
      vi.mocked(AccountAdminService.bootstrapAdmin).mockResolvedValue({
        userId: "u-1",
        created: true,
        temporaryPassword: TEMPORARY,
      });
      const io = captureOutput();

      const code = await runAuthAdminCli(
        ["create-admin", "--email", "Jefa@Example.com", "--name", "La Jefa", "--username", "Jefa"],
        io.output,
      );

      expect(code).toBe(0);
      expect(AccountAdminService.bootstrapAdmin).toHaveBeenCalledWith({
        email: "jefa@example.com",
        name: "La Jefa",
        username: "jefa",
      });
      expect(io.stdout().split(TEMPORARY)).toHaveLength(2);
      expect(io.stderr()).not.toContain(TEMPORARY);
      expect(JSON.stringify(loggedCalls)).not.toContain(TEMPORARY);
    });

    it("create-admin sobre una cuenta existente lo aclara", async () => {
      vi.mocked(AccountAdminService.bootstrapAdmin).mockResolvedValue({
        userId: "u-1",
        created: false,
        temporaryPassword: TEMPORARY,
      });
      const io = captureOutput();

      await runAuthAdminCli(["create-admin", "--email", "ana@example.com"], io.output);

      expect(io.stdout()).toMatch(/ya existía/);
      expect(io.stdout()).toMatch(/Conserva su historial/);
    });

    it("reset-password imprime la contraseña temporal", async () => {
      vi.mocked(AccountAdminService.resetPasswordByEmail).mockResolvedValue({ userId: "u-1", temporaryPassword: TEMPORARY });
      const io = captureOutput();

      const code = await runAuthAdminCli(["reset-password", "--email", "ana@example.com"], io.output);

      expect(code).toBe(0);
      expect(AccountAdminService.resetPasswordByEmail).toHaveBeenCalledWith("ana@example.com");
      expect(io.stdout()).toContain(TEMPORARY);
      expect(JSON.stringify(loggedCalls)).not.toContain(TEMPORARY);
    });

    it("un error esperado sale por stderr con su mensaje y código 1", async () => {
      vi.mocked(AccountAdminService.resetPasswordByEmail).mockRejectedValue(
        new NotFoundError("No hay ninguna cuenta con ese correo."),
      );
      const io = captureOutput();

      const code = await runAuthAdminCli(["reset-password", "--email", "nadie@example.com"], io.output);

      expect(code).toBe(1);
      expect(io.stderr()).toContain("No hay ninguna cuenta con ese correo.");
      expect(io.stdout()).toBe("");
    });

    it("un error inesperado va al log y la salida no da detalles", async () => {
      vi.mocked(AccountAdminService.resetPasswordByEmail).mockRejectedValue(new Error("connection refused"));
      const io = captureOutput();

      const code = await runAuthAdminCli(["reset-password", "--email", "ana@example.com"], io.output);

      expect(code).toBe(1);
      expect(io.stderr()).not.toContain("connection refused");
      expect(loggedCalls.some(([level]) => level === "error")).toBe(true);
    });

    it.each([
      [[]],
      [["borrar-todo", "--email", "a@example.com"]],
      [["create-admin"]],
      [["create-admin", "--email", "no-es-un-correo"]],
      [["create-admin", "--email", "a@example.com", "--rol", "admin"]],
      [["reset-password", "--email", "a@example.com", "--name", "x"]],
      [["create-admin", "--email", "a@example.com", "--username", "con@arroba"]],
    ])("argumentos inválidos %j -> uso y código 1, sin tocar la base", async (argv) => {
      const io = captureOutput();

      const code = await runAuthAdminCli(argv, io.output);

      expect(code).toBe(1);
      expect(io.stderr().length).toBeGreaterThan(0);
      expect(AccountAdminService.bootstrapAdmin).not.toHaveBeenCalled();
      expect(AccountAdminService.resetPasswordByEmail).not.toHaveBeenCalled();
    });
  });
});

import env from "../config/env";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { runWithContext } from "../config/request-context";
import * as AccountAdminService from "../modules/users/account-admin.service";
import { AppError } from "../utils/errors";

/// CLI de administración de cuentas del modo local (LOCAL_AUTH_PLAN.md, D18):
/// crear el primer admin y restablecer una contraseña cuando ningún admin puede
/// entrar. También arranca una migración de external-auth a local (§10).
///
///   npm run auth:admin -- create-admin --email <correo> [--name <nombre>] [--username <usuario>]
///   npm run auth:admin -- reset-password --email <correo>
///
/// La contraseña temporal se imprime una sola vez, por la salida del comando y
/// nunca por el logger: terminaría en los archivos de log (LOGGING_PLAN.md
/// §4.2). No es un log de aplicación sino la respuesta del comando para quien
/// lo corre, por eso usa `process.stdout.write`.

/// Salidas inyectables, para que los tests lean lo que imprime sin tocar la terminal.
export interface CliOutput {
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
}

const USAGE = [
  "Uso:",
  "  npm run auth:admin -- create-admin --email <correo> [--name <nombre>] [--username <usuario>]",
  "  npm run auth:admin -- reset-password --email <correo>",
  "",
].join("\n");

const COMMANDS = ["create-admin", "reset-password"] as const;
type Command = (typeof COMMANDS)[number];

const OPTIONS: Record<Command, string[]> = {
  "create-admin": ["email", "name", "username"],
  "reset-password": ["email"],
};

const USERNAME_PATTERN = /^[a-z0-9._]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ParsedArgs {
  command: Command;
  options: Record<string, string>;
}

/// `--clave valor`, nada más: alcanza para dos comandos y evita una dependencia.
function parseArgs(argv: string[]): ParsedArgs | string {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command as Command)) {
    return command ? `Comando desconocido: ${command}` : "Falta el comando.";
  }
  const options: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    const name = flag?.startsWith("--") ? flag.slice(2) : "";
    if (!OPTIONS[command as Command].includes(name) || value === undefined || value.startsWith("--")) {
      return `Opción inválida: ${flag}`;
    }
    options[name] = value.trim();
  }
  return { command: command as Command, options };
}

function temporaryPasswordNotice(password: string): string {
  return [
    "Contraseña temporal (se muestra una sola vez; al entrar hay que cambiarla):",
    "",
    `  ${password}`,
    "",
  ].join("\n");
}

export async function runAuthAdminCli(argv: string[], output: CliOutput = process): Promise<number> {
  if (env.auth.mode !== "local") {
    output.stderr.write(
      "Este comando solo corre en modo local: el .env tiene EXTERNAL_AUTH configurado, y ahí las cuentas las administra EXTERNAL_AUTH.\n",
    );
    return 1;
  }

  const parsed = parseArgs(argv);
  if (typeof parsed === "string") {
    output.stderr.write(`${parsed}\n\n${USAGE}`);
    return 1;
  }

  const email = parsed.options.email?.toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email)) {
    output.stderr.write(`Falta un --email válido.\n\n${USAGE}`);
    return 1;
  }
  const username = parsed.options.username?.toLowerCase();
  if (username !== undefined && !USERNAME_PATTERN.test(username)) {
    output.stderr.write("El usuario debe tener de 3 a 32 caracteres: letras, números, punto o guion bajo.\n");
    return 1;
  }

  // Contexto de ejecución propio, como el de los workers: las filas de
  // auditoría quedan con `via: "cli"` y sin actor ni IP, porque no hay una
  // persona autenticada detrás.
  return runWithContext(logger.child({ cli: "auth-admin", command: parsed.command }), {}, async () => {
    try {
      if (parsed.command === "create-admin") {
        const result = await AccountAdminService.bootstrapAdmin({ email, name: parsed.options.name, username });
        output.stdout.write(
          (result.created
            ? `Se creó la cuenta ${email}, con rol admin.\n`
            : `La cuenta ${email} ya existía: ahora tiene rol admin y una contraseña nueva. Conserva su historial.\n`) +
            temporaryPasswordNotice(result.temporaryPassword),
        );
      } else {
        const result = await AccountAdminService.resetPasswordByEmail(email);
        output.stdout.write(`Se restableció la contraseña de ${email}.\n` + temporaryPasswordNotice(result.temporaryPassword));
      }
      return 0;
    } catch (error) {
      if (error instanceof AppError) {
        output.stderr.write(`${error.message}\n`);
      } else {
        logger.error({ err: error }, "auth-admin command failed");
        output.stderr.write("No se pudo completar el comando. El detalle quedó en el log.\n");
      }
      return 1;
    }
  });
}

if (require.main === module) {
  void runAuthAdminCli(process.argv.slice(2)).then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  });
}

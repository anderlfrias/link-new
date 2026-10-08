#!/usr/bin/env node
// Prepara los archivos de entorno para correr LINK por primera vez.
//
//   npm run setup               -> .env en la raíz (para `docker compose`)
//   npm run setup -- --dev      -> backend/.env y frontend/.env.local (sin Docker)
//
// Crea el archivo a partir de su `.env.example` y completa lo que hay que
// generar (contraseña de PostgreSQL, secretos y claves VAPID). Sin
// dependencias: anda sin `npm ci` (por ejemplo, dentro de un contenedor de Node).
//
// Reglas:
//   - Nunca pisa un valor existente: solo completa lo que está vacío. Cambiar
//     LOCAL_AUTH_JWT_SECRET cierra todas las sesiones, cambiar las claves VAPID
//     invalida las suscripciones push y cambiar POSTGRES_PASSWORD con un volumen
//     ya creado deja a la app sin acceso a su base.
//   - No imprime ningún secreto, solo los nombres de las variables.
//   - No pregunta nada: todo se controla con flags.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

const POSTGRES_PASSWORD_PLACEHOLDER = "change-me";
const VAPID_SUBJECT_PLACEHOLDER = "mailto:admin@example.com";
const EXTERNAL_AUTH_VARS = ["EXTERNAL_AUTH_API_URL", "APP_CODE_EXTERNAL_AUTH", "EXTERNAL_AUTH_JWT_SECRET"];

const USAGE = `Uso: npm run setup -- [opciones]

  (sin opciones)            crea .env en la raíz, para \`docker compose\`
  --dev                     crea backend/.env y frontend/.env.local, para correr sin Docker
  --vapid-subject <valor>   contacto de las notificaciones push (mailto: o https:);
                            reemplaza el de ejemplo
  -h, --help                muestra esta ayuda
`;

/// Secreto aleatorio de `bytes` bytes, en base64url (sin caracteres que haya que escapar en un .env).
function randomSecret(bytes) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/// Par de claves VAPID (P-256): público de 65 bytes (87 caracteres en base64url) y
/// privado de 32 (43 caracteres), el formato que valida `web-push`.
function generateVapidKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  // `getPrivateKey()` puede devolver menos de 32 bytes si el valor empieza con ceros
  // (una vez cada ~256 claves): `web-push` exige exactamente 32.
  const privateKey = padLeft(ecdh.getPrivateKey(), 32);
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: privateKey.toString("base64url"),
  };
}

function padLeft(buffer, length) {
  return buffer.length >= length ? buffer : Buffer.concat([Buffer.alloc(length - buffer.length), buffer]);
}

/// Línea `CLAVE=valor` de `key` en `content`, o `null`. Ignora las comentadas (`# CLAVE=`).
function findVariable(lines, key) {
  const prefix = `${key}=`;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  return index === -1 ? null : { index, raw: lines[index].slice(prefix.length) };
}

/// Valor de una variable sin comillas ni comentario al final de la línea.
function parseValue(raw) {
  const withoutComment = raw.replace(/\s+#.*$/, "").trim();
  const quoted = /^(["'])(.*)\1$/.exec(withoutComment);
  return quoted ? { value: quoted[2], quote: quoted[1] } : { value: withoutComment, quote: "" };
}

/// Valor actual de `key` en `content` (cadena vacía si no está o está vacía).
function readValue(content, key) {
  const found = findVariable(content.split(/\r?\n/), key);
  return found ? parseValue(found.raw).value : "";
}

/// Reemplaza `key` por `value` conservando comillas, comentario final y el resto del archivo
/// (reemplazo línea por línea, sin volver a serializar). Si `key` no está, no hace nada.
function setValue(content, key, value) {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const found = findVariable(lines, key);
  if (!found) return content;
  const { quote } = parseValue(found.raw);
  const trailingComment = /\s+#.*$/.exec(found.raw);
  lines[found.index] = `${key}=${quote}${value}${quote}${trailingComment ? trailingComment[0] : ""}`;
  return lines.join(eol);
}

/// Completa las variables vacías de `content`. Devuelve el contenido nuevo, los nombres
/// completados y los avisos. `options.created` indica que el archivo se acaba de crear
/// desde el ejemplo (la contraseña de PostgreSQL de ejemplo solo se reemplaza entonces).
function fillEnv(content, options = {}) {
  const { created = false, vapidSubject = null } = options;
  const filled = [];
  const warnings = [];
  let next = content;

  const isEmpty = (key) => readValue(next, key) === "";
  const has = (key) => findVariable(next.split(/\r?\n/), key) !== null;
  const fill = (key, value) => {
    next = setValue(next, key, value);
    filled.push(key);
  };

  if (has("POSTGRES_PASSWORD")) {
    const current = readValue(next, "POSTGRES_PASSWORD");
    if (current === "") {
      fill("POSTGRES_PASSWORD", randomSecret(24));
    } else if (current === POSTGRES_PASSWORD_PLACEHOLDER) {
      if (created) {
        fill("POSTGRES_PASSWORD", randomSecret(24));
      } else {
        // Con un volumen de PostgreSQL ya creado, cambiarla dejaría a la app sin acceso a su base.
        warnings.push(
          "POSTGRES_PASSWORD sigue en el valor de ejemplo. No se cambia sola: si la base ya existe, dejaría de ser accesible. En una instalación nueva, borrá el valor y volvé a correr el script.",
        );
      }
    }
  }

  // Con las tres EXTERNAL_AUTH_*, la instalación usa el proveedor externo y LOCAL_AUTH_JWT_SECRET se ignora.
  if (has("LOCAL_AUTH_JWT_SECRET") && isEmpty("LOCAL_AUTH_JWT_SECRET")) {
    const externalAuthConfigured = EXTERNAL_AUTH_VARS.some((key) => readValue(next, key) !== "");
    if (!externalAuthConfigured) fill("LOCAL_AUTH_JWT_SECRET", randomSecret(48));
  }

  if (has("FILE_URL_SIGNING_SECRET") && isEmpty("FILE_URL_SIGNING_SECRET")) {
    fill("FILE_URL_SIGNING_SECRET", randomSecret(48));
  }

  if (has("VAPID_PUBLIC_KEY") && has("VAPID_PRIVATE_KEY")) {
    const publicEmpty = isEmpty("VAPID_PUBLIC_KEY");
    const privateEmpty = isEmpty("VAPID_PRIVATE_KEY");
    if (publicEmpty && privateEmpty) {
      const { publicKey, privateKey } = generateVapidKeys();
      fill("VAPID_PUBLIC_KEY", publicKey);
      fill("VAPID_PRIVATE_KEY", privateKey);
    } else if (publicEmpty !== privateEmpty) {
      warnings.push(
        "Solo una de VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY tiene valor: no se tocan. Borrá las dos para generar un par nuevo.",
      );
    }
  }

  if (vapidSubject && has("VAPID_SUBJECT")) {
    const current = readValue(next, "VAPID_SUBJECT");
    if (current === "" || current === VAPID_SUBJECT_PLACEHOLDER) {
      fill("VAPID_SUBJECT", vapidSubject);
    }
  }

  return { content: next, filled, warnings };
}

function parseArgs(argv) {
  const options = { dev: false, vapidSubject: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dev") options.dev = true;
    else if (arg === "--docker") options.dev = false;
    else if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "--vapid-subject") {
      options.vapidSubject = argv[i + 1] ?? "";
      i += 1;
    } else {
      throw new Error(`Opción desconocida: ${arg}`);
    }
  }
  if (options.vapidSubject !== null && !/^(mailto:|https:\/\/)\S+$/.test(options.vapidSubject)) {
    throw new Error("--vapid-subject tiene que ser un mailto: o una URL https:// (por ejemplo, mailto:admin@example.com).");
  }
  return options;
}

/// Un archivo de entorno a preparar: de dónde sale, adónde va y si hay algo que completar.
function targetsFor(options) {
  if (options.dev) {
    return [
      { example: "backend/.env.example", file: "backend/.env", fill: true },
      { example: "frontend/.env.example", file: "frontend/.env.local", fill: false },
    ];
  }
  return [{ example: ".env.example", file: ".env", fill: true }];
}

function writeEnvFile(file, content, created) {
  fs.writeFileSync(file, content);
  // Tiene secretos: que solo lo lea quien lo creó. En Windows no aplica.
  if (created && process.platform !== "win32") {
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // Un sistema de archivos sin permisos POSIX: no es un error.
    }
  }
}

/// Punto de entrada. Devuelve el código de salida (0 = bien, 1 = error de lectura, 2 = uso).
/// `io.root` (default: la raíz del repo), `io.log` y `io.error` se inyectan en los tests.
function main(argv = process.argv.slice(2), io = {}) {
  const { root = ROOT, log = console.log, error = console.error } = io;

  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    error(err.message);
    error(USAGE);
    return 2;
  }
  if (options.help) {
    log(USAGE);
    return 0;
  }

  const targets = targetsFor(options);
  const missing = targets.filter((target) => !fs.existsSync(path.join(root, target.example)));
  if (missing.length > 0) {
    error(`Falta ${missing.map((target) => target.example).join(" y ")}: ¿se está corriendo desde un checkout completo de LINK?`);
    return 1;
  }

  const allWarnings = [];
  for (const target of targets) {
    const file = path.join(root, target.file);
    const created = !fs.existsSync(file);
    const original = fs.readFileSync(created ? path.join(root, target.example) : file, "utf8");

    const result = target.fill
      ? fillEnv(original, { created, vapidSubject: options.vapidSubject })
      : { content: original, filled: [], warnings: [] };

    if (created || result.content !== original) {
      writeEnvFile(file, result.content, created);
    }

    log(created ? `${target.file} creado a partir de ${target.example}` : `${target.file} ya existía`);
    log(result.filled.length > 0 ? `  completadas: ${result.filled.join(", ")}` : "  sin variables por completar");
    allWarnings.push(...result.warnings.map((warning) => `${target.file}: ${warning}`));
  }

  for (const warning of allWarnings) log(`Aviso: ${warning}`);

  log("Siguiente paso:");
  if (options.dev) {
    log("  npm ci && npm run db:migrate");
    log("  npm run auth:admin:dev --workspace=backend -- create-admin --email admin@example.com");
    log("  npm run dev");
  } else {
    log("  docker compose up -d --build");
    log("  docker compose exec backend npm run auth:admin -- create-admin --email admin@example.com");
  }
  return 0;
}

module.exports = { fillEnv, generateVapidKeys, main, randomSecret, readValue, setValue };

if (require.main === module) {
  process.exit(main());
}

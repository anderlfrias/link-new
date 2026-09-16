import "dotenv/config";
import * as yup from "yup";

const schema = yup.object({
  DATABASE_URL: yup.string().required(),
  PORT: yup.number().default(4000),
  EXTERNAL_AUTH_API_URL: yup.string().url().required(),
  APP_CODE_EXTERNAL_AUTH: yup.string().required(),
  EXTERNAL_AUTH_JWT_SECRET: yup.string().required(),
  // Solo semilla de AppSettings.maxUploadSizeMb en el primer arranque (ver
  // settings.repository.ts#getOrCreate) — después la fila en la base manda.
  // 2048 (antes 25): techo que un admin puede habilitar una vez completado
  // el upload chunked de LARGE_FILES_PLAN.md. El camino directo de hoy
  // (`POST /v1/files`) sigue tope-ado por `ABSOLUTE_MAX_UPLOAD_BYTES` (32 MB,
  // ver file.route.ts) hasta esa fase, sin importar este valor.
  MAX_UPLOAD_SIZE_MB: yup.number().default(2048),
  VAPID_PUBLIC_KEY: yup.string().required(),
  VAPID_PRIVATE_KEY: yup.string().required(),
  VAPID_SUBJECT: yup.string().required(),
  // Opcional a propósito: sin definir, la API y el socket quedan abiertos a
  // cualquier origen (cómodo en dev/LAN). Ver config/cors-origins.ts.
  CORS_ORIGIN: yup.string().optional(),
  // Opcional a propósito, a diferencia de VAPID_*: sin esta key, /v1/giphy/*
  // responde 503 en vez de tirar abajo todo el server al arrancar (ver
  // giphy.service.ts) — así activar/desactivar Giphy no exige coordinar un
  // restart con esta variable siempre presente.
  GIPHY_API_KEY: yup.string().optional(),
  // Secreto para firmar tokens HMAC en URLs de archivos (/v1/files/:id/content?t=...).
  // Si no se define, se utiliza EXTERNAL_AUTH_JWT_SECRET como fallback seguro.
  FILE_URL_SIGNING_SECRET: yup.string().optional(),
  // Almacenamiento S3 (SeaweedFS / MinIO / AWS S3) — LARGE_FILES_PLAN.md Fase 3
  STORAGE_WRITE_PROVIDER: yup.string().oneOf(["LOCAL", "S3"]).default("LOCAL"),
  S3_ENDPOINT: yup.string().optional(),
  S3_REGION: yup.string().default("us-east-1"),
  S3_BUCKET: yup.string().default("link-files"),
  S3_ACCESS_KEY_ID: yup.string().optional(),
  S3_SECRET_ACCESS_KEY: yup.string().optional(),
  S3_FORCE_PATH_STYLE: yup
    .boolean()
    .transform((value, originalValue) =>
      typeof originalValue === "string" ? originalValue.toLowerCase() === "true" : Boolean(value),
    )
    .default(true),
  // Logging (ver LOGGING_PLAN.md). Opcionales con default a propósito: una
  // instalación existente arranca sin tocar su .env.
  LOG_LEVEL: yup
    .string()
    .oneOf(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  // `true` activa pino-pretty (salida coloreada para una terminal humana).
  // Default false: en producción el log tiene que ser JSON por línea, que es
  // lo que consume jq/Loki/cualquier agregador. Mismo patrón de parseo de
  // booleano que S3_FORCE_PATH_STYLE.
  LOG_PRETTY: yup
    .boolean()
    .transform((value, originalValue) =>
      typeof originalValue === "string" ? originalValue.toLowerCase() === "true" : Boolean(value),
    )
    .default(false),
});

let env: yup.InferType<typeof schema>;

try {
  env = schema.validateSync(process.env, { abortEarly: false, stripUnknown: true });
} catch (error) {
  const messages = error instanceof yup.ValidationError ? error.errors : [String(error)];
  // Única excepción a la prohibición de console.* en este backend (ver
  // LOGGING_PLAN.md y src/no-console.test.ts): logger.ts importa este archivo
  // para leer LOG_LEVEL, así que acá todavía no existe un logger que usar — y
  // si la configuración es inválida, tampoco hay garantía de poder construirlo.
  console.error("Invalid environment configuration:\n" + messages.map((m) => `- ${m}`).join("\n"));
  process.exit(1);
}

export default env;

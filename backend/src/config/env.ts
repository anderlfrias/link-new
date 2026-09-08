import "dotenv/config";
import * as yup from "yup";

const schema = yup.object({
  DATABASE_URL: yup.string().required(),
  PORT: yup.number().default(4000),
  EXTERNAL_AUTH_API_URL: yup.string().url().required(),
  APP_CODE_EXTERNAL_AUTH: yup.string().required(),
  EXTERNAL_AUTH_JWT_SECRET: yup.string().required(),
  MAX_UPLOAD_SIZE_MB: yup.number().default(25),
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
});

let env: yup.InferType<typeof schema>;

try {
  env = schema.validateSync(process.env, { abortEarly: false, stripUnknown: true });
} catch (error) {
  const messages = error instanceof yup.ValidationError ? error.errors : [String(error)];
  console.error("Invalid environment configuration:\n" + messages.map((m) => `- ${m}`).join("\n"));
  process.exit(1);
}

export default env;

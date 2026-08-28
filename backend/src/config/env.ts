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

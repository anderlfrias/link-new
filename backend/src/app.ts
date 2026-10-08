import env from "./config/env";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { parseTrustProxy } from "./config/client-ip";
import { corsOrigin } from "./config/cors-origins";
import { errorHandler } from "./middlewares/error.middleware";
import { httpLogger } from "./middlewares/http-logger.middleware";
import { requestContext } from "./middlewares/request-context.middleware";
import healthRoutes from "./modules/health/health.route";
import routes from "./route";

const app = express();

// Detrás de un reverse proxy (nginx, Caddy, Cloudflare Tunnel...) — sin esto,
// Express toma la conexión TCP entrante como "el cliente", que siempre es el
// proxy más cercano, nunca el visitante real. Eso rompe cualquier cosa basada
// en IP (rate limiting, el access log de httpLogger): TODO el tráfico externo
// cae bajo la misma IP. Se configura con TRUST_PROXY (ver
// config/client-ip.ts): el default `1` asume un único salto de proxy delante
// de este proceso; con un proxy local además (ej. Cloudflare → nginx → acá),
// `2`; sin ningún proxy, `false` — si no, cualquiera elige su IP mandando
// X-Forwarded-For.
app.set("trust proxy", parseTrustProxy(env.TRUST_PROXY));

app.use(helmet());
app.use(cors({ origin: corsOrigin }));
app.use(httpLogger);
app.use(requestContext);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// "El proceso responde". El chequeo que también mira la base de datos es `/health`.
app.get("/", (_req, res) => {
  res.send("Backend is running");
});

app.use("/health", healthRoutes);

app.use("/api", routes);

app.use(errorHandler);

export default app;

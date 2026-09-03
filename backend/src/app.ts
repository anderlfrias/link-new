import "./config/env";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { corsOrigin } from "./config/cors-origins";
import { errorHandler } from "./middlewares/error.middleware";
import routes from "./route";

const app = express();

// Detrás de Cloudflare (y de cualquier reverse proxy local propio entre
// Cloudflare y este proceso) — sin esto, Express toma la conexión TCP
// entrante como "el cliente", que siempre es el proxy más cercano, nunca el
// visitante real. Eso rompe cualquier cosa basada en IP (rate limiting,
// logs de morgan): TODO el tráfico externo cae bajo la misma IP. `1` asume
// un único salto de proxy delante de este proceso (típico con Cloudflare
// Tunnel/cloudflared apuntando directo acá); si además hay un reverse proxy
// local (nginx, etc.) entre Cloudflare y este server, subir a `2`.
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: corsOrigin }));
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// helmet() ya seteó Cross-Origin-Resource-Policy: same-origin arriba, lo que
// bloquea que el frontend (otro puerto = otro origen) cargue estas imágenes en
// un <img>. Se relaja solo acá, no globalmente: es la única ruta pensada para
// consumirse desde otro origen (ver backend/API.md sección 9).
app.use(
  "/uploads",
  helmet.crossOriginResourcePolicy({ policy: "cross-origin" }),
  express.static(path.join(__dirname, "..", "uploads")),
);

app.get("/", (_req, res) => {
  res.send("Backend is running");
});

app.use("/api", routes);

app.use(errorHandler);

export default app;

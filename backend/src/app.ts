import "./config/env";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { errorHandler } from "./middlewares/error.middleware";
import routes from "./route";

const app = express();

app.use(helmet());
app.use(cors());
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

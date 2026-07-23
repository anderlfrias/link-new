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
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/", (_req, res) => {
  res.send("Backend is running");
});

app.use("/api", routes);

app.use(errorHandler);

export default app;

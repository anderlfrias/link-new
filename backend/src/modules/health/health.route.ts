import { Router } from "express";
import { checkDatabase } from "./health.service";

/// `GET /health`: el backend está arriba **y** llega a la base de datos. Lo usa el
/// HEALTHCHECK del contenedor (backend/Dockerfile). A diferencia de `GET /` (que solo
/// dice que el proceso responde), si PostgreSQL se cae después del arranque esto pasa
/// a 503.
///
/// Es público (Docker no se autentica) y hace una consulta trivial por request: no
/// cachea ni acepta parámetros. Si el backend se expone a internet, conviene filtrarlo
/// en el proxy (ver SECURITY.md). No devuelve el error ni ningún detalle de la base.
const router = Router();

router.get("/", async (_req, res) => {
  const databaseUp = await checkDatabase();
  res.status(databaseUp ? 200 : 503).json({ status: databaseUp ? "ok" : "unavailable" });
});

export default router;

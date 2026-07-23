import http from "http";
import app from "./app";
import env from "./config/env";
import { initSocket } from "./socket";

const PORT = env.PORT;

const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

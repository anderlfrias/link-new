import { TokenExpiredError } from "jsonwebtoken";
import { authenticateAccessToken } from "../modules/auth/identity";
import { AppError } from "../utils/errors";
import { SocketMiddleware } from "./types";

/// Primer middleware global de socketMiddlewares (ver middleware.ts): verifica
/// el mismo token que `authenticate` en Express, a partir de
/// `socket.handshake.auth.token`, y lo resuelve contra la base con la misma
/// función que `attachInternalUser` (`resolveInternalUser`, LOCAL_AUTH_PLAN.md
/// D7) para dejarlo en `socket.data.user`. Rechaza además los tokens
/// restringidos (`pcr`): con uno de esos no se recibe nada en vivo hasta
/// cambiar la contraseña (D13).
/// Ningún módulo debe autenticar un socket por su cuenta: todos leen
/// `socket.data.user` una vez este middleware corrió.
export const authenticateSocket: SocketMiddleware = (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== "string") {
    return next(new Error("Missing token"));
  }

  authenticateAccessToken(token)
    .then(({ user }) => {
      socket.data.user = user;
      next();
    })
    .catch((error) => {
      // El frontend cierra la sesión ante estos dos mensajes
      // (socket-provider.tsx). Una cuenta desactivada, un token revocado o un
      // cambio de contraseña pendiente también terminan la sesión del socket:
      // van como "Invalid token", igual que un usuario que no existe.
      const expired =
        error instanceof TokenExpiredError || (error instanceof AppError && error.code === "session_expired");
      next(new Error(expired ? "Token expired" : "Invalid token"));
    });
};

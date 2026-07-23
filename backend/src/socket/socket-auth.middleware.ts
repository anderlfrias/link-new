import { TokenExpiredError } from "jsonwebtoken";
import { mapTokenToUser, verifyToken } from "../modules/auth/jwt";
import { prisma } from "../config/prisma";
import { AuthenticatedSocketUser, SocketMiddleware } from "./types";

/// Primer middleware global de socketMiddlewares (ver middleware.ts): verifica
/// el mismo JWT de EXTERNAL_AUTH que usa `authenticate` en Express, a partir de
/// `socket.handshake.auth.token`, y resuelve el `id` interno del usuario (igual
/// que `attachInternalUser` en Express) para dejarlo en `socket.data.user`.
/// Ningún módulo debe autenticar un socket por su cuenta: todos leen
/// `socket.data.user` una vez este middleware corrió.
export const authenticateSocket: SocketMiddleware = (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== "string") {
    return next(new Error("Missing token"));
  }

  resolveUser(token)
    .then((user) => {
      socket.data.user = user;
      next();
    })
    .catch((error) => {
      if (error instanceof TokenExpiredError) {
        return next(new Error("Token expired"));
      }
      next(new Error("Invalid token"));
    });
};

async function resolveUser(token: string): Promise<AuthenticatedSocketUser> {
  const mappedUser = mapTokenToUser(verifyToken(token));
  const user = await prisma.user.findUnique({ where: { email: mappedUser.email } });
  if (!user) {
    throw new Error("User not found");
  }
  return { ...mappedUser, internalUserId: user.id };
}

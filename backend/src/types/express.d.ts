import { AuthenticatedIdentity, MappedUser } from "../modules/auth/auth.types";

declare global {
  namespace Express {
    interface Request {
      user?: MappedUser;
      /// Lo que dijo el token (modo, `iat`, si es restringido). Lo deja
      /// `authenticate` y lo consume `attachInternalUser` para los controles
      /// del modo local (revocación y duración de sesión, LOCAL_AUTH_PLAN.md D7).
      authIdentity?: AuthenticatedIdentity;
    }
  }
}

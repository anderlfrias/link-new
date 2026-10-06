import { AppError } from "../../utils/errors";
import { LoginFailureReason } from "../audit/audit.types";

/// Error del login local que lleva el motivo real para la auditoría
/// (`LOGIN_FAILED.reason`, LOCAL_AUTH_PLAN.md D12). El motivo nunca llega al
/// cliente: el error handler solo serializa mensaje, status y `code`.
///
/// En un archivo propio y sin dependencias pesadas: el controller lo necesita
/// para `mapLoginFailureReason`, y así sus tests no arrastran el socket.
export class LocalLoginError extends AppError {
  constructor(
    message: string,
    statusCode: number,
    public readonly reason: LoginFailureReason,
    code?: string,
  ) {
    super(message, statusCode, code);
  }
}

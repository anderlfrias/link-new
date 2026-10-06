/// `code` (opcional) es un identificador estable del motivo, para que el
/// cliente reaccione sin depender del texto del mensaje (ej.
/// `password_change_required`, LOCAL_AUTH_PLAN.md D13). `details` (opcional)
/// suma campos a la respuesta, como la lista de reglas de contraseña que no se
/// cumplen. `error.middleware.ts` devuelve los dos junto al mensaje: tienen
/// que ser datos pensados para el cliente, nunca un detalle interno.
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", code?: string, details?: Record<string, unknown>) {
    super(message, 400, code, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", code?: string) {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", code?: string) {
    super(message, 403, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found", code?: string) {
    super(message, 404, code);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", code?: string) {
    super(message, 409, code);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests", code?: string) {
    super(message, 429, code);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service unavailable", code?: string) {
    super(message, 503, code);
  }
}

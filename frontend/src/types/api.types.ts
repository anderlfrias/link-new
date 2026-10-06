/**
 * Formato de error que devuelve el backend en cualquier respuesta HTTP no exitosa.
 * Ver backend/API.md, sección "Formato de error": algunos errores suman `code`
 * (un identificador estable del motivo) y campos propios, como `rules` en un
 * `password_policy`.
 */
export interface ApiErrorBody {
  error: string;
  code?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  /** Motivo estable para reaccionar sin depender del texto (ej. `invalid_current_password`). */
  readonly code?: string;
  /** El body completo del error, para leer campos propios como `rules`. */
  readonly body?: ApiErrorBody;

  constructor(status: number, message: string, code?: string, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

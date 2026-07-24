/**
 * Formato de error que devuelve el backend en cualquier respuesta HTTP no exitosa.
 * Ver backend/API.md, sección "Formato de error".
 */
export interface ApiErrorBody {
  error: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

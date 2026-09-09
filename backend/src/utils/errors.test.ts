import { describe, expect, it } from "vitest";
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
} from "./errors";

describe("AppError", () => {
  it("expone el statusCode pasado y usa el nombre de la subclase", () => {
    const error = new AppError("algo salió mal", 418);

    expect(error.statusCode).toBe(418);
    expect(error.message).toBe("algo salió mal");
    expect(error.name).toBe("AppError");
    expect(error).toBeInstanceOf(Error);
  });
});

describe.each([
  { Ctor: BadRequestError, statusCode: 400, defaultMessage: "Bad request" },
  { Ctor: UnauthorizedError, statusCode: 401, defaultMessage: "Unauthorized" },
  { Ctor: ForbiddenError, statusCode: 403, defaultMessage: "Forbidden" },
  { Ctor: NotFoundError, statusCode: 404, defaultMessage: "Not found" },
  { Ctor: ServiceUnavailableError, statusCode: 503, defaultMessage: "Service unavailable" },
])("$Ctor.name", ({ Ctor, statusCode, defaultMessage }) => {
  it(`usa statusCode ${statusCode} y el mensaje por default sin argumentos`, () => {
    const error = new Ctor();

    expect(error.statusCode).toBe(statusCode);
    expect(error.message).toBe(defaultMessage);
    expect(error.name).toBe(Ctor.name);
    expect(error).toBeInstanceOf(AppError);
  });

  it("permite sobreescribir el mensaje", () => {
    const error = new Ctor("mensaje custom");

    expect(error.message).toBe("mensaje custom");
    expect(error.statusCode).toBe(statusCode);
  });
});

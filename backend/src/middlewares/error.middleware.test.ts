import { MulterError } from "multer";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../utils/errors";
import { createMockRequest, createMockResponse } from "../test/http-mocks";
import { errorHandler } from "./error.middleware";

describe("errorHandler", () => {
  it("AppError conocido -> responde con su statusCode y message propios", () => {
    const res = createMockResponse();
    const error = new NotFoundError("Conversation not found");

    errorHandler(error, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Conversation not found" });
  });

  it("MulterError (multer valida antes que file.route.ts) -> 400 con el mensaje de multer", () => {
    const res = createMockResponse();
    const error = new MulterError("LIMIT_FILE_SIZE");

    errorHandler(error, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: error.message });
  });

  it("Error genérico no reconocido -> 500 con mensaje fijo, sin filtrar el mensaje ni el stack real", () => {
    const res = createMockResponse();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("detalle interno sensible: falló la conexión a postgres en 10.0.0.5");

    errorHandler(error, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    const [[jsonArg]] = vi.mocked(res.json).mock.calls;
    expect(JSON.stringify(jsonArg)).not.toContain("postgres");
    consoleErrorSpy.mockRestore();
  });
});

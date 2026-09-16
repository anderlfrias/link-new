import { MulterError } from "multer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ServiceUnavailableError } from "../utils/errors";
import { createMockRequest, createMockResponse } from "../test/http-mocks";

const logSpy = { warn: vi.fn(), error: vi.fn() };

vi.mock("../config/request-context", () => ({
  getLogger: () => logSpy,
}));

import { errorHandler } from "./error.middleware";

describe("errorHandler", () => {
  beforeEach(() => {
    logSpy.warn.mockReset();
    logSpy.error.mockReset();
  });

  it("AppError 4xx -> responde con su statusCode y message propios, y loguea en warn", () => {
    const res = createMockResponse();
    const error = new NotFoundError("Conversation not found");

    errorHandler(error, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Conversation not found" });
    expect(logSpy.warn).toHaveBeenCalledWith(
      { statusCode: 404, error: "NotFoundError", reason: "Conversation not found" },
      "request rejected",
    );
    expect(logSpy.error).not.toHaveBeenCalled();
  });

  it("el log de un 4xx no incluye stack (solo statusCode/error/reason)", () => {
    const res = createMockResponse();
    errorHandler(new NotFoundError("x"), createMockRequest(), res, vi.fn());

    const [[fields]] = logSpy.warn.mock.calls;
    expect(fields).not.toHaveProperty("stack");
    expect(fields).not.toHaveProperty("err");
  });

  it("AppError 5xx (ServiceUnavailableError) -> se loguea en error con el err incluido", () => {
    const res = createMockResponse();
    const error = new ServiceUnavailableError("EXTERNAL_AUTH no responde");

    errorHandler(error, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: "EXTERNAL_AUTH no responde" });
    expect(logSpy.error).toHaveBeenCalledWith({ err: error, statusCode: 503 }, "request failed");
    expect(logSpy.warn).not.toHaveBeenCalled();
  });

  it("MulterError (multer valida antes que file.route.ts) -> 400 con el mensaje de multer, log en warn", () => {
    const res = createMockResponse();
    const error = new MulterError("LIMIT_FILE_SIZE");

    errorHandler(error, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: error.message });
    expect(logSpy.warn).toHaveBeenCalledWith(
      { statusCode: 400, error: "MulterError", reason: error.message, field: error.field },
      "upload rejected",
    );
  });

  it("Error genérico no reconocido -> 500 con mensaje fijo, sin filtrar el mensaje ni el stack real, log en error", () => {
    const res = createMockResponse();
    const error = new Error("detalle interno sensible: falló la conexión a postgres en 10.0.0.5");

    errorHandler(error, createMockRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
    const [[jsonArg]] = vi.mocked(res.json).mock.calls;
    expect(JSON.stringify(jsonArg)).not.toContain("postgres");
    expect(logSpy.error).toHaveBeenCalledWith({ err: error }, "unhandled error");
  });
});

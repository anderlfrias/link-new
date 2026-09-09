import { describe, expect, it } from "vitest";
import * as yup from "yup";
import { BadRequestError } from "../utils/errors";
import { createMockNext, createMockRequest, createMockResponse } from "../test/http-mocks";
import { validateBody } from "./validate.middleware";

const schema = yup.object({
  name: yup.string().required(),
  age: yup.number().optional(),
});

describe("validateBody", () => {
  it("body válido -> pasa, req.body queda con el resultado validado, no toca res", async () => {
    const req = createMockRequest({ body: { name: "Ana", age: 30 } });
    const res = createMockResponse();
    const next = createMockNext();

    await validateBody(schema)(req, res, next);

    expect(req.body).toEqual({ name: "Ana", age: 30 });
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("stripUnknown: true -> elimina campos no declarados en el schema", async () => {
    const req = createMockRequest({ body: { name: "Ana", age: 30, extra: "sobra" } });
    const next = createMockNext();

    await validateBody(schema)(req, createMockResponse(), next);

    expect(req.body).toEqual({ name: "Ana", age: 30 });
    expect(req.body).not.toHaveProperty("extra");
  });

  it("body inválido -> next(BadRequestError) con el detalle de qué falló, nunca deja pasar el ValidationError crudo", async () => {
    const req = createMockRequest({ body: { age: "no-es-numero" } });
    const next = createMockNext();

    await validateBody(schema)(req, createMockResponse(), next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error).not.toBeInstanceOf(yup.ValidationError);
    expect(error.message.length).toBeGreaterThan(0);
  });

  it("abortEarly: false -> junta todos los errores de validación, no solo el primero", async () => {
    const req = createMockRequest({ body: { age: "no-es-numero" } }); // falta name Y age inválido
    const next = createMockNext();

    await validateBody(schema)(req, createMockResponse(), next);

    const error = next.mock.calls[0][0];
    // El mensaje junta los errores con ", " (ver validate.middleware.ts) — dos
    // problemas en el body deberían dejar rastro de ambos, no de uno solo.
    expect(error.message).toContain(",");
  });
});

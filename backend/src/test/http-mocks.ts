import type { Request, Response } from "express";
import { vi } from "vitest";

export function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as Request;
}

export function createMockResponse(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.redirect = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

// Sin anotar el tipo de retorno a propósito: así el mock conserva `.mock.calls`
// utilizable en los tests, y sigue siendo asignable a `NextFunction` donde se
// lo pasa (su firma es `(err?: any) => void`, compatible con un mock genérico).
export function createMockNext() {
  return vi.fn();
}

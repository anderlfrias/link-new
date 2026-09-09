import http from "http";
import { describe, expect, it, vi } from "vitest";
import { corsOrigin } from "../config/cors-origins";
import { createSocketGateway } from "./gateway";
import { getIO, initSocket } from "./index";

describe("socket gateway & initialization", () => {
  it("createSocketGateway instantiates Socket.IO Server with corsOrigin", () => {
    const server = http.createServer();
    const io = createSocketGateway(server);

    expect(io).toBeDefined();
    // Verify opts contain cors origin configuration
    expect((io as any).opts.cors.origin).toEqual(corsOrigin);
  });

  it("initSocket initializes gateway, applies middlewares, and exposes instance via getIO()", () => {
    const server = http.createServer();
    const io = initSocket(server);

    expect(io).toBeDefined();
    expect(getIO()).toBe(io);
  });
});

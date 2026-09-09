import { describe, expect, it } from "vitest";
import { aggregateMessageStatus } from "./message-status";

describe("message-status", () => {
  it("returns 'sent' when receipts array is empty", () => {
    expect(aggregateMessageStatus([])).toBe("sent");
  });

  it("returns 'read' only when ALL receipts are 'read'", () => {
    expect(
      aggregateMessageStatus([
        { userId: "u-1", status: "read" },
        { userId: "u-2", status: "read" },
      ]),
    ).toBe("read");
  });

  it("returns 'delivered' when all receipts are either 'delivered' or 'read'", () => {
    expect(
      aggregateMessageStatus([
        { userId: "u-1", status: "read" },
        { userId: "u-2", status: "delivered" },
      ]),
    ).toBe("delivered");

    expect(
      aggregateMessageStatus([
        { userId: "u-1", status: "delivered" },
        { userId: "u-2", status: "delivered" },
      ]),
    ).toBe("delivered");
  });

  it("returns 'sent' if any recipient is still only in 'sent' status", () => {
    expect(
      aggregateMessageStatus([
        { userId: "u-1", status: "read" },
        { userId: "u-2", status: "sent" },
      ]),
    ).toBe("sent");

    expect(
      aggregateMessageStatus([
        { userId: "u-1", status: "delivered" },
        { userId: "u-2", status: "sent" },
      ]),
    ).toBe("sent");
  });
});

import { describe, expect, it } from "vitest";
import { buildStoredFileUrl, buildUploadedFileUrl } from "./file-url";

describe("file-url", () => {
  it("buildStoredFileUrl prepends backend origin and /uploads/ prefix", () => {
    expect(buildStoredFileUrl("avatars/user-1.png")).toBe(
      "http://localhost:4000/uploads/avatars/user-1.png",
    );
    expect(buildStoredFileUrl("attachments/doc.pdf")).toBe(
      "http://localhost:4000/uploads/attachments/doc.pdf",
    );
  });

  it("buildUploadedFileUrl prepends backend origin to given relative url", () => {
    expect(buildUploadedFileUrl("/uploads/avatars/group.jpg")).toBe(
      "http://localhost:4000/uploads/avatars/group.jpg",
    );
  });
});

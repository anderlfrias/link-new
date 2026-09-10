import { describe, expect, it } from "vitest";
import {
  buildStoredFileUrl,
  buildUploadedFileUrl,
  getAvatarUrl,
  resolveFileUrl,
} from "./file-url";

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
    expect(buildUploadedFileUrl("/api/v1/files/f-1/content?t=token")).toBe(
      "http://localhost:4000/api/v1/files/f-1/content?t=token",
    );
    expect(buildUploadedFileUrl("http://external.com/photo.jpg")).toBe(
      "http://external.com/photo.jpg",
    );
  });

  it("resolveFileUrl prioriza file.url sobre file.path", () => {
    expect(
      resolveFileUrl({
        url: "/api/v1/files/f-1/content?t=abc",
        path: "2026/09/doc.pdf",
      }),
    ).toBe("http://localhost:4000/api/v1/files/f-1/content?t=abc");

    expect(resolveFileUrl({ path: "2026/09/doc.pdf" })).toBe(
      "http://localhost:4000/uploads/2026/09/doc.pdf",
    );
    expect(resolveFileUrl({})).toBe("");
  });

  it("getAvatarUrl prioriza avatarFileId/imageFileId usando /api/v1/files/:id/content", () => {
    expect(getAvatarUrl({ avatarFileId: "f-avatar-1" })).toBe(
      "http://localhost:4000/api/v1/files/f-avatar-1/content",
    );
    expect(getAvatarUrl({ imageFileId: "f-group-1" })).toBe(
      "http://localhost:4000/api/v1/files/f-group-1/content",
    );
    expect(getAvatarUrl({ avatarFile: { path: "avatars/u-1.png" } })).toBe(
      "http://localhost:4000/uploads/avatars/u-1.png",
    );
    expect(getAvatarUrl({})).toBeNull();
  });
});

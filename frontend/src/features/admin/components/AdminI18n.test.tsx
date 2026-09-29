import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n";
import { AdminShell } from "./AdminShell";
import { ForbiddenScreen } from "./ForbiddenScreen";
import { DeleteFileConfirmModal } from "./DeleteFileConfirmModal";
import { AdminSettingsPanel } from "./AdminSettingsPanel";
import { AdminUsersPanel } from "./AdminUsersPanel";
import { AdminFilesPanel } from "./AdminFilesPanel";
import { AdminAuditPanel } from "./AdminAuditPanel";
import { usePathname } from "next/navigation";
import { useAdminUsers } from "@/features/admin/hooks/use-admin-users";
import { useAdminFiles } from "@/features/admin/hooks/use-admin-files";
import { useAdminFileStats } from "@/features/admin/hooks/use-admin-file-stats";
import { useDeleteAdminFile } from "@/features/admin/hooks/use-delete-admin-file";
import { useAdminAuditLogs } from "@/features/admin/hooks/use-admin-audit-logs";
import type { AdminFileListItem } from "@/features/admin/types/admin-files.types";
import type { AdminSettings } from "@/features/admin/types/admin-settings.types";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("@/components/ui/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock("@/features/files/components/FileTypeIcon", () => ({
  FileTypeIcon: () => <div data-testid="file-type-icon" />,
}));

vi.mock("@/features/admin/hooks/use-admin-users", () => ({
  useAdminUsers: vi.fn(),
}));

vi.mock("@/features/admin/hooks/use-admin-files", () => ({
  useAdminFiles: vi.fn(),
}));

vi.mock("@/features/admin/hooks/use-admin-file-stats", () => ({
  useAdminFileStats: vi.fn(),
}));

vi.mock("@/features/admin/hooks/use-delete-admin-file", () => ({
  useDeleteAdminFile: vi.fn(),
}));

vi.mock("@/features/admin/hooks/use-admin-audit-logs", () => ({
  useAdminAuditLogs: vi.fn(),
}));

const mockUseAdminSettings = vi.fn();
const mockSave = vi.fn();

vi.mock("@/features/admin/hooks/use-admin-settings", () => ({
  useAdminSettings: () => mockUseAdminSettings(),
}));

vi.mock("@/features/admin/hooks/use-update-admin-settings", () => ({
  useUpdateAdminSettings: () => ({
    save: mockSave,
    pending: false,
    error: null,
  }),
}));

const mockSettings: AdminSettings = {
  maxUploadSizeMb: 25,
  fileTypeRestrictionMode: "DISABLED",
  fileTypeList: [],
  maxFilesPerMessage: null,
  allowConversationDelete: true,
  maxVoiceNoteDurationSeconds: 120,
  maxGroupMembers: 50,
  whoCanCreateGroups: "ALL_MEMBERS",
  whoCanAddMembers: "ALL_MEMBERS",
  whoCanRemoveMembers: "GROUP_ADMINS_ONLY",
  whoCanChangeGroupInfo: "ALL_MEMBERS",
  whoCanDeleteGroup: "CREATOR_ONLY",
  allowGroupDelete: true,
  whoCanLeaveGroup: "ALL_MEMBERS",
  allowGroupOverrideAddMembers: true,
  allowGroupOverrideRemoveMembers: false,
  allowGroupOverrideMaxGroupMembers: false,
  allowGroupOverrideChangeGroupInfo: true,
  allowGroupOverrideDeleteGroup: false,
  allowGroupOverrideLeaveGroup: true,
  messageRetentionDays: null,
  auditLogRetentionDays: 365,
  allowMessageEdit: true,
  messageEditTimeLimitMinutes: 15,
  allowMessageDeleteForEveryone: true,
  messageDeleteForEveryoneTimeLimitMinutes: 60,
  allowStickersAndGifs: true,
  uploadCleanupEnabled: false,
  orphanFileRetentionHours: null,
  softDeletedFilePurgeDays: null,
  uploadCleanupDryRun: false,
  fileMigrationEnabled: false,
  fileMigrationBatchSize: 50,
  fileMigrationIntervalMinutes: 60,
  fileMigrationDeleteLocalAfterCommit: false,
};

describe("Admin i18n support (English locale)", () => {
  it("renders AdminShell with English nav labels and back link", () => {
    vi.mocked(usePathname).mockReturnValue("/admin");

    render(
      <I18nProvider initialLocale="en">
        <AdminShell>
          <div>Content</div>
        </AdminShell>
      </I18nProvider>,
    );

    expect(screen.getByRole("link", { name: "Back to chat" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Global Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Files" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Audit" })).toBeInTheDocument();
  });

  it("renders ForbiddenScreen with English texts", () => {
    render(
      <I18nProvider initialLocale="en">
        <ForbiddenScreen />
      </I18nProvider>,
    );

    expect(screen.getByText("You don't have permission to view this page.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to chat" })).toBeInTheDocument();
  });

  it("renders DeleteFileConfirmModal with English texts", () => {
    const file: AdminFileListItem = {
      id: "f-1",
      originalName: "report.pdf",
      size: 1024,
      mimeType: "application/pdf",
      extension: "pdf",
      url: "/files/report.pdf",
      provider: "LOCAL",
      createdAt: "2026-09-01T12:00:00.000Z",
      createdBy: { id: "u-1", name: "Alice", email: "alice@example.com" },
      usage: {
        avatarOfUserCount: 0,
        groupImageOfConversationCount: 0,
        messageAttachmentCount: 0,
      },
    };

    render(
      <I18nProvider initialLocale="en">
        <DeleteFileConfirmModal
          file={file}
          pending={false}
          error={null}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Permanently delete file")).toBeInTheDocument();
    expect(screen.getByText("This action is permanent and cannot be undone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete permanently" })).toBeInTheDocument();
  });

  it("renders AdminSettingsPanel with English section headers and labels", () => {
    mockUseAdminSettings.mockReturnValue({
      settings: mockSettings,
      status: "success",
      error: null,
      refetch: vi.fn(),
    });

    render(
      <I18nProvider initialLocale="en">
        <AdminSettingsPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Global Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "File Attachments" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "File Lifecycle and Cleanup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Progressive S3 Migration (SeaweedFS)" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Private Conversations" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Voice Notes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Groups" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Message Retention & Audit Trail" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Message Editing & Deletion" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "GIFs and Stickers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("renders AdminUsersPanel with English texts and search placeholder", () => {
    vi.mocked(useAdminUsers).mockReturnValue({
      users: [
        {
          id: "u-1",
          name: "Carlos Sanchez",
          email: "carlos@test.com",
          username: "csanchez",
          avatarFileId: null,
          avatarFile: null,
          status: "ACTIVE",
          createdAt: "2026-09-09T00:00:00.000Z",
          storage: { totalSize: 5000, fileCount: 2 },
          activity: { conversationCount: 3, messagesSentCount: 20, groupsAdministeredCount: 1 },
          syncProfileWithIntegration: true,
        },
      ],
      status: "ready",
      error: null,
      hasMore: false,
      loadingMore: false,
      loadMore: vi.fn(),
      totalCount: 1,
      refetch: vi.fn(),
    });

    render(
      <I18nProvider initialLocale="en">
        <AdminUsersPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByText("This panel is read-only. To update a user's name, photo, or details, do so from EXTERNAL_AUTH.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by name, email, or username")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(screen.getByText("1 user(s)")).toBeInTheDocument();
    expect(screen.getByText("Synced with EXTERNAL_AUTH")).toBeInTheDocument();
    expect(screen.getByText("Admin of 1 group(s)")).toBeInTheDocument();
  });

  it("renders AdminFilesPanel with English storage stats and filters", () => {
    vi.mocked(useAdminFileStats).mockReturnValue({
      stats: {
        localCount: 10,
        s3Count: 5,
        totalCount: 15,
        migrationEnabled: true,
        migrationBatchSize: 50,
        migrationIntervalMinutes: 60,
      },
      status: "ready",
      error: null,
      refetch: vi.fn(),
    });

    vi.mocked(useAdminFiles).mockReturnValue({
      files: [],
      status: "ready",
      error: null,
      hasMore: false,
      loadingMore: false,
      loadMore: vi.fn(),
      totalCount: 0,
      totalSize: 0,
      refetch: vi.fn(),
    });

    vi.mocked(useDeleteAdminFile).mockReturnValue({
      deleteFile: vi.fn(),
      pending: false,
      error: null,
    });

    render(
      <I18nProvider initialLocale="en">
        <AdminFilesPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Files" })).toBeInTheDocument();
    expect(screen.getByText("Storage:")).toBeInTheDocument();
    expect(screen.getByText("Local disk:")).toBeInTheDocument();
    expect(screen.getByText("SeaweedFS (S3):")).toBeInTheDocument();
    expect(screen.getByText("Active migration (50/batch · 60 min)")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("File name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("User (name or email)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("renders AdminAuditPanel with English default filter notice and options", () => {
    vi.mocked(useAdminAuditLogs).mockReturnValue({
      items: [],
      status: "ready",
      error: null,
      hasMore: false,
      loadingMore: false,
      loadMore: vi.fn(),
      refetch: vi.fn(),
    });

    render(
      <I18nProvider initialLocale="en">
        <AdminAuditPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole("heading", { name: "Audit Log" })).toBeInTheDocument();
    expect(screen.getByText("Default filter active:")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Default filter (Admin & authentication)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All actions" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("User ID or actor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });
});

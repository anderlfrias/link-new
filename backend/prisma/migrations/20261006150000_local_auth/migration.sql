-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "chat_audit_action" ADD VALUE 'create_user';
ALTER TYPE "chat_audit_action" ADD VALUE 'update_user';
ALTER TYPE "chat_audit_action" ADD VALUE 'reset_password';
ALTER TYPE "chat_audit_action" ADD VALUE 'change_password';

-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "local_session_ttl_hours" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "lockout_duration_minutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "max_failed_login_attempts" INTEGER,
ADD COLUMN     "password_expiration_days" INTEGER,
ADD COLUMN     "password_history_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "password_min_length" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "password_require_lowercase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_require_number" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_require_symbol" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_require_uppercase" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "local_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tokens_valid_after" TIMESTAMP(3);

-- DropEnum
DROP TYPE "auth_provider";

-- CreateTable
CREATE TABLE "local_credentials" (
    "user_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "previous_password_hashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "password_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_credentials_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "local_credentials" ADD CONSTRAINT "local_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('local', 'external');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "conversation_type" AS ENUM ('private', 'group', 'self');

-- CreateEnum
CREATE TYPE "message_type" AS ENUM ('text', 'system', 'sticker', 'contact', 'poll', 'call');

-- CreateEnum
CREATE TYPE "chat_audit_action" AS ENUM ('create_conversation', 'add_member', 'remove_member', 'send_message', 'forward_message', 'edit_message', 'delete_message', 'change_name', 'change_image', 'set_group_admin', 'login', 'login_failed', 'update_settings', 'admin_delete_file', 'start_call', 'end_call');

-- CreateEnum
CREATE TYPE "file_provider" AS ENUM ('local', 's3');

-- CreateEnum
CREATE TYPE "call_type" AS ENUM ('audio', 'video');

-- CreateEnum
CREATE TYPE "call_status" AS ENUM ('ringing', 'accepted', 'rejected', 'missed', 'completed', 'busy');

-- CreateEnum
CREATE TYPE "group_permission_level" AS ENUM ('all_members', 'group_admins_only', 'app_admins_only', 'creator_only');

-- CreateEnum
CREATE TYPE "file_type_restriction_mode" AS ENUM ('disabled', 'allowlist', 'blocklist');

-- CreateEnum
CREATE TYPE "file_upload_status" AS ENUM ('pending', 'uploading', 'completed', 'aborted', 'expired', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "external_id" TEXT,
    "identity_provider" TEXT,
    "username" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatar_file_id" TEXT,
    "sync_profile_with_integration" BOOLEAN NOT NULL DEFAULT true,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "notification_sound_enabled" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'es',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "type" "conversation_type" NOT NULL,
    "image_file_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "last_message_id" TEXT,
    "last_message_at" TIMESTAMP(3),
    "last_message_sender_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_read_message_id" TEXT,
    "last_read_at" TIMESTAMP(3),
    "last_delivered_message_id" TEXT,
    "last_delivered_at" TIMESTAMP(3),
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "hidden_at" TIMESTAMP(3),

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "reply_to_id" TEXT,
    "forwarded_from_id" TEXT,
    "type" "message_type" NOT NULL,
    "content" TEXT NOT NULL,
    "edited_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "provider" "file_provider" NOT NULL,
    "checksum" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "purged_at" TIMESTAMP(3),

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_files" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_reactions" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polls" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "allow_multiple" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_options" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "actor_email" TEXT,
    "conversation_id" TEXT,
    "message_id" TEXT,
    "target_type" TEXT,
    "target_id" TEXT,
    "action" "chat_audit_action" NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "max_upload_size_mb" INTEGER NOT NULL DEFAULT 25,
    "file_type_restriction_mode" "file_type_restriction_mode" NOT NULL DEFAULT 'disabled',
    "file_type_list" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_files_per_message" INTEGER DEFAULT 10,
    "allow_conversation_delete" BOOLEAN NOT NULL DEFAULT true,
    "max_voice_note_duration_seconds" INTEGER NOT NULL DEFAULT 300,
    "max_group_members" INTEGER NOT NULL DEFAULT 256,
    "who_can_create_groups" "group_permission_level" NOT NULL DEFAULT 'all_members',
    "who_can_add_members" "group_permission_level" NOT NULL DEFAULT 'all_members',
    "who_can_remove_members" "group_permission_level" NOT NULL DEFAULT 'creator_only',
    "who_can_change_group_info" "group_permission_level" NOT NULL DEFAULT 'all_members',
    "who_can_delete_group" "group_permission_level" NOT NULL DEFAULT 'creator_only',
    "allow_group_delete" BOOLEAN NOT NULL DEFAULT true,
    "who_can_leave_group" "group_permission_level" NOT NULL DEFAULT 'all_members',
    "allow_group_override_add_members" BOOLEAN NOT NULL DEFAULT false,
    "allow_group_override_remove_members" BOOLEAN NOT NULL DEFAULT false,
    "allow_group_override_max_group_members" BOOLEAN NOT NULL DEFAULT false,
    "allow_group_override_change_group_info" BOOLEAN NOT NULL DEFAULT false,
    "allow_group_override_delete_group" BOOLEAN NOT NULL DEFAULT false,
    "allow_group_override_leave_group" BOOLEAN NOT NULL DEFAULT false,
    "message_retention_days" INTEGER,
    "audit_log_retention_days" INTEGER,
    "allow_message_edit" BOOLEAN NOT NULL DEFAULT true,
    "message_edit_time_limit_minutes" INTEGER,
    "allow_message_delete_for_everyone" BOOLEAN NOT NULL DEFAULT true,
    "message_delete_for_everyone_time_limit_minutes" INTEGER,
    "allow_stickers_and_gifs" BOOLEAN NOT NULL DEFAULT true,
    "upload_cleanup_enabled" BOOLEAN NOT NULL DEFAULT false,
    "orphan_file_retention_hours" INTEGER DEFAULT 24,
    "soft_deleted_file_purge_days" INTEGER,
    "upload_cleanup_dry_run" BOOLEAN NOT NULL DEFAULT false,
    "file_migration_enabled" BOOLEAN NOT NULL DEFAULT false,
    "file_migration_batch_size" INTEGER NOT NULL DEFAULT 50,
    "file_migration_interval_minutes" INTEGER NOT NULL DEFAULT 60,
    "file_migration_delete_local_after_commit" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_group_settings" (
    "conversation_id" TEXT NOT NULL,
    "who_can_add_members" "group_permission_level",
    "who_can_remove_members" "group_permission_level",
    "max_group_members" INTEGER,
    "who_can_change_group_info" "group_permission_level",
    "who_can_delete_group" "group_permission_level",
    "who_can_leave_group" "group_permission_level",
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_group_settings_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_uploads" (
    "id" TEXT NOT NULL,
    "provider" "file_provider" NOT NULL,
    "object_key" TEXT NOT NULL,
    "external_upload_id" TEXT,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "declared_size" BIGINT NOT NULL,
    "part_size" INTEGER NOT NULL,
    "total_parts" INTEGER NOT NULL,
    "status" "file_upload_status" NOT NULL DEFAULT 'pending',
    "client_checksum" TEXT,
    "created_by_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "stored_file_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "file_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "caller_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "type" "call_type" NOT NULL DEFAULT 'audio',
    "status" "call_status" NOT NULL DEFAULT 'ringing',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_external_id_key" ON "users"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "conversations_created_by_id_idx" ON "conversations"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_members_conversation_id_user_id_key" ON "conversation_members"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "messages_reply_to_id_idx" ON "messages"("reply_to_id");

-- CreateIndex
CREATE INDEX "messages_forwarded_from_id_idx" ON "messages"("forwarded_from_id");

-- CreateIndex
CREATE INDEX "stored_files_created_by_id_idx" ON "stored_files"("created_by_id");

-- CreateIndex
CREATE INDEX "stored_files_deleted_at_idx" ON "stored_files"("deleted_at");

-- CreateIndex
CREATE INDEX "stored_files_purged_at_idx" ON "stored_files"("purged_at");

-- CreateIndex
CREATE INDEX "stored_files_created_at_idx" ON "stored_files"("created_at");

-- CreateIndex
CREATE INDEX "message_files_message_id_idx" ON "message_files"("message_id");

-- CreateIndex
CREATE INDEX "message_files_file_id_idx" ON "message_files"("file_id");

-- CreateIndex
CREATE INDEX "message_reactions_message_id_idx" ON "message_reactions"("message_id");

-- CreateIndex
CREATE INDEX "message_reactions_user_id_idx" ON "message_reactions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_reactions_message_id_user_id_key" ON "message_reactions"("message_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "polls_message_id_key" ON "polls"("message_id");

-- CreateIndex
CREATE INDEX "poll_options_poll_id_idx" ON "poll_options"("poll_id");

-- CreateIndex
CREATE INDEX "poll_votes_option_id_idx" ON "poll_votes"("option_id");

-- CreateIndex
CREATE INDEX "poll_votes_user_id_idx" ON "poll_votes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_option_id_user_id_key" ON "poll_votes"("option_id", "user_id");

-- CreateIndex
CREATE INDEX "chat_audit_logs_user_id_idx" ON "chat_audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "chat_audit_logs_conversation_id_idx" ON "chat_audit_logs"("conversation_id");

-- CreateIndex
CREATE INDEX "chat_audit_logs_message_id_idx" ON "chat_audit_logs"("message_id");

-- CreateIndex
CREATE INDEX "chat_audit_logs_action_created_at_idx" ON "chat_audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "chat_audit_logs_created_at_idx" ON "chat_audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_uploads_stored_file_id_key" ON "file_uploads"("stored_file_id");

-- CreateIndex
CREATE INDEX "file_uploads_status_expires_at_idx" ON "file_uploads"("status", "expires_at");

-- CreateIndex
CREATE INDEX "file_uploads_created_by_id_status_idx" ON "file_uploads"("created_by_id", "status");

-- CreateIndex
CREATE INDEX "calls_conversation_id_created_at_idx" ON "calls"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "calls_caller_id_created_at_idx" ON "calls"("caller_id", "created_at");

-- CreateIndex
CREATE INDEX "calls_receiver_id_created_at_idx" ON "calls"("receiver_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_forwarded_from_id_fkey" FOREIGN KEY ("forwarded_from_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_files" ADD CONSTRAINT "message_files_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_files" ADD CONSTRAINT "message_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_audit_logs" ADD CONSTRAINT "chat_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_audit_logs" ADD CONSTRAINT "chat_audit_logs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_audit_logs" ADD CONSTRAINT "chat_audit_logs_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_group_settings" ADD CONSTRAINT "conversation_group_settings_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_stored_file_id_fkey" FOREIGN KEY ("stored_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_caller_id_fkey" FOREIGN KEY ("caller_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

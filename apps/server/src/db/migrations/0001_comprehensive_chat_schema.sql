-- Comprehensive chat application schema migration
-- This migration adds all the enhanced tables and features for the chat application

-- First, enhance the existing user table with additional profile and status fields
ALTER TABLE "user" ADD COLUMN "display_name" text;
ALTER TABLE "user" ADD COLUMN "bio" text;
ALTER TABLE "user" ADD COLUMN "location" text;
ALTER TABLE "user" ADD COLUMN "website" text;
ALTER TABLE "user" ADD COLUMN "is_online" boolean DEFAULT false;
ALTER TABLE "user" ADD COLUMN "last_seen_at" timestamp;
ALTER TABLE "user" ADD COLUMN "status" text DEFAULT 'offline';
ALTER TABLE "user" ADD COLUMN "custom_status" text;
ALTER TABLE "user" ADD COLUMN "is_active" boolean DEFAULT true;
ALTER TABLE "user" ADD COLUMN "is_deleted" boolean DEFAULT false;
ALTER TABLE "user" ADD COLUMN "deleted_at" timestamp;
ALTER TABLE "user" ADD COLUMN "is_private" boolean DEFAULT false;
ALTER TABLE "user" ADD COLUMN "allow_friend_requests" boolean DEFAULT true;
ALTER TABLE "user" ADD COLUMN "show_online_status" boolean DEFAULT true;

-- Add constraints for user status enum
ALTER TABLE "user" ADD CONSTRAINT "user_status_check" CHECK ("status" IN ('online', 'away', 'busy', 'invisible', 'offline'));

-- Add indexes for user table performance
CREATE INDEX "user_email_idx" ON "user" ("email");
CREATE INDEX "user_status_idx" ON "user" ("status");
CREATE INDEX "user_last_seen_idx" ON "user" ("last_seen_at");
CREATE INDEX "user_active_idx" ON "user" ("is_active", "is_deleted");

--> statement-breakpoint

-- Create the new conversation table for enhanced chat management
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"description" text,
	"type" text DEFAULT 'direct' NOT NULL,
	"is_public" boolean DEFAULT false,
	"invite_code" text,
	"max_participants" integer,
	"is_active" boolean DEFAULT true,
	"is_archived" boolean DEFAULT false,
	"is_deleted" boolean DEFAULT false,
	"created_by" uuid NOT NULL,
	"last_message_at" timestamp,
	"last_activity_at" timestamp,
	"message_count" integer DEFAULT 0,
	"participant_count" integer DEFAULT 0,
	"settings" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_invite_code_unique" UNIQUE("invite_code"),
	CONSTRAINT "conversation_type_check" CHECK ("type" IN ('direct', 'group', 'channel', 'assistant'))
);

-- Add indexes for conversation table performance
CREATE INDEX "conversation_type_idx" ON "conversation" ("type");
CREATE INDEX "conversation_created_by_idx" ON "conversation" ("created_by");
CREATE INDEX "conversation_last_activity_idx" ON "conversation" ("last_activity_at");
CREATE INDEX "conversation_active_idx" ON "conversation" ("is_active", "is_deleted");
CREATE INDEX "conversation_invite_code_idx" ON "conversation" ("invite_code");

--> statement-breakpoint

-- Create conversation participants table for many-to-many relationships
CREATE TABLE "conversation_participant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"can_add_members" boolean DEFAULT false,
	"can_remove_members" boolean DEFAULT false,
	"can_edit_conversation" boolean DEFAULT false,
	"can_delete_messages" boolean DEFAULT false,
	"can_pin_messages" boolean DEFAULT false,
	"notifications_enabled" boolean DEFAULT true,
	"muted_until" timestamp,
	"is_muted" boolean DEFAULT false,
	"last_read_message_id" uuid,
	"last_read_at" timestamp,
	"unread_count" integer DEFAULT 0,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"invited_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_participant_conversation_id_user_id_pk" PRIMARY KEY("conversation_id", "user_id"),
	CONSTRAINT "participant_role_check" CHECK ("role" IN ('owner', 'admin', 'moderator', 'member', 'guest')),
	CONSTRAINT "participant_status_check" CHECK ("status" IN ('active', 'invited', 'left', 'removed', 'banned'))
);

-- Add indexes for participant table performance
CREATE INDEX "participant_conversation_idx" ON "conversation_participant" ("conversation_id");
CREATE INDEX "participant_user_idx" ON "conversation_participant" ("user_id");
CREATE INDEX "participant_status_idx" ON "conversation_participant" ("status");
CREATE INDEX "participant_role_idx" ON "conversation_participant" ("role");
CREATE INDEX "participant_last_read_idx" ON "conversation_participant" ("last_read_at");

--> statement-breakpoint

-- Enhance the existing message table with comprehensive features
-- First, add the new columns to the existing message table
ALTER TABLE "message" ADD COLUMN "conversation_id" uuid;
ALTER TABLE "message" ADD COLUMN "sender_id" uuid;
ALTER TABLE "message" ADD COLUMN "content_type" text DEFAULT 'text' NOT NULL;
ALTER TABLE "message" ADD COLUMN "formatted_content" text;
ALTER TABLE "message" ADD COLUMN "mentions" text;
ALTER TABLE "message" ADD COLUMN "hashtags" text;
ALTER TABLE "message" ADD COLUMN "thread_root_id" uuid;
ALTER TABLE "message" ADD COLUMN "thread_order" integer DEFAULT 0;
ALTER TABLE "message" ADD COLUMN "reply_count" integer DEFAULT 0;
ALTER TABLE "message" ADD COLUMN "status" text DEFAULT 'sent' NOT NULL;
ALTER TABLE "message" ADD COLUMN "edited_at" timestamp;
ALTER TABLE "message" ADD COLUMN "edited_by" uuid;
ALTER TABLE "message" ADD COLUMN "reactions" text;
ALTER TABLE "message" ADD COLUMN "is_pinned" boolean DEFAULT false;
ALTER TABLE "message" ADD COLUMN "pinned_at" timestamp;
ALTER TABLE "message" ADD COLUMN "pinned_by" uuid;
ALTER TABLE "message" ADD COLUMN "delivered_at" timestamp;
ALTER TABLE "message" ADD COLUMN "read_by_count" integer DEFAULT 0;
ALTER TABLE "message" ADD COLUMN "is_system_message" boolean DEFAULT false;
ALTER TABLE "message" ADD COLUMN "system_message_type" text;
ALTER TABLE "message" ADD COLUMN "is_moderated" boolean DEFAULT false;
ALTER TABLE "message" ADD COLUMN "moderation_reason" text;
ALTER TABLE "message" ADD COLUMN "moderated_at" timestamp;
ALTER TABLE "message" ADD COLUMN "moderated_by" uuid;
ALTER TABLE "message" ADD COLUMN "deleted_at" timestamp;
ALTER TABLE "message" ADD COLUMN "deleted_by" uuid;
ALTER TABLE "message" ADD COLUMN "model" text;
ALTER TABLE "message" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;

-- Add check constraints for message enums
ALTER TABLE "message" ADD CONSTRAINT "message_content_type_check" CHECK ("content_type" IN ('text', 'image', 'file', 'audio', 'video', 'code', 'system', 'poll', 'location'));
ALTER TABLE "message" ADD CONSTRAINT "message_status_check" CHECK ("status" IN ('sending', 'sent', 'delivered', 'read', 'failed', 'edited', 'deleted'));
ALTER TABLE "message" ADD CONSTRAINT "message_system_type_check" CHECK ("system_message_type" IN ('join', 'leave', 'add_member', 'remove_member', 'title_change', 'settings_change'));

-- Add performance indexes for message table
CREATE INDEX "message_conversation_created_idx" ON "message" ("conversation_id", "created_at");
CREATE INDEX "message_sender_idx" ON "message" ("sender_id");
CREATE INDEX "message_thread_root_idx" ON "message" ("thread_root_id");
CREATE INDEX "message_parent_idx" ON "message" ("parent_message_id");
CREATE INDEX "message_status_idx" ON "message" ("status");
CREATE INDEX "message_content_type_idx" ON "message" ("content_type");
CREATE INDEX "message_pinned_idx" ON "message" ("is_pinned");
CREATE INDEX "message_deleted_idx" ON "message" ("is_deleted");

--> statement-breakpoint

-- Create attachment table for comprehensive file management
CREATE TABLE "attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"filename" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"storage_provider" text DEFAULT 'local' NOT NULL,
	"storage_key" text NOT NULL,
	"storage_url" text,
	"metadata" text,
	"thumbnail_url" text,
	"preview_url" text,
	"content_description" text,
	"extracted_text" text,
	"tags" text,
	"is_public" boolean DEFAULT false,
	"access_token" text,
	"expires_at" timestamp,
	"is_scanned" boolean DEFAULT false,
	"scan_result" text,
	"scan_details" text,
	"processing_status" text DEFAULT 'pending' NOT NULL,
	"processing_error" text,
	"download_count" integer DEFAULT 0,
	"last_accessed_at" timestamp,
	"is_deleted" boolean DEFAULT false,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_storage_provider_check" CHECK ("storage_provider" IN ('local', 's3', 'gcs', 'azure', 'cloudinary')),
	CONSTRAINT "attachment_scan_result_check" CHECK ("scan_result" IN ('clean', 'infected', 'suspicious', 'pending')),
	CONSTRAINT "attachment_processing_status_check" CHECK ("processing_status" IN ('pending', 'processing', 'completed', 'failed'))
);

-- Add indexes for attachment table performance
CREATE INDEX "attachment_message_idx" ON "attachment" ("message_id");
CREATE INDEX "attachment_uploader_idx" ON "attachment" ("uploaded_by");
CREATE INDEX "attachment_mime_type_idx" ON "attachment" ("mime_type");
CREATE INDEX "attachment_processing_status_idx" ON "attachment" ("processing_status");
CREATE INDEX "attachment_storage_key_idx" ON "attachment" ("storage_key");

--> statement-breakpoint

-- Create user relationships table for social features
CREATE TABLE "user_relationship" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"request_message" text,
	"response_message" text,
	"can_see_online_status" boolean DEFAULT true,
	"can_send_messages" boolean DEFAULT true,
	"can_see_profile" boolean DEFAULT true,
	"notifications_enabled" boolean DEFAULT true,
	"last_interaction_at" timestamp,
	"interaction_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	CONSTRAINT "user_relationship_from_user_id_to_user_id_type_pk" PRIMARY KEY("from_user_id", "to_user_id", "type"),
	CONSTRAINT "relationship_type_check" CHECK ("type" IN ('friend', 'block', 'follow', 'mute')),
	CONSTRAINT "relationship_status_check" CHECK ("status" IN ('pending', 'accepted', 'rejected', 'active', 'inactive'))
);

-- Add indexes for user relationship table performance
CREATE INDEX "relationship_from_user_idx" ON "user_relationship" ("from_user_id");
CREATE INDEX "relationship_to_user_idx" ON "user_relationship" ("to_user_id");
CREATE INDEX "relationship_type_status_idx" ON "user_relationship" ("type", "status");
CREATE INDEX "relationship_last_interaction_idx" ON "user_relationship" ("last_interaction_at");

--> statement-breakpoint

-- Add foreign key constraints
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;

-- Add foreign keys for enhanced message table
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "message" ADD CONSTRAINT "message_edited_by_user_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "message" ADD CONSTRAINT "message_pinned_by_user_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "message" ADD CONSTRAINT "message_moderated_by_user_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "message" ADD CONSTRAINT "message_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "attachment" ADD CONSTRAINT "attachment_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;

ALTER TABLE "user_relationship" ADD CONSTRAINT "user_relationship_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "user_relationship" ADD CONSTRAINT "user_relationship_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
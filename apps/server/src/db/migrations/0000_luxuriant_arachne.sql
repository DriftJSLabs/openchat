CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"username" text,
	"display_name" text,
	"bio" text,
	"location" text,
	"website" text,
	"avatar" text,
	"timezone" text,
	"language" text DEFAULT 'en',
	"is_online" boolean DEFAULT false,
	"last_seen_at" timestamp,
	"last_active_at" timestamp,
	"status" text DEFAULT 'offline',
	"custom_status" text,
	"is_active" boolean DEFAULT true,
	"is_deleted" boolean DEFAULT false,
	"deleted_at" timestamp,
	"is_verified" boolean DEFAULT false,
	"two_factor_enabled" boolean DEFAULT false,
	"is_suspended" boolean DEFAULT false,
	"suspended_until" timestamp,
	"login_count" integer DEFAULT 0,
	"is_private" boolean DEFAULT false,
	"allow_friend_requests" boolean DEFAULT true,
	"allow_direct_messages" boolean DEFAULT true,
	"show_online_status" boolean DEFAULT true,
	"email_notifications" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "user_presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'offline' NOT NULL,
	"custom_status" text,
	"device_id" text,
	"session_id" text,
	"connection_id" text,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"is_typing" boolean DEFAULT false,
	"typing_in" uuid,
	"typing_last_update" timestamp,
	"connection_count" integer DEFAULT 0,
	"last_ip_address" text,
	"user_agent" text,
	"platform" text,
	"app_version" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_presence_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_token" text NOT NULL,
	"device_fingerprint" text,
	"device_name" text,
	"device_type" text,
	"ip_address" text,
	"location" text,
	"user_agent" text,
	"is_secure" boolean DEFAULT false,
	"is_trusted" boolean DEFAULT false,
	"requires_2fa" boolean DEFAULT false,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"login_at" timestamp DEFAULT now() NOT NULL,
	"logout_at" timestamp,
	"is_active" boolean DEFAULT true,
	"is_revoked" boolean DEFAULT false,
	"revoked_reason" text,
	"revoked_by" uuid,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_session_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" uuid,
	"message_id" uuid,
	"operation" text NOT NULL,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0,
	"completion_tokens" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"cost" integer DEFAULT 0,
	"latency" integer DEFAULT 0,
	"status" text NOT NULL,
	"error_message" text,
	"finish_reason" text,
	"quality_score" integer,
	"user_feedback" text,
	"request_metadata" text,
	"response_metadata" text,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
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
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"user_id" text NOT NULL,
	"chat_type" text DEFAULT 'conversation' NOT NULL,
	"settings" text,
	"tags" text,
	"is_pinned" boolean DEFAULT false,
	"is_archived" boolean DEFAULT false,
	"last_activity_at" timestamp,
	"message_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "chat_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" uuid,
	"total_messages" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"avg_response_time" integer DEFAULT 0,
	"total_characters" integer DEFAULT 0,
	"sessions_count" integer DEFAULT 0,
	"last_used_at" timestamp,
	"daily_usage" text,
	"weekly_usage" text,
	"monthly_usage" text,
	"error_count" integer DEFAULT 0,
	"successful_responses" integer DEFAULT 0,
	"avg_tokens_per_message" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	CONSTRAINT "conversation_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
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
	CONSTRAINT "conversation_participant_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "device_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"content" text NOT NULL,
	"content_type" text DEFAULT 'text' NOT NULL,
	"formatted_content" text,
	"mentions" text,
	"hashtags" text,
	"metadata" text,
	"thread_root_id" uuid,
	"parent_message_id" uuid,
	"thread_order" integer DEFAULT 0,
	"reply_count" integer DEFAULT 0,
	"status" text DEFAULT 'sent' NOT NULL,
	"edit_history" text,
	"edited_at" timestamp,
	"edited_by" uuid,
	"reactions" text,
	"is_pinned" boolean DEFAULT false,
	"pinned_at" timestamp,
	"pinned_by" uuid,
	"delivered_at" timestamp,
	"read_by_count" integer DEFAULT 0,
	"is_system_message" boolean DEFAULT false,
	"system_message_type" text,
	"is_moderated" boolean DEFAULT false,
	"moderation_reason" text,
	"moderated_at" timestamp,
	"moderated_by" uuid,
	"is_deleted" boolean DEFAULT false,
	"deleted_at" timestamp,
	"deleted_by" uuid,
	"token_count" integer DEFAULT 0,
	"model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"mode" text DEFAULT 'hybrid' NOT NULL,
	"auto_sync" boolean DEFAULT true,
	"sync_interval" integer DEFAULT 30000,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"operation" text NOT NULL,
	"data" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"synced" boolean DEFAULT false,
	"priority" integer DEFAULT 1,
	"retry_count" integer DEFAULT 0,
	"last_retry_at" timestamp,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"theme" text DEFAULT 'system',
	"language" text DEFAULT 'en',
	"font_size" text DEFAULT 'medium',
	"compact_mode" boolean DEFAULT false,
	"default_chat_type" text DEFAULT 'conversation',
	"auto_save_chats" boolean DEFAULT true,
	"show_timestamps" boolean DEFAULT true,
	"enable_notifications" boolean DEFAULT true,
	"default_model" text DEFAULT 'gpt-4',
	"temperature" integer DEFAULT 70,
	"max_tokens" integer DEFAULT 2048,
	"context_window" integer DEFAULT 8192,
	"allow_analytics" boolean DEFAULT true,
	"allow_data_sharing" boolean DEFAULT false,
	"retention_period" integer DEFAULT 365,
	"export_format" text DEFAULT 'json',
	"include_metadata" boolean DEFAULT true,
	"custom_settings" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	CONSTRAINT "user_relationship_from_user_id_to_user_id_type_pk" PRIMARY KEY("from_user_id","to_user_id","type")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_analytics" ADD CONSTRAINT "chat_analytics_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_analytics" ADD CONSTRAINT "chat_analytics_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participant" ADD CONSTRAINT "conversation_participant_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_edited_by_user_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_pinned_by_user_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_moderated_by_user_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_config" ADD CONSTRAINT "sync_config_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relationship" ADD CONSTRAINT "user_relationship_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_relationship" ADD CONSTRAINT "user_relationship_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_email_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_username_idx" ON "user" USING btree ("username");--> statement-breakpoint
CREATE INDEX "user_status_idx" ON "user" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_last_seen_idx" ON "user" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "user_last_active_idx" ON "user" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "user_active_idx" ON "user" USING btree ("is_active","is_deleted");--> statement-breakpoint
CREATE INDEX "user_presence_user_id_idx" ON "user_presence" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_presence_status_idx" ON "user_presence" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_presence_last_active_idx" ON "user_presence" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX "user_presence_typing_idx" ON "user_presence" USING btree ("typing_in");--> statement-breakpoint
CREATE INDEX "user_presence_session_idx" ON "user_presence" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "user_session_user_id_idx" ON "user_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_session_token_idx" ON "user_session" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "user_session_device_idx" ON "user_session" USING btree ("device_fingerprint");--> statement-breakpoint
CREATE INDEX "user_session_active_idx" ON "user_session" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "user_session_expires_idx" ON "user_session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "user_session_activity_idx" ON "user_session" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "attachment_message_idx" ON "attachment" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "attachment_uploader_idx" ON "attachment" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "attachment_mime_type_idx" ON "attachment" USING btree ("mime_type");--> statement-breakpoint
CREATE INDEX "attachment_processing_status_idx" ON "attachment" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "attachment_storage_key_idx" ON "attachment" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "conversation_type_idx" ON "conversation" USING btree ("type");--> statement-breakpoint
CREATE INDEX "conversation_created_by_idx" ON "conversation" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "conversation_last_activity_idx" ON "conversation" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "conversation_active_idx" ON "conversation" USING btree ("is_active","is_deleted");--> statement-breakpoint
CREATE INDEX "conversation_invite_code_idx" ON "conversation" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "participant_conversation_idx" ON "conversation_participant" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "participant_user_idx" ON "conversation_participant" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "participant_status_idx" ON "conversation_participant" USING btree ("status");--> statement-breakpoint
CREATE INDEX "participant_role_idx" ON "conversation_participant" USING btree ("role");--> statement-breakpoint
CREATE INDEX "participant_last_read_idx" ON "conversation_participant" USING btree ("last_read_at");--> statement-breakpoint
CREATE INDEX "message_conversation_created_idx" ON "message" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "message_sender_idx" ON "message" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "message_thread_root_idx" ON "message" USING btree ("thread_root_id");--> statement-breakpoint
CREATE INDEX "message_parent_idx" ON "message" USING btree ("parent_message_id");--> statement-breakpoint
CREATE INDEX "message_status_idx" ON "message" USING btree ("status");--> statement-breakpoint
CREATE INDEX "message_content_type_idx" ON "message" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "message_pinned_idx" ON "message" USING btree ("is_pinned");--> statement-breakpoint
CREATE INDEX "message_deleted_idx" ON "message" USING btree ("is_deleted");--> statement-breakpoint
CREATE INDEX "relationship_from_user_idx" ON "user_relationship" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "relationship_to_user_idx" ON "user_relationship" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "relationship_type_status_idx" ON "user_relationship" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "relationship_last_interaction_idx" ON "user_relationship" USING btree ("last_interaction_at");
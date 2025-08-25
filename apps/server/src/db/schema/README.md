# Chat Application Database Schema Documentation

This document describes the comprehensive database schema implementation for the OpenChat application using Drizzle ORM and PostgreSQL. The schema supports modern chat application features including real-time messaging, file attachments, user relationships, and advanced conversation management.

## Schema Overview

The database schema is organized into several key areas:

### 1. Authentication & User Management (`auth.ts`)
- **User profiles** with enhanced social features
- **Session management** for authentication
- **Account linking** for OAuth providers
- **Email verification** system

### 2. Chat & Messaging (`chat.ts`)
- **Conversations** supporting direct messages, groups, and channels
- **Messages** with threading, reactions, and rich content types
- **Attachments** with comprehensive file management
- **User relationships** for social features
- **Participants management** with roles and permissions

### 3. Validation Schemas (`validation.ts`)
- **Zod schemas** matching database types
- **API endpoint validation**
- **Complex operation schemas**
- **Input sanitization and type safety**

## Core Tables

### Users Table (Enhanced)

```sql
CREATE TABLE "user" (
  -- Core authentication
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  email_verified BOOLEAN NOT NULL,
  image TEXT,
  
  -- Enhanced profile features
  display_name TEXT,
  bio TEXT,
  location TEXT,
  website TEXT,
  
  -- Status and presence
  is_online BOOLEAN DEFAULT FALSE,
  last_seen_at TIMESTAMP,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'away', 'busy', 'invisible', 'offline')),
  custom_status TEXT,
  
  -- Account management
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  
  -- Privacy settings
  is_private BOOLEAN DEFAULT FALSE,
  allow_friend_requests BOOLEAN DEFAULT TRUE,
  show_online_status BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

**Key Features:**
- Real-time presence tracking
- Privacy controls
- Soft deletion support
- Rich profile information
- Performance-optimized indexes

### Conversations Table

```sql
CREATE TABLE "conversation" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  description TEXT,
  type TEXT DEFAULT 'direct' NOT NULL CHECK (type IN ('direct', 'group', 'channel', 'assistant')),
  
  -- Group/channel features
  is_public BOOLEAN DEFAULT FALSE,
  invite_code TEXT UNIQUE,
  max_participants INTEGER,
  
  -- Status management
  is_active BOOLEAN DEFAULT TRUE,
  is_archived BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  
  -- Ownership and activity
  created_by UUID NOT NULL REFERENCES "user"(id),
  last_message_at TIMESTAMP,
  last_activity_at TIMESTAMP,
  message_count INTEGER DEFAULT 0,
  participant_count INTEGER DEFAULT 0,
  
  -- Settings (JSON)
  settings TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

**Key Features:**
- Multiple conversation types (DM, group, channel, AI assistant)
- Public/private channels with invite codes
- Activity tracking and statistics
- Flexible settings via JSON

### Conversation Participants Table

```sql
CREATE TABLE "conversation_participant" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES "conversation"(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  
  -- Role-based permissions
  role TEXT DEFAULT 'member' NOT NULL CHECK (role IN ('owner', 'admin', 'moderator', 'member', 'guest')),
  status TEXT DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'invited', 'left', 'removed', 'banned')),
  
  -- Granular permissions
  can_add_members BOOLEAN DEFAULT FALSE,
  can_remove_members BOOLEAN DEFAULT FALSE,
  can_edit_conversation BOOLEAN DEFAULT FALSE,
  can_delete_messages BOOLEAN DEFAULT FALSE,
  can_pin_messages BOOLEAN DEFAULT FALSE,
  
  -- Notification settings
  notifications_enabled BOOLEAN DEFAULT TRUE,
  muted_until TIMESTAMP,
  is_muted BOOLEAN DEFAULT FALSE,
  
  -- Read tracking
  last_read_message_id UUID,
  last_read_at TIMESTAMP,
  unread_count INTEGER DEFAULT 0,
  
  -- Activity tracking
  joined_at TIMESTAMP DEFAULT NOW() NOT NULL,
  left_at TIMESTAMP,
  invited_by UUID REFERENCES "user"(id),
  
  -- Unique constraint
  PRIMARY KEY (conversation_id, user_id)
);
```

**Key Features:**
- Role-based access control
- Granular permission system
- Read receipt tracking
- Invitation management
- Notification controls

### Enhanced Messages Table

```sql
CREATE TABLE "message" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES "conversation"(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES "user"(id),
  
  -- Content and type
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text' NOT NULL CHECK (content_type IN ('text', 'image', 'file', 'audio', 'video', 'code', 'system', 'poll', 'location')),
  formatted_content TEXT,
  
  -- Social features
  mentions TEXT, -- JSON array of user IDs
  hashtags TEXT, -- JSON array of hashtags
  reactions TEXT, -- JSON object with reaction counts
  
  -- Threading support
  thread_root_id UUID,
  parent_message_id UUID,
  thread_order INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  
  -- Message lifecycle
  status TEXT DEFAULT 'sent' NOT NULL CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed', 'edited', 'deleted')),
  
  -- Edit history
  edit_history TEXT, -- JSON array of previous versions
  edited_at TIMESTAMP,
  edited_by UUID REFERENCES "user"(id),
  
  -- Message features
  is_pinned BOOLEAN DEFAULT FALSE,
  pinned_at TIMESTAMP,
  pinned_by UUID REFERENCES "user"(id),
  
  -- Delivery tracking
  delivered_at TIMESTAMP,
  read_by_count INTEGER DEFAULT 0,
  
  -- System messages
  is_system_message BOOLEAN DEFAULT FALSE,
  system_message_type TEXT CHECK (system_message_type IN ('join', 'leave', 'add_member', 'remove_member', 'title_change', 'settings_change')),
  
  -- Moderation
  is_moderated BOOLEAN DEFAULT FALSE,
  moderation_reason TEXT,
  moderated_at TIMESTAMP,
  moderated_by UUID REFERENCES "user"(id),
  
  -- Soft deletion
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES "user"(id),
  
  -- AI integration
  token_count INTEGER DEFAULT 0,
  model TEXT,
  metadata TEXT, -- JSON for additional data
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

**Key Features:**
- Rich content types (text, media, files, polls, etc.)
- Threading and reply support
- Message reactions and social features
- Comprehensive edit history
- Delivery and read tracking
- Content moderation
- AI assistant integration

### File Attachments Table

```sql
CREATE TABLE "attachment" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES "message"(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES "user"(id),
  
  -- File information
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  
  -- Storage management
  storage_provider TEXT DEFAULT 'local' NOT NULL CHECK (storage_provider IN ('local', 's3', 'gcs', 'azure', 'cloudinary')),
  storage_key TEXT NOT NULL,
  storage_url TEXT,
  
  -- File processing
  metadata TEXT, -- JSON: dimensions, duration, etc.
  thumbnail_url TEXT,
  preview_url TEXT,
  
  -- AI-powered analysis
  content_description TEXT, -- AI-generated description
  extracted_text TEXT, -- OCR results
  tags TEXT, -- JSON array of auto-generated tags
  
  -- Security and access
  is_public BOOLEAN DEFAULT FALSE,
  access_token TEXT,
  expires_at TIMESTAMP,
  
  -- Virus scanning
  is_scanned BOOLEAN DEFAULT FALSE,
  scan_result TEXT CHECK (scan_result IN ('clean', 'infected', 'suspicious', 'pending')),
  scan_details TEXT, -- JSON with scan results
  
  -- Processing status
  processing_status TEXT DEFAULT 'pending' NOT NULL CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error TEXT,
  
  -- Usage tracking
  download_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP,
  
  -- Soft deletion
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

**Key Features:**
- Multi-provider storage support
- Automatic file processing (thumbnails, previews)
- AI-powered content analysis
- Security scanning
- Access control and expiration
- Usage analytics

### User Relationships Table

```sql
CREATE TABLE "user_relationship" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  
  -- Relationship type and status
  type TEXT NOT NULL CHECK (type IN ('friend', 'block', 'follow', 'mute')),
  status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'active', 'inactive')),
  
  -- Request/response messages
  request_message TEXT,
  response_message TEXT,
  
  -- Privacy settings
  can_see_online_status BOOLEAN DEFAULT TRUE,
  can_send_messages BOOLEAN DEFAULT TRUE,
  can_see_profile BOOLEAN DEFAULT TRUE,
  notifications_enabled BOOLEAN DEFAULT TRUE,
  
  -- Activity tracking
  last_interaction_at TIMESTAMP,
  interaction_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  accepted_at TIMESTAMP,
  
  -- Composite primary key for uniqueness
  PRIMARY KEY (from_user_id, to_user_id, type)
);
```

**Key Features:**
- Multiple relationship types
- Bidirectional relationship tracking
- Privacy controls per relationship
- Activity monitoring
- Request/acceptance workflow

## Performance Optimizations

### Strategic Indexes

The schema includes carefully planned indexes for optimal query performance:

```sql
-- User lookups and status queries
CREATE INDEX "user_email_idx" ON "user" ("email");
CREATE INDEX "user_status_idx" ON "user" ("status");
CREATE INDEX "user_last_seen_idx" ON "user" ("last_seen_at");
CREATE INDEX "user_active_idx" ON "user" ("is_active", "is_deleted");

-- Conversation queries
CREATE INDEX "conversation_type_idx" ON "conversation" ("type");
CREATE INDEX "conversation_created_by_idx" ON "conversation" ("created_by");
CREATE INDEX "conversation_last_activity_idx" ON "conversation" ("last_activity_at");

-- Message queries (most critical for performance)
CREATE INDEX "message_conversation_created_idx" ON "message" ("conversation_id", "created_at");
CREATE INDEX "message_sender_idx" ON "message" ("sender_id");
CREATE INDEX "message_thread_root_idx" ON "message" ("thread_root_id");

-- Participant lookups
CREATE INDEX "participant_conversation_idx" ON "conversation_participant" ("conversation_id");
CREATE INDEX "participant_user_idx" ON "conversation_participant" ("user_id");
```

### Query Patterns Supported

1. **Recent conversations for user** - Fast lookup via participant index + conversation activity
2. **Message history pagination** - Optimized via conversation_id + created_at composite index
3. **Unread message counts** - Cached counters with real-time updates
4. **Thread replies** - Efficient via thread_root_id index
5. **User presence queries** - Fast status and last_seen lookups
6. **File attachment queries** - Indexed by message and uploader

## ElectricSQL Synchronization

The schema is designed to support ElectricSQL's local-first synchronization:

### Row-Level Security Considerations

```sql
-- Example RLS policies (to be implemented)
-- Users can only see their own data and public profiles
CREATE POLICY user_access ON "user" FOR SELECT USING (
  id = current_user_id() OR 
  (is_private = FALSE AND is_active = TRUE AND is_deleted = FALSE)
);

-- Conversation access based on participation
CREATE POLICY conversation_access ON "conversation" FOR SELECT USING (
  id IN (
    SELECT conversation_id FROM conversation_participant 
    WHERE user_id = current_user_id() AND status = 'active'
  )
);

-- Message access based on conversation participation
CREATE POLICY message_access ON "message" FOR SELECT USING (
  conversation_id IN (
    SELECT conversation_id FROM conversation_participant 
    WHERE user_id = current_user_id() AND status = 'active'
  )
);
```

### Synchronization-Friendly Features

1. **UUID Primary Keys** - Avoid conflicts during offline creation
2. **Soft Deletion** - Maintain sync integrity with `is_deleted` flags
3. **Timestamp Tracking** - `created_at` and `updated_at` for conflict resolution
4. **Status Fields** - Track entity lifecycle states
5. **Metadata Fields** - Store sync-related information

## Data Validation

### Zod Schema Integration

The `validation.ts` file provides comprehensive Zod schemas that:

1. **Match database constraints** exactly
2. **Validate API inputs** before database operations
3. **Provide TypeScript types** for full type safety
4. **Support complex operations** like creating conversations with participants
5. **Handle file uploads** with size and type validation

### Example Usage

```typescript
import { validationSchemas } from '@/db/schema/validation';

// Validate message creation
const messageData = validationSchemas.sendMessage.parse({
  conversationId: "123e4567-e89b-12d3-a456-426614174000",
  content: "Hello, world!",
  contentType: "text",
  mentions: ["987fcdeb-51d2-43e8-9876-543210987654"]
});

// Validate conversation creation
const groupData = validationSchemas.createGroupConversation.parse({
  title: "Project Team",
  description: "Discussion about the new project",
  participantUserIds: ["user1", "user2", "user3"],
  isPublic: false
});
```

## Migration Strategy

### Backward Compatibility

The migration is designed to:

1. **Preserve existing data** in the current `chat` and `message` tables
2. **Add new fields** without breaking existing queries
3. **Provide migration path** from old schema to new schema
4. **Support gradual rollout** of new features

### Migration Steps

1. **Run the migration** to add new tables and columns
2. **Update application code** to use new schema gradually
3. **Migrate existing data** from old tables to new tables
4. **Deprecate old tables** once migration is complete

## API Integration Examples

### Creating a Direct Conversation

```typescript
import { db, validationSchemas } from '@/db';
import { conversation, conversationParticipant } from '@/db/schema/chat';

async function createDirectConversation(currentUserId: string, otherUserId: string) {
  const validated = validationSchemas.createDirectConversation.parse({
    participantUserId: otherUserId
  });
  
  return db.transaction(async (tx) => {
    // Create conversation
    const [newConversation] = await tx
      .insert(conversation)
      .values({
        type: 'direct',
        createdBy: currentUserId,
        participantCount: 2,
      })
      .returning();
    
    // Add participants
    await tx.insert(conversationParticipant).values([
      {
        conversationId: newConversation.id,
        userId: currentUserId,
        role: 'owner',
        status: 'active',
      },
      {
        conversationId: newConversation.id,
        userId: otherUserId,
        role: 'member',
        status: 'active',
      }
    ]);
    
    return newConversation;
  });
}
```

### Sending a Message with Attachments

```typescript
async function sendMessageWithAttachment(
  conversationId: string, 
  senderId: string, 
  content: string,
  fileData: File
) {
  const messageData = validationSchemas.sendMessage.parse({
    conversationId,
    content,
    contentType: 'text'
  });
  
  return db.transaction(async (tx) => {
    // Create message
    const [newMessage] = await tx
      .insert(message)
      .values({
        conversationId,
        senderId,
        content,
        contentType: 'text',
      })
      .returning();
    
    // Upload and create attachment
    const uploadResult = await uploadFile(fileData);
    
    await tx.insert(attachment).values({
      messageId: newMessage.id,
      uploadedBy: senderId,
      filename: uploadResult.filename,
      originalFilename: fileData.name,
      mimeType: fileData.type,
      fileSize: fileData.size,
      storageProvider: 'local',
      storageKey: uploadResult.key,
      storageUrl: uploadResult.url,
    });
    
    return newMessage;
  });
}
```

## Security Considerations

### Data Protection

1. **Input Validation** - All inputs validated through Zod schemas
2. **SQL Injection Prevention** - Parameterized queries via Drizzle ORM
3. **Access Control** - Row-level security policies (to be implemented)
4. **File Security** - Virus scanning and access token system
5. **Privacy Controls** - User-level privacy settings

### Audit Trail

The schema includes comprehensive audit fields:
- `created_at` and `updated_at` timestamps
- `edited_by`, `deleted_by`, `moderated_by` user references
- `edit_history` for message changes
- Activity tracking in relationships and participants

## Monitoring and Analytics

### Performance Metrics

Built-in support for tracking:
- Message delivery times
- File processing status
- Database query performance
- User activity patterns

### Health Checks

The database module includes health check functionality:

```typescript
import { checkDatabaseHealth } from '@/db';

const health = await checkDatabaseHealth();
console.log(`Database healthy: ${health.healthy}`);
```

## Future Enhancements

The schema is designed to support future features:

1. **Message Encryption** - Additional fields for encrypted content
2. **Voice/Video Calls** - Call session tracking
3. **Advanced Analytics** - User behavior tracking
4. **Bot Integration** - Bot user accounts and automated messages
5. **Enterprise Features** - Organizations, teams, advanced permissions

---

This comprehensive schema provides a solid foundation for a modern, scalable chat application with rich features and excellent performance characteristics.
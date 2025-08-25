# Enhanced Authentication System for OpenChat

This document outlines the comprehensive authentication system enhancements implemented to support the chat application's advanced requirements.

## Overview

The enhanced authentication system extends the existing better-auth setup with comprehensive features for:
- User profile management with rich social features
- Real-time presence tracking and status management
- Social relationships (friends, blocking, following, muting)
- Advanced session management with device tracking
- JWT token integration for ElectricSQL synchronization
- Comprehensive rate limiting and security controls
- Privacy controls and authorization middleware

## Architecture Components

### 1. Enhanced Database Schema (`/apps/server/src/db/schema/auth.ts`)

**Extended User Table:**
- Rich profile fields: `username`, `displayName`, `bio`, `avatar`, `location`, `website`
- Status management: `status`, `customStatus`, `lastActiveAt`
- Privacy controls: `isPrivate`, `allowDirectMessages`, `allowFriendRequests`
- Security features: `isVerified`, `twoFactorEnabled`, `isSuspended`
- Performance indexes for common lookups

**User Relationships Table (`user_relationship`):**
- Supports: friends, blocking, following, muting, favorites
- Status tracking: pending, accepted, declined, active
- Prevents duplicate relationships with composite unique constraints
- Metadata field for extensible relationship data

**User Presence Table (`user_presence`):**
- Real-time status tracking: online, away, busy, offline
- Typing indicators with chat-specific tracking
- Multi-device support with connection counting
- Device and platform information tracking
- Activity timestamps for cleanup processes

**Enhanced Session Table (`user_session`):**
- Device fingerprinting and identification
- Security flags: trusted devices, 2FA requirements
- Geographic and network information
- Session revocation with reason tracking
- Comprehensive activity logging

### 2. Validation System (`/apps/server/src/lib/auth-validation.ts`)

Comprehensive Zod schemas for:
- User registration and login with strong validation
- Profile updates with privacy controls
- Relationship management operations
- Security operations (password changes, 2FA)
- Search and filtering with safety limits
- Bulk operations with appropriate constraints

### 3. Enhanced Better-Auth Configuration (`/apps/server/src/lib/auth.ts`)

**JWT Token Utilities:**
- ElectricSQL-compatible token generation
- WebSocket authentication tokens
- Secure token verification with proper error handling
- Configurable expiration and audience settings

**Presence Management:**
- Real-time status updates
- Connection count tracking
- Typing indicator management
- Automatic cleanup of stale data

**Security Enhancements:**
- Trusted origins configuration
- Rate limiting integration
- Enhanced session management
- Hooks for activity tracking and cleanup

### 4. Authentication Middleware (`/apps/server/src/middleware/auth-middleware.ts`)

**Middleware Types:**
- `requireAuth`: Basic authentication check
- `requireEnhancedAuth`: Full profile and relationship data
- `requireChatAccess`: Chat-specific authorization
- `requireMessageAccess`: Message-level permissions
- `requireUserRelationship`: Relationship-based access control

**Features:**
- Automatic activity tracking
- Relationship-based authorization
- Privacy setting enforcement
- Suspended/blocked user handling
- Permission system foundation

### 5. Context Enhancement (`/apps/server/src/lib/context.ts`)

**Enhanced Context Includes:**
- Complete user profile information
- Real-time presence data
- Relationship mappings and quick lookups
- Permission sets for authorization
- Rate limiting information
- Device and network metadata

**Utility Functions:**
- Friend/blocked user list retrieval
- Relationship checking functions
- Enhanced session creation
- Context type guards

### 6. Presence Tracking Service (`/apps/server/src/lib/presence-service.ts`)

**Real-time Features:**
- Online/offline status management
- Typing indicator tracking (3-second timeout)
- Multi-device connection handling
- Activity timestamp updates
- Automatic cleanup (5-minute timeout)

**Performance Optimizations:**
- Background cleanup processes
- Efficient database queries
- Connection count management
- Bulk presence operations

### 7. Rate Limiting System (`/apps/server/src/middleware/chat-rate-limits.ts`)

**Operation-Specific Limits:**
- Message creation: 20/minute (enhanced for authenticated users)
- Chat creation: 5 per 5 minutes
- Typing indicators: 30 per 10 seconds
- Presence updates: 15/minute
- File uploads: 10 per 5 minutes
- Search operations: 30/minute
- Bulk operations: 3 per 10 minutes

**Adaptive Features:**
- User-based scaling (authenticated users get higher limits)
- Premium user support (when implemented)
- Operation-specific key generation
- Comprehensive monitoring and logging

### 8. User Profile Management (`/apps/server/src/routers/user-profile.ts`)

**Endpoints:**
- `getMyProfile`: Complete personal profile with all fields
- `updateMyProfile`: Profile updates with validation
- `updateStatus`: Real-time status changes
- `updatePrivacySettings`: Privacy control management
- `getUserProfile`: Other user profiles (privacy-aware)
- `searchUsers`: User discovery with relationship context
- `getMyActivityStats`: Personal activity metrics
- `deleteAccount`: Secure account deletion (soft delete)

**Privacy Features:**
- Private profile support
- Relationship-based visibility
- Status visibility controls
- Blocked user filtering

### 9. Relationship Management (`/apps/server/src/routers/user-relationships.ts`)

**Endpoints:**
- `createRelationship`: Friend requests, blocking, following
- `respondToFriendRequest`: Accept/decline friend requests
- `removeRelationship`: Remove any relationship type
- `getRelationships`: List relationships with filtering
- `getFriendRequests`: Pending friend request management
- `bulkRelationshipAction`: Bulk operations (block multiple users)
- `getRelationshipStats`: Relationship statistics

**Features:**
- Mutual friend request auto-acceptance
- Comprehensive relationship filtering
- Bulk operations with error handling
- Statistics and monitoring

### 10. Database Migration (`/apps/server/src/db/migrations/0002_enhanced_auth_schema.sql`)

**Migration Includes:**
- Safe ALTER TABLE operations for existing user table
- New table creation with proper constraints
- Performance indexes for all common queries
- Helpful database views for common operations
- Utility functions for relationship checking
- Automatic timestamp triggers
- Default presence records for existing users

## Integration Points

### ElectricSQL Synchronization
- JWT tokens compatible with ElectricSQL authentication
- User ID and permission claims in tokens
- Secure token generation and verification
- Support for offline synchronization

### WebSocket Real-time Features
- Presence status broadcasting
- Typing indicator propagation  
- Connection management
- Activity tracking

### Rate Limiting Integration
- Context-aware rate limiting
- User-based scaling
- Operation-specific limits
- Monitoring and alerting hooks

## Security Features

### Authentication Security
- Strong password requirements
- Optional 2FA support framework
- Session security with device tracking
- Trusted device management
- Session revocation capabilities

### Privacy Controls
- Private profile visibility
- Relationship-based content access
- Blocked user filtering
- Status visibility controls
- Direct message permissions

### Authorization System
- Granular permission system
- Relationship-based access control
- Chat and message-level authorization
- Admin operation restrictions
- Bulk operation limitations

## Performance Optimizations

### Database Performance
- Comprehensive indexing strategy
- Efficient relationship queries
- Optimized presence tracking
- Bulk operation support
- Query result caching opportunities

### Real-time Performance
- Efficient presence updates
- Typing indicator cleanup
- Connection count management
- Background maintenance processes

### Rate Limiting Performance
- Memory-based rate limiting store
- Automatic cleanup processes
- Efficient key generation
- Non-blocking activity updates

## Usage Examples

### Basic Authentication
```typescript
// Using enhanced auth middleware
.use(...commonMiddleware.enhancedAuth)
.handler(async ({ context }) => {
  const { user, relationships, permissions } = context as EnhancedContext;
  // Access to full user profile and relationship data
});
```

### Chat Authorization
```typescript
// Require chat access
.use(requireChatAccess("chatId"))
.handler(async ({ context }) => {
  // Guaranteed access to the specified chat
});
```

### Presence Management
```typescript
// Update user status
await presenceHelpers.updatePresence(userId, {
  status: "online",
  customStatus: "Working on OpenChat",
});
```

### Relationship Checking
```typescript
// Check if users are friends
const areFriends = await checkUserRelationship(userId1, userId2, "friend");
```

## Monitoring and Maintenance

### Health Monitoring
- Presence service statistics
- Rate limit violation tracking
- Session health metrics
- Relationship statistics

### Maintenance Tasks
- Automatic presence cleanup (every minute)
- Stale session removal
- Typing indicator cleanup (3-second timeout)
- Connection count reconciliation

### Performance Metrics
- Authentication success rates
- Rate limit hit rates
- Presence update frequency
- Relationship operation patterns

## Future Enhancements

### Planned Features
1. Role-based permission system
2. Premium user tier with enhanced limits
3. Advanced analytics and insights
4. Social graph analysis
5. Advanced privacy controls
6. Federation support for external systems

### Integration Opportunities
1. Push notification system
2. Email notification system
3. Analytics and monitoring platforms
4. Content moderation systems
5. Backup and disaster recovery

## Migration Guide

### Database Migration
```bash
# Run the enhanced auth schema migration
bun run db:migrate

# Or apply manually
psql $DATABASE_URL -f src/db/migrations/0002_enhanced_auth_schema.sql
```

### Code Integration
```typescript
// Import enhanced middleware
import { commonMiddleware } from "../middleware/auth-middleware";

// Use in routes
.use(...commonMiddleware.enhancedAuth)

// Access enhanced context
const { user, relationships, permissions } = context as EnhancedContext;
```

### Environment Variables
```env
# JWT configuration
JWT_SECRET=your-jwt-secret-key

# Better Auth configuration  
BETTER_AUTH_SECRET=your-better-auth-secret
BETTER_AUTH_URL=http://localhost:3000

# CORS configuration
CORS_ORIGIN=http://localhost:3001
ADDITIONAL_TRUSTED_ORIGINS=https://yourdomain.com
```

This enhanced authentication system provides a comprehensive foundation for building secure, scalable chat applications with rich social features and real-time capabilities.
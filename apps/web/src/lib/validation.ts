// Input validation utilities

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model: string;
  token?: string;
  streamId?: string;
  resume?: boolean;
  partialContent?: string;
}

export function validateChatRequest(data: any): { valid: boolean; error?: string; data?: ChatRequest } {
  // Check if data exists
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Request body must be a valid object' };
  }

  // Validate messages array
  if (!data.messages || !Array.isArray(data.messages)) {
    return { valid: false, error: 'Messages must be a non-empty array' };
  }

  if (data.messages.length === 0) {
    return { valid: false, error: 'Messages array cannot be empty' };
  }

  if (data.messages.length > 100) {
    return { valid: false, error: 'Too many messages (max 100)' };
  }

  // Validate each message
  for (let i = 0; i < data.messages.length; i++) {
    const msg = data.messages[i];
    
    if (!msg || typeof msg !== 'object') {
      return { valid: false, error: `Message ${i} must be an object` };
    }

    if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
      return { valid: false, error: `Message ${i} must have a valid role (user, assistant, or system)` };
    }

    if (typeof msg.content !== 'string') {
      return { valid: false, error: `Message ${i} content must be a string` };
    }

    if (msg.content.length === 0) {
      return { valid: false, error: `Message ${i} content cannot be empty` };
    }

    if (msg.content.length > 50000) {
      return { valid: false, error: `Message ${i} content too long (max 50,000 characters)` };
    }

    // Basic content sanitization check
    if (msg.content.includes('<script>') || msg.content.includes('javascript:')) {
      return { valid: false, error: `Message ${i} contains potentially unsafe content` };
    }
  }

  // Validate model
  if (!data.model || typeof data.model !== 'string') {
    return { valid: false, error: 'Model must be a non-empty string' };
  }

  if (data.model.length > 100) {
    return { valid: false, error: 'Model name too long (max 100 characters)' };
  }

  // Basic model name validation
  if (!/^[a-zA-Z0-9\/_-]+$/.test(data.model)) {
    return { valid: false, error: 'Model name contains invalid characters' };
  }

  // Validate optional token
  if (data.token !== undefined) {
    if (typeof data.token !== 'string') {
      return { valid: false, error: 'Token must be a string' };
    }
    
    if (data.token.length > 1000) {
      return { valid: false, error: 'Token too long (max 1000 characters)' };
    }
  }

  // Validate optional streamId
  if (data.streamId !== undefined) {
    if (typeof data.streamId !== 'string') {
      return { valid: false, error: 'Stream ID must be a string' };
    }
    
    if (data.streamId.length > 100) {
      return { valid: false, error: 'Stream ID too long (max 100 characters)' };
    }

    // Validate UUID format for streamId
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.streamId)) {
      return { valid: false, error: 'Stream ID must be a valid UUID' };
    }
  }

  // Validate optional resume flag
  if (data.resume !== undefined && typeof data.resume !== 'boolean') {
    return { valid: false, error: 'Resume flag must be a boolean' };
  }

  // Validate optional partialContent
  if (data.partialContent !== undefined) {
    if (typeof data.partialContent !== 'string') {
      return { valid: false, error: 'Partial content must be a string' };
    }
    
    if (data.partialContent.length > 100000) {
      return { valid: false, error: 'Partial content too long (max 100,000 characters)' };
    }
  }

  return {
    valid: true,
    data: {
      messages: data.messages,
      model: data.model,
      token: data.token,
      streamId: data.streamId,
      resume: data.resume || false,
      partialContent: data.partialContent
    }
  };
}

// Rate limiting helpers
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(clientId: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const clientData = requestCounts.get(clientId);

  if (!clientData || now > clientData.resetTime) {
    // First request or window expired
    requestCounts.set(clientId, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (clientData.count >= maxRequests) {
    return false; // Rate limit exceeded
  }

  clientData.count++;
  return true;
}

export function getClientId(req: Request): string {
  // In production, you might want to use a more sophisticated client identification
  // For now, use a combination of IP and User-Agent
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  return `${ip}:${userAgent.substring(0, 50)}`;
}
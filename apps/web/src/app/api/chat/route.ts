import { NextRequest } from 'next/server';

// Use edge runtime for better performance
export const runtime = 'edge';

type StreamData = {
  messages: any[];
  model: string;
  partialResponse: string;
  timestamp: number;
  token?: string;
};

// Use in-memory storage (no file system access in edge runtime)
// For production, use KV storage or Redis
const memoryStorage = new Map<string, StreamData>();

// Storage abstraction for edge runtime
async function loadStorage(): Promise<Map<string, StreamData>> {
  // Clean up old entries (24+ hours)
  const now = Date.now();
  for (const [key, value] of memoryStorage.entries()) {
    if (now - value.timestamp > 24 * 60 * 60 * 1000) {
      memoryStorage.delete(key);
    }
  }
  return memoryStorage;
}

async function saveStorage(storage: Map<string, StreamData>): Promise<void> {
  // Update in-memory storage
  memoryStorage.clear();
  for (const [key, value] of storage.entries()) {
    memoryStorage.set(key, value);
  }
}

async function setStreamData(id: string, data: StreamData): Promise<void> {
  const storage = await loadStorage();
  
  // Clean up old entries (older than 24 hours)
  const now = Date.now();
  for (const [key, value] of storage.entries()) {
    if (now - value.timestamp > 24 * 60 * 60 * 1000) {
      storage.delete(key);
    }
  }
  
  storage.set(id, data);
  await saveStorage(storage);
}

async function getStreamData(id: string): Promise<StreamData | undefined> {
  const storage = await loadStorage();
  return storage.get(id);
}

export async function POST(req: NextRequest) {
  try {
    const {
      messages,
      model,
      token,
      streamId,
      resume = false,
      partialContent
    } = await req.json();
    
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Messages array required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'OpenRouter token required' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate or use provided stream ID
    const id = streamId || crypto.randomUUID();
    
    // If resuming, get previous partial response
    let previousContent = '';
    if (resume) {
      // Use passed partial content if available (from client DB)
      if (partialContent) {
        previousContent = partialContent;
      } else if (streamId) {
        // Fallback to server storage
        const stored = await getStreamData(streamId);
        if (stored) {
          previousContent = stored.partialResponse || '';
        }
      }
    }

    // Prepare messages for OpenRouter
    const requestMessages = [...messages];
    if (resume && previousContent) {
      // Add the partial response to context for continuation
      requestMessages.push({
        role: 'assistant',
        content: previousContent
      });
      // Be more explicit about continuation to avoid repetition
      const endsWithSpace = previousContent.endsWith(' ');
      const endsWithPunctuation = /[.!?]$/.test(previousContent.trim());
      
      let continuationPrompt = 'Continue from exactly where you stopped. Do not add ellipsis. ';
      if (!endsWithSpace && !endsWithPunctuation) {
        continuationPrompt += 'Complete the current word/sentence first. ';
      }
      continuationPrompt += 'Do not repeat any content.';
      
      requestMessages.push({
        role: 'user',
        content: continuationPrompt
      });
    }

    const openRouterRequest = {
      model,
      messages: requestMessages,
      stream: true,
      max_tokens: 4096,
    };

    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://openchat.pro',
      },
      body: JSON.stringify(openRouterRequest),
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      
      return new Response(JSON.stringify({ 
        error: 'OpenRouter API error', 
        details: errorText,
        status: openRouterResponse.status
      }), {
        status: openRouterResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Set up SSE headers
    const responseHeaders = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    });

    const reader = openRouterResponse.body?.getReader();
    const decoder = new TextDecoder();
    
    let buffer = '';
    let accumulatedContent = previousContent; // Start with previous content when resuming

    const stream = new ReadableStream({
      async start(controller) {
        if (!reader) {
          controller.close();
          return;
        }

        // Send initial stream ID
        controller.enqueue(`event: streamId\ndata: ${JSON.stringify({ streamId: id, resume, previousContent })}\n\n`);
        
        // Store initial stream state
        await setStreamData(id, {
          messages,
          model,
          partialResponse: accumulatedContent,
          timestamp: Date.now(),
          token
        });

        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              // Send final message
              controller.enqueue(`event: done\ndata: {"done":true}\n\n`);
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim() === '') continue;
              if (!line.startsWith('data: ')) continue;

              const data = line.slice(6);
              if (data === '[DONE]') {
                controller.enqueue(`event: done\ndata: {"done":true}\n\n`);
                break;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                
                if (content) {
                  // For continuation, only send the new content
                  controller.enqueue(`data: ${JSON.stringify(content)}\n\n`);
                  accumulatedContent += content;
                  
                  // Update stored stream data periodically
                  await setStreamData(id, {
                    messages,
                    model,
                    partialResponse: accumulatedContent,
                    timestamp: Date.now(),
                    token
                  });
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        } catch (error: any) {
          controller.enqueue(`event: error\ndata: ${JSON.stringify({ 
            error: error.message || 'Stream processing error'
          })}\n\n`);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      }
    });

    return new Response(stream, { headers: responseHeaders });

  } catch (error: any) {
    return new Response(JSON.stringify({ 
      error: 'Request processing error',
      details: error.message || 'Unknown error' 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Resume endpoint
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const streamId = url.searchParams.get('streamId');
  
  if (!streamId) {
    return new Response(JSON.stringify({ error: 'streamId required' }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const streamData = await getStreamData(streamId);
  
  if (!streamData) {
    return new Response(JSON.stringify({ error: 'Stream not found' }), { 
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify(streamData), {
    headers: { 'Content-Type': 'application/json' }
  });
}
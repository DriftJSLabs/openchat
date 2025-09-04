import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { NextRequest } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const models = {
  'openai/gpt-4o': openai('gpt-4o'),
  'openai/gpt-4o-mini': openai('gpt-4o-mini'),
  'openai/gpt-3.5-turbo': openai('gpt-3.5-turbo'),
  'anthropic/claude-3-5-sonnet': anthropic('claude-3-5-sonnet-20241022'),
  'anthropic/claude-3-5-haiku': anthropic('claude-3-5-haiku-20241022'),
  'anthropic/claude-3-opus': anthropic('claude-3-opus-20240229'),
};

// File-based storage for stream data
const storageFile = join(env.STREAM_DATA_DIR, 'streams.json');

// Initialize storage directory
mkdir(env.STREAM_DATA_DIR, { recursive: true }).catch(() => {});

type StreamData = {
  messages: any[];
  model: string;
  partialResponse: string;
  timestamp: number;
  token?: string;
};

// Helper functions for file-based storage
async function loadStorage(): Promise<Map<string, StreamData>> {
  try {
    const data = await readFile(storageFile, 'utf-8');
    const entries = JSON.parse(data);
    return new Map(Object.entries(entries));
  } catch {
    return new Map();
  }
}

async function saveStorage(storage: Map<string, StreamData>): Promise<void> {
  try {
    const data = Object.fromEntries(storage);
    await writeFile(storageFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    // Silently fail if we can't write
  }
}

async function setStreamData(id: string, data: StreamData): Promise<void> {
  const storage = await loadStorage();
  
  // Clean up old entries (older than 24 hours)
  const now = Date.now();
  for (const [key, value] of storage) {
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

    const selectedModel = models[model as keyof typeof models];
    
    if (!selectedModel) {

      if (!token) {
        return new Response(JSON.stringify({ error: 'OpenRouter token required for this model' }), { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Prepare messages for continuation
      const requestMessages = [...messages];
      if (resume && previousContent) {
        // Add the partial response to context for continuation
        requestMessages.push({
          role: 'assistant',
          content: previousContent
        });
        // Be more explicit about continuation to avoid repetition
        // Check if previous content ends mid-word or mid-sentence
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
        messages: requestMessages.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        })),
        stream: true,
        temperature: 0.7,
        max_tokens: 2000,
      };

      let openRouterResponse;
      try {
        openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': env.NEXT_PUBLIC_OPENROUTER_APP_URL,
            'X-Title': 'OpenChat',
          },
          body: JSON.stringify(openRouterRequest),
          signal: req.signal, // Forward abort signal from request
        });
      } catch (error: any) {
        if (error.name === 'AbortError' || error.code === 'ECONNRESET') {
          // Client aborted the request, return a clean response
          return new Response(null, { status: 499 }); // Client Closed Request
        }
        throw error;
      }

      if (!openRouterResponse.ok) {
        const errorText = await openRouterResponse.text();
        let errorMessage = `OpenRouter API error: ${openRouterResponse.status}`;
        let isUpstreamRateLimit = false;
        let suggestedAction = '';
        
        // Try to parse error JSON for more details
        try {
          const errorJson = JSON.parse(errorText);
          
          // Check if it's an upstream rate limit (provider's fault, not ours)
          if (errorJson.error?.metadata?.raw) {
            const rawMessage = errorJson.error.metadata.raw;
            
            // Check if it's an upstream rate limit
            if (rawMessage.includes('temporarily rate-limited upstream') || 
                rawMessage.includes('rate-limited upstream')) {
              isUpstreamRateLimit = true;
              
              // Extract model name from the message
              const modelMatch = rawMessage.match(/^([^:]+):?/);
              const modelName = modelMatch ? modelMatch[1] : 'This model';
              
              errorMessage = `${modelName} is temporarily unavailable`;
              suggestedAction = 'Try a different model or wait a moment';
            } else {
              errorMessage = rawMessage;
            }
          } else if (errorJson.error?.message) {
            errorMessage = errorJson.error.message;
          }
        } catch (e) {
          // If parsing fails, use the default error message
          }
        
        // Handle rate limiting specifically
        if (openRouterResponse.status === 429) {
          const retryAfter = openRouterResponse.headers.get('Retry-After');
          
          const headers: HeadersInit = { 
            'Content-Type': 'application/json'
          };
          
          if (retryAfter) headers['Retry-After'] = retryAfter;
          
          return new Response(JSON.stringify({ 
            error: errorMessage,
            isUpstreamRateLimit,
            suggestedAction: suggestedAction || (isUpstreamRateLimit 
              ? 'Please try a different model or wait briefly'
              : 'Please wait a moment and try again'),
            retryAfter: retryAfter ? parseInt(retryAfter) : (isUpstreamRateLimit ? 5 : 60),
            details: errorText
          }), {
            status: 429,
            headers
          });
        }
        
        return new Response(JSON.stringify({ 
          error: errorMessage,
          details: errorText
        }), {
          status: openRouterResponse.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Stream OpenRouter response
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let fullResponse = previousContent;
      
      const stream = new ReadableStream({
        async start(controller) {
          const reader = openRouterResponse.body!.getReader();
          let buffer = '';
          let isClosed = false;
          
          // Handle abort signal
          const abortHandler = () => {
            isClosed = true;
            reader.cancel();
            // Store partial response when aborted
            if (fullResponse) {
              setStreamData(id, {
                messages,
                model,
                partialResponse: fullResponse,
                timestamp: Date.now(),
                token
              }).catch(() => {});
            }
          };
          
          req.signal.addEventListener('abort', abortHandler);
          
          try {
            // Send previous content if resuming
            if (resume && previousContent && !isClosed) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'resume', 
                content: previousContent,
                streamId: id 
              })}\n\n`));
            }
            
            while (!isClosed) {
              const { done, value } = await reader.read();
              if (done) {
                // Store the complete response when stream ends naturally
                await setStreamData(id, {
                  messages,
                  model,
                  partialResponse: fullResponse,
                  timestamp: Date.now(),
                  token
                });
                
                if (!isClosed) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    type: 'done',
                    streamId: id 
                  })}\n\n`));
                  controller.close();
                  isClosed = true;
                }
                break;
              }
              
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              
              for (const line of lines) {
                if (isClosed) break; // Stop processing if closed
                
                if (line.startsWith('data: ')) {
                  const data = line.slice(6).trim();
                  if (data === '[DONE]') {
                    // Store the complete response
                    await setStreamData(id, {
                      messages,
                      model,
                      partialResponse: fullResponse,
                      timestamp: Date.now(),
                      token
                    });
                    
                    if (!isClosed) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                        type: 'done',
                        streamId: id 
                      })}\n\n`));
                      controller.close();
                      isClosed = true;
                    }
                    return;
                  }
                  
                  try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    if (content && !isClosed) {
                      fullResponse += content;
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                        type: 'delta', 
                        content 
                      })}\n\n`));
                    }
                  } catch (e) {
                    }
                }
              }
            }
          } catch (error: any) {
            // Check if it's an abort or connection reset error
            if (error?.name === 'AbortError' || error?.code === 'ECONNRESET') {
              // Store partial response when aborted
              if (fullResponse) {
                setStreamData(id, {
                  messages,
                  model,
                  partialResponse: fullResponse,
                  timestamp: Date.now(),
                  token
                }).catch(() => {});
              }
              if (!isClosed) {
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'abort',
                    streamId: id
                  })}\n\n`));
                } catch (e) {
                  // Controller might be closed, ignore
                }
                try {
                  controller.close();
                } catch (e) {
                  // Already closed, ignore
                }
                isClosed = true;
              }
            } else if (!isClosed) {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'error',
                  error: error?.message || 'Stream error'
                })}\n\n`));
                controller.close();
              } catch (e) {
                // Controller might be closed, ignore
              }
              isClosed = true;
            }
          } finally {
            req.signal.removeEventListener('abort', abortHandler);
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no', // Disable buffering for nginx
        },
      });
    }

    const apiKey = model.startsWith('openai/') 
      ? env.OPENAI_API_KEY 
      : env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ 
        error: `API key not configured for ${model.split('/')[0]}` 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // For AI SDK models, handle with custom streaming
    let fullText = previousContent;
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        let isClosed = false;
        
        // Handle abort signal
        const abortHandler = () => {
          isClosed = true;
          // Store partial response when aborted
          if (fullText) {
            setStreamData(id, {
              messages,
              model,
              partialResponse: fullText,
              timestamp: Date.now()
            }).catch(() => {});
          }
        };
        
        req.signal.addEventListener('abort', abortHandler);
        
        try {
          // Send previous content if resuming
          if (resume && previousContent && !isClosed) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'resume', 
              content: previousContent,
              streamId: id 
            })}\n\n`));
          }

          // Prepare messages for AI SDK
          const requestMessages = [...messages];
          if (resume && previousContent) {
            requestMessages.push({
              role: 'assistant',
              content: previousContent
            });
            requestMessages.push({
              role: 'user',
              content: 'Continue from where you left off.'
            });
          }

        let result;
        try {
          result = streamText({
            model: selectedModel,
            messages: requestMessages,
            temperature: 0.7,
            maxRetries: 2,
            abortSignal: req.signal, // Forward abort signal
            onAbort: () => {
              // Store partial response when aborted
              if (fullText) {
                setStreamData(id, {
                  messages,
                  model,
                  partialResponse: fullText,
                  timestamp: Date.now()
                }).catch(() => {});
              }
              },
          });
        } catch (error: any) {
          if (error.name === 'AbortError' || error.code === 'ECONNRESET') {
            return new Response(null, { status: 499 });
          }
          throw error;
        }

        for await (const chunk of result.textStream) {
            if (isClosed) break; // Stop if controller is closed
            
            fullText += chunk;
            if (!isClosed) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'delta', 
                content: chunk 
              })}\n\n`));
            }
          }

          // Store the complete response
          if (!isClosed) {
            await setStreamData(id, {
              messages,
              model,
              partialResponse: fullText,
              timestamp: Date.now()
            });
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'done',
              streamId: id 
            })}\n\n`));
            controller.close();
            isClosed = true;
          }
          } catch (error: any) {
            // Check if it's an abort or connection reset error
            if (error?.name === 'AbortError' || error?.code === 'ECONNRESET') {
              // Store partial response when aborted
              if (fullText) {
                setStreamData(id, {
                  messages,
                  model,
                  partialResponse: fullText,
                  timestamp: Date.now()
                }).catch(() => {});
              }
              if (!isClosed) {
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'abort',
                    streamId: id
                  })}\n\n`));
                } catch (e) {
                  // Controller might be closed, ignore
                }
                try {
                  controller.close();
                } catch (e) {
                  // Already closed, ignore
                }
                isClosed = true;
              }
            } else if (!isClosed) {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'error',
                  error: error?.message || 'Stream error'
                })}\n\n`));
                controller.close();
              } catch (e) {
                // Controller might be closed, ignore
              }
              isClosed = true;
            }
          } finally {
            req.signal.removeEventListener('abort', abortHandler);
          }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Stream-Id': id,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// GET endpoint for checking stream state
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const streamId = url.searchParams.get('streamId');
  
  if (!streamId) {
    return new Response('Stream ID required', { status: 400 });
  }

  const stored = await getStreamData(streamId);
  if (!stored) {
    return new Response('Stream not found', { status: 404 });
  }
  
  return new Response(JSON.stringify(stored), {
    headers: { 'Content-Type': 'application/json' }
  });
}
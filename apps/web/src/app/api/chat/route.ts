import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { NextRequest } from 'next/server';
import { CSRFProtection } from '@/lib/csrf';
import { chatRateLimit } from '@/lib/rate-limit';
import { SecureLogger } from '@/lib/secure-logger';

export const runtime = 'edge';

const models = {
  'openai/gpt-4o': openai('gpt-4o'),
  'openai/gpt-4o-mini': openai('gpt-4o-mini'),
  'openai/gpt-3.5-turbo': openai('gpt-3.5-turbo'),
  'anthropic/claude-3-5-sonnet': anthropic('claude-3-5-sonnet-20241022'),
  'anthropic/claude-3-5-haiku': anthropic('claude-3-5-haiku-20241022'),
  'anthropic/claude-3-opus': anthropic('claude-3-opus-20240229'),
};

// Memory-based storage for demo (use Redis/KV in production)
const streamStorage = new Map<string, {
  messages: any[];
  model: string;
  partialResponse: string;
  timestamp: number;
  token?: string;
}>();

export async function POST(req: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResult = chatRateLimit(req);
    if (rateLimitResult) {
      return rateLimitResult;
    }

    // Apply CSRF protection
    const csrfResult = CSRFProtection.middleware(req);
    if (csrfResult) {
      return csrfResult;
    }

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
        const stored = streamStorage.get(streamId);
        if (stored) {
          previousContent = stored.partialResponse || '';
        }
      }
    }

    const selectedModel = models[model as keyof typeof models];
    
    if (!selectedModel) {
      SecureLogger.log('Model not found in AI SDK, falling back to OpenRouter');
      
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
            'HTTP-Referer': process.env.NEXT_PUBLIC_OPENROUTER_APP_URL || 'http://localhost:3001',
            'X-Title': 'OpenChat',
          },
          body: JSON.stringify(openRouterRequest),
          signal: req.signal, // Forward abort signal from request
        });
      } catch (error: any) {
        if (error.name === 'AbortError' || error.code === 'ECONNRESET') {
          // Client aborted the request, return a clean response
          SecureLogger.log('OpenRouter request aborted by client');
          return new Response(null, { status: 499 }); // Client Closed Request
        }
        throw error;
      }

      if (!openRouterResponse.ok) {
        const errorText = await openRouterResponse.text();
        return new Response(JSON.stringify({ 
          error: `OpenRouter API error: ${openRouterResponse.status}`,
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
              streamStorage.set(id, {
                messages,
                model,
                partialResponse: fullResponse,
                timestamp: Date.now(),
                token
              });
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
                streamStorage.set(id, {
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
                    streamStorage.set(id, {
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
                    SecureLogger.error('Parse error:', e);
                  }
                }
              }
            }
          } catch (error: any) {
            // Check if it's an abort or connection reset error
            if (error?.name === 'AbortError' || error?.code === 'ECONNRESET') {
              // Store partial response when aborted
              if (fullResponse) {
                streamStorage.set(id, {
                  messages,
                  model,
                  partialResponse: fullResponse,
                  timestamp: Date.now(),
                  token
                });
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
      ? process.env.OPENAI_API_KEY 
      : process.env.ANTHROPIC_API_KEY;

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
            streamStorage.set(id, {
              messages,
              model,
              partialResponse: fullText,
              timestamp: Date.now()
            });
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
          result = await streamText({
            model: selectedModel,
            messages: requestMessages,
            temperature: 0.7,
            maxRetries: 2,
            abortSignal: req.signal, // Forward abort signal
            onAbort: () => {
              // Store partial response when aborted
              if (fullText) {
                streamStorage.set(id, {
                  messages,
                  model,
                  partialResponse: fullText,
                  timestamp: Date.now()
                });
              }
              SecureLogger.log(`Stream aborted after generating ${fullText.length} characters`);
            },
          });
        } catch (error: any) {
          if (error.name === 'AbortError' || error.code === 'ECONNRESET') {
            SecureLogger.log('AI SDK request aborted by client');
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
            streamStorage.set(id, {
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
                streamStorage.set(id, {
                  messages,
                  model,
                  partialResponse: fullText,
                  timestamp: Date.now()
                });
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
    SecureLogger.error('Error in chat API:', error);
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

  const stored = streamStorage.get(streamId);
  if (!stored) {
    return new Response('Stream not found', { status: 404 });
  }
  
  return new Response(JSON.stringify(stored), {
    headers: { 'Content-Type': 'application/json' }
  });
}
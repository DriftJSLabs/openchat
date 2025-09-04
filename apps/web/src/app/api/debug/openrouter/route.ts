import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

// Debug endpoint to test OpenRouter API directly
export async function POST(req: NextRequest) {
  try {
    const { token, model = 'openai/gpt-3.5-turbo' } = await req.json();
    
    if (!token) {
      return new Response(JSON.stringify({ error: 'Token required for debug test' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Test basic API connectivity
    // First test: Get models list
    const modelsResponse = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!modelsResponse.ok) {
      const errorText = await modelsResponse.text();
      return new Response(JSON.stringify({ 
        error: 'Models API failed',
        status: modelsResponse.status,
        details: errorText
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const modelsData = await modelsResponse.json();
    // Second test: Simple chat completion (non-streaming)
    const chatRequest = {
      model,
      messages: [{ role: 'user', content: 'Say "Hello from OpenRouter debug test!"' }],
      stream: false,
      max_tokens: 50,
    };

    const chatResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.NEXT_PUBLIC_OPENROUTER_APP_URL,
        'X-Title': 'OpenChat Debug',
      },
      body: JSON.stringify(chatRequest),
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      return new Response(JSON.stringify({ 
        error: 'Chat API failed',
        status: chatResponse.status,
        details: errorText
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const chatData = await chatResponse.json();
    const responseContent = chatData.choices?.[0]?.message?.content;
    
    // Third test: Streaming test
    const streamRequest = {
      model,
      messages: [{ role: 'user', content: 'Count from 1 to 5, one number per message.' }],
      stream: true,
      max_tokens: 50,
    };

    const streamResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.NEXT_PUBLIC_OPENROUTER_APP_URL,
        'X-Title': 'OpenChat Debug',
      },
      body: JSON.stringify(streamRequest),
    });

    if (!streamResponse.ok) {
      const errorText = await streamResponse.text();
      return new Response(JSON.stringify({ 
        error: 'Streaming test failed',
        status: streamResponse.status,
        details: errorText
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Process a few chunks of the stream
    const reader = streamResponse.body?.getReader();
    const decoder = new TextDecoder();
    let streamedContent = '';
    let chunkCount = 0;

    if (reader) {
      try {
        for (let i = 0; i < 10; i++) { // Read first 10 chunks
          const { done, value } = await reader.read();
          if (done) break;
          
          chunkCount++;
          const chunk = decoder.decode(value, { stream: true });
          
          const lines = chunk.split('\n').filter(line => line.trim());
          for (const line of lines) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const data = JSON.parse(line.slice(6));
                const content = data.choices?.[0]?.delta?.content;
                if (content) streamedContent += content;
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
        }
        reader.cancel();
      } catch (e) {
        }
    }

    // Return debug results
    return new Response(JSON.stringify({
      success: true,
      tests: {
        modelsApi: {
          status: 'success',
          modelsCount: modelsData.data?.length || 0,
        },
        chatCompletion: {
          status: 'success',
          model: chatData.model,
          content: responseContent,
          usage: chatData.usage,
        },
        streaming: {
          status: 'success',
          chunks: chunkCount,
          content: streamedContent,
        }
      },
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Debug test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
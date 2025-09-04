"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "server/convex/_generated/api";
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelSwitcher } from "@/components/model-switcher";
import { useOpenRouterAuth } from "@/contexts/openrouter-auth";
import { cn } from "@/lib/utils";
import type { Id } from "server/convex/_generated/dataModel";

interface ChatPageClientProps {
  chatId: string;
}

// Get initial model from localStorage (outside component to avoid recreation)
const getInitialModel = () => {
  if (typeof window !== 'undefined') {
    const savedModel = localStorage.getItem('selectedModel');
    return savedModel || "openai/gpt-4o";
  }
  return "openai/gpt-4o";
};

export default function ChatPageClient({ chatId }: ChatPageClientProps) {
  // Load saved model from localStorage or use default
  const [selectedModel, setSelectedModel] = useState(getInitialModel);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { isConnected, token } = useOpenRouterAuth();
  
  // Handle model change with localStorage update
  const handleModelChange = useCallback((newModel: string) => {
    setSelectedModel(newModel);
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedModel', newModel);
    }
  }, []);
  const chat = useQuery(api.chats.getChat, { chatId: chatId as Id<"chats"> });
  const messages = useQuery(api.messages.getMessages, { chatId: chatId as Id<"chats"> });
  const sendMessage = useMutation(api.messages.sendMessage);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  useEffect(() => {
    const title = chat?.title ? `${chat.title} - OpenChat` : "Chat - OpenChat";
    document.title = title;
    
    // Cleanup function to reset title when component unmounts
    return () => {
      document.title = "OpenChat";
    };
  }, [chat?.title]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // In development mode, work without OpenRouter connection
    const message = input.trim();
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      // Send user message to Convex
      await sendMessage({
        chatId: chatId as Id<"chats">,
        content: message,
        role: "user",
      });

      // If OpenRouter is not connected, show a message to connect
      if (!isConnected || !token) {
        // Simulate AI thinking time
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Show message to connect OpenRouter
        const mockResponse = "To get AI responses, please connect to OpenRouter using the 'Connect OpenRouter' button in the sidebar.";
        
        // Simulate streaming
        setStreamingContent('');
        for (let i = 0; i <= mockResponse.length; i++) {
          setStreamingContent(mockResponse.substring(0, i));
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        
        // Save the mock response
        await sendMessage({
          chatId: chatId as Id<"chats">,
          content: mockResponse,
          role: "assistant",
          model: "mock-model",
        });
        
        setStreamingContent('');
        setIsLoading(false);
        return;
      }
      
      // Send to direct OpenRouter API (when connected)
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...(messages || []).map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            { role: 'user', content: message }
          ],
          model: selectedModel,
          token: token,
        }),
      });

      if (!response.ok) {
        let errorDetails = 'Unknown error';
        try {
          const errorData = await response.json();
          errorDetails = errorData.details || errorData.error || 'API request failed';
          } catch {
          errorDetails = await response.text();
          }
        throw new Error(`OpenRouter API failed (${response.status}): ${errorDetails}`);
      }

      if (!response.body) {
        throw new Error('No response body from OpenRouter API');
      }

      const reader = response.body.getReader();
      let aiContent = '';
      let chunkCount = 0;
      setStreamingContent('');
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          chunkCount++;
          const chunk = new TextDecoder().decode(value);
          
          aiContent += chunk;
          setStreamingContent(aiContent);
          
          // Small delay to make streaming visible and smooth
          await new Promise(resolve => setTimeout(resolve, 15));
        }
      } catch (streamError) {
        throw new Error(`Failed to read AI response stream: ${streamError}`);
      }

      // Validate and save response
      const trimmedContent = aiContent.trim();
      if (trimmedContent) {
        await sendMessage({
          chatId: chatId as Id<"chats">,
          content: trimmedContent,
          role: "assistant",
          model: selectedModel,
        });
      } else {
        throw new Error('AI model returned empty response. Please try again or select a different model.');
      }

      setStreamingContent('');

    } catch (error) {
      // Categorize error types for better user feedback
      let errorMessage = 'Unknown error occurred';
      let canRetry = true;
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Check for specific error types
        if (error.message.includes('401') || error.message.includes('unauthorized')) {
          errorMessage = 'OpenRouter authentication failed. Please reconnect your account.';
          canRetry = false;
        } else if (error.message.includes('402') || error.message.includes('insufficient')) {
          errorMessage = 'Insufficient OpenRouter credits. Please add credits to your account.';
          canRetry = false;
        } else if (error.message.includes('429') || error.message.includes('rate limit')) {
          errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
          canRetry = true;
        } else if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
          errorMessage = 'OpenRouter server error. Please try again in a moment.';
          canRetry = true;
        } else if (error.message.includes('Empty response') || error.message.includes('empty response')) {
          errorMessage = `No response from ${selectedModel}. Try a different model or check if it's available.`;
          canRetry = true;
        } else if (error.message.includes('stream')) {
          errorMessage = 'Streaming connection failed. Please check your internet connection and try again.';
          canRetry = true;
        }
      }
      
      setError(errorMessage);
      setInput(message); // Restore input for retry
    } finally {
      setIsLoading(false);
    }
  };

  if (!chat) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <p className="text-muted-foreground">Chat not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{chat.title}</h1>
        </div>
          <div className="flex items-center gap-3">
            <ModelSwitcher 
              selectedModel={selectedModel} 
              onModelChange={handleModelChange} 
            />
          </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages?.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <h2 className="text-2xl font-semibold mb-2">Start a conversation</h2>
            <p className="text-muted-foreground">
              Choose an AI model above and type your message below
            </p>
          </div>
        )}
        
        {messages?.map((message, index) => (
          <div
            key={message._id}
            className={cn(
              "flex animate-in fade-in-0 slide-in-from-bottom-2",
              message.role === "user" ? "justify-end" : "justify-start"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 transition-all",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted border border-border"
              )}
            >
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-xs opacity-60">
                  {new Date(message.createdAt).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </p>
                {message.role === "assistant" && message.model && (
                  <p className="text-xs opacity-50 ml-2">{message.model}</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Streaming AI response */}
        {streamingContent && (
          <div className="flex justify-start animate-in fade-in-0">
            <div className="bg-muted border border-border rounded-2xl px-4 py-2.5 max-w-[80%]">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {streamingContent}
              </p>
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-xs opacity-60">streaming...</p>
                <p className="text-xs opacity-50 ml-2">{selectedModel}</p>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !streamingContent && (
          <div className="flex justify-start animate-in fade-in-0">
            <div className="bg-muted border border-border rounded-2xl px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <p className="text-sm text-muted-foreground">AI is thinking...</p>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input form with integrated model picker */}
      <div className="relative z-10 border-t border-border p-4 bg-background flex flex-col items-center">
        {error && (
          <div className="mb-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg w-full max-w-3xl">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-destructive flex-1">{error}</p>
              {input && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    handleSubmit({ preventDefault: () => {} } as React.FormEvent);
                  }}
                  className="text-xs h-7 px-2 border-destructive/30 hover:border-destructive/50 text-destructive hover:text-destructive"
                >
                  Retry
                </Button>
              )}
            </div>
            {error.includes('different model') && isConnected && (
              <div className="mt-2 pt-2 border-t border-destructive/20">
                <p className="text-xs text-muted-foreground mb-2">Try switching to a different model:</p>
                <ModelSwitcher 
                  selectedModel={selectedModel} 
                  onModelChange={handleModelChange} 
                  compact={true}
                />
              </div>
            )}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-3xl">
          <div className="flex-1 flex items-center rounded-full border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
            {/* Model picker integrated into input */}
            {isConnected && (
              <>
                <ModelSwitcher 
                  selectedModel={selectedModel} 
                  onModelChange={handleModelChange} 
                  compact={true}
                />
                <div className="h-6 w-px bg-border mx-2" />
              </>
            )}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything..."
              className="flex-1 bg-transparent px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none"
              disabled={false}
              autoFocus
            />
          </div>
          <Button
            type="submit"
            size="icon"
            className="rounded-full h-10 w-10 transition-all hover:scale-110 active:scale-95"
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
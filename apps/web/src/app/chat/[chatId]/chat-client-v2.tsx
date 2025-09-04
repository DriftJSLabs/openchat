"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "server/convex/_generated/api";
import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2, Play, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatInput } from "@/components/chat-input";
import { MessageContent } from "@/components/message-content";
import { toast } from "sonner";
import { useOpenRouterAuth } from "@/contexts/openrouter-auth";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { Id } from "server/convex/_generated/dataModel";

interface ChatPageClientProps {
  chatId: string;
}

interface StreamData {
  streamId: string;
  partialContent: string;
  stopPosition: number;
  model: string;
  messages: any[];
  canResume: boolean;
  messageId: string;
  savedToDb: boolean;
}

// Get initial model from localStorage (outside component to avoid recreation)
const getInitialModel = () => {
  if (typeof window !== 'undefined') {
    const savedModel = localStorage.getItem('selectedModel');
    return savedModel || "openai/gpt-4o-mini";
  }
  return "openai/gpt-4o-mini";
};

export default function ChatPageClient({ chatId }: ChatPageClientProps) {
  // Load saved model from localStorage or use default
  const [selectedModel, setSelectedModel] = useState(getInitialModel);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [stoppedStreams, setStoppedStreams] = useState<Map<string, StreamData>>(new Map());
  const [continuingMessageId, setContinuingMessageId] = useState<string | null>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentStreamIdRef = useRef<string | null>(null);
  const currentStreamMessages = useRef<any[]>([]);
  const currentMessageIdRef = useRef<string | null>(null);
  const isStreamSavedRef = useRef<boolean>(false);
  const isAbortingRef = useRef<boolean>(false); // Track user-initiated aborts
  const lastScrollTop = useRef(0);
  const scrollCheckTimer = useRef<NodeJS.Timeout | null>(null);
  const lastRequestTimeRef = useRef<number>(0); // Track last API request time for rate limiting
  
  // Refs to track accumulated content in real-time (always current, unlike state)
  const accumulatedContentRef = useRef<string>("");
  const continuationContentRef = useRef<string>("");

  const { isConnected, token } = useOpenRouterAuth();
  const chat = useQuery(api.chats.getChat, { chatId: chatId as Id<"chats"> });
  const messages = useQuery(api.messages.getMessages, { chatId: chatId as Id<"chats"> });
  const sendMessage = useMutation(api.messages.sendMessage);
  const updateMessage = useMutation(api.messages.updateMessage);

  // Handle model change with localStorage update
  const handleModelChange = useCallback((newModel: string) => {
    setSelectedModel(newModel);
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedModel', newModel);
    }
  }, []);

  // Improved scroll detection with debouncing
  const handleScroll = useCallback(() => {
    if (scrollCheckTimer.current) {
      clearTimeout(scrollCheckTimer.current);
    }

    scrollCheckTimer.current = setTimeout(() => {
      if (scrollContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        const isAtBottom = distanceFromBottom < 50;
        
        // Only update state if there's an actual change
        if (!isAtBottom && !isUserScrolling) {
          setIsUserScrolling(true);
          setShowScrollButton(true);
        } else if (isAtBottom && isUserScrolling) {
          setIsUserScrolling(false);
          setShowScrollButton(false);
        }
        
        lastScrollTop.current = scrollTop;
      }
    }, 100); // Debounce for 100ms
  }, [isUserScrolling]);

  // Auto-scroll only when appropriate
  useEffect(() => {
    // Only auto-scroll if user hasn't manually scrolled up
    if (!isUserScrolling) {
      // Use requestAnimationFrame for smooth scrolling
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ 
          behavior: streamingContent ? "auto" : "smooth",
          block: "end" 
        });
      });
    }
  }, [messages?.length, streamingContent, isUserScrolling]); // Only trigger on new messages or streaming updates

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    setIsUserScrolling(false);
    setShowScrollButton(false);
    messagesEndRef.current?.scrollIntoView({ 
      behavior: "smooth",
      block: "end"
    });
  }, []);

  useEffect(() => {
    const title = chat?.title ? `${chat.title} - OpenChat` : "Chat - OpenChat";
    document.title = title;
    
    // Cleanup function to reset title when component unmounts
    return () => {
      document.title = "OpenChat";
    };
  }, [chat?.title]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (scrollCheckTimer.current) {
        clearTimeout(scrollCheckTimer.current);
        scrollCheckTimer.current = null;
      }
    };
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      
      // Set abort flag IMMEDIATELY before sending abort signal
      isAbortingRef.current = true;
      
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      
      // Handle stopping during continuation differently
      if (continuingMessageId && continuationContentRef.current) {
        
        // Update the message in the database with the new partial content
        const messageId = continuingMessageId;
        const streamData = stoppedStreams.get(messageId);
        if (streamData) {
          // Get the current message from the database
          const currentMessage = messages?.find(m => m._id === messageId);
          const currentContent = currentMessage?.content || streamData.partialContent || '';
          // Use ref value which is always current
          const fullContent = currentContent + continuationContentRef.current;
          
          // Update the message in the database
          updateMessage({
            messageId: messageId as Id<"messages">,
            content: fullContent,
          }).then(() => {
            
            // Update the stream data to allow resuming again
            const updatedStreamData: StreamData = {
              ...streamData,
              partialContent: fullContent,
              stopPosition: fullContent.length,
              canResume: true,
              savedToDb: true
            };
            
            setStoppedStreams(prev => {
              const newMap = new Map(prev);
              newMap.set(messageId, updatedStreamData);
              return newMap;
            });
            
            // Clear UI state AFTER updating the stoppedStreams Map
            setIsLoading(false);
            setContinuingMessageId(null);
            setStreamingContent('');
            continuationContentRef.current = ''; // Clear continuation ref
          }).catch(error => {
            // Still clear UI state on error
            setIsLoading(false);
            setContinuingMessageId(null);
            setStreamingContent('');
          });
        } else {
          // No stream data found, just clear UI state
          setIsLoading(false);
          setContinuingMessageId(null);
          setStreamingContent('');
        }
        
        // Don't clear state here - let the async operation complete first
        return;
      }
      
      // For new messages (not continuation), handle differently
      // Don't save here - let handleSubmit be the single source of truth for saving
      // Just update the UI state
      setIsLoading(false);
      // Don't clear streamingContent yet - handleSubmit needs it for saving
    }
  }, [continuingMessageId, stoppedStreams, messages, updateMessage]);

  const MIN_REQUEST_INTERVAL = 1000; // Minimum 1 second between requests
  
  const continueGeneration = async (messageId: string) => {
    if (isLoading) return;
    
    // Client-side rate limiting - ensure minimum interval between requests
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTimeRef.current;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      toast.warning(`Please wait a moment before continuing`, {
        description: `Try again in ${Math.ceil(waitTime / 1000)} second(s)`
      });
      return;
    }
    
    // Get the stream data for this message
    const streamData = stoppedStreams.get(messageId) as any;
    if (!streamData || !streamData.canResume) {
      return;
    }
    
    // Check if we're still in a rate limit cooldown period
    if (streamData.retryAfter && streamData.retryAfter > now) {
      const waitTime = Math.ceil((streamData.retryAfter - now) / 1000);
      toast.warning(`Rate limited`, {
        description: `Please wait ${waitTime} seconds before trying again`
      });
      return;
    }
    
    lastRequestTimeRef.current = now;
    
    setIsLoading(true);
    setContinuingMessageId(messageId);
    currentMessageIdRef.current = messageId;
    setStreamingContent(''); // Start fresh - don't duplicate
    isAbortingRef.current = false; // Reset abort flag for continuation
    
    // Create new abort controller for continuation
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    try {
      // Get the current content from the message in the database
      const currentMessage = messages?.find(m => m._id === messageId);
      const currentContent = currentMessage?.content || streamData.partialContent;
      
      // Send continuation request with resume flag and current content
      // Retry logic with exponential backoff for rate limits
      let retryCount = 0;
      const maxRetries = 3;
      let response: Response | null = null;
      
      while (retryCount <= maxRetries) {
        try {
          response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages,
              model: selectedModel,
              token,
              streamId: streamData.streamId,
              resume: true,
              partialContent: currentContent, // Send the current partial content
            }),
          });
          
          if (response.ok) {
            break; // Success, exit retry loop
          }
          
          // Handle rate limiting specifically
          if (response.status === 429) {
            if (retryCount >= maxRetries) {
              // Update UI to show rate limit error
              const retryAfter = response.headers.get('Retry-After');
              const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
              
              // Check if it's an upstream rate limit or our rate limit
              try {
                const errorData = await response.json();
                if (errorData.isUpstreamRateLimit) {
                  toast.warning(errorData.error, {
                    description: errorData.suggestedAction,
                    duration: 6000
                  });
                } else {
                  toast.warning(`Rate limited`, {
                    description: `Please wait ${Math.ceil(waitTime / 1000)} seconds and try again`
                  });
                }
              } catch {
                toast.warning(`Rate limited`, {
                  description: `Please wait ${Math.ceil(waitTime / 1000)} seconds and try again`
                });
              }
              
              setContinuingMessageId(null);
              setIsLoading(false);
              
              // Store the partial content for potential future retry
              const updatedStreamData = {
                ...streamData,
                wasRateLimited: true,
                retryAfter: Date.now() + waitTime
              };
              setStoppedStreams(new Map(stoppedStreams.set(messageId, updatedStreamData)));
              
              throw new Error(`Rate limited: Please wait before continuing. Too many requests in a short time.`);
            }
            
            // Calculate backoff delay (1s, 2s, 4s, 8s)
            const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
            
            // Check if it's an upstream rate limit - don't retry for those
            try {
              const errorData = await response.json();
              if (errorData.isUpstreamRateLimit) {
                toast.warning(errorData.error, {
                  description: errorData.suggestedAction,
                  duration: 6000
                });
                setContinuingMessageId(null);
                setIsLoading(false);
                return; // Don't retry for upstream rate limits
              }
            } catch {
              // Continue with retry if we can't parse the error
            }
            
            // Only retry for our rate limits
            toast.info(`Retrying in ${Math.ceil(delay / 1000)} seconds...`, {
              description: `Attempt ${retryCount + 1} of ${maxRetries}`
            });
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delay));
            
            retryCount++;
            continue;
          }
          
          // For other errors, throw immediately
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Continuation failed: ${response.status}`);
          }
        } catch (error) {
          if (retryCount >= maxRetries || !(error instanceof Error) || !error.message.includes('429')) {
            throw error;
          }
          retryCount++;
        }
      }
      
      if (!response || !response.ok) {
        throw new Error('Failed to continue after maximum retries');
      }
      
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      continuationContentRef.current = ''; // Reset ref for tracking
      let continuedContent = ''; // For state updates
      let buffer = '';
      let wasStoppedEarly = false;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: false });
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data) {
                try {
                  const parsed = JSON.parse(data);
                  
                  if (parsed.type === 'resume') {
                    // Skip the previous content echo
                    continue;
                  } else if (parsed.type === 'delta') {
                    // Handle first chunk - remove ellipsis but preserve spacing
                    let chunk = parsed.content;
                    if (continuedContent.length === 0) {
                      // Only remove ellipsis at the very start, preserve everything else
                      chunk = chunk.replace(/^\.{3,}/, ''); // Remove ONLY dots, not spaces
                    }
                    continuedContent += chunk;
                    continuationContentRef.current = continuedContent; // Keep ref in sync
                    setStreamingContent(continuedContent);
                  } else if (parsed.type === 'done') {
                    // Stream completed
                  } else if (parsed.type === 'abort') {
                    // Stream was aborted
                  }
                } catch (e) {
                  // Handle plain text for OpenRouter
                  if (!line.includes('[DONE]')) {
                    continuedContent += data;
                    setStreamingContent(continuedContent);
                  }
                }
              }
            }
          }
        }
      } catch (streamError: any) {
        if (streamError?.name === 'AbortError') {
          // Mark that the stream was stopped for proper handling
          wasStoppedEarly = true;
        } else {
          throw streamError;
        }
      }
      
      // Update the message with continued content
      if (continuedContent.trim() || wasStoppedEarly) {
        const fullContent = streamData.partialContent + continuedContent;
        
        // Update message in database with the complete content
        await updateMessage({
          messageId: messageId as Id<"messages">,
          content: fullContent,
        });
        
        // Update or remove from stopped streams based on completion
        if (!wasStoppedEarly) {
          // Completed successfully - remove from stopped streams
          setStoppedStreams(prev => {
            const newMap = new Map(prev);
            newMap.delete(messageId);
            return newMap;
          });
        } else {
          // Stopped again - update stream data for next continuation
          const updatedStreamData: StreamData = {
            ...streamData,
            partialContent: fullContent,
            stopPosition: fullContent.length,
            canResume: true,
            savedToDb: true
          };
          setStoppedStreams(prev => {
            const newMap = new Map(prev);
            newMap.set(messageId, updatedStreamData);
            return newMap;
          });
        }
      }
      
    } catch (error) {
      toast.error('Failed to continue generation. Please try again.');
    } finally {
      setIsLoading(false);
      setContinuingMessageId(null);
      setStreamingContent('');
      abortControllerRef.current = null;
      currentMessageIdRef.current = null;
      isAbortingRef.current = false; // Reset abort flag
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Client-side rate limiting for new messages
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTimeRef.current;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      toast.warning(`Please wait a moment`, {
        description: `Try again in ${Math.ceil(waitTime / 1000)} second(s)`
      });
      return;
    }
    lastRequestTimeRef.current = now;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);
    setStreamingContent("");
    setIsUserScrolling(false); // Reset scroll when sending new message
    setShowScrollButton(false);
    isStreamSavedRef.current = false; // Reset save flag

    // Add user message to database
    await sendMessage({
      chatId: chatId as Id<"chats">,
      content: userMessage,
      role: "user",
    });

    // Prepare messages for API
    const contextMessages = messages?.map(msg => ({
      role: msg.role,
      content: msg.content,
    })) || [];
    
    const allMessages = [
      ...contextMessages,
      { role: "user", content: userMessage }
    ];
    
    // Store messages for potential continuation
    currentStreamMessages.current = allMessages;

    // Create unique stream ID
    const streamId = crypto.randomUUID();
    currentStreamIdRef.current = streamId;

    // Create abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const needsToken = !selectedModel.startsWith("openai/") && !selectedModel.startsWith("anthropic/");
      
      // If OpenRouter is not connected and we need it, show a message
      if (needsToken && !isConnected) {
        const connectMessage = "To get AI responses, please connect to OpenRouter using the 'Connect OpenRouter' button.";
        
        // Save the message
        await sendMessage({
          chatId: chatId as Id<"chats">,
          content: connectMessage,
          role: "assistant",
          model: "system",
        });
        
        setIsLoading(false);
        return;
      }
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          messages: allMessages,
          model: selectedModel,
          token: needsToken ? token : undefined,
          streamId,
        }),
      });

      if (!response.ok) {
        // Handle rate limiting specifically
        if (response.status === 429) {
          const errorData = await response.json();
          
          // Check if it's an upstream rate limit
          if (errorData.isUpstreamRateLimit) {
            toast.warning(errorData.error, {
              description: errorData.suggestedAction,
              duration: 6000
            });
          } else {
            const retryAfter = response.headers.get('Retry-After');
            const waitTime = retryAfter ? parseInt(retryAfter) : 60;
            toast.warning(`Rate limited`, {
              description: `Please wait ${waitTime} seconds before trying again`
            });
          }
          
          setIsLoading(false);
          
          // Don't throw for rate limits, just return gracefully
          return;
        }
        
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      accumulatedContentRef.current = ""; // Reset ref
      let accumulatedContent = "";
      let wasStoppedEarly = false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data && !data.includes('[DONE]')) {
                try {
                  const parsed = JSON.parse(data);
                  
                  if (parsed.type === 'delta') {
                    accumulatedContent += parsed.content;
                    accumulatedContentRef.current = accumulatedContent; // Keep ref in sync
                    setStreamingContent(accumulatedContent);
                    // Log every 10th chunk to avoid spam
                    if (accumulatedContent.length % 100 < parsed.content.length) {
                    }
                  } else if (parsed.type === 'done') {
                  } else if (parsed.type === 'abort') {
                    wasStoppedEarly = true;
                  }
                } catch (e) {
                  // Handle plain text response for OpenRouter
                  accumulatedContent += data;
                  accumulatedContentRef.current = accumulatedContent; // Keep ref in sync
                  setStreamingContent(accumulatedContent);
                }
              }
            } else if (line && !line.startsWith('data:')) {
              // Plain text chunk
              accumulatedContent += chunk;
              setStreamingContent(accumulatedContent);
              break; // Exit the loop for plain text
            }
          }
        }
      } catch (streamError: any) {
        if (streamError?.name === 'AbortError') {
          wasStoppedEarly = true;
        } else {
          throw streamError;
        }
      }

      // Save assistant message if not already saved
      // Use ref value which is always current (in case state is stale)
      const contentToSave = accumulatedContentRef.current || accumulatedContent;
      if (contentToSave.trim() && !isStreamSavedRef.current) {
        const assistantMessageId = await sendMessage({
          chatId: chatId as Id<"chats">,
          content: contentToSave,
          role: "assistant",
        });
        
        isStreamSavedRef.current = true;
        currentMessageIdRef.current = assistantMessageId;
        
        // Clear streaming content immediately after saving to prevent duplicate display
        setStreamingContent("");

        // Store for resumption if stopped early
        if (wasStoppedEarly) {
          const streamData: StreamData = {
            streamId,
            partialContent: contentToSave, // Use the same content that was saved
            stopPosition: contentToSave.length,
            model: selectedModel,
            messages: allMessages,
            canResume: true,
            messageId: assistantMessageId,
            savedToDb: true
          };
          setStoppedStreams(prev => new Map(prev).set(assistantMessageId, streamData));
        }
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        toast.error(error.message || "Failed to send message. Please try again.");
      }
    } finally {
      setIsLoading(false);
      // Clear streaming content if it hasn't been cleared yet
      setStreamingContent(prev => {
        if (prev) {
        }
        return "";
      });
      abortControllerRef.current = null;
      currentStreamIdRef.current = null;
      currentMessageIdRef.current = null;
      isStreamSavedRef.current = false;
      isAbortingRef.current = false; // Reset abort flag
      accumulatedContentRef.current = ""; // Clear accumulated content ref
    }
  };

  const getDisplayContent = (message: any) => {
    // If this message is being continued, combine DB content with streaming content
    if (continuingMessageId === message._id && streamingContent) {
      return message.content + streamingContent;
    }
    // Otherwise just return the DB content
    return message.content;
  };

  if (!chat) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const needsOpenRouter = selectedModel && !selectedModel.startsWith("openai/") && !selectedModel.startsWith("anthropic/");
  const canSendMessage = !needsOpenRouter || isConnected;

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages?.map((message) => (
          <motion.div
            key={message._id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "flex",
              message.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-4 py-2",
                message.role === "user"
                  ? "bg-primary text-primary-foreground ml-auto"
                  : "bg-muted"
              )}
            >
              <MessageContent content={getDisplayContent(message)} />
              
              {/* Show continue button for stopped messages */}
              {message.role === "assistant" && 
               stoppedStreams.has(message._id) && 
               stoppedStreams.get(message._id)?.canResume &&
               !isLoading && 
               continuingMessageId !== message._id && (
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => continueGeneration(message._id)}
                    className="flex items-center gap-1"
                  >
                    <Play className="h-3 w-3" />
                    Continue
                  </Button>
                </div>
              )}
              
              {/* Show loading indicator when continuing this message */}
              {continuingMessageId === message._id && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {streamingContent ? 'Continuing generation...' : 'Starting continuation...'}
                </div>
              )}
            </div>
          </motion.div>
        ))}

        {/* Regular streaming for new messages */}
        {streamingContent && !continuingMessageId && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex justify-start"
          >
            <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
              <MessageContent content={streamingContent} />
            </div>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          onClick={scrollToBottom}
          className="absolute bottom-28 right-4 z-20 bg-primary text-primary-foreground rounded-full p-3 shadow-lg hover:shadow-xl transition-shadow"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="h-5 w-5" />
        </motion.button>
      )}

      {/* Input area - flex-shrink-0 to prevent compression */}
      <div className="flex-shrink-0 bg-background border-t p-4 space-y-2">        
        <div className="flex gap-2 items-center">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            onModelChange={handleModelChange}
            selectedModel={selectedModel}
            isLoading={isLoading}
            isConnected={canSendMessage}
            onStop={stopGeneration}
          />
        </div>
      </div>
    </div>
  );
}
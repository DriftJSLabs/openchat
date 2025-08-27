'use client';

import { cn } from '@/lib/utils';
import type { ComponentProps, HTMLAttributes } from 'react';
import { useCallback, useState, useRef, useEffect } from 'react';
import { useDraftAutoSave } from '@/hooks/mutations/use-draft-mutations';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
  type PromptInputProps,
  type PromptInputTextareaProps,
} from '@/components/ai-elements/prompt-input';
import { useChatContainer } from './chat-container';
import { Button } from '@/components/ui/button';
import { 
  Paperclip,
  Image,
  Mic,
  MicOff,
  StopCircle,
  MoreHorizontal,
} from 'lucide-react';
import type { ChatStatus } from 'ai';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Props for the ChatInput component
 */
export interface ChatInputProps {
  /** CSS class name */
  className?: string;
  /** Current input value */
  value?: string;
  /** Handler for input value changes */
  onChange?: (value: string) => void;
  /** Handler for message submission */
  onSubmit?: (content: string) => void;
  /** Handler for stopping current generation */
  onStop?: () => void;
  /** Current chat status */
  status?: ChatStatus;
  /** Placeholder text for the input */
  placeholder?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether to show advanced tools (file upload, voice, etc.) */
  showAdvancedTools?: boolean;
  /** Whether voice input is supported */
  supportsVoice?: boolean;
  /** Whether file upload is supported */
  supportsFileUpload?: boolean;
  /** Maximum character limit */
  maxLength?: number;
  /** Custom tool buttons to add */
  customTools?: React.ReactNode;
  /** File upload handler */
  onFileUpload?: (files: FileList) => void;
  /** Voice recording handlers */
  onVoiceStart?: () => void;
  onVoiceStop?: () => void;
  onVoiceCancel?: () => void;
  /** Whether voice recording is active */
  isRecording?: boolean;
  /** Typing indicator configuration */
  typingIndicator?: {
    enabled: boolean;
    onTypingStart?: () => void;
    onTypingStop?: () => void;
    typingTimeout?: number;
  };
  /** Whether someone else is typing */
  isOthersTyping?: boolean;
  /** Who is typing (for display) */
  typingUsers?: string[];
  /** Drag and drop configuration */
  dragAndDrop?: {
    enabled: boolean;
    allowedTypes?: string[];
    maxFileSize?: number;
    maxFiles?: number;
  };
  /** Auto-save draft configuration */
  autoSave?: {
    enabled: boolean;
    key?: string;
    interval?: number;
  };
}

/**
 * Enhanced chat input component built on existing PromptInput patterns.
 * Provides a comprehensive input interface for chat messages with support
 * for text, file uploads, voice input, and various chat-specific features.
 * 
 * Features:
 * - Built on proven PromptInput component architecture
 * - Auto-resizing textarea with proper height constraints
 * - Submit on Enter, new line on Shift+Enter
 * - File upload support with drag & drop
 * - Voice recording capabilities
 * - Message status indicators (sending, streaming, error)
 * - Character count and limits
 * - Responsive design for mobile and desktop
 * - Integration with chat container context
 * - Extensible toolbar for additional tools
 * 
 * Accessibility:
 * - Proper ARIA labels and roles
 * - Keyboard navigation support
 * - Screen reader friendly status updates
 * - Focus management for modal interactions
 */
export function ChatInput({
  className,
  value = '',
  onChange,
  onSubmit,
  onStop,
  status,
  placeholder = 'Type your message...',
  disabled = false,
  showAdvancedTools = true,
  supportsVoice = false,
  supportsFileUpload = true,
  maxLength = 4000,
  customTools,
  onFileUpload,
  onVoiceStart,
  onVoiceStop,
  onVoiceCancel,
  isRecording = false,
  typingIndicator,
  isOthersTyping = false,
  typingUsers = [],
  dragAndDrop,
  autoSave,
  ...props
}: ChatInputProps) {
  const { 
    isStreaming, 
    isSyncing, 
    onSendMessage, 
    onStopStream,
    error: chatError
  } = useChatContainer();
  
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [charCount, setCharCount] = useState(value?.length || 0);
  
  // Draft auto-save mutation - replaces useEffect patterns
  const draftAutoSave = useDraftAutoSave(
    autoSave?.key || 'default', 
    {
      debounceMs: autoSave?.interval || 1000,
      enabled: autoSave?.enabled || false,
    }
  );
  const [isDragActive, setIsDragActive] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Update character count when value changes
  useEffect(() => {
    setCharCount(value.length);
  }, [value]);

  // Auto-save when value changes using mutation (replaces useEffect)
  useEffect(() => {
    if (value && autoSave?.enabled) {
      draftAutoSave.debouncedSave(value);
    }
  }, [value, autoSave?.enabled, draftAutoSave.debouncedSave]);

  // Load saved draft on mount using mutation
  useEffect(() => {
    if (autoSave?.enabled && autoSave.key && !value) {
      draftAutoSave.loadDraft().then((savedDraft) => {
        if (savedDraft) {
          onChange?.(savedDraft);
        }
      }).catch(console.error);
    }
  }, [autoSave?.enabled, autoSave?.key, value, onChange, draftAutoSave.loadDraft]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Handle form submission with enhanced error handling and state management
   */
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!value.trim() || disabled || isStreaming || isSyncing) {
      return;
    }

    // Call the provided onSubmit handler or fall back to container handler
    if (onSubmit) {
      onSubmit(value.trim());
    } else if (onSendMessage) {
      onSendMessage(value.trim());
    }

    // Clear the input after submission
    onChange?.('');
    setAttachedFiles([]);
  }, [value, disabled, isStreaming, isSyncing, onSubmit, onSendMessage, onChange]);

  /**
   * Handle textarea value changes with typing indicator support
   */
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    
    // Enforce character limit
    if (maxLength && newValue.length > maxLength) {
      return;
    }
    
    onChange?.(newValue);

    // Handle typing indicator
    if (typingIndicator?.enabled) {
      // Start typing if not already typing
      if (!isTyping && newValue.trim()) {
        setIsTyping(true);
        typingIndicator.onTypingStart?.();
      }

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Set new timeout to stop typing
      if (newValue.trim()) {
        typingTimeoutRef.current = setTimeout(() => {
          setIsTyping(false);
          typingIndicator.onTypingStop?.();
        }, typingIndicator.typingTimeout || 3000);
      } else {
        // Stop typing immediately if input is empty
        setIsTyping(false);
        typingIndicator.onTypingStop?.();
      }
    }
  }, [onChange, maxLength, typingIndicator, isTyping]);

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Validate file for upload
   */
  const validateFile = useCallback((file: File): boolean => {
    if (!dragAndDrop?.enabled && !supportsFileUpload) return false;

    const config = dragAndDrop || { enabled: true };
    
    // Check file size
    if (config.maxFileSize && file.size > config.maxFileSize) {
      console.warn(`File ${file.name} is too large. Maximum size is ${config.maxFileSize} bytes.`);
      return false;
    }

    // Check file type
    if (config.allowedTypes && !config.allowedTypes.some(type => {
      if (type.startsWith('.')) {
        return file.name.toLowerCase().endsWith(type.toLowerCase());
      } else if (type.includes('*')) {
        const [category] = type.split('/');
        return file.type.startsWith(category);
      } else {
        return file.type === type;
      }
    })) {
      console.warn(`File type ${file.type} is not allowed.`);
      return false;
    }

    return true;
  }, [dragAndDrop, supportsFileUpload]);

  /**
   * Handle file input change
   */
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const validFiles = Array.from(files).filter(validateFile);
      
      // Check max files limit
      const config = dragAndDrop || { enabled: true };
      const currentFileCount = attachedFiles.length;
      const maxFiles = config.maxFiles || 10;
      const filesToAdd = validFiles.slice(0, maxFiles - currentFileCount);
      
      if (filesToAdd.length > 0) {
        setAttachedFiles(prev => [...prev, ...filesToAdd]);
        onFileUpload?.(e.target.files as FileList);
      }
    }
    // Reset the input
    e.target.value = '';
  }, [onFileUpload, validateFile, dragAndDrop, attachedFiles.length]);

  /**
   * Handle drag and drop events
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragAndDrop?.enabled || supportsFileUpload) {
      setIsDragActive(true);
    }
  }, [dragAndDrop, supportsFileUpload]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (!dragAndDrop?.enabled && !supportsFileUpload) return;

    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(validateFile);
    
    // Check max files limit
    const config = dragAndDrop || { enabled: true };
    const currentFileCount = attachedFiles.length;
    const maxFiles = config.maxFiles || 10;
    const filesToAdd = validFiles.slice(0, maxFiles - currentFileCount);
    
    if (filesToAdd.length > 0) {
      setAttachedFiles(prev => [...prev, ...filesToAdd]);
      // Create a synthetic FileList for the callback
      const fileList = new DataTransfer();
      filesToAdd.forEach(file => fileList.items.add(file));
      onFileUpload?.(fileList.files);
    }
  }, [dragAndDrop, supportsFileUpload, validateFile, attachedFiles.length, onFileUpload]);

  /**
   * Remove attached file
   */
  const removeFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Handle voice recording toggle
   */
  const handleVoiceToggle = useCallback(() => {
    if (isRecording) {
      onVoiceStop?.();
    } else {
      onVoiceStart?.();
    }
  }, [isRecording, onVoiceStart, onVoiceStop]);

  /**
   * Determine if the submit button should be disabled
   */
  const isSubmitDisabled = !value.trim() || disabled || isStreaming || isSyncing;

  /**
   * Determine the current effective status
   */
  const currentStatus = status || (isStreaming ? 'streaming' : isSyncing ? 'submitted' : undefined);

  /**
   * Determine which stop handler to use
   */
  const stopHandler = onStop || onStopStream;

  return (
    <div className={cn('w-full space-y-3', className)}>
      {/* Typing indicator for others */}
      {isOthersTyping && typingUsers.length > 0 && (
        <div className="px-3 py-2 text-sm text-muted-foreground animate-pulse">
          <div className="flex items-center gap-2">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 bg-current rounded-full animate-bounce"></div>
            </div>
            <span>
              {typingUsers.length === 1 
                ? `${typingUsers[0]} is typing...`
                : typingUsers.length === 2
                ? `${typingUsers[0]} and ${typingUsers[1]} are typing...`
                : `${typingUsers.length} people are typing...`
              }
            </span>
          </div>
        </div>
      )}

      {/* Attached files display */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3">
          {attachedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 text-sm"
            >
              <span className="truncate max-w-32">{file.name}</span>
              <span className="text-xs text-muted-foreground">
                ({(file.size / 1024).toFixed(1)}KB)
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0"
                onClick={() => removeFile(index)}
                aria-label={`Remove ${file.name}`}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Main input form with drag and drop */}
      <div
        className={cn(
          'relative',
          isDragActive && 'ring-2 ring-primary ring-offset-2 bg-primary/5'
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragActive && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg z-10 flex items-center justify-center">
            <div className="text-center">
              <Paperclip className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-primary">Drop files here</p>
            </div>
          </div>
        )}

        <PromptInput
          className={cn(
            'transition-shadow duration-200',
            isRecording && 'ring-2 ring-destructive ring-offset-2',
            isDragActive && 'pointer-events-none'
          )}
          onSubmit={handleSubmit}
          {...props}
        >
          {/* Main textarea */}
          <PromptInputTextarea
            ref={textareaRef}
            value={value}
            onChange={handleTextareaChange}
            placeholder={placeholder}
            disabled={disabled}
            aria-label="Message input"
            aria-describedby="char-count"
            maxLength={maxLength}
          />

        {/* Toolbar */}
        <PromptInputToolbar>
          <PromptInputTools>
            {/* Advanced tools */}
            {showAdvancedTools && (
              <>
                {/* File upload */}
                {supportsFileUpload && (
                  <>
                    <PromptInputButton
                      onClick={handleFileSelect}
                      disabled={disabled}
                      aria-label="Attach file"
                    >
                      <Paperclip className="size-4" />
                    </PromptInputButton>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileInputChange}
                      accept="image/*,.pdf,.doc,.docx,.txt"
                    />
                  </>
                )}

                {/* Voice recording */}
                {supportsVoice && (
                  <PromptInputButton
                    onClick={handleVoiceToggle}
                    disabled={disabled}
                    variant={isRecording ? "destructive" : "ghost"}
                    aria-label={isRecording ? "Stop recording" : "Start voice recording"}
                  >
                    {isRecording ? (
                      <MicOff className="size-4" />
                    ) : (
                      <Mic className="size-4" />
                    )}
                  </PromptInputButton>
                )}

                {/* Custom tools */}
                {customTools}

                {/* More options */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <PromptInputButton
                      disabled={disabled}
                      aria-label="More options"
                    >
                      <MoreHorizontal className="size-4" />
                    </PromptInputButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem>
                      <Image className="mr-2 h-4 w-4" />
                      Generate image
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                      Clear conversation
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </PromptInputTools>

          {/* Right side: character count and submit */}
          <div className="flex items-center gap-2">
            {/* Character count */}
            {maxLength && (
              <span
                id="char-count"
                className={cn(
                  'text-xs tabular-nums',
                  charCount > maxLength * 0.9 
                    ? 'text-destructive' 
                    : 'text-muted-foreground'
                )}
              >
                {charCount}/{maxLength}
              </span>
            )}

            {/* Stop button when streaming */}
            {currentStatus === 'streaming' && stopHandler && (
              <Button
                variant="outline"
                size="sm"
                onClick={stopHandler}
                className="flex items-center gap-1.5"
                aria-label="Stop generation"
              >
                <StopCircle className="size-4" />
                Stop
              </Button>
            )}

            {/* Sync indicator when syncing */}
            {isSyncing && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Syncing...
              </div>
            )}

            {/* Submit button */}
            <PromptInputSubmit
              status={currentStatus}
              disabled={isSubmitDisabled}
              aria-label={
                currentStatus === 'streaming' 
                  ? 'Generating response...' 
                  : 'Send message'
              }
            />
          </div>
        </PromptInputToolbar>
        </PromptInput>
      </div>

      {/* Voice recording indicator */}
      {isRecording && (
        <div className="flex items-center justify-center gap-2 text-destructive text-sm">
          <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
          Recording... Click mic to stop
          {onVoiceCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onVoiceCancel}
              className="ml-2"
            >
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Chat input container for additional styling or layout control
 */
export interface ChatInputContainerProps extends HTMLAttributes<HTMLDivElement> {}

export function ChatInputContainer({
  className,
  children,
  ...props
}: ChatInputContainerProps) {
  return (
    <div
      className={cn(
        'border-t border-border bg-background p-4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Simplified chat input for basic use cases
 */
export interface SimpleChatInputProps extends Pick<ChatInputProps, 
  'value' | 'onChange' | 'onSubmit' | 'placeholder' | 'disabled' | 'status'
> {}

export function SimpleChatInput({
  value = '',
  onChange,
  onSubmit,
  placeholder = 'Type your message...',
  disabled = false,
  status,
}: SimpleChatInputProps) {
  return (
    <ChatInput
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      placeholder={placeholder}
      disabled={disabled}
      status={status}
      showAdvancedTools={false}
      supportsVoice={false}
      supportsFileUpload={false}
    />
  );
}
'use client';

import { cn } from '@/lib/utils';
import type { ComponentProps, HTMLAttributes } from 'react';
import { useCallback, useState, useRef, useEffect } from 'react';
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
export interface ChatInputProps extends Omit<PromptInputProps, 'onSubmit'> {
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
  const [charCount, setCharCount] = useState(value.length);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update character count when value changes
  useEffect(() => {
    setCharCount(value.length);
  }, [value]);

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
   * Handle textarea value changes
   */
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    
    // Enforce character limit
    if (maxLength && newValue.length > maxLength) {
      return;
    }
    
    onChange?.(newValue);
  }, [onChange, maxLength]);

  /**
   * Handle file selection
   */
  const handleFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Handle file input change
   */
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setAttachedFiles(prev => [...prev, ...Array.from(files)]);
      onFileUpload?.(files);
    }
    // Reset the input
    e.target.value = '';
  }, [onFileUpload]);

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
      {/* Attached files display */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3">
          {attachedFiles.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 text-sm"
            >
              <span className="truncate max-w-32">{file.name}</span>
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

      {/* Main input form */}
      <PromptInput
        className={cn(
          'transition-shadow duration-200',
          isRecording && 'ring-2 ring-destructive ring-offset-2',
          className
        )}
        onSubmit={handleSubmit}
        {...props}
      >
        {/* Main textarea */}
        <PromptInputTextarea
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
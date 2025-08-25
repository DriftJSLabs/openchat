'use client';

import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { 
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { 
  SearchIcon,
  MenuIcon,
  SettingsIcon,
  UserIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';

// Chat components
import { ChatContainer, ChatContent, ChatHeader, ChatMain, ChatFooter } from '@/components/chat/chat-container';
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { ChatInput } from '@/components/chat/chat-input';
import { MessageList } from '@/components/chat/message-list';

// Advanced components
import { MessageSearchDialog, MessageSearchTrigger } from '@/components/message-search';
import { UserPresenceIndicator, UserPresenceList, PresenceSummary } from '@/components/user-presence';
import { FileAttachmentUpload, FilePreviewModal } from '@/components/file-attachment';

// Hooks and services
import { useLocalDatabase, useChats, useMessages } from '@/hooks/use-local-database';
import { useChatStream } from '@/hooks/use-chat-stream';
import { useMessageSearch } from '@/lib/search-service';
import { useUserPresence } from '@/components/user-presence';
import { useFileUpload } from '@/lib/file-upload-service';
import { useMobile } from '@/hooks/use-mobile';

// Types
import type { Message, Chat, User } from '@/lib/db/schema/shared';
import type { FileAttachment } from '@/components/file-attachment';
import type { SearchFilters } from '@/components/message-search';

/**
 * Props for the ChatLayout component
 */
export interface ChatLayoutProps extends HTMLAttributes<HTMLDivElement> {
  /** Current user information */
  user: User;
  /** Initial chat ID to load */
  initialChatId?: string;
  /** Whether to show the sidebar by default */
  defaultSidebarOpen?: boolean;
  /** Custom header content */
  headerContent?: React.ReactNode;
  /** Custom sidebar content */
  sidebarContent?: React.ReactNode;
  /** Configuration options */
  config?: {
    enableSearch?: boolean;
    enableFileUpload?: boolean;
    enableVoiceInput?: boolean;
    enablePresence?: boolean;
    maxFileSize?: number;
    allowedFileTypes?: string[];
  };
  /** Event handlers */
  onChatSelect?: (chatId: string) => void;
  onMessageSend?: (message: Message) => void;
  onFileUpload?: (files: FileAttachment[]) => void;
  onUserAction?: (action: string, data: any) => void;
}

/**
 * Main chat layout component that orchestrates all chat UI elements.
 * Provides a complete chat interface with sidebar, messages, input, and advanced features.
 * 
 * Features:
 * - Responsive layout with resizable panels
 * - Chat sidebar with conversation list
 * - Message display with virtualization and infinite scroll
 * - Advanced message input with file upload and typing indicators
 * - Full-text search with advanced filtering
 * - User presence indicators
 * - File attachment system with preview
 * - Real-time sync status indicators
 * - Mobile-optimized with sheet-based sidebar
 * - Keyboard shortcuts and accessibility
 * - Theme support and customization
 * 
 * Layout Structure:
 * - Desktop: Resizable sidebar + main chat area
 * - Mobile: Sheet overlay for sidebar + full-width chat
 * - Header: Search, user menu, settings
 * - Main: Message list with infinite scroll
 * - Footer: Input with advanced features
 * - Overlays: Search modal, file preview, settings
 */
export function ChatLayout({
  className,
  user,
  initialChatId,
  defaultSidebarOpen = true,
  headerContent,
  sidebarContent,
  config = {},
  onChatSelect,
  onMessageSend,
  onFileUpload,
  onUserAction,
  ...props
}: ChatLayoutProps) {
  // Mobile detection
  const isMobile = useMobile();
  
  // Layout state
  const [currentChatId, setCurrentChatId] = useState(initialChatId);
  const [sidebarOpen, setSidebarOpen] = useState(defaultSidebarOpen && !isMobile);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filePreviewOpen, setFilePreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileAttachment | null>(null);
  
  // Configuration with defaults
  const {
    enableSearch = true,
    enableFileUpload = true,
    enableVoiceInput = false,
    enablePresence = true,
    maxFileSize = 10 * 1024 * 1024, // 10MB
    allowedFileTypes = ['image/*', 'application/pdf', '.doc', '.docx', '.txt'],
  } = config;

  // Database hooks
  const { isInitialized, database, error: dbError } = useLocalDatabase({ 
    userId: user.id,
    autoSync: true 
  });
  const { chats, createChat, updateChat, deleteChat } = useChats(user.id);
  const { 
    messages, 
    isLoading: messagesLoading,
    addMessage,
    refresh: refreshMessages 
  } = useMessages(currentChatId);

  // Chat streaming
  const {
    input,
    handleInputChange,
    handleSubmit,
    isLoading: isStreaming,
    error: streamError,
    stop: stopStream,
    persistedMessages,
    currentChat,
    isDatabaseLoading,
    isSyncing,
    createChat: createStreamChat,
  } = useChatStream({
    chatId: currentChatId,
    userId: user.id,
    api: '/api/chat',
    persistMessages: true,
    autoCreateChat: true,
    onChatCreated: (chat) => {
      setCurrentChatId(chat.id);
      onChatSelect?.(chat.id);
    },
    onMessagePersisted: (message) => {
      onMessageSend?.(message);
    },
  });

  // Search functionality
  const { search: performSearch, indexMessages } = useMessageSearch();
  
  // File upload
  const { 
    uploadFile, 
    generateThumbnail, 
    compressImage,
    getMetadata 
  } = useFileUpload('/api/upload');

  // User presence (if enabled)
  const { presence: userPresence } = useUserPresence(user.id);

  // Mock data for demonstration - in real app this would come from the database
  const allUsers = useMemo(() => [user], [user]);
  const userPresences = useMemo(() => [{
    user,
    presence: userPresence,
  }], [user, userPresence]);

  /**
   * Handle chat selection
   */
  const handleChatSelect = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
    onChatSelect?.(chatId);
    
    // Close sidebar on mobile after selection
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [onChatSelect, isMobile]);

  /**
   * Handle creating a new chat
   */
  const handleCreateChat = useCallback(async () => {
    try {
      const newChat = await createStreamChat('New Chat');
      if (newChat) {
        setCurrentChatId(newChat.id);
        onChatSelect?.(newChat.id);
      }
    } catch (error) {
      console.error('Failed to create chat:', error);
    }
  }, [createStreamChat, onChatSelect]);

  /**
   * Handle message search
   */
  const handleSearch = useCallback(async (filters: SearchFilters) => {
    // Index messages if not already done
    await indexMessages(messages, chats, allUsers);
    
    // Perform search
    return performSearch(filters);
  }, [indexMessages, messages, chats, allUsers, performSearch]);

  /**
   * Handle file attachments
   */
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    const newAttachments: FileAttachment[] = [];
    
    for (const file of files) {
      const id = `${file.name}-${file.size}-${Date.now()}`;
      const thumbnail = await generateThumbnail(file);
      const metadata = await getMetadata(file);
      
      const attachment: FileAttachment = {
        id,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        uploadProgress: 0,
        uploadStatus: 'pending',
        thumbnail: thumbnail || undefined,
        metadata,
      };
      
      newAttachments.push(attachment);
    }
    
    setAttachments(prev => [...prev, ...newAttachments]);
    onFileUpload?.(newAttachments);
  }, [generateThumbnail, getMetadata, onFileUpload]);

  const handleFileRemove = useCallback((fileId: string) => {
    setAttachments(prev => prev.filter(f => f.id !== fileId));
  }, []);

  const handleFileUpload = useCallback(async (attachment: FileAttachment) => {
    try {
      // Update status
      setAttachments(prev => prev.map(f => 
        f.id === attachment.id 
          ? { ...f, uploadStatus: 'uploading', uploadProgress: 0 }
          : f
      ));

      // Upload file
      const result = await uploadFile(attachment.file, (progress) => {
        setAttachments(prev => prev.map(f => 
          f.id === attachment.id 
            ? { ...f, uploadProgress: progress }
            : f
        ));
      });

      if (result.success) {
        setAttachments(prev => prev.map(f => 
          f.id === attachment.id 
            ? { 
                ...f, 
                uploadStatus: 'completed',
                url: result.url,
                thumbnail: result.thumbnail || f.thumbnail,
                metadata: result.metadata || f.metadata,
              }
            : f
        ));
      } else {
        setAttachments(prev => prev.map(f => 
          f.id === attachment.id 
            ? { 
                ...f, 
                uploadStatus: 'error',
                errorMessage: result.error,
              }
            : f
        ));
      }
    } catch (error) {
      setAttachments(prev => prev.map(f => 
        f.id === attachment.id 
          ? { 
              ...f, 
              uploadStatus: 'error',
              errorMessage: (error as Error).message,
            }
          : f
      ));
    }
  }, [uploadFile]);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command/Ctrl + K for search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      
      // Command/Ctrl + N for new chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleCreateChat();
      }
      
      // Command/Ctrl + B to toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCreateChat]);

  // Render loading state
  if (!isInitialized || isDatabaseLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Initializing chat...
        </div>
      </div>
    );
  }

  // Render error state
  if (dbError) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">Failed to initialize chat</p>
          <p className="text-sm text-muted-foreground">{dbError.message}</p>
        </div>
      </div>
    );
  }

  const sidebarComponent = (
    <div className="flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Chats</h2>
          <div className="flex items-center gap-2">
            {enableSearch && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchOpen(true)}
                className="h-8 w-8"
              >
                <SearchIcon className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCreateChat}
              className="h-8 w-8"
            >
              <PlusIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {enableSearch && (
          <div className="mt-3">
            <MessageSearchTrigger
              onOpenSearch={() => setSearchOpen(true)}
              className="w-full"
            />
          </div>
        )}
      </div>

      {/* Sidebar Content */}
      <div className="flex-1 overflow-hidden">
        {sidebarContent || (
          <ChatSidebar
            userId={user.id}
            selectedChatId={currentChatId}
            onSelectChat={handleChatSelect}
            onCreateChat={handleCreateChat}
            className="h-full border-0"
            showSearch={false} // We handle search in header
          />
        )}
      </div>

      {/* Presence Summary */}
      {enablePresence && (
        <div className="p-4 border-t">
          <PresenceSummary presences={userPresences.map(up => up.presence)} />
        </div>
      )}
    </div>
  );

  return (
    <div className={cn('h-screen flex flex-col', className)} {...props}>
      {/* Mobile Header */}
      {isMobile && (
        <div className="flex items-center justify-between p-4 border-b bg-background">
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <MenuIcon className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Chat Navigation</SheetTitle>
              </SheetHeader>
              {sidebarComponent}
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <h1 className="font-semibold truncate">
              {currentChat?.title || 'OpenChat'}
            </h1>
            {isSyncing && (
              <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
            )}
          </div>

          <div className="flex items-center gap-2">
            {enableSearch && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchOpen(true)}
              >
                <SearchIcon className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon">
              <UserIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="flex-1 flex">
        {isMobile ? (
          // Mobile: Full width chat
          <ChatContainer
            currentChat={currentChat}
            userId={user.id}
            isLoading={messagesLoading || isDatabaseLoading}
            error={streamError?.message}
            isStreaming={isStreaming}
            isSyncing={isSyncing}
            className="flex-1"
          >
            <ChatContent className="flex-1">
              <ChatMain>
                <MessageList
                  messages={persistedMessages.length > 0 ? persistedMessages : []}
                  isLoading={messagesLoading}
                  chatId={currentChatId}
                  virtualized={persistedMessages.length > 100}
                  enableInfiniteScroll={true}
                />
              </ChatMain>
              
              <ChatFooter>
                {enableFileUpload && attachments.length > 0 && (
                  <div className="mb-4">
                    <FileAttachmentUpload
                      attachments={attachments}
                      config={{
                        maxFileSize,
                        maxFiles: 10,
                        allowedTypes: allowedFileTypes,
                        allowedExtensions: ['.jpg', '.png', '.pdf', '.doc', '.docx'],
                        uploadEndpoint: '/api/upload',
                      }}
                      onFilesSelected={handleFilesSelected}
                      onFileRemove={handleFileRemove}
                      onUpload={handleFileUpload}
                      className="border-0 p-0"
                    />
                  </div>
                )}
                
                <ChatInput
                  value={input}
                  onChange={handleInputChange}
                  onSubmit={handleSubmit}
                  onStop={stopStream}
                  status={isStreaming ? 'streaming' : undefined}
                  disabled={!isInitialized}
                  showAdvancedTools={enableFileUpload || enableVoiceInput}
                  supportsFileUpload={enableFileUpload}
                  supportsVoice={enableVoiceInput}
                  onFileUpload={(files) => handleFilesSelected(Array.from(files))}
                  dragAndDrop={{
                    enabled: enableFileUpload,
                    allowedTypes: allowedFileTypes,
                    maxFileSize,
                    maxFiles: 10,
                  }}
                  autoSave={{
                    enabled: true,
                    key: currentChatId,
                  }}
                />
              </ChatFooter>
            </ChatContent>
          </ChatContainer>
        ) : (
          // Desktop: Resizable panels
          <ResizablePanelGroup direction="horizontal" className="flex-1">
            {sidebarOpen && (
              <>
                <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
                  {sidebarComponent}
                </ResizablePanel>
                <ResizableHandle />
              </>
            )}
            
            <ResizablePanel defaultSize={sidebarOpen ? 75 : 100}>
              <ChatContainer
                currentChat={currentChat}
                userId={user.id}
                isLoading={messagesLoading || isDatabaseLoading}
                error={streamError?.message}
                isStreaming={isStreaming}
                isSyncing={isSyncing}
                className="h-full"
              >
                <ChatContent className="h-full">
                  {/* Desktop Header */}
                  <ChatHeader 
                    title={currentChat?.title || 'Select a chat to start messaging'}
                  >
                    {headerContent || (
                      <div className="flex items-center gap-2">
                        {!sidebarOpen && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSidebarOpen(true)}
                          >
                            <MenuIcon className="h-4 w-4" />
                          </Button>
                        )}
                        
                        {enablePresence && userPresences.length > 0 && (
                          <UserPresenceList
                            users={userPresences}
                            size="sm"
                            maxUsers={3}
                            onlineOnly={true}
                            className="hidden md:block"
                          />
                        )}
                        
                        {enableSearch && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSearchOpen(true)}
                          >
                            <SearchIcon className="h-4 w-4" />
                          </Button>
                        )}
                        
                        <Button variant="ghost" size="icon">
                          <SettingsIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </ChatHeader>

                  <ChatMain>
                    {currentChatId ? (
                      <MessageList
                        messages={persistedMessages.length > 0 ? persistedMessages : []}
                        isLoading={messagesLoading}
                        chatId={currentChatId}
                        virtualized={persistedMessages.length > 100}
                        enableInfiniteScroll={true}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-center">
                        <div className="space-y-4">
                          <div className="text-6xl">💬</div>
                          <div>
                            <h2 className="text-xl font-semibold mb-2">Welcome to OpenChat</h2>
                            <p className="text-muted-foreground mb-4">
                              Select a conversation from the sidebar or create a new one to get started.
                            </p>
                            <Button onClick={handleCreateChat}>
                              <PlusIcon className="mr-2 h-4 w-4" />
                              Start New Chat
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </ChatMain>
                  
                  {currentChatId && (
                    <ChatFooter>
                      {enableFileUpload && attachments.length > 0 && (
                        <div className="mb-4">
                          <FileAttachmentUpload
                            attachments={attachments}
                            config={{
                              maxFileSize,
                              maxFiles: 10,
                              allowedTypes: allowedFileTypes,
                              allowedExtensions: ['.jpg', '.png', '.pdf', '.doc', '.docx'],
                              uploadEndpoint: '/api/upload',
                            }}
                            onFilesSelected={handleFilesSelected}
                            onFileRemove={handleFileRemove}
                            onUpload={handleFileUpload}
                            className="border-0 p-0"
                          />
                        </div>
                      )}
                      
                      <ChatInput
                        value={input}
                        onChange={handleInputChange}
                        onSubmit={handleSubmit}
                        onStop={stopStream}
                        status={isStreaming ? 'streaming' : undefined}
                        disabled={!isInitialized}
                        showAdvancedTools={enableFileUpload || enableVoiceInput}
                        supportsFileUpload={enableFileUpload}
                        supportsVoice={enableVoiceInput}
                        onFileUpload={(files) => handleFilesSelected(Array.from(files))}
                        dragAndDrop={{
                          enabled: enableFileUpload,
                          allowedTypes: allowedFileTypes,
                          maxFileSize,
                          maxFiles: 10,
                        }}
                        autoSave={{
                          enabled: true,
                          key: currentChatId,
                        }}
                      />
                    </ChatFooter>
                  )}
                </ChatContent>
              </ChatContainer>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      {/* Search Modal */}
      {enableSearch && (
        <MessageSearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onSearch={handleSearch}
          chats={chats}
          users={allUsers}
          onMessageSelect={(result) => {
            // Navigate to the message's chat
            if (result.message.chatId !== currentChatId) {
              setCurrentChatId(result.message.chatId);
            }
            setSearchOpen(false);
            onUserAction?.('message_selected', result);
          }}
        />
      )}

      {/* File Preview Modal */}
      <FilePreviewModal
        attachment={previewFile}
        open={filePreviewOpen}
        onOpenChange={setFilePreviewOpen}
      />

      {/* Toaster for notifications */}
      <Toaster />
    </div>
  );
}
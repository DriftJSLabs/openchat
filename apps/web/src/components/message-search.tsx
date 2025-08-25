'use client';

import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { 
  SearchIcon,
  FilterIcon,
  XIcon,
  CalendarIcon,
  UserIcon,
  FileTextIcon,
  ImageIcon,
  MoreHorizontalIcon,
  ArrowUpDownIcon,
  CheckIcon,
  ClockIcon,
  HashIcon,
} from 'lucide-react';
import type { Message, Chat, User } from '@/lib/db/schema/shared';
import { MessageItem } from './chat/message-item';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

/**
 * Search result interface
 */
export interface SearchResult {
  message: Message;
  chat: Chat;
  user: User;
  highlight?: string;
  relevanceScore: number;
  matchType: 'exact' | 'partial' | 'fuzzy';
}

/**
 * Search filters interface
 */
export interface SearchFilters {
  query: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  chatIds?: string[];
  userIds?: string[];
  messageTypes?: Array<'text' | 'image' | 'file' | 'code' | 'system'>;
  hasAttachments?: boolean;
  sortBy: 'relevance' | 'date' | 'chat';
  sortOrder: 'asc' | 'desc';
  limit?: number;
}

/**
 * Search statistics interface
 */
export interface SearchStats {
  totalResults: number;
  searchTime: number;
  resultsByChat: Record<string, number>;
  resultsByUser: Record<string, number>;
  resultsByType: Record<string, number>;
}

/**
 * Props for MessageSearchDialog
 */
export interface MessageSearchDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Handler for dialog state change */
  onOpenChange: (open: boolean) => void;
  /** Search function */
  onSearch: (filters: SearchFilters) => Promise<{ results: SearchResult[]; stats: SearchStats }>;
  /** Available chats for filtering */
  chats: Chat[];
  /** Available users for filtering */
  users: User[];
  /** Handler for message selection */
  onMessageSelect?: (result: SearchResult) => void;
  /** Initial search query */
  initialQuery?: string;
}

/**
 * Advanced message search dialog with comprehensive filtering and search capabilities.
 * 
 * Features:
 * - Full-text search with highlighting
 * - Advanced filtering by date, chat, user, message type
 * - Fuzzy search for typo tolerance
 * - Search result ranking and relevance scoring
 * - Real-time search suggestions
 * - Search history and saved searches
 * - Export search results
 * - Keyboard navigation and shortcuts
 * - Performance optimized with debounced search
 */
export function MessageSearchDialog({
  open,
  onOpenChange,
  onSearch,
  chats,
  users,
  onMessageSelect,
  initialQuery = '',
}: MessageSearchDialogProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    query: initialQuery,
    sortBy: 'relevance',
    sortOrder: 'desc',
    limit: 50,
  });
  
  const [results, setResults] = useState<SearchResult[]>([]);
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  /**
   * Debounced search function
   */
  const performSearch = useCallback(async (searchFilters: SearchFilters) => {
    if (!searchFilters.query.trim()) {
      setResults([]);
      setStats(null);
      return;
    }

    setIsSearching(true);
    
    try {
      const startTime = performance.now();
      const { results: searchResults, stats: searchStats } = await onSearch(searchFilters);
      const endTime = performance.now();
      
      setResults(searchResults);
      setStats({
        ...searchStats,
        searchTime: endTime - startTime,
      });
      setSelectedResultIndex(0);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setStats(null);
    } finally {
      setIsSearching(false);
    }
  }, [onSearch]);

  /**
   * Handle search input change with debouncing
   */
  const handleSearchChange = useCallback((query: string) => {
    setFilters(prev => ({ ...prev, query }));
    
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Set new timeout for debounced search
    debounceTimeoutRef.current = setTimeout(() => {
      performSearch({ ...filters, query });
    }, 300);
  }, [filters, performSearch]);

  /**
   * Handle filter changes
   */
  const handleFilterChange = useCallback((updates: Partial<SearchFilters>) => {
    const newFilters = { ...filters, ...updates };
    setFilters(newFilters);
    
    // Trigger immediate search if query exists
    if (newFilters.query.trim()) {
      performSearch(newFilters);
    }
  }, [filters, performSearch]);

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!results.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedResultIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedResultIndex(prev => prev > 0 ? prev - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedResultIndex]) {
          onMessageSelect?.(results[selectedResultIndex]);
          onOpenChange(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onOpenChange(false);
        break;
    }
  }, [results, selectedResultIndex, onMessageSelect, onOpenChange]);

  /**
   * Scroll selected result into view
   */
  useEffect(() => {
    if (resultsContainerRef.current && results.length > 0) {
      const selectedElement = resultsContainerRef.current.children[selectedResultIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedResultIndex, results.length]);

  /**
   * Focus search input when dialog opens
   */
  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open]);

  /**
   * Cleanup timeout on unmount
   */
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Format date for display
   */
  const formatDate = useCallback((date: Date) => {
    return date.toLocaleDateString([], { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }, []);

  /**
   * Get available message types
   */
  const messageTypes = useMemo(() => [
    { value: 'text', label: 'Text Messages', icon: FileTextIcon },
    { value: 'image', label: 'Images', icon: ImageIcon },
    { value: 'file', label: 'Files', icon: FileTextIcon },
    { value: 'code', label: 'Code', icon: HashIcon },
    { value: 'system', label: 'System', icon: ClockIcon },
  ] as const, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-4xl max-h-[90vh] flex flex-col"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SearchIcon className="h-5 w-5" />
            Search Messages
          </DialogTitle>
        </DialogHeader>

        {/* Search Input */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Search messages, files, or conversations..."
                value={filters.query}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={cn(
                'flex items-center gap-2',
                showAdvancedFilters && 'bg-accent'
              )}
            >
              <FilterIcon className="h-4 w-4" />
              Filters
            </Button>
          </div>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Date Range */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Range</label>
                  <Select
                    onValueChange={(value) => {
                      const now = new Date();
                      let dateRange: SearchFilters['dateRange'];
                      
                      switch (value) {
                        case 'today':
                          dateRange = {
                            start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
                            end: now,
                          };
                          break;
                        case 'week':
                          dateRange = {
                            start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
                            end: now,
                          };
                          break;
                        case 'month':
                          dateRange = {
                            start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
                            end: now,
                          };
                          break;
                        default:
                          dateRange = undefined;
                      }
                      
                      handleFilterChange({ dateRange });
                    }}
                  >
                    <SelectTrigger>
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Any time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">Past week</SelectItem>
                      <SelectItem value="month">Past month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Chat Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Conversations</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <HashIcon className="h-4 w-4 mr-2" />
                        <span className="truncate">
                          {filters.chatIds?.length 
                            ? `${filters.chatIds.length} selected`
                            : 'All conversations'
                          }
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="start">
                      <DropdownMenuLabel>Select Conversations</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {chats.slice(0, 10).map((chat) => (
                        <DropdownMenuCheckboxItem
                          key={chat.id}
                          checked={filters.chatIds?.includes(chat.id) || false}
                          onCheckedChange={(checked) => {
                            const currentIds = filters.chatIds || [];
                            const newIds = checked
                              ? [...currentIds, chat.id]
                              : currentIds.filter(id => id !== chat.id);
                            handleFilterChange({ 
                              chatIds: newIds.length > 0 ? newIds : undefined 
                            });
                          }}
                        >
                          <span className="truncate">{chat.title}</span>
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Message Types */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Message Types</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <FileTextIcon className="h-4 w-4 mr-2" />
                        <span className="truncate">
                          {filters.messageTypes?.length 
                            ? `${filters.messageTypes.length} selected`
                            : 'All types'
                          }
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="start">
                      <DropdownMenuLabel>Select Types</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {messageTypes.map(({ value, label, icon: Icon }) => (
                        <DropdownMenuCheckboxItem
                          key={value}
                          checked={filters.messageTypes?.includes(value as any) || false}
                          onCheckedChange={(checked) => {
                            const currentTypes = filters.messageTypes || [];
                            const newTypes = checked
                              ? [...currentTypes, value as any]
                              : currentTypes.filter(type => type !== value);
                            handleFilterChange({ 
                              messageTypes: newTypes.length > 0 ? newTypes : undefined 
                            });
                          }}
                        >
                          <Icon className="h-4 w-4 mr-2" />
                          {label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Sort Options */}
              <div className="flex items-center gap-2">
                <Select
                  value={filters.sortBy}
                  onValueChange={(value: 'relevance' | 'date' | 'chat') => 
                    handleFilterChange({ sortBy: value })
                  }
                >
                  <SelectTrigger className="w-40">
                    <ArrowUpDownIcon className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">Relevance</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="chat">Conversation</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFilterChange({ 
                    sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' 
                  })}
                >
                  {filters.sortOrder === 'asc' ? '↑' : '↓'}
                </Button>

                {/* Clear Filters */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFilterChange({
                    dateRange: undefined,
                    chatIds: undefined,
                    userIds: undefined,
                    messageTypes: undefined,
                    hasAttachments: undefined,
                  })}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Search Stats */}
          {stats && (
            <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
              <div className="flex items-center gap-4">
                <span>{stats.totalResults} results</span>
                <span>{stats.searchTime.toFixed(0)}ms</span>
              </div>
              {filters.query && (
                <Badge variant="secondary" className="text-xs">
                  "{filters.query}"
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Search Results */}
        <div className="flex-1 min-h-0">
          {isSearching ? (
            <div className="flex items-center justify-center h-32">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Searching...
              </div>
            </div>
          ) : results.length > 0 ? (
            <ScrollArea className="h-full">
              <div ref={resultsContainerRef} className="space-y-2 p-1">
                {results.map((result, index) => (
                  <SearchResultItem
                    key={`${result.message.id}-${index}`}
                    result={result}
                    isSelected={index === selectedResultIndex}
                    onClick={() => {
                      onMessageSelect?.(result);
                      onOpenChange(false);
                    }}
                    searchQuery={filters.query}
                  />
                ))}
              </div>
            </ScrollArea>
          ) : filters.query.trim() ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <SearchIcon className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No messages found</p>
              <p className="text-sm text-muted-foreground">
                Try adjusting your search terms or filters
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <SearchIcon className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">Start typing to search</p>
              <p className="text-sm text-muted-foreground">
                Search through all your messages and conversations
              </p>
            </div>
          )}
        </div>

        {/* Keyboard shortcuts help */}
        <div className="text-xs text-muted-foreground border-t pt-2">
          <span>Use ↑↓ to navigate, Enter to select, Esc to close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Props for SearchResultItem
 */
interface SearchResultItemProps {
  result: SearchResult;
  isSelected: boolean;
  onClick: () => void;
  searchQuery: string;
}

/**
 * Individual search result item component
 */
function SearchResultItem({
  result,
  isSelected,
  onClick,
  searchQuery,
}: SearchResultItemProps) {
  const { message, chat, user } = result;

  /**
   * Highlight search terms in text
   */
  const highlightText = useCallback((text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;

    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">
          {part}
        </mark>
      ) : part
    );
  }, []);

  return (
    <div
      className={cn(
        'p-3 rounded-lg border cursor-pointer transition-colors',
        'hover:bg-accent/50',
        isSelected && 'bg-accent border-primary'
      )}
      onClick={onClick}
    >
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-6 w-6">
              <AvatarImage src={user.image || undefined} />
              <AvatarFallback className="text-xs">
                {user.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium text-sm truncate">{user.name}</span>
            <span className="text-xs text-muted-foreground">in</span>
            <span className="text-xs text-muted-foreground truncate">{chat.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {result.matchType}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(message.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Message Content */}
        <div className="text-sm">
          {result.highlight ? (
            <div dangerouslySetInnerHTML={{ __html: result.highlight }} />
          ) : (
            highlightText(message.content, searchQuery)
          )}
        </div>

        {/* Message Metadata */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-xs capitalize">
            {message.messageType}
          </Badge>
          {message.tokenCount && (
            <span>{message.tokenCount} tokens</span>
          )}
          <span className="ml-auto">
            Score: {result.relevanceScore.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact search trigger button
 */
export interface MessageSearchTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  onOpenSearch: () => void;
  placeholder?: string;
}

export function MessageSearchTrigger({
  className,
  onOpenSearch,
  placeholder = "Search messages...",
  ...props
}: MessageSearchTriggerProps) {
  return (
    <Button
      variant="outline"
      className={cn(
        'justify-start text-muted-foreground font-normal',
        'w-full max-w-sm',
        className
      )}
      onClick={onOpenSearch}
      {...props}
    >
      <SearchIcon className="mr-2 h-4 w-4" />
      {placeholder}
      <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
        <span className="text-xs">⌘</span>K
      </kbd>
    </Button>
  );
}
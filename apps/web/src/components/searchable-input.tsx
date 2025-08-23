/**
 * Searchable Input Component
 * 
 * Enhanced input component with real-time search capabilities,
 * keyboard navigation, and customizable filtering options.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SearchableInputProps {
  placeholder?: string;
  className?: string;
  onSearch?: (query: string) => void;
  onClear?: () => void;
  debounceMs?: number;
  showClearButton?: boolean;
  autoFocus?: boolean;
}

/**
 * Searchable input component with debouncing and keyboard navigation
 * 
 * @param placeholder - Input placeholder text
 * @param className - Additional CSS classes
 * @param onSearch - Callback fired when search query changes
 * @param onClear - Callback fired when search is cleared
 * @param debounceMs - Debounce delay in milliseconds
 * @param showClearButton - Whether to show clear button
 * @param autoFocus - Whether to auto-focus the input
 */
export function SearchableInput({
  placeholder = "Search...",
  className,
  onSearch,
  onClear,
  debounceMs = 300,
  showClearButton = true,
  autoFocus = false,
}: SearchableInputProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Auto-focus on mount if requested
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Debounced search effect
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      onSearch?.(query);
    }, debounceMs);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, onSearch, debounceMs]);

  const handleClear = () => {
    setQuery('');
    onClear?.();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle Escape to clear
    if (e.key === 'Escape') {
      if (query) {
        handleClear();
      } else {
        inputRef.current?.blur();
      }
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        {/* Search Icon */}
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        
        {/* Input Field */}
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          className={cn(
            "pl-10",
            showClearButton && query && "pr-10",
            isFocused && "ring-2 ring-primary/20"
          )}
        />
        
        {/* Clear Button */}
        {showClearButton && query && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted/80"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Focus Ring Animation */}
      {isFocused && (
        <div className="absolute inset-0 rounded-md ring-2 ring-primary/20 pointer-events-none animate-in fade-in-0 duration-200" />
      )}
    </div>
  );
}

/**
 * Advanced searchable input with suggestions
 */
interface SearchWithSuggestionsProps extends SearchableInputProps {
  suggestions?: string[];
  onSuggestionSelect?: (suggestion: string) => void;
  maxSuggestions?: number;
}

export function SearchWithSuggestions({
  suggestions = [],
  onSuggestionSelect,
  maxSuggestions = 5,
  ...props
}: SearchWithSuggestionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [query, setQuery] = useState('');

  // Filter suggestions based on query
  const filteredSuggestions = suggestions
    .filter(suggestion => 
      suggestion.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, maxSuggestions);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filteredSuggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredSuggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredSuggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          const suggestion = filteredSuggestions[selectedIndex];
          onSuggestionSelect?.(suggestion);
          setQuery(suggestion);
          setIsOpen(false);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    onSuggestionSelect?.(suggestion);
    setQuery(suggestion);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <SearchableInput
        {...props}
        onSearch={(searchQuery) => {
          setQuery(searchQuery);
          setIsOpen(searchQuery.length > 0);
          setSelectedIndex(-1);
          props.onSearch?.(searchQuery);
        }}
        onKeyDown={handleKeyDown}
      />

      {/* Suggestions Dropdown */}
      {isOpen && filteredSuggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              onClick={() => handleSuggestionClick(suggestion)}
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors",
                index === selectedIndex && "bg-muted"
              )}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Search input with recent searches
 */
interface SearchWithHistoryProps extends SearchableInputProps {
  maxHistory?: number;
  storageKey?: string;
}

export function SearchWithHistory({
  maxHistory = 5,
  storageKey = 'search-history',
  ...props
}: SearchWithHistoryProps) {
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load search history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
  }, [storageKey]);

  // Save search history to localStorage
  const saveToHistory = (query: string) => {
    if (!query.trim()) return;

    const newHistory = [
      query,
      ...history.filter(item => item !== query)
    ].slice(0, maxHistory);

    setHistory(newHistory);
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(newHistory));
    } catch (error) {
      console.error('Failed to save search history:', error);
    }
  };

  const handleSearch = (query: string) => {
    if (query.trim()) {
      saveToHistory(query);
    }
    props.onSearch?.(query);
  };

  return (
    <div className="relative">
      <SearchableInput
        {...props}
        onSearch={handleSearch}
        onFocus={() => setShowHistory(true)}
        onBlur={() => setTimeout(() => setShowHistory(false), 200)}
      />

      {/* Search History Dropdown */}
      {showHistory && history.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-50">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
            Recent searches
          </div>
          {history.map((item, index) => (
            <button
              key={index}
              onClick={() => handleSearch(item)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors flex items-center gap-2"
            >
              <Search className="h-3 w-3 text-muted-foreground" />
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
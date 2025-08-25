import type { Message, Chat, User } from '@/lib/db/schema/shared';
import type { SearchResult, SearchFilters, SearchStats } from '@/components/message-search';

/**
 * Search index entry for efficient searching
 */
interface SearchIndexEntry {
  messageId: string;
  content: string;
  tokens: string[];
  chatId: string;
  userId: string;
  messageType: string;
  createdAt: number;
  hasAttachments: boolean;
}

/**
 * Search configuration
 */
interface SearchConfig {
  maxResults: number;
  fuzzyThreshold: number;
  minQueryLength: number;
  highlightLength: number;
  stopWords: string[];
  stemming: boolean;
}

/**
 * Full-text search service with advanced features
 */
export class MessageSearchService {
  private searchIndex = new Map<string, SearchIndexEntry>();
  private tokenIndex = new Map<string, Set<string>>(); // token -> messageIds
  private config: SearchConfig;
  
  // Caches
  private messagesCache = new Map<string, Message>();
  private chatsCache = new Map<string, Chat>();
  private usersCache = new Map<string, User>();
  
  // Search statistics
  private searchStats = {
    totalSearches: 0,
    averageSearchTime: 0,
    mostSearchedTerms: new Map<string, number>(),
  };

  constructor(config?: Partial<SearchConfig>) {
    this.config = {
      maxResults: 100,
      fuzzyThreshold: 0.8,
      minQueryLength: 2,
      highlightLength: 200,
      stopWords: [
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
        'before', 'after', 'above', 'below', 'between', 'among', 'under', 'over',
        'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
        'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
      ],
      stemming: true,
      ...config,
    };
  }

  /**
   * Index messages for search
   */
  async indexMessages(messages: Message[], chats: Chat[], users: User[]): Promise<void> {
    // Clear existing indexes
    this.searchIndex.clear();
    this.tokenIndex.clear();
    
    // Update caches
    messages.forEach(message => this.messagesCache.set(message.id, message));
    chats.forEach(chat => this.chatsCache.set(chat.id, chat));
    users.forEach(user => this.usersCache.set(user.id, user));

    // Index each message
    messages.forEach(message => {
      this.indexMessage(message);
    });
  }

  /**
   * Index a single message
   */
  private indexMessage(message: Message): void {
    const tokens = this.tokenizeText(message.content);
    const hasAttachments = message.messageType !== 'text';
    
    const indexEntry: SearchIndexEntry = {
      messageId: message.id,
      content: message.content,
      tokens,
      chatId: message.chatId,
      userId: message.chatId, // This should be mapped from message to user
      messageType: message.messageType,
      createdAt: typeof message.createdAt === 'number' 
        ? message.createdAt 
        : new Date(message.createdAt).getTime(),
      hasAttachments,
    };

    this.searchIndex.set(message.id, indexEntry);

    // Add to token index
    tokens.forEach(token => {
      if (!this.tokenIndex.has(token)) {
        this.tokenIndex.set(token, new Set());
      }
      this.tokenIndex.get(token)!.add(message.id);
    });
  }

  /**
   * Perform search with filters
   */
  async search(filters: SearchFilters): Promise<{ results: SearchResult[]; stats: SearchStats }> {
    const startTime = performance.now();
    
    if (filters.query.length < this.config.minQueryLength) {
      return {
        results: [],
        stats: this.createEmptyStats(performance.now() - startTime),
      };
    }

    // Track search
    this.searchStats.totalSearches++;
    this.trackSearchTerm(filters.query);

    // Get matching message IDs
    const matchingIds = await this.findMatchingMessages(filters);
    
    // Score and rank results
    const scoredResults = await this.scoreAndRankResults(matchingIds, filters);
    
    // Apply limit
    const limitedResults = scoredResults.slice(0, filters.limit || this.config.maxResults);
    
    // Build search results
    const results: SearchResult[] = [];
    for (const { messageId, score, matchType } of limitedResults) {
      const result = await this.buildSearchResult(messageId, score, matchType, filters.query);
      if (result) {
        results.push(result);
      }
    }

    const endTime = performance.now();
    const searchTime = endTime - startTime;

    // Update average search time
    const totalTime = this.searchStats.averageSearchTime * (this.searchStats.totalSearches - 1) + searchTime;
    this.searchStats.averageSearchTime = totalTime / this.searchStats.totalSearches;

    return {
      results,
      stats: this.createSearchStats(results, searchTime),
    };
  }

  /**
   * Find matching messages based on filters
   */
  private async findMatchingMessages(filters: SearchFilters): Promise<Set<string>> {
    const queryTokens = this.tokenizeText(filters.query);
    const matchingIds = new Set<string>();

    // Exact and partial matches
    for (const token of queryTokens) {
      // Exact matches
      if (this.tokenIndex.has(token)) {
        this.tokenIndex.get(token)!.forEach(id => matchingIds.add(id));
      }

      // Partial matches
      for (const [indexToken, messageIds] of this.tokenIndex.entries()) {
        if (indexToken.includes(token) || token.includes(indexToken)) {
          messageIds.forEach(id => matchingIds.add(id));
        }
      }
    }

    // Fuzzy matches
    if (matchingIds.size < 10) {
      for (const [indexToken, messageIds] of this.tokenIndex.entries()) {
        for (const queryToken of queryTokens) {
          if (this.calculateSimilarity(queryToken, indexToken) > this.config.fuzzyThreshold) {
            messageIds.forEach(id => matchingIds.add(id));
          }
        }
      }
    }

    // Apply filters
    const filteredIds = new Set<string>();
    for (const messageId of matchingIds) {
      const entry = this.searchIndex.get(messageId);
      if (entry && this.matchesFilters(entry, filters)) {
        filteredIds.add(messageId);
      }
    }

    return filteredIds;
  }

  /**
   * Check if message matches filters
   */
  private matchesFilters(entry: SearchIndexEntry, filters: SearchFilters): boolean {
    // Date range filter
    if (filters.dateRange) {
      const messageDate = entry.createdAt;
      if (messageDate < filters.dateRange.start.getTime() || 
          messageDate > filters.dateRange.end.getTime()) {
        return false;
      }
    }

    // Chat filter
    if (filters.chatIds && !filters.chatIds.includes(entry.chatId)) {
      return false;
    }

    // User filter
    if (filters.userIds && !filters.userIds.includes(entry.userId)) {
      return false;
    }

    // Message type filter
    if (filters.messageTypes && !filters.messageTypes.includes(entry.messageType as any)) {
      return false;
    }

    // Attachments filter
    if (filters.hasAttachments !== undefined && 
        entry.hasAttachments !== filters.hasAttachments) {
      return false;
    }

    return true;
  }

  /**
   * Score and rank search results
   */
  private async scoreAndRankResults(
    messageIds: Set<string>, 
    filters: SearchFilters
  ): Promise<Array<{ messageId: string; score: number; matchType: 'exact' | 'partial' | 'fuzzy' }>> {
    const queryTokens = this.tokenizeText(filters.query);
    const results: Array<{ messageId: string; score: number; matchType: 'exact' | 'partial' | 'fuzzy' }> = [];

    for (const messageId of messageIds) {
      const entry = this.searchIndex.get(messageId);
      if (!entry) continue;

      let score = 0;
      let matchType: 'exact' | 'partial' | 'fuzzy' = 'fuzzy';

      // Calculate relevance score
      for (const queryToken of queryTokens) {
        for (const contentToken of entry.tokens) {
          if (queryToken === contentToken) {
            score += 10; // Exact match
            matchType = 'exact';
          } else if (contentToken.includes(queryToken) || queryToken.includes(contentToken)) {
            score += 5; // Partial match
            if (matchType === 'fuzzy') matchType = 'partial';
          } else {
            const similarity = this.calculateSimilarity(queryToken, contentToken);
            if (similarity > this.config.fuzzyThreshold) {
              score += similarity * 2; // Fuzzy match
            }
          }
        }
      }

      // Boost score based on recency
      const ageInDays = (Date.now() - entry.createdAt) / (1000 * 60 * 60 * 24);
      score *= Math.max(0.1, 1 - (ageInDays / 365)); // Decay over a year

      // Boost score based on message type
      if (entry.messageType === 'text') score *= 1.2;
      if (entry.messageType === 'code') score *= 1.1;

      results.push({ messageId, score, matchType });
    }

    // Sort by score and relevance
    results.sort((a, b) => {
      if (filters.sortBy === 'relevance') {
        return b.score - a.score;
      } else if (filters.sortBy === 'date') {
        const entryA = this.searchIndex.get(a.messageId);
        const entryB = this.searchIndex.get(b.messageId);
        if (!entryA || !entryB) return 0;
        
        return filters.sortOrder === 'desc' 
          ? entryB.createdAt - entryA.createdAt
          : entryA.createdAt - entryB.createdAt;
      } else {
        // Sort by chat
        const entryA = this.searchIndex.get(a.messageId);
        const entryB = this.searchIndex.get(b.messageId);
        if (!entryA || !entryB) return 0;
        
        return entryA.chatId.localeCompare(entryB.chatId);
      }
    });

    return results;
  }

  /**
   * Build a complete search result
   */
  private async buildSearchResult(
    messageId: string,
    score: number,
    matchType: 'exact' | 'partial' | 'fuzzy',
    query: string
  ): Promise<SearchResult | null> {
    const message = this.messagesCache.get(messageId);
    if (!message) return null;

    const chat = this.chatsCache.get(message.chatId);
    if (!chat) return null;

    // Find user (this is simplified - you'd need proper user mapping)
    const user = Array.from(this.usersCache.values())[0];
    if (!user) return null;

    // Generate highlight
    const highlight = this.generateHighlight(message.content, query);

    return {
      message,
      chat,
      user,
      highlight,
      relevanceScore: score,
      matchType,
    };
  }

  /**
   * Generate search highlight
   */
  private generateHighlight(content: string, query: string): string {
    const queryTokens = this.tokenizeText(query);
    let highlight = content;
    
    // Find the best match position
    let bestPosition = 0;
    let bestScore = 0;
    
    for (let i = 0; i < content.length - this.config.highlightLength; i++) {
      const snippet = content.slice(i, i + this.config.highlightLength);
      let score = 0;
      
      for (const token of queryTokens) {
        const regex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = snippet.match(regex);
        score += matches ? matches.length : 0;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestPosition = i;
      }
    }
    
    // Extract snippet
    let snippet = content.slice(bestPosition, bestPosition + this.config.highlightLength);
    
    // Add ellipsis if needed
    if (bestPosition > 0) snippet = '...' + snippet;
    if (bestPosition + this.config.highlightLength < content.length) snippet += '...';
    
    // Highlight query terms
    for (const token of queryTokens) {
      const regex = new RegExp(`(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      snippet = snippet.replace(regex, '<mark>$1</mark>');
    }
    
    return snippet;
  }

  /**
   * Tokenize text for indexing and searching
   */
  private tokenizeText(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => 
        token.length > 1 && 
        !this.config.stopWords.includes(token)
      )
      .map(token => this.config.stemming ? this.stemWord(token) : token);
  }

  /**
   * Simple stemming algorithm
   */
  private stemWord(word: string): string {
    // Very basic stemming - in production you'd use a proper stemming library
    if (word.endsWith('ing')) return word.slice(0, -3);
    if (word.endsWith('ed')) return word.slice(0, -2);
    if (word.endsWith('er')) return word.slice(0, -2);
    if (word.endsWith('est')) return word.slice(0, -3);
    if (word.endsWith('ly')) return word.slice(0, -2);
    if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
    return word;
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    const maxLength = Math.max(str1.length, str2.length);
    return (maxLength - matrix[str2.length][str1.length]) / maxLength;
  }

  /**
   * Track search terms for analytics
   */
  private trackSearchTerm(term: string): void {
    const currentCount = this.searchStats.mostSearchedTerms.get(term) || 0;
    this.searchStats.mostSearchedTerms.set(term, currentCount + 1);
    
    // Keep only top 100 terms
    if (this.searchStats.mostSearchedTerms.size > 100) {
      const entries = Array.from(this.searchStats.mostSearchedTerms.entries());
      entries.sort((a, b) => b[1] - a[1]);
      this.searchStats.mostSearchedTerms = new Map(entries.slice(0, 100));
    }
  }

  /**
   * Create search statistics
   */
  private createSearchStats(results: SearchResult[], searchTime: number): SearchStats {
    const resultsByChat: Record<string, number> = {};
    const resultsByUser: Record<string, number> = {};
    const resultsByType: Record<string, number> = {};

    results.forEach(result => {
      resultsByChat[result.chat.id] = (resultsByChat[result.chat.id] || 0) + 1;
      resultsByUser[result.user.id] = (resultsByUser[result.user.id] || 0) + 1;
      resultsByType[result.message.messageType] = (resultsByType[result.message.messageType] || 0) + 1;
    });

    return {
      totalResults: results.length,
      searchTime,
      resultsByChat,
      resultsByUser,
      resultsByType,
    };
  }

  /**
   * Create empty search stats
   */
  private createEmptyStats(searchTime: number): SearchStats {
    return {
      totalResults: 0,
      searchTime,
      resultsByChat: {},
      resultsByUser: {},
      resultsByType: {},
    };
  }

  /**
   * Get search analytics
   */
  getAnalytics() {
    return {
      totalSearches: this.searchStats.totalSearches,
      averageSearchTime: this.searchStats.averageSearchTime,
      topSearchTerms: Array.from(this.searchStats.mostSearchedTerms.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      indexSize: this.searchIndex.size,
      tokenIndexSize: this.tokenIndex.size,
    };
  }

  /**
   * Clear the search index
   */
  clearIndex(): void {
    this.searchIndex.clear();
    this.tokenIndex.clear();
    this.messagesCache.clear();
    this.chatsCache.clear();
    this.usersCache.clear();
  }
}

/**
 * Default search service instance
 */
let defaultSearchService: MessageSearchService | null = null;

/**
 * Get or create the default search service
 */
export function getSearchService(config?: Partial<SearchConfig>): MessageSearchService {
  if (!defaultSearchService) {
    defaultSearchService = new MessageSearchService(config);
  }
  return defaultSearchService;
}

/**
 * React hook for search functionality
 */
export function useMessageSearch(config?: Partial<SearchConfig>) {
  const searchService = getSearchService(config);

  const search = async (filters: SearchFilters) => {
    return searchService.search(filters);
  };

  const indexMessages = async (messages: Message[], chats: Chat[], users: User[]) => {
    return searchService.indexMessages(messages, chats, users);
  };

  const getAnalytics = () => {
    return searchService.getAnalytics();
  };

  return {
    search,
    indexMessages,
    getAnalytics,
  };
}
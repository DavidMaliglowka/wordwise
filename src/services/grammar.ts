import { auth } from '../lib/firebase';
import {
  GrammarCheckRequest,
  GrammarCheckResponse,
  GrammarCheckApiResponse,
  GrammarCheckError,
  GrammarSuggestion,
  EditorSuggestion
} from '../types/grammar';

// Grammar check function URL
const GRAMMAR_CHECK_URL = 'https://checkgrammar-mlvq44c2lq-uc.a.run.app';

// Client-side cache for grammar suggestions
class GrammarCache {
  private cache = new Map<string, { suggestions: GrammarSuggestion[]; timestamp: number }>();
  private readonly maxAge = 5 * 60 * 1000; // 5 minutes

  private generateKey(text: string, options: Partial<GrammarCheckRequest>): string {
    const { includeSpelling = true, includeGrammar = true, includeStyle = false, language = 'en' } = options;
    const key = `${text.trim()}_${language}_${includeSpelling}_${includeGrammar}_${includeStyle}`;
    return btoa(key); // base64 encode for safe storage
  }

  get(text: string, options: Partial<GrammarCheckRequest>): GrammarSuggestion[] | null {
    const key = this.generateKey(text, options);
    const cached = this.cache.get(key);

    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > this.maxAge;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return cached.suggestions;
  }

  set(text: string, options: Partial<GrammarCheckRequest>, suggestions: GrammarSuggestion[]): void {
    const key = this.generateKey(text, options);
    this.cache.set(key, {
      suggestions,
      timestamp: Date.now()
    });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Global cache instance
const grammarCache = new GrammarCache();

// Helper to get auth headers
async function getAuthHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }

  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// Helper to create GrammarCheckError
function createGrammarError(message: string, code?: number, type: GrammarCheckError['type'] = 'api'): GrammarCheckError {
  return { message, code, type };
}

export class GrammarService {
  /**
   * Check text for grammar and spelling suggestions
   */
  static async checkGrammar(request: GrammarCheckRequest, useCache: boolean = true): Promise<GrammarCheckResponse> {
    const { text, language = 'en', includeSpelling = true, includeGrammar = true, includeStyle = false } = request;

    // Input validation
    if (!text || text.trim().length === 0) {
      return {
        suggestions: [],
        processedText: text,
        cached: false,
        processingTimeMs: 0
      };
    }

    if (text.length > 10000) {
      throw createGrammarError('Text too long. Maximum 10,000 characters allowed.', 400, 'validation');
    }

    // Check cache first
    if (useCache) {
      const cached = grammarCache.get(text, { language, includeSpelling, includeGrammar, includeStyle });
      if (cached) {
        return {
          suggestions: cached,
          processedText: text,
          cached: true,
          processingTimeMs: 0
        };
      }
    }

    try {
      const headers = await getAuthHeaders();
      const startTime = Date.now();

      const response = await fetch(GRAMMAR_CHECK_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text,
          language,
          includeSpelling,
          includeGrammar,
          includeStyle,
          stream: false // We'll implement streaming later if needed
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;

        if (response.status === 401) {
          throw createGrammarError('Authentication failed', 401, 'auth');
        } else if (response.status === 429) {
          throw createGrammarError('Rate limit exceeded. Please try again later.', 429, 'api');
        } else if (response.status >= 500) {
          throw createGrammarError('Grammar service temporarily unavailable', response.status, 'api');
        } else {
          throw createGrammarError(errorMessage, response.status, 'api');
        }
      }

      const data: GrammarCheckApiResponse = await response.json();

      if (!data.success) {
        throw createGrammarError(data.data?.toString() || 'Grammar check failed', undefined, 'api');
      }

      const result = data.data;

      // Cache successful result
      if (useCache && result.suggestions) {
        grammarCache.set(text, { language, includeSpelling, includeGrammar, includeStyle }, result.suggestions);
      }

      return {
        ...result,
        processingTimeMs: result.processingTimeMs || (Date.now() - startTime)
      };

    } catch (error: any) {
      // Re-throw GrammarCheckError as-is
      if (error.type) {
        throw error;
      }

      // Handle network errors
      if (error.name === 'TypeError' || error.message.includes('fetch')) {
        throw createGrammarError('Network error. Please check your connection.', undefined, 'network');
      }

      // Handle JSON parsing errors
      if (error instanceof SyntaxError) {
        throw createGrammarError('Invalid response from grammar service', undefined, 'api');
      }

      // Generic error
      throw createGrammarError(error.message || 'An unexpected error occurred', undefined, 'api');
    }
  }

  /**
   * Convert grammar suggestions to editor suggestions with unique IDs
   */
  static createEditorSuggestions(suggestions: GrammarSuggestion[]): EditorSuggestion[] {
    return suggestions.map((suggestion, index) => ({
      ...suggestion,
      id: `grammar-${Date.now()}-${index}`,
      isVisible: true,
      isHovered: false,
      isDismissed: false
    }));
  }

  /**
   * Validate text before sending to API
   */
  static validateText(text: string): { isValid: boolean; error?: string } {
    if (!text || typeof text !== 'string') {
      return { isValid: false, error: 'Text must be a non-empty string' };
    }

    if (text.trim().length === 0) {
      return { isValid: false, error: 'Text cannot be empty' };
    }

    if (text.length > 10000) {
      return { isValid: false, error: 'Text too long. Maximum 10,000 characters allowed.' };
    }

    return { isValid: true };
  }

  /**
   * Clear the grammar cache
   */
  static clearCache(): void {
    grammarCache.clear();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { size: number; maxAge: number } {
    return {
      size: grammarCache.size(),
      maxAge: 5 * 60 * 1000 // 5 minutes
    };
  }

  /**
   * Check if user is authenticated
   */
  static isAuthenticated(): boolean {
    return !!auth.currentUser;
  }

  /**
   * Applies a suggestion to text with intelligent position handling
   * Handles position drift and preserves surrounding punctuation
   */
  static applyTextSuggestion(
    text: string,
    suggestion: GrammarSuggestion,
    appliedSuggestions: GrammarSuggestion[] = []
  ): { newText: string; positionDelta: number } {
    // Sort applied suggestions by start position (latest first) to calculate position drift
    const sortedApplied = appliedSuggestions.sort((a, b) => b.range.start - a.range.start);

    // Calculate position offset from previously applied suggestions
    let positionOffset = 0;
    for (const applied of sortedApplied) {
      if (applied.range.start < suggestion.range.start) {
        const lengthDelta = applied.proposed.length - applied.original.length;
        positionOffset += lengthDelta;
      }
    }

    // Adjust the suggestion range based on position drift
    const adjustedStart = suggestion.range.start + positionOffset;
    const adjustedEnd = suggestion.range.end + positionOffset;

    // Validate adjusted positions
    if (adjustedStart < 0 || adjustedEnd > text.length || adjustedStart > adjustedEnd) {
      throw new Error(`Invalid suggestion position after adjustment: start=${adjustedStart}, end=${adjustedEnd}, textLength=${text.length}`);
    }

    // Extract the text to be replaced and verify it matches the original
    const textToReplace = text.substring(adjustedStart, adjustedEnd);

    // More flexible matching - handle case differences and extra whitespace
    const normalizeForComparison = (str: string) => str.toLowerCase().trim();
    if (normalizeForComparison(textToReplace) !== normalizeForComparison(suggestion.original)) {
      // Try to find the text nearby (within 10 characters) in case of minor position drift
      const searchStart = Math.max(0, adjustedStart - 10);
      const searchEnd = Math.min(text.length, adjustedEnd + 10);
      const searchArea = text.substring(searchStart, searchEnd);
      const originalNormalized = normalizeForComparison(suggestion.original);

      const foundIndex = searchArea.toLowerCase().indexOf(originalNormalized);
      if (foundIndex >= 0) {
        // Recalculate positions based on found text
        const newStart = searchStart + foundIndex;
        const newEnd = newStart + suggestion.original.length;

        // Apply replacement with corrected positions
        const before = text.substring(0, newStart);
        const after = text.substring(newEnd);
        const newText = before + suggestion.proposed + after;
        const positionDelta = suggestion.proposed.length - suggestion.original.length;

        return { newText, positionDelta };
      }

      // If fuzzy search fails, try a broader search for the exact word
      const wordBoundaryRegex = new RegExp(`\\b${suggestion.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const match = wordBoundaryRegex.exec(text);

      if (match && match.index !== undefined) {
        const before = text.substring(0, match.index);
        const after = text.substring(match.index + match[0].length);
        const newText = before + suggestion.proposed + after;
        const positionDelta = suggestion.proposed.length - match[0].length;

        return { newText, positionDelta };
      }

      throw new Error(`Text mismatch: expected "${suggestion.original}" but found "${textToReplace}". Could not locate text for replacement.`);
    }

    // Apply the replacement
    const before = text.substring(0, adjustedStart);
    const after = text.substring(adjustedEnd);
    const newText = before + suggestion.proposed + after;
    const positionDelta = suggestion.proposed.length - suggestion.original.length;

    return { newText, positionDelta };
  }

  /**
   * Update suggestion positions after text has been modified
   */
  static updateSuggestionsAfterChange(
    suggestions: GrammarSuggestion[],
    changeStart: number,
    changeEnd: number,
    newLength: number
  ): GrammarSuggestion[] {
    const lengthDelta = newLength - (changeEnd - changeStart);

    return suggestions.map(suggestion => {
      // If suggestion is entirely before the change, no adjustment needed
      if (suggestion.range.end <= changeStart) {
        return suggestion;
      }

      // If suggestion is entirely after the change, shift by length delta
      if (suggestion.range.start >= changeEnd) {
        return {
          ...suggestion,
          range: {
            start: suggestion.range.start + lengthDelta,
            end: suggestion.range.end + lengthDelta
          }
        };
      }

      // If suggestion overlaps with the change, it's likely invalid now
      return null;
    }).filter((suggestion): suggestion is GrammarSuggestion => suggestion !== null);
  }
}

export default GrammarService;

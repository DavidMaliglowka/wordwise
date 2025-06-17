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

      // Parse and validate the suggestions from the API response
      const validatedSuggestions = result.suggestions
        ? this._parseAndValidateSuggestions(result.suggestions)
        : [];

      // Cache successful result
      if (useCache && validatedSuggestions.length > 0) {
        grammarCache.set(text, { language, includeSpelling, includeGrammar, includeStyle }, validatedSuggestions);
      }

      return {
        ...result,
        suggestions: validatedSuggestions,
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
   * Parses and validates raw suggestions from the API.
   * Filters out any malformed suggestion objects.
   */
  private static _parseAndValidateSuggestions(rawSuggestions: any[]): GrammarSuggestion[] {
    if (!Array.isArray(rawSuggestions)) {
      console.warn('Grammar API returned non-array suggestions:', rawSuggestions);
      return [];
    }

    const validated: GrammarSuggestion[] = [];

    rawSuggestions.forEach((s, index) => {
      // Basic structure validation
      if (
        typeof s !== 'object' ||
        s === null ||
        typeof s.type !== 'string' ||
        typeof s.range !== 'object' ||
        typeof s.range.start !== 'number' ||
        typeof s.range.end !== 'number' ||
        typeof s.original !== 'string' ||
        typeof s.proposed !== 'string' ||
        typeof s.explanation !== 'string'
      ) {
        console.warn(`Malformed suggestion at index ${index} skipped:`, s);
        return; // Skip this suggestion
      }

      // Ensure range is valid
      if (s.range.start > s.range.end || s.range.start < 0) {
        console.warn(`Invalid range in suggestion at index ${index} skipped:`, s);
        return;
      }

      // Validate confidence, default if missing
      let confidence = 0.9; // Default confidence
      if (typeof s.confidence === 'number' && s.confidence >= 0 && s.confidence <= 1) {
        confidence = s.confidence;
      } else if (s.confidence !== undefined) {
        console.warn(`Invalid confidence in suggestion at index ${index} (using default):`, s);
      }

      // If everything is okay, add to the validated list
      validated.push({
        type: s.type,
        range: { start: s.range.start, end: s.range.end },
        original: s.original,
        proposed: s.proposed,
        explanation: s.explanation,
        confidence,
      });
    });

    return validated;
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
    // 1. Try a robust word boundary search first, as AI ranges can be unreliable.
    // This regex matches the word and captures optional trailing punctuation.
    const wordBoundaryRegex = new RegExp(`\\b(${suggestion.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})([.,?!]?)\\b`, 'i');
    const match = wordBoundaryRegex.exec(text);

    if (match && match.index !== undefined) {
      const matchedWord = match[1]; // The actual word "tommorow"
      const trailingPunctuation = match[2] || ''; // The "." or empty string

      // Preserve punctuation in the replacement
      const replacementText = suggestion.proposed + trailingPunctuation;

      const before = text.substring(0, match.index);
      const after = text.substring(match.index + matchedWord.length + trailingPunctuation.length);
      const newText = before + replacementText + after;
      const positionDelta = replacementText.length - (matchedWord.length + trailingPunctuation.length);

      return { newText, positionDelta };
    }

    // 2. Fallback to using the suggestion's range if the regex fails.
    // This maintains the existing position drift logic for more complex cases.
    const sortedApplied = appliedSuggestions.sort((a, b) => b.range.start - a.range.start);
    let positionOffset = 0;
    for (const applied of sortedApplied) {
      if (applied.range.start < suggestion.range.start) {
        const lengthDelta = applied.proposed.length - applied.original.length;
        positionOffset += lengthDelta;
      }
    }

    const adjustedStart = suggestion.range.start + positionOffset;
    const adjustedEnd = suggestion.range.end + positionOffset;

    if (adjustedStart < 0 || adjustedEnd > text.length || adjustedStart > adjustedEnd) {
      throw new Error(`Invalid suggestion position after adjustment: start=${adjustedStart}, end=${adjustedEnd}, textLength=${text.length}`);
    }

    const textToReplace = text.substring(adjustedStart, adjustedEnd);

    // Apply the replacement if it's a simple match
    const before = text.substring(0, adjustedStart);
    const after = text.substring(adjustedEnd);
    const newText = before + suggestion.proposed + after;
    const positionDelta = suggestion.proposed.length - textToReplace.length;

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

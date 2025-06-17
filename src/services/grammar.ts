import { auth } from '../lib/firebase';
import {
  GrammarCheckRequest,
  GrammarCheckResponse,
  GrammarCheckApiResponse,
  GrammarCheckError,
  GrammarSuggestion,
  EditorSuggestion,
  GrammarCategory,
  CategorizedSuggestions
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
    // Use btoa with TextEncoder to handle Unicode characters safely
    try {
      return btoa(unescape(encodeURIComponent(key)));
    } catch (error) {
      // Fallback: create a simple hash-like key if encoding fails
      return key.replace(/[^\w\-_]/g, '_').substring(0, 100);
    }
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

      // Validate that the explanation matches the actual change
      const isValidExplanation = this._validateExplanation(s.original, s.proposed, s.explanation);
      if (!isValidExplanation) {
        console.warn(`Explanation mismatch in suggestion at index ${index}:`, {
          original: s.original,
          proposed: s.proposed,
          explanation: s.explanation
        });
        // Fix the explanation to match the actual change
        s.explanation = this._generateCorrectExplanation(s.original, s.proposed, s.type);
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
   * Validate that the explanation matches the actual change being made
   */
  private static _validateExplanation(original: string, proposed: string, explanation: string): boolean {
    const lowerExplanation = explanation.toLowerCase();

    // Check for capitalization changes
    if (original.toLowerCase() === proposed.toLowerCase() && original !== proposed) {
      const isCapitalizing = original[0] === original[0].toLowerCase() && proposed[0] === proposed[0].toUpperCase();
      const isLowercasing = original[0] === original[0].toUpperCase() && proposed[0] === proposed[0].toLowerCase();

      if (isCapitalizing && !lowerExplanation.includes('capital')) {
        return false;
      }
      if (isLowercasing && !lowerExplanation.includes('lowercase')) {
        return false;
      }
    }

    // Check for punctuation changes
    if (original.includes(',') && !proposed.includes(',')) {
      if (!lowerExplanation.includes('remov') && !lowerExplanation.includes('delet')) {
        return false;
      }
    }
    if (!original.includes(',') && proposed.includes(',')) {
      if (!lowerExplanation.includes('add') && !lowerExplanation.includes('insert')) {
        return false;
      }
    }

    return true; // Default to valid if no obvious mismatches
  }

  /**
   * Generate a correct explanation for a change
   */
  private static _generateCorrectExplanation(original: string, proposed: string, type: string): string {
    // Handle capitalization changes
    if (original.toLowerCase() === proposed.toLowerCase() && original !== proposed) {
      if (original[0] === original[0].toLowerCase() && proposed[0] === proposed[0].toUpperCase()) {
        return `Capitalize the first letter of "${original}" to "${proposed}".`;
      }
      if (original[0] === original[0].toUpperCase() && proposed[0] === proposed[0].toLowerCase()) {
        return `Change "${original}" to lowercase "${proposed}".`;
      }
    }

    // Handle punctuation changes
    if (original.includes(',') && !proposed.includes(',')) {
      return `Remove the comma from "${original}" to improve sentence flow.`;
    }
    if (!original.includes(',') && proposed.includes(',')) {
      return `Add a comma to "${original}" for proper punctuation.`;
    }

    // Default explanations by type
    switch (type) {
      case 'grammar':
        return `Correct the grammar from "${original}" to "${proposed}".`;
      case 'spelling':
        return `Fix the spelling from "${original}" to "${proposed}".`;
      case 'punctuation':
        return `Correct the punctuation from "${original}" to "${proposed}".`;
      case 'style':
        return `Improve the style from "${original}" to "${proposed}".`;
      default:
        return `Change "${original}" to "${proposed}".`;
    }
  }

  /**
   * Automatically categorize a suggestion based on its type and content
   */
  private static _categorizeSuggestion(suggestion: GrammarSuggestion): GrammarCategory {
    // If category is already provided, use it
    if (suggestion.category) {
      return suggestion.category;
    }

    // Auto-categorize based on type and content
    switch (suggestion.type) {
      case 'grammar':
      case 'spelling':
        return 'correctness';

      case 'punctuation':
        // Punctuation can affect clarity or correctness
        return suggestion.confidence > 0.8 ? 'correctness' : 'clarity';

      case 'style':
        // Style suggestions usually improve clarity, engagement, or delivery
        const explanation = suggestion.explanation.toLowerCase();
        if (explanation.includes('tone') || explanation.includes('formal') || explanation.includes('professional')) {
          return 'delivery';
        } else if (explanation.includes('engage') || explanation.includes('interest') || explanation.includes('active')) {
          return 'engagement';
        } else {
          return 'clarity';
        }

      default:
        return 'clarity'; // Default fallback
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
      isDismissed: false,
      category: this._categorizeSuggestion(suggestion)
    }));
  }

  /**
   * Group suggestions by category for UI display
   */
  static categorizeSuggestions(suggestions: EditorSuggestion[]): CategorizedSuggestions {
    const categorized: CategorizedSuggestions = {
      correctness: [],
      clarity: [],
      engagement: [],
      delivery: []
    };

    suggestions.forEach(suggestion => {
      categorized[suggestion.category].push(suggestion);
    });

    return categorized;
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

    // ENHANCED FIX: Multiple fallback strategies for finding the correct text
    let finalStart = suggestion.range.start;
    let finalEnd = suggestion.range.end;
    let textToReplace = text.substring(finalStart, finalEnd);

    // Strategy 1: Try original positions first
    if (textToReplace === suggestion.original) {
      // Perfect match with original positions
      // Use the original positions
    } else {
      // Strategy 2: Search for ALL instances and choose the best one
      const instances = [];
      let searchStart = 0;
      while (true) {
        const index = text.indexOf(suggestion.original, searchStart);
        if (index === -1) break;
        instances.push({
          start: index,
          end: index + suggestion.original.length,
          distance: Math.abs(index - suggestion.range.start)
        });
        searchStart = index + 1;
      }

      if (instances.length === 0) {
        throw new Error(`Cannot find text "${suggestion.original}" anywhere in the document`);
      }

      if (instances.length === 1) {
        // Only one instance found, use it
        finalStart = instances[0].start;
        finalEnd = instances[0].end;
      } else {
        // Multiple instances found, choose the closest to the original position
        const bestInstance = instances.reduce((closest, current) =>
          current.distance < closest.distance ? current : closest
        );

        finalStart = bestInstance.start;
        finalEnd = bestInstance.end;
      }

      textToReplace = text.substring(finalStart, finalEnd);
    }

    // Final validation
    if (finalStart < 0 || finalEnd > text.length || finalStart > finalEnd) {
      throw new Error(`Invalid final position: start=${finalStart}, end=${finalEnd}, textLength=${text.length}`);
    }

    if (textToReplace !== suggestion.original) {
      throw new Error(`Final text mismatch: expected "${suggestion.original}", got "${textToReplace}"`);
    }

    // Apply the replacement
    const before = text.substring(0, finalStart);
    const after = text.substring(finalEnd);
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

      // If suggestion overlaps with the change, only remove it if it's significantly overlapping
      // Allow small overlaps (like punctuation) to be preserved and shifted
      const overlapStart = Math.max(suggestion.range.start, changeStart);
      const overlapEnd = Math.min(suggestion.range.end, changeEnd);
      const overlapLength = Math.max(0, overlapEnd - overlapStart);
      const suggestionLength = suggestion.range.end - suggestion.range.start;

      // If more than 50% of the suggestion overlaps with the change, remove it
      if (overlapLength > suggestionLength * 0.5) {
        return null;
      }

      // Otherwise, try to preserve and adjust the suggestion
      // If the suggestion starts before the change but ends within it, truncate it
      if (suggestion.range.start < changeStart && suggestion.range.end <= changeEnd) {
        return {
          ...suggestion,
          range: {
            start: suggestion.range.start,
            end: changeStart
          }
        };
      }

      // If the suggestion starts within the change but ends after it, shift the start
      if (suggestion.range.start >= changeStart && suggestion.range.end > changeEnd) {
        return {
          ...suggestion,
          range: {
            start: changeStart + newLength,
            end: suggestion.range.end + lengthDelta
          }
        };
      }

      // Default case: shift the entire suggestion
      return {
        ...suggestion,
        range: {
          start: suggestion.range.start + lengthDelta,
          end: suggestion.range.end + lengthDelta
        }
      };
    }).filter((suggestion): suggestion is GrammarSuggestion => suggestion !== null);
  }
}

export default GrammarService;

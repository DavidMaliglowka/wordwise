import { useState, useCallback, useRef, useEffect } from 'react';
import { useGrammarDebounce } from './useDebounce';
import { GrammarService } from '../services/grammar';
import {
  GrammarSuggestion,
  EditorSuggestion,
  GrammarCheckError,
  GrammarCheckOptions
} from '../types/grammar';

interface UseGrammarCheckResult {
  suggestions: EditorSuggestion[];
  isLoading: boolean;
  error: GrammarCheckError | null;
  lastCheckedText: string;
  checkText: (text: string) => void;
  clearSuggestions: () => void;
  dismissSuggestion: (suggestionId: string) => void;
  applySuggestion: (suggestionId: string, currentText: string) => { newText: string; appliedSuggestion: GrammarSuggestion } | null;
  retryLastCheck: () => void;
  cacheStats: { size: number; maxAge: number };
}

const DEFAULT_OPTIONS: Required<GrammarCheckOptions> = {
  delay: 1000,
  minLength: 3,
  includeSpelling: true,
  includeGrammar: true,
  includeStyle: false,
  enableCache: true
};

export function useGrammarCheck(options: Partial<GrammarCheckOptions> = {}): UseGrammarCheckResult {
  const config = { ...DEFAULT_OPTIONS, ...options };

  // State management
  const [suggestions, setSuggestions] = useState<EditorSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GrammarCheckError | null>(null);
  const [lastCheckedText, setLastCheckedText] = useState('');

  // Track applied suggestions for position calculations
  const appliedSuggestionsRef = useRef<GrammarSuggestion[]>([]);

  // Keep track of current request to handle race conditions
  const currentRequestRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Grammar check function
  const performGrammarCheck = useCallback(async (text: string) => {
    console.log('🔧 Checking authentication...');
    const isAuth = GrammarService.isAuthenticated();
    console.log('🔧 Is authenticated:', isAuth);

    if (!isAuth) {
      console.log('🔧 Authentication failed');
      setError({
        message: 'Please sign in to use grammar checking',
        type: 'auth'
      });
      return;
    }

    // Normalize text to handle problematic characters
    const normalizedText = text
      // Normalize Unicode (decomposed to composed)
      .normalize('NFC')
      // Replace smart quotes with regular quotes
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Replace em/en dashes with regular hyphens
      .replace(/[—–]/g, '-')
      // Replace non-breaking spaces with regular spaces
      .replace(/\u00A0/g, ' ')
      // Replace other problematic whitespace characters
      .replace(/[\u2000-\u200B\u2028\u2029\uFEFF]/g, ' ')
      // Clean up multiple spaces
      .replace(/\s+/g, ' ')
      // Trim
      .trim();

    // Debug: Log the original and normalized text
    if (text !== normalizedText) {
      console.log('🔧 Text normalization applied:');
      console.log('Original length:', text.length);
      console.log('Normalized length:', normalizedText.length);
      console.log('Original (first 100 chars):', JSON.stringify(text.substring(0, 100)));
      console.log('Normalized (first 100 chars):', JSON.stringify(normalizedText.substring(0, 100)));
    }

    console.log('🔧 Validating normalized text...');
    const validation = GrammarService.validateText(normalizedText);
    console.log('🔧 Validation result:', validation);
    if (!validation.isValid) {
      console.log('🔧 Validation failed:', validation.error);
      setError({
        message: validation.error || 'Invalid text',
        type: 'validation'
      });
      return;
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    const requestId = ++currentRequestRef.current;

    console.log('🔧 Starting grammar check...');
    setIsLoading(true);
    setError(null);

    try {
            console.log('🔧 Calling GrammarService.checkGrammar with:', {
        textLength: normalizedText.length,
        language: 'en',
        includeSpelling: config.includeSpelling,
        includeGrammar: config.includeGrammar,
        includeStyle: config.includeStyle,
        enableCache: config.enableCache
      });

      // Force no cache to bypass the cached empty result
      const response = await GrammarService.checkGrammar({
        text: normalizedText,
        language: 'en',
        includeSpelling: config.includeSpelling,
        includeGrammar: config.includeGrammar,
        includeStyle: config.includeStyle
      }, false); // Force no cache

      console.log('🔧 Grammar check response:', response);

      // Check if this is still the current request
      if (requestId === currentRequestRef.current) {
        const editorSuggestions = GrammarService.createEditorSuggestions(response.suggestions);
        setSuggestions(editorSuggestions);
        setLastCheckedText(normalizedText); // Store normalized text
        setError(null);
        // Reset applied suggestions for new text
        appliedSuggestionsRef.current = [];
      }
    } catch (err: any) {
      console.log('🔧 Grammar check error:', err);
      console.log('🔧 Error details:', {
        name: err.name,
        message: err.message,
        type: err.type,
        requestId,
        currentRequestId: currentRequestRef.current
      });

      // Only update state if this is still the current request and not aborted
      if (requestId === currentRequestRef.current && err.name !== 'AbortError') {
        const grammarError: GrammarCheckError = err.type ? err : {
          message: err.message || 'Grammar check failed',
          type: 'api'
        };
        console.log('🔧 Setting error state:', grammarError);
        setError(grammarError);
        setSuggestions([]); // Clear suggestions on error
      }
    } finally {
      console.log('🔧 Grammar check finally block, setting loading to false');
      // Only update loading state if this is still the current request
      if (requestId === currentRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [config.includeSpelling, config.includeGrammar, config.includeStyle, config.enableCache]);

  // Set up debounced grammar checking
  const { trigger: triggerGrammarCheck, cancel: cancelGrammarCheck, reset: resetGrammarCheck } = useGrammarDebounce(
    performGrammarCheck,
    config.delay,
    config.minLength
  );

  // Public API methods
  const checkText = useCallback((text: string) => {
    console.log('🔧 checkText called with:', {
      length: text.length,
      firstChars: JSON.stringify(text.substring(0, 50))
    });
    setError(null); // Clear previous errors
    triggerGrammarCheck(text);
  }, [triggerGrammarCheck]);

  const clearSuggestions = useCallback(() => {
    cancelGrammarCheck();
    resetGrammarCheck(); // Reset the debounce cache
    GrammarService.clearCache(); // Clear the grammar service cache
    setSuggestions([]);
    setError(null);
    setLastCheckedText('');
    setIsLoading(false);
    appliedSuggestionsRef.current = [];
  }, [cancelGrammarCheck, resetGrammarCheck]);

  const dismissSuggestion = useCallback((suggestionId: string) => {
    setSuggestions(prev =>
      prev.map(suggestion =>
        suggestion.id === suggestionId
          ? { ...suggestion, isDismissed: true, isVisible: false }
          : suggestion
      )
    );
  }, []);

    const applySuggestion = useCallback((suggestionId: string, currentText: string) => {
    const suggestion = suggestions.find(s => s.id === suggestionId);
    if (!suggestion) {
      return null;
    }

          try {
        // Use the smart text replacement logic (no need to pass applied suggestions)
        const result = GrammarService.applyTextSuggestion(
          currentText,
          suggestion,
          [] // Empty array since we're using content-based search now
        );

        // Simply remove the applied suggestion from the list
        // The content-based search will handle finding other suggestions correctly
        setSuggestions(prev => prev.filter(s => s.id !== suggestionId));

        return {
          newText: result.newText,
          appliedSuggestion: suggestion
        };
      } catch (error: any) {
        // If smart replacement fails, fall back to removing the suggestion and showing an error
        setError({
          message: `Failed to apply suggestion: ${error.message}`,
          type: 'validation'
        });

        // Remove the problematic suggestion
        setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
        return null;
      }
  }, [suggestions]);

  const retryLastCheck = useCallback(() => {
    if (lastCheckedText) {
      performGrammarCheck(lastCheckedText);
    }
  }, [lastCheckedText, performGrammarCheck]);

  const cacheStats = GrammarService.getCacheStats();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      cancelGrammarCheck();
    };
  }, [cancelGrammarCheck]);

  return {
    suggestions: suggestions.filter(s => !s.isDismissed), // Filter out dismissed suggestions
    isLoading,
    error,
    lastCheckedText,
    checkText,
    clearSuggestions,
    dismissSuggestion,
    applySuggestion,
    retryLastCheck,
    cacheStats
  };
}

export default useGrammarCheck;

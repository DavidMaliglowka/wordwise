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
    if (!GrammarService.isAuthenticated()) {
      setError({
        message: 'Please sign in to use grammar checking',
        type: 'auth'
      });
      return;
    }

    const validation = GrammarService.validateText(text);
    if (!validation.isValid) {
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

    setIsLoading(true);
    setError(null);

    try {
      const response = await GrammarService.checkGrammar({
        text,
        language: 'en',
        includeSpelling: config.includeSpelling,
        includeGrammar: config.includeGrammar,
        includeStyle: config.includeStyle
      }, config.enableCache);

      // Check if this is still the current request
      if (requestId === currentRequestRef.current) {
        const editorSuggestions = GrammarService.createEditorSuggestions(response.suggestions);
        setSuggestions(editorSuggestions);
        setLastCheckedText(text);
        setError(null);
        // Reset applied suggestions for new text
        appliedSuggestionsRef.current = [];
      }
    } catch (err: any) {
      // Only update state if this is still the current request and not aborted
      if (requestId === currentRequestRef.current && err.name !== 'AbortError') {
        const grammarError: GrammarCheckError = err.type ? err : {
          message: err.message || 'Grammar check failed',
          type: 'api'
        };
        setError(grammarError);
        setSuggestions([]); // Clear suggestions on error
      }
    } finally {
      // Only update loading state if this is still the current request
      if (requestId === currentRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [config.includeSpelling, config.includeGrammar, config.includeStyle, config.enableCache]);

  // Set up debounced grammar checking
  const { trigger: triggerGrammarCheck, cancel: cancelGrammarCheck } = useGrammarDebounce(
    performGrammarCheck,
    config.delay,
    config.minLength
  );

  // Public API methods
  const checkText = useCallback((text: string) => {
    setError(null); // Clear previous errors
    triggerGrammarCheck(text);
  }, [triggerGrammarCheck]);

  const clearSuggestions = useCallback(() => {
    cancelGrammarCheck();
    setSuggestions([]);
    setError(null);
    setLastCheckedText('');
    setIsLoading(false);
    appliedSuggestionsRef.current = [];
  }, [cancelGrammarCheck]);

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
      // Use the smart text replacement logic
      const result = GrammarService.applyTextSuggestion(
        currentText,
        suggestion,
        appliedSuggestionsRef.current
      );

      // Track this applied suggestion
      appliedSuggestionsRef.current.push(suggestion);

      // Update positions of remaining suggestions
      const updatedSuggestions = GrammarService.updateSuggestionsAfterChange(
        suggestions.filter(s => s.id !== suggestionId),
        suggestion.range.start,
        suggestion.range.end,
        suggestion.proposed.length
      );

      // Update suggestions state with position-corrected suggestions
      const editorSuggestions = GrammarService.createEditorSuggestions(updatedSuggestions);
      setSuggestions(editorSuggestions);

      return {
        newText: result.newText,
        appliedSuggestion: suggestion
      };
    } catch (error: any) {
      // If smart replacement fails, fall back to removing the suggestion and showing an error
      console.error('Failed to apply suggestion:', error.message);
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

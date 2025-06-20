import { useState, useCallback, useRef, useEffect } from 'react';
import { useDebounce } from './useDebounce';
import { hybridGrammarService } from '../services/grammar-hybrid';
import { GrammarService } from '../services/grammar';
import {
  GrammarSuggestion,
  EditorSuggestion,
  GrammarCheckError,
  GrammarCheckOptions,
  GrammarCategory,
  GrammarSuggestionType
} from '../types/grammar';

interface UseHybridGrammarCheckResult {
  suggestions: EditorSuggestion[];
  isLoading: boolean;
  isRefining: boolean; // New: indicates GPT-4o refinement in progress
  error: GrammarCheckError | null;
  lastCheckedText: string;
  checkText: (text: string) => void;
  clearSuggestions: () => void;
  dismissSuggestion: (suggestionId: string) => void;
  applySuggestion: (suggestionId: string, currentText: string) => { newText: string; appliedSuggestion: GrammarSuggestion } | null;
  refineSuggestion: (suggestionId: string) => Promise<void>; // New: GPT-4o refinement
  retryLastCheck: () => void;
  stats: { clientSuggestions: number; refinedSuggestions: number; totalProcessingTime: number };
}

const DEFAULT_OPTIONS: Required<GrammarCheckOptions> = {
  delay: 300, // Faster debounce for hybrid approach
  minLength: 3,
  includeSpelling: true,
  includeGrammar: true,
  includeStyle: true, // Enable style by default for hybrid
  enableCache: true
};

// Helper to map client suggestion types to grammar types
const mapClientTypeToGrammarType = (clientType: string): GrammarSuggestionType => {
  switch (clientType) {
    case 'spelling': return 'spelling';
    case 'grammar': return 'grammar';
    case 'style': return 'style';
    case 'passive': return 'style';
    default: return 'grammar';
  }
};

// Helper to map client types to categories
const mapClientTypeToCategory = (clientType: string): GrammarCategory => {
  switch (clientType) {
    case 'spelling': return 'correctness';
    case 'grammar': return 'correctness';
    case 'style': return 'clarity';
    case 'passive': return 'clarity';
    default: return 'correctness';
  }
};

export function useHybridGrammarCheck(options: Partial<GrammarCheckOptions> = {}): UseHybridGrammarCheckResult {
  const config = { ...DEFAULT_OPTIONS, ...options };

  // State management
  const [suggestions, setSuggestions] = useState<EditorSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<GrammarCheckError | null>(null);
  const [lastCheckedText, setLastCheckedText] = useState('');
  const [stats, setStats] = useState({
    clientSuggestions: 0,
    refinedSuggestions: 0,
    totalProcessingTime: 0
  });

  // Track current request to handle race conditions
  const currentRequestRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Convert client suggestions to editor format
  const convertToEditorSuggestions = useCallback((clientSuggestions: any[]): EditorSuggestion[] => {
    return clientSuggestions.map(suggestion => ({
      id: suggestion.id,
      range: {
        start: suggestion.range.start,
        end: suggestion.range.end
      },
      type: mapClientTypeToGrammarType(suggestion.type),
      category: mapClientTypeToCategory(suggestion.type),
      original: suggestion.flaggedText || '',
      proposed: suggestion.replacement || '',
      explanation: suggestion.message,
      confidence: suggestion.confidence / 100, // Convert percentage to decimal
      severity: suggestion.severity === 'error' ? 'high' : suggestion.severity === 'warning' ? 'medium' : 'low',
      isVisible: true,
      isHovered: false,
      isDismissed: false
    }));
  }, []);

  // Main grammar check function
  const performHybridGrammarCheck = useCallback(async (text: string) => {
    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    const requestId = ++currentRequestRef.current;
    const startTime = performance.now();

    setIsLoading(true);
    setError(null);

    try {
      // Use hybrid grammar service for instant client-side analysis
      const result = await hybridGrammarService.checkGrammar(text);

      // Check if this is still the current request
      if (requestId === currentRequestRef.current) {
        const editorSuggestions = convertToEditorSuggestions(result.suggestions);
        setSuggestions(editorSuggestions);
        setLastCheckedText(text);
        setError(null);

        const processingTime = performance.now() - startTime;
        setStats(prev => ({
          ...prev,
          clientSuggestions: result.suggestions.length,
          totalProcessingTime: processingTime
        }));

        console.log(`✅ Hybrid grammar check complete: ${result.suggestions.length} suggestions in ${processingTime.toFixed(1)}ms`);
      }
    } catch (err: any) {
      // Only update state if this is still the current request and not aborted
      if (requestId === currentRequestRef.current && err.name !== 'AbortError') {
        const grammarError: GrammarCheckError = {
          message: err.message || 'Hybrid grammar check failed',
          type: 'api'
        };
        setError(grammarError);
        setSuggestions([]);
        console.error('❌ Hybrid grammar check error:', err);
      }
    } finally {
      // Only update loading state if this is still the current request
      if (requestId === currentRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [convertToEditorSuggestions]);

  // Set up debounced grammar checking
  const debouncedCheck = useDebounce(performHybridGrammarCheck, config.delay);

  // Public API methods
  const checkText = useCallback((text: string) => {
    if (text.length < config.minLength) {
      setSuggestions([]);
      setLastCheckedText('');
      return;
    }

    setError(null);
    debouncedCheck(text);
  }, [debouncedCheck, config.minLength]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setError(null);
    setLastCheckedText('');
    setIsLoading(false);
    setIsRefining(false);
  }, []);

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
      // Use the legacy grammar service's text application logic
      const result = GrammarService.applyTextSuggestion(
        currentText,
        suggestion,
        []
      );

      // Remove the applied suggestion from the list
      setSuggestions(prev => prev.filter(s => s.id !== suggestionId));

      return {
        newText: result.newText,
        appliedSuggestion: suggestion
      };
    } catch (error: any) {
      setError({
        message: `Failed to apply suggestion: ${error.message}`,
        type: 'validation'
      });

      // Remove the problematic suggestion
      setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
      return null;
    }
  }, [suggestions]);

  // New: GPT-4o refinement for specific suggestions
  const refineSuggestion = useCallback(async (suggestionId: string) => {
    const suggestion = suggestions.find(s => s.id === suggestionId);
    if (!suggestion) return;

    // Check if user is authenticated for GPT-4o refinement
    if (!GrammarService.isAuthenticated()) {
      setError({
        message: 'Please sign in to use AI refinement',
        type: 'auth'
      });
      return;
    }

    setIsRefining(true);

    try {
      // Extract context around the suggestion for GPT-4o
      const contextStart = Math.max(0, suggestion.range.start - 50);
      const contextEnd = Math.min(lastCheckedText.length, suggestion.range.end + 50);
      const context = lastCheckedText.slice(contextStart, contextEnd);

      // Call legacy grammar service for GPT-4o refinement
      const response = await GrammarService.checkGrammar({
        text: context,
        language: 'en',
        includeSpelling: true,
        includeGrammar: true,
        includeStyle: true
      }, false);

      // Find refined suggestions that match our original suggestion
      const refinedSuggestions = response.suggestions.filter(s =>
        s.range.start >= (suggestion.range.start - contextStart) &&
        s.range.end <= (suggestion.range.end - contextStart)
      );

      if (refinedSuggestions.length > 0) {
        // Replace the original suggestion with refined ones
        const editorRefinedSuggestions = GrammarService.createEditorSuggestions(refinedSuggestions)
          .map(s => ({
            ...s,
            range: {
              start: s.range.start + contextStart,
              end: s.range.end + contextStart
            }
          }));

        setSuggestions(prev => [
          ...prev.filter(s => s.id !== suggestionId),
          ...editorRefinedSuggestions
        ]);

        setStats(prev => ({
          ...prev,
          refinedSuggestions: prev.refinedSuggestions + refinedSuggestions.length
        }));

        console.log(`✨ Refined suggestion ${suggestionId} with ${refinedSuggestions.length} GPT-4o suggestions`);
      }
    } catch (error: any) {
      setError({
        message: `Failed to refine suggestion: ${error.message}`,
        type: 'api'
      });
      console.error('❌ Suggestion refinement error:', error);
    } finally {
      setIsRefining(false);
    }
  }, [suggestions, lastCheckedText]);

  const retryLastCheck = useCallback(() => {
    if (lastCheckedText) {
      performHybridGrammarCheck(lastCheckedText);
    }
  }, [lastCheckedText, performHybridGrammarCheck]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    suggestions: suggestions.filter(s => !s.isDismissed),
    isLoading,
    isRefining,
    error,
    lastCheckedText,
    checkText,
    clearSuggestions,
    dismissSuggestion,
    applySuggestion,
    refineSuggestion,
    retryLastCheck,
    stats
  };
}

export default useHybridGrammarCheck;

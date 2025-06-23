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
  regenerateSuggestion: (suggestionId: string) => Promise<void>; // New: Passive voice regeneration
  retryLastCheck: () => void;
  stats: { clientSuggestions: number; refinedSuggestions: number; totalProcessingTime: number };
}

const DEFAULT_OPTIONS: Required<GrammarCheckOptions> = {
  delay: 300, // Faster debounce for hybrid approach
  minLength: 3,
  includeSpelling: true,
  includeGrammar: true,
  includeStyle: true, // Enable style by default for hybrid
  enableCache: true,
  enhancePassiveVoice: false, // Default to false for performance
  enhanceSpelling: true // Enable context-aware spelling by default
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
    return clientSuggestions.map(suggestion => {
      const isPassiveVoice = suggestion.type === 'passive' ||
                            (suggestion.type === 'style' && suggestion.message?.toLowerCase().includes('passive'));
      const isSpelling = suggestion.type === 'spelling';

      // Clean up spelling explanations to be more user-friendly
      let cleanExplanation = suggestion.message;
      if (isSpelling) {
        // Hide the long "expected for example..." descriptions for spelling
        if (cleanExplanation.includes('expected for example')) {
          const word = suggestion.flaggedText || suggestion.original;
          const replacement = suggestion.replacement || '';
          cleanExplanation = replacement
            ? `Unknown word. Did you mean "${replacement}"?`
            : `Unknown word "${word}".`;
        }
      }

      return {
        id: suggestion.id,
        range: {
          start: suggestion.range.start,
          end: suggestion.range.end
        },
        type: mapClientTypeToGrammarType(suggestion.type),
        category: mapClientTypeToCategory(suggestion.type),
        original: suggestion.flaggedText || '',
        proposed: suggestion.replacement || '',
        explanation: cleanExplanation,
        confidence: suggestion.confidence / 100, // Convert percentage to decimal
        severity: suggestion.severity === 'error' ? 'high' : suggestion.severity === 'warning' ? 'medium' : 'low',
        isVisible: true,
        isHovered: false,
        isDismissed: false,
        // Add regeneration support for passive voice and spelling suggestions
        canRegenerate: isPassiveVoice || isSpelling,
        regenerateId: (isPassiveVoice || isSpelling) ? `regen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : undefined
      };
    });
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
      const result = await hybridGrammarService.checkGrammar(text, {
        includeStyle: config.includeStyle,
        priority: 'balanced',
        userTier: 'premium', // All users get enhanced features now
        enhancePassiveVoice: config.enhancePassiveVoice
      });

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

    // Track which suggestions we already attempted to auto-refine
  // so we don't call GPT repeatedly on the same one.
  const autoRefinedIds = useRef<Set<string>>(new Set());

  // New: Smart spelling refinement using context-aware GPT suggestions
  const regenerateSpellingSuggestion = useCallback(async (suggestionId: string) => {
    const suggestion = suggestions.find(s => s.id === suggestionId);
    if (!suggestion || suggestion.type !== 'spelling') {
      console.error('❌ SPELLING REFINE DEBUG: Invalid suggestion for spelling refinement', {
        suggestionId,
        suggestionType: suggestion?.type,
        expectedType: 'spelling'
      });
      return;
    }

    console.log('🔤 SPELLING REFINE DEBUG: Starting context-aware spelling refinement', {
      suggestionId,
      flaggedWord: suggestion.original,
      currentProposed: suggestion.proposed
    });

    // Check if user is authenticated for GPT spelling refinement
    if (!GrammarService.isAuthenticated()) {
      console.error('❌ SPELLING REFINE DEBUG: User not authenticated');
      setError({
        message: 'Please sign in to use AI spelling refinement',
        type: 'auth'
      });
      return;
    }

    setIsRefining(true);

    try {
      console.log('🌐 SPELLING REFINE DEBUG: Calling spelling refinement service...');

      // Use hybrid service for context-aware spelling correction
      const refinedSuggestion = await hybridGrammarService.refineSpellingSuggestion(
        {
          id: suggestion.id,
          rule: 'spelling',
          message: suggestion.explanation,
          severity: 'error' as const,
          range: suggestion.range,
          replacement: suggestion.proposed,
          type: 'spelling',
          confidence: Math.round((suggestion.confidence || 0.5) * 100),
          flaggedText: suggestion.original,
          canRegenerate: true,
          regenerateId: suggestion.id
        },
        lastCheckedText
      );

      if (refinedSuggestion) {
        console.log('✨ SPELLING REFINE DEBUG: Successfully refined spelling suggestion', {
          originalWord: suggestion.original,
          originalProposed: suggestion.proposed,
          refinedProposed: refinedSuggestion.replacement,
          confidence: refinedSuggestion.confidence
        });

        // Convert the refined suggestion back to EditorSuggestion
        const refinedEditorSuggestion = convertToEditorSuggestions([refinedSuggestion])[0];

        if (refinedEditorSuggestion) {
          // Replace the original suggestion with the refined one
          setSuggestions(prev => [
            ...prev.filter(s => s.id !== suggestionId),
            {
              ...refinedEditorSuggestion,
              canRegenerate: true,
              regenerateId: `refined_spelling_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            }
          ]);

          setStats(prev => ({
            ...prev,
            refinedSuggestions: prev.refinedSuggestions + 1
          }));

          console.log('✅ SPELLING REFINE DEBUG: Successfully replaced spelling suggestion with context-aware version');
        }
      } else {
        console.log('⚠️ SPELLING REFINE DEBUG: No context improvement available, keeping original');
      }
    } catch (error: any) {
      console.error('❌ Spelling refinement error:', error);
      setError({
        message: `Failed to refine spelling: ${error.message}`,
        type: 'api'
      });
    } finally {
      setIsRefining(false);
    }
  }, [suggestions, lastCheckedText, convertToEditorSuggestions]);

  // Update the refineSuggestion method to handle spelling
  const refineSuggestion = useCallback(async (suggestionId: string) => {
    const suggestion = suggestions.find(s => s.id === suggestionId);
    if (!suggestion) {
      console.error('❌ REFINE DEBUG: Suggestion not found for ID:', suggestionId);
      return;
    }

    // Route to appropriate refinement method based on type
    if (suggestion.type === 'spelling') {
      return regenerateSpellingSuggestion(suggestionId);
    }

    console.log('🔍 REFINE DEBUG: Starting refinement process', {
      suggestionId,
      suggestionType: suggestion.type,
      original: suggestion.original
    });

    // Check if user is authenticated for GPT-4o refinement
    const isAuthenticated = GrammarService.isAuthenticated();
    console.log('🔐 REFINE DEBUG: Authentication check:', { isAuthenticated });

    if (!isAuthenticated) {
      console.error('❌ REFINE DEBUG: User not authenticated');
      setError({
        message: 'Please sign in to use AI refinement',
        type: 'auth'
      });
      return;
    }

    console.log('🚀 REFINE DEBUG: Starting refinement process...');
    setIsRefining(true);

    try {
      console.log('🌐 REFINE DEBUG: Calling hybrid grammar service for enhanced refinement...');

      // Use hybrid service with enhanced passive voice for better results
      const result = await hybridGrammarService.checkGrammar(lastCheckedText, {
        includeStyle: true,
        priority: 'quality',
        userTier: 'premium',
        enhancePassiveVoice: true // Enable GPT-4o enhancements
      });

      console.log('📨 REFINE DEBUG: Received response from hybrid service', {
        suggestionsCount: result.suggestions?.length || 0,
        responseKeys: Object.keys(result)
      });

      // Find suggestions that overlap with our target suggestion
      const refinedSuggestions = result.suggestions.filter(s =>
        (s.range.start <= suggestion.range.end && s.range.end >= suggestion.range.start) ||
        s.type === 'passive' || s.type === 'style'
      );

      console.log('🎯 REFINE DEBUG: Found refined suggestions', {
        totalSuggestions: result.suggestions.length,
        refinedCount: refinedSuggestions.length,
        refinedTypes: refinedSuggestions.map(s => s.type)
      });

      if (refinedSuggestions.length > 0) {
        // Convert and replace the original suggestion with refined ones
        const editorRefinedSuggestions = convertToEditorSuggestions(refinedSuggestions)
          .map(s => ({
            ...s,
            canRegenerate: s.type === 'style' || s.type === 'passive' || s.type === 'spelling',
            regenerateId: `refined_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          }));

        setSuggestions(prev => [
          ...prev.filter(s => s.id !== suggestionId),
          ...editorRefinedSuggestions
        ]);

        setStats(prev => ({
          ...prev,
          refinedSuggestions: prev.refinedSuggestions + refinedSuggestions.length
        }));

        console.log(`✨ Refined suggestion ${suggestionId} with ${refinedSuggestions.length} enhanced suggestions`);
      } else {
        console.log('⚠️ REFINE DEBUG: No refined suggestions found, keeping original');
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
  }, [suggestions, lastCheckedText, convertToEditorSuggestions, regenerateSpellingSuggestion]);

  // Update regenerateSuggestion to also handle spelling
  const regenerateSuggestion = useCallback(async (suggestionId: string) => {
    const suggestion = suggestions.find(s => s.id === suggestionId);
    if (!suggestion) {
      console.error('❌ REGENERATE DEBUG: Suggestion not found');
      return;
    }

    // Route to appropriate regeneration method
    if (suggestion.type === 'spelling') {
      return regenerateSpellingSuggestion(suggestionId);
    }

    if (suggestion.type !== 'style' && suggestion.type !== 'passive') {
      console.error('❌ REGENERATE DEBUG: Invalid suggestion for regeneration', {
        suggestionId,
        suggestionType: suggestion?.type,
        availableTypes: ['style', 'passive', 'spelling']
      });
      return;
    }

    console.log('🔄 REGENERATE DEBUG: Starting lightweight suggestion refinement', {
      suggestionId,
      suggestionType: suggestion.type,
      flaggedText: suggestion.original
    });

    // Check if user is authenticated for GPT-4o regeneration
    if (!GrammarService.isAuthenticated()) {
      console.error('❌ REGENERATE DEBUG: User not authenticated');
      setError({
        message: 'Please sign in to use AI regeneration',
        type: 'auth'
      });
      return;
    }

    setIsRefining(true);

    try {
      console.log('🌐 REGENERATE DEBUG: Calling lightweight refineSuggestion method...');

      // Convert EditorSuggestion back to ClientSuggestion format for the hybrid service
      const clientSuggestion = {
        id: suggestion.id,
        rule: suggestion.type || 'unknown',
        message: suggestion.explanation || 'Grammar issue detected',
        severity: 'suggestion' as const,
        range: suggestion.range,
        replacement: suggestion.proposed,
        type: suggestion.type as 'spelling' | 'grammar' | 'style' | 'passive',
        confidence: Math.round((suggestion.confidence || 0.5) * 100),
        flaggedText: suggestion.original,
        canRegenerate: suggestion.canRegenerate,
        regenerateId: suggestion.regenerateId
      };

      // Use the new lightweight refinement method
      const refinedSuggestion = await hybridGrammarService.refineSuggestion(clientSuggestion, lastCheckedText);

      if (refinedSuggestion) {
        console.log('✨ REGENERATE DEBUG: Successfully refined suggestion', {
          originalId: suggestion.id,
          refinedId: refinedSuggestion.id,
          originalReplacement: suggestion.proposed,
          refinedReplacement: refinedSuggestion.replacement
        });

        // Convert the refined ClientSuggestion back to EditorSuggestion
        const refinedEditorSuggestion = convertToEditorSuggestions([refinedSuggestion])[0];

        if (refinedEditorSuggestion) {
          // Replace the original suggestion with the refined one
          setSuggestions(prev => [
            ...prev.filter(s => s.id !== suggestionId),
            {
              ...refinedEditorSuggestion,
              canRegenerate: true,
              regenerateId: `refined_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            }
          ]);

          setStats(prev => ({
            ...prev,
            refinedSuggestions: prev.refinedSuggestions + 1
          }));

          console.log('✅ REGENERATE DEBUG: Successfully replaced suggestion with refined version');
        }
      } else {
        console.log('⚠️ REGENERATE DEBUG: No refinement available, keeping original suggestion');
        setError({
          message: 'Unable to generate an improved suggestion at this time',
          type: 'api'
        });
      }
    } catch (error: any) {
      setError({
        message: `Failed to regenerate suggestion: ${error.message}`,
        type: 'api'
      });
      console.error('❌ Regeneration error:', error);
    } finally {
      setIsRefining(false);
    }
  }, [suggestions, lastCheckedText, convertToEditorSuggestions, regenerateSpellingSuggestion]);

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

  // Auto-refine logic for spelling and passive voice suggestions
  useEffect(() => {
    // Only attempt when we are not already refining globally
    if (isRefining) return;

    suggestions.forEach((s) => {
      const needsRefine =
        // Passive voice suggestions that need refinement
        ((s.type === 'style' || s.type === 'passive') &&
        // If proposed text is empty or identical to original, we want a rewrite
        (!s.proposed || s.proposed.trim() === '' || s.proposed.trim() === s.original.trim())) ||
        // Spelling suggestions that need context-aware refinement
        (s.type === 'spelling' &&
        // If confidence is low or no proposed replacement
        (s.confidence < 0.8 || !s.proposed || s.proposed.trim() === ''));

      if (needsRefine && !autoRefinedIds.current.has(s.id)) {
        autoRefinedIds.current.add(s.id);

        // Fire and forget – no await so UI stays responsive
        setTimeout(() => {
          if (s.type === 'spelling') {
            console.log('🤖 AUTO-REFINE DEBUG: Starting automatic spelling refinement', {
              suggestionId: s.id,
              flaggedWord: s.original,
              currentProposed: s.proposed,
              confidence: s.confidence
            });
            regenerateSpellingSuggestion(s.id).catch(() => {
              /* swallow – user can still click regenerate manually */
            });
          } else {
            regenerateSuggestion(s.id).catch(() => {
              /* swallow – user can still click regenerate manually */
            });
          }
        }, 1000); // 1 second delay for auto-refine
      }
    });
  }, [suggestions, regenerateSuggestion, regenerateSpellingSuggestion, isRefining]);

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
    regenerateSuggestion,
    retryLastCheck,
    stats
  };
}

export default useHybridGrammarCheck;

import { useState, useEffect, useCallback } from 'react';
import { GrammarService } from '../services/grammar';
import { Document } from '../types/firestore';

interface SuggestionCountResult {
  count: number;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

/**
 * Hook to get real-time grammar suggestion count for a document
 * Uses debounced checking to avoid excessive API calls
 */
export const useGrammarSuggestionCount = (document: Document): SuggestionCountResult => {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const checkSuggestionCount = useCallback(async () => {
    if (!document.content || document.content.trim().length === 0) {
      setCount(0);
      setError(null);
      setLastUpdated(new Date());
      return;
    }

    // Don't check very short content (less than 10 characters)
    if (document.content.trim().length < 10) {
      setCount(0);
      setError(null);
      setLastUpdated(new Date());
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await GrammarService.checkGrammar({
        text: document.content,
        includeSpelling: true,
        includeGrammar: true,
        includeStyle: false // Keep it focused on grammar/spelling for performance
      });

      setCount(response.suggestions.length);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error checking grammar suggestions:', err);

      // Set a fallback count based on document's existing editCount if available
      const fallbackCount = document.editCount || 0;
      setCount(fallbackCount);

      // Only set error for non-auth related issues to avoid spamming
      if (err && typeof err === 'object' && 'type' in err && err.type !== 'auth') {
        setError('Unable to check suggestions');
      }

      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, [document.content, document.editCount]);

  // Effect to check suggestion count when document content changes
  useEffect(() => {
    // Debounce the check to avoid excessive API calls
    const timeoutId = setTimeout(() => {
      checkSuggestionCount();
    }, 1000); // 1 second delay

    return () => clearTimeout(timeoutId);
  }, [checkSuggestionCount]);

  return {
    count,
    loading,
    error,
    lastUpdated
  };
};

/**
 * Hook for batch suggestion counting (for multiple documents)
 * More efficient when dealing with document lists
 */
export const useBatchGrammarSuggestionCount = (documents: Document[]): Map<string, SuggestionCountResult> => {
  const [results, setResults] = useState<Map<string, SuggestionCountResult>>(new Map());

  const updateDocumentCount = useCallback(async (document: Document) => {
    if (!document.content || document.content.trim().length < 10) {
      setResults(prev => new Map(prev.set(document.id, {
        count: 0,
        loading: false,
        error: null,
        lastUpdated: new Date()
      })));
      return;
    }

    // Set loading state
    setResults(prev => new Map(prev.set(document.id, {
      count: prev.get(document.id)?.count || 0,
      loading: true,
      error: null,
      lastUpdated: prev.get(document.id)?.lastUpdated || null
    })));

    try {
      const response = await GrammarService.checkGrammar({
        text: document.content,
        includeSpelling: true,
        includeGrammar: true,
        includeStyle: false
      });

      setResults(prev => new Map(prev.set(document.id, {
        count: response.suggestions.length,
        loading: false,
        error: null,
        lastUpdated: new Date()
      })));
    } catch (err) {
      console.error(`Error checking grammar for document ${document.id}:`, err);

      const fallbackCount = document.editCount || 0;
      setResults(prev => new Map(prev.set(document.id, {
        count: fallbackCount,
        loading: false,
        error: err && typeof err === 'object' && 'type' in err && err.type !== 'auth'
          ? 'Unable to check suggestions'
          : null,
        lastUpdated: new Date()
      })));
    }
  }, []);

  // Effect to process documents in batches
  useEffect(() => {
    if (documents.length === 0) {
      setResults(new Map());
      return;
    }

    // Process documents in small batches to avoid overwhelming the API
    const batchSize = 3;
    let currentBatch = 0;

    const processBatch = () => {
      const startIndex = currentBatch * batchSize;
      const endIndex = Math.min(startIndex + batchSize, documents.length);
      const batch = documents.slice(startIndex, endIndex);

      batch.forEach(doc => {
        // Add delay between requests to avoid rate limiting
        setTimeout(() => updateDocumentCount(doc), Math.random() * 2000);
      });

      currentBatch++;

      if (endIndex < documents.length) {
        // Process next batch after delay
        setTimeout(processBatch, 3000);
      }
    };

    // Start processing
    const timeoutId = setTimeout(processBatch, 500);

    return () => clearTimeout(timeoutId);
  }, [documents, updateDocumentCount]);

  return results;
};

import NodeCache from 'node-cache';
import * as crypto from 'crypto';
import { CachedResult, GrammarSuggestion } from '../types/grammar';

// Initialize cache with 1 hour TTL
const cache = new NodeCache({
  stdTTL: 3600, // 1 hour
  checkperiod: 120, // Check for expired keys every 2 minutes
  useClones: false // Performance optimization
});

/**
 * Generate a hash for text to use as cache key
 * @param text - The text to hash
 * @param options - Additional options that affect the result
 * @returns SHA-256 hash of the input
 */
export function generateTextHash(
  text: string,
  options: { language?: string; includeSpelling?: boolean; includeGrammar?: boolean; includeStyle?: boolean } = {}
): string {
  const normalizedText = text.trim().toLowerCase();
  const optionsString = JSON.stringify(options);
  const combined = `${normalizedText}:${optionsString}`;

  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Get cached grammar check result
 * @param cacheKey - The cache key to look up
 * @returns Cached result or null if not found/expired
 */
export function getCachedResult(cacheKey: string): GrammarSuggestion[] | null {
  try {
    const cached = cache.get<CachedResult>(cacheKey);

    if (!cached) {
      return null;
    }

    // Check if result has expired
    if (Date.now() > cached.expiresAt) {
      cache.del(cacheKey);
      return null;
    }

    return cached.suggestions;
  } catch (error) {
    console.error('Error retrieving cached result:', error);
    return null;
  }
}

/**
 * Store grammar check result in cache
 * @param cacheKey - The cache key to store under
 * @param suggestions - The suggestions to cache
 * @param ttlSeconds - Time to live in seconds (default: 1 hour)
 */
export function setCachedResult(
  cacheKey: string,
  suggestions: GrammarSuggestion[],
  ttlSeconds: number = 3600
): void {
  try {
    const cachedResult: CachedResult = {
      suggestions,
      timestamp: Date.now(),
      expiresAt: Date.now() + (ttlSeconds * 1000)
    };

    cache.set(cacheKey, cachedResult, ttlSeconds);
  } catch (error) {
    console.error('Error storing cached result:', error);
  }
}

/**
 * Clear all cached results
 */
export function clearCache(): void {
  cache.flushAll();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    keys: cache.keys().length,
    hits: cache.getStats().hits,
    misses: cache.getStats().misses,
    ksize: cache.getStats().ksize,
    vsize: cache.getStats().vsize
  };
}

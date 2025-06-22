import { performanceMonitor } from './performance-monitor';

// Enhanced cache configuration
export interface CacheConfig {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  enableMetrics: boolean;
  enableCompression: boolean;
  enablePersistence: boolean; // For client-side persistence
  keyPrefix: string;
}

// Cache entry structure
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  expiresAt: number;
  accessCount: number;
  lastAccessedAt: number;
  size: number; // Estimated size in bytes
  compressed: boolean;
}

// Cache statistics
export interface CacheStats {
  size: number;
  maxSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  totalSize: number; // Total size in bytes
  oldestEntry: number;
  newestEntry: number;
  averageAccessCount: number;
}

// Enhanced cache implementation with monitoring
export class EnhancedCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private config: CacheConfig;
  private hitCount = 0;
  private missCount = 0;
  private sessionId: string;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 1000,
      ttl: 300000, // 5 minutes default
      enableMetrics: true,
      enableCompression: false,
      enablePersistence: false,
      keyPrefix: 'cache',
      ...config
    };

    this.sessionId = `cache_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Start cleanup interval
    this.startCleanup();

    // Load from persistence if enabled
    if (this.config.enablePersistence && typeof window !== 'undefined') {
      this.loadFromPersistence();
    }
  }

  // Get value from cache
  get(key: string): T | null {
    const fullKey = `${this.config.keyPrefix}:${key}`;
    const entry = this.cache.get(fullKey);

    if (!entry) {
      this.missCount++;
      this.recordCacheMetric('miss', key);
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(fullKey);
      this.missCount++;
      this.recordCacheMetric('miss', key, { reason: 'expired' });
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();
    this.hitCount++;
    this.recordCacheMetric('hit', key, { accessCount: entry.accessCount });

    return entry.value;
  }

  // Set value in cache
  set(key: string, value: T, customTtl?: number): void {
    const fullKey = `${this.config.keyPrefix}:${key}`;
    const now = Date.now();
    const ttl = customTtl || this.config.ttl;
    const size = this.estimateSize(value);

    // Check if we need to evict entries to make space
    if (this.cache.size >= this.config.maxSize) {
      this.evictLeastRecentlyUsed();
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: now,
      expiresAt: now + ttl,
      accessCount: 0,
      lastAccessedAt: now,
      size,
      compressed: false
    };

    // Apply compression if enabled and beneficial
    if (this.config.enableCompression && size > 1000) {
      try {
        entry.value = this.compress(value) as T;
        entry.compressed = true;
        entry.size = this.estimateSize(entry.value);
      } catch (error) {
        console.warn('Cache compression failed:', error);
      }
    }

    this.cache.set(fullKey, entry);
    this.recordCacheMetric('set', key, { size, ttl });

    // Save to persistence if enabled
    if (this.config.enablePersistence) {
      this.saveToPersistence(fullKey, entry);
    }
  }

  // Check if key exists and is not expired
  has(key: string): boolean {
    const fullKey = `${this.config.keyPrefix}:${key}`;
    const entry = this.cache.get(fullKey);

    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(fullKey);
      return false;
    }

    return true;
  }

  // Delete specific key
  delete(key: string): boolean {
    const fullKey = `${this.config.keyPrefix}:${key}`;
    const deleted = this.cache.delete(fullKey);

    if (deleted) {
      this.recordCacheMetric('evict', key, { reason: 'manual_delete' });
    }

    // Remove from persistence if enabled
    if (this.config.enablePersistence && typeof window !== 'undefined') {
      try {
        localStorage.removeItem(`${this.config.keyPrefix}_${fullKey}`);
      } catch (error) {
        console.warn('Failed to remove from localStorage:', error);
      }
    }

    return deleted;
  }

  // Clear entire cache
  clear(): void {
    const sizeBefore = this.cache.size;
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;

    this.recordCacheMetric('clear', 'all', { entriesCleared: sizeBefore });

    // Clear persistence if enabled
    if (this.config.enablePersistence && typeof window !== 'undefined') {
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(`${this.config.keyPrefix}_`));
        keys.forEach(k => localStorage.removeItem(k));
      } catch (error) {
        console.warn('Failed to clear localStorage:', error);
      }
    }
  }

  // Get cache statistics
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const totalRequests = this.hitCount + this.missCount;
    const hitRate = totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0;

    const timestamps = entries.map(e => e.timestamp);
    const accessCounts = entries.map(e => e.accessCount);

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate,
      totalSize: entries.reduce((sum, e) => sum + e.size, 0),
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0,
      averageAccessCount: accessCounts.length > 0
        ? accessCounts.reduce((sum, c) => sum + c, 0) / accessCounts.length
        : 0
    };
  }

  // Update cache configuration
  updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // If max size reduced, evict entries
    if (this.cache.size > this.config.maxSize) {
      const entriesToRemove = this.cache.size - this.config.maxSize;
      for (let i = 0; i < entriesToRemove; i++) {
        this.evictLeastRecentlyUsed();
      }
    }
  }

  // Generate cache key with hash for consistent lookups
  generateKey(text: string, options: any = {}): string {
    const keyData = { text: text.trim(), ...options };
    const keyString = JSON.stringify(keyData);

    // Simple hash function for consistent key generation
    let hash = 0;
    for (let i = 0; i < keyString.length; i++) {
      const char = keyString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return `key_${Math.abs(hash).toString(36)}`;
  }

  // Evict least recently used entry
  private evictLeastRecentlyUsed(): void {
    if (this.cache.size === 0) return;

    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedAt < lruTime) {
        lruTime = entry.lastAccessedAt;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.recordCacheMetric('evict', lruKey, { reason: 'lru_eviction' });
    }
  }

  // Estimate object size in bytes
  private estimateSize(obj: any): number {
    try {
      const str = JSON.stringify(obj);
      return new Blob([str]).size;
    } catch (error) {
      // Fallback estimation
      return JSON.stringify(obj).length * 2; // Rough estimate for UTF-16
    }
  }

  // Simple compression (for demo - in production use actual compression library)
  private compress(obj: any): string {
    try {
      const str = JSON.stringify(obj);
      // Simple run-length encoding for demonstration
      return str.replace(/(.)\1+/g, (match, char) => `${char}${match.length}`);
    } catch (error) {
      return JSON.stringify(obj);
    }
  }

  // Decompress (reverse of compress)
  private decompress(compressed: string): any {
    try {
      // Reverse run-length encoding
      const str = compressed.replace(/(.)\d+/g, (match, char) => {
        const count = parseInt(match.slice(1));
        return char.repeat(count);
      });
      return JSON.parse(str);
    } catch (error) {
      return JSON.parse(compressed);
    }
  }

  // Record cache metrics
  private recordCacheMetric(action: 'hit' | 'miss' | 'set' | 'clear' | 'evict', key: string, metadata: any = {}): void {
    if (!this.config.enableMetrics) return;

    const stats = this.getStats();
    const keyHash = this.hashString(key);

    performanceMonitor.recordCacheMetric({
      action,
      cacheType: 'client',
      keyHash,
      dataSize: metadata.size,
      ttl: metadata.ttl,
      hitRate: stats.hitRate,
      size: stats.size,
      maxSize: stats.maxSize
    });
  }

  // Hash string for anonymized logging
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  // Cleanup expired entries
  private startCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          expiredKeys.push(key);
        }
      }

      expiredKeys.forEach(key => {
        this.cache.delete(key);
        this.recordCacheMetric('evict', key, { reason: 'expired' });
      });
    }, 60000); // Check every minute
  }

  // Persistence methods (for browser environments)
  private saveToPersistence(key: string, entry: CacheEntry<T>): void {
    if (typeof window === 'undefined') return;

    try {
      const persistentEntry = {
        ...entry,
        value: entry.compressed ? entry.value : JSON.stringify(entry.value)
      };

      localStorage.setItem(
        `${this.config.keyPrefix}_${key}`,
        JSON.stringify(persistentEntry)
      );
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
    }
  }

  private loadFromPersistence(): void {
    if (typeof window === 'undefined') return;

    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(`${this.config.keyPrefix}_`));

      keys.forEach(storageKey => {
        try {
          const storedData = localStorage.getItem(storageKey);
          if (!storedData) return;

          const entry: CacheEntry<T> = JSON.parse(storedData);

          // Check if still valid
          if (Date.now() <= entry.expiresAt) {
            // Restore value
            if (entry.compressed) {
              entry.value = this.decompress(entry.value as string) as T;
            } else {
              entry.value = JSON.parse(entry.value as string);
            }

            const cacheKey = storageKey.replace(`${this.config.keyPrefix}_`, '');
            this.cache.set(cacheKey, entry);
          } else {
            // Remove expired entry
            localStorage.removeItem(storageKey);
          }
        } catch (error) {
          console.warn('Failed to restore cache entry:', error);
          localStorage.removeItem(storageKey);
        }
      });
    } catch (error) {
      console.warn('Failed to load from localStorage:', error);
    }
  }
}

// Grammar-specific enhanced cache
export class GrammarCache extends EnhancedCache<any> {
  constructor() {
    super({
      maxSize: 500,
      ttl: 600000, // 10 minutes for grammar results
      enableMetrics: true,
      enablePersistence: true,
      keyPrefix: 'grammar'
    });
  }

  // Generate grammar-specific cache key
  generateGrammarKey(text: string, options: {
    includeSpelling?: boolean;
    includeGrammar?: boolean;
    includeStyle?: boolean;
    language?: string;
    userTier?: string;
    enhancePassiveVoice?: boolean;
    priority?: 'fast' | 'quality' | 'balanced';
  }): string {
    return this.generateKey(text, {
      ...options,
      textLength: text.length,
      wordCount: text.split(/\s+/).length
    });
  }

  // Get cached grammar result
  getGrammarResult(text: string, options: any): any | null {
    const key = this.generateGrammarKey(text, options);
    return this.get(key);
  }

  // Cache grammar result
  setGrammarResult(text: string, options: any, result: any, customTtl?: number): void {
    const key = this.generateGrammarKey(text, options);
    this.set(key, result, customTtl);
  }
}

// Export enhanced cache instances
export const grammarCache = new GrammarCache();
export const systemCache = new EnhancedCache({
  maxSize: 200,
  ttl: 300000, // 5 minutes
  enableMetrics: true,
  keyPrefix: 'system'
});

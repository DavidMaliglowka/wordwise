import { auth } from '../lib/firebase';

// Types for performance metrics
export interface PerformanceMetrics {
  id: string;
  timestamp: number;
  sessionId: string;
  userId?: string;
  processingMode: 'client' | 'hybrid' | 'server';
  textLength: number;
  wordCount: number;
  processingTimeMs: number;
  suggestionsCount: number;
  cached: boolean;
  cacheHit?: boolean;
  estimatedCost: number;
  actualCost?: number;
  userTier: 'free' | 'premium';
  errorOccurred: boolean;
  errorType?: string;
  queueWaitTimeMs?: number;
  retryCount?: number;
}

export interface CacheMetrics {
  id: string;
  timestamp: number;
  sessionId: string;
  action: 'hit' | 'miss' | 'set' | 'clear' | 'evict';
  cacheType: 'client' | 'server';
  keyHash: string;
  dataSize?: number;
  ttl?: number;
  hitRate: number;
  size: number;
  maxSize: number;
}

export interface CostMetrics {
  id: string;
  timestamp: number;
  sessionId: string;
  userId?: string;
  provider: 'openai' | 'client';
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost: number;
  currency: string;
  userTier: 'free' | 'premium';
  rateLimitHit: boolean;
  costThresholdExceeded: boolean;
}

export interface SystemHealthMetrics {
  id: string;
  timestamp: number;
  cpuUsage?: number;
  memoryUsage?: number;
  activeRequests: number;
  queueSize: number;
  errorRate: number;
  avgResponseTime: number;
  cacheHitRate: number;
  totalCostToday: number;
  totalRequestsToday: number;
}

// Configuration interface
export interface MonitoringConfig {
  enabled: boolean;
  collectInterval: number; // ms
  maxMetricsAge: number; // ms
  maxStoredMetrics: number;
  enableRealTimeUpdates: boolean;
  costThresholds: {
    free: { daily: number; perCheck: number };
    premium: { daily: number; perCheck: number };
  };
  performanceThresholds: {
    maxProcessingTime: number; // ms
    maxQueueWaitTime: number; // ms
    minCacheHitRate: number; // percentage
  };
}

// Default monitoring configuration
const DEFAULT_CONFIG: MonitoringConfig = {
  enabled: true,
  collectInterval: 1000, // 1 second
  maxMetricsAge: 24 * 60 * 60 * 1000, // 24 hours
  maxStoredMetrics: 10000,
  enableRealTimeUpdates: true,
  costThresholds: {
    free: { daily: 1.0, perCheck: 0.05 },
    premium: { daily: 10.0, perCheck: 0.20 }
  },
  performanceThresholds: {
    maxProcessingTime: 5000, // 5 seconds
    maxQueueWaitTime: 2000, // 2 seconds
    minCacheHitRate: 70 // 70%
  }
};

// Request queue for managing concurrent requests
interface QueuedRequest {
  id: string;
  timestamp: number;
  priority: 'low' | 'normal' | 'high';
  userTier: 'free' | 'premium';
  estimatedCost: number;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  timeoutId?: NodeJS.Timeout;
}

// Main performance monitoring service
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private config: MonitoringConfig = DEFAULT_CONFIG;
  private sessionId: string;
  private metrics: {
    performance: PerformanceMetrics[];
    cache: CacheMetrics[];
    cost: CostMetrics[];
    systemHealth: SystemHealthMetrics[];
  };
  private requestQueue: QueuedRequest[] = [];
  private activeRequests = new Set<string>();
  private listeners: ((metrics: any) => void)[] = [];
  private intervalId?: NodeJS.Timeout;
  private dailyCosts = new Map<string, number>(); // userId -> cost
  private dailyRequestCounts = new Map<string, number>(); // userId -> count

  private constructor() {
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.metrics = {
      performance: [],
      cache: [],
      cost: [],
      systemHealth: []
    };
    this.startMonitoring();
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  // Configuration management
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): MonitoringConfig {
    return { ...this.config };
  }

  // Performance metrics tracking
  recordPerformanceMetric(metric: Omit<PerformanceMetrics, 'id' | 'timestamp' | 'sessionId'>): void {
    if (!this.config.enabled) return;

    const fullMetric: PerformanceMetrics = {
      id: `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      ...metric
    };

    this.metrics.performance.push(fullMetric);
    this.cleanupOldMetrics();
    this.notifyListeners('performance', fullMetric);
  }

  // Cache metrics tracking
  recordCacheMetric(metric: Omit<CacheMetrics, 'id' | 'timestamp' | 'sessionId'>): void {
    if (!this.config.enabled) return;

    const fullMetric: CacheMetrics = {
      id: `cache_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      ...metric
    };

    this.metrics.cache.push(fullMetric);
    this.cleanupOldMetrics();
    this.notifyListeners('cache', fullMetric);
  }

  // Cost metrics tracking
  recordCostMetric(metric: Omit<CostMetrics, 'id' | 'timestamp' | 'sessionId'>): void {
    if (!this.config.enabled) return;

    const fullMetric: CostMetrics = {
      id: `cost_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      ...metric
    };

    this.metrics.cost.push(fullMetric);

    // Update daily cost tracking
    if (metric.userId) {
      const currentCost = this.dailyCosts.get(metric.userId) || 0;
      this.dailyCosts.set(metric.userId, currentCost + metric.cost);

      const currentCount = this.dailyRequestCounts.get(metric.userId) || 0;
      this.dailyRequestCounts.set(metric.userId, currentCount + 1);
    }

    this.cleanupOldMetrics();
    this.notifyListeners('cost', fullMetric);
  }

  // System health monitoring
  recordSystemHealthMetric(): void {
    if (!this.config.enabled) return;

    const now = Date.now();
    const recentPerf = this.metrics.performance.filter(m => now - m.timestamp < 60000); // Last minute
    const recentCache = this.metrics.cache.filter(m => now - m.timestamp < 60000);
    const recentCost = this.metrics.cost.filter(m => now - m.timestamp < 86400000); // Last day

    const errorCount = recentPerf.filter(m => m.errorOccurred).length;
    const totalRequests = recentPerf.length;
    const cacheHits = recentCache.filter(m => m.action === 'hit').length;
    const cacheTotal = recentCache.filter(m => m.action === 'hit' || m.action === 'miss').length;
    const totalCostToday = recentCost.reduce((sum, m) => sum + m.cost, 0);

    const metric: SystemHealthMetrics = {
      id: `health_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: now,
      activeRequests: this.activeRequests.size,
      queueSize: this.requestQueue.length,
      errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
      avgResponseTime: recentPerf.length > 0
        ? recentPerf.reduce((sum, m) => sum + m.processingTimeMs, 0) / recentPerf.length
        : 0,
      cacheHitRate: cacheTotal > 0 ? (cacheHits / cacheTotal) * 100 : 0,
      totalCostToday,
      totalRequestsToday: totalRequests
    };

    this.metrics.systemHealth.push(metric);
    this.cleanupOldMetrics();
    this.notifyListeners('systemHealth', metric);
  }

  // Request queue management
  async queueRequest<T>(
    requestFn: () => Promise<T>,
    options: {
      priority?: 'low' | 'normal' | 'high';
      userTier?: 'free' | 'premium';
      estimatedCost?: number;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const {
      priority = 'normal',
      userTier = 'free',
      estimatedCost = 0,
      timeout = 30000
    } = options;

    return new Promise<T>((resolve, reject) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const queueStartTime = Date.now();

      // Check cost thresholds
      const userId = auth.currentUser?.uid;
      if (userId && this.exceedsUserCostThreshold(userId, estimatedCost, userTier)) {
        reject(new Error('Daily cost threshold exceeded'));
        return;
      }

      const queuedRequest: QueuedRequest = {
        id: requestId,
        timestamp: Date.now(),
        priority,
        userTier,
        estimatedCost,
        resolve: async (value) => {
          const queueWaitTime = Date.now() - queueStartTime;
          this.activeRequests.add(requestId);

          try {
            const result = await requestFn();
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            this.activeRequests.delete(requestId);
            if (queuedRequest.timeoutId) {
              clearTimeout(queuedRequest.timeoutId);
            }
          }
        },
        reject
      };

      // Set timeout
      if (timeout > 0) {
        queuedRequest.timeoutId = setTimeout(() => {
          this.removeFromQueue(requestId);
          reject(new Error('Request timeout'));
        }, timeout);
      }

      // Add to queue and sort by priority
      this.requestQueue.push(queuedRequest);
      this.sortQueue();
      this.processQueue();
    });
  }

  private sortQueue(): void {
    const priorityOrder = { high: 3, normal: 2, low: 1 };
    this.requestQueue.sort((a, b) => {
      // Premium users get priority
      if (a.userTier !== b.userTier) {
        return a.userTier === 'premium' ? -1 : 1;
      }
      // Then by priority level
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      // Finally by timestamp (FIFO)
      return a.timestamp - b.timestamp;
    });
  }

  private async processQueue(): Promise<void> {
    // Process up to 3 concurrent requests for free users, 10 for premium
    const maxConcurrent = this.requestQueue.some(r => r.userTier === 'premium') ? 10 : 3;

    while (this.requestQueue.length > 0 && this.activeRequests.size < maxConcurrent) {
      const request = this.requestQueue.shift();
      if (request) {
        request.resolve(null);
      }
    }
  }

  private removeFromQueue(requestId: string): void {
    const index = this.requestQueue.findIndex(r => r.id === requestId);
    if (index >= 0) {
      const request = this.requestQueue[index];
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      this.requestQueue.splice(index, 1);
    }
  }

  // Cost threshold checking
  private exceedsUserCostThreshold(userId: string, additionalCost: number, userTier: 'free' | 'premium'): boolean {
    const currentCost = this.dailyCosts.get(userId) || 0;
    const threshold = this.config.costThresholds[userTier].daily;
    return (currentCost + additionalCost) > threshold;
  }

  getUserDailyCost(userId: string): number {
    return this.dailyCosts.get(userId) || 0;
  }

  getUserDailyRequestCount(userId: string): number {
    return this.dailyRequestCounts.get(userId) || 0;
  }

  // Analytics and reporting
  getAnalytics(timeRangeMs: number = 3600000): {
    performance: any;
    cache: any;
    cost: any;
    systemHealth: any;
    recommendations: string[];
  } {
    const now = Date.now();
    const cutoff = now - timeRangeMs;

    const recentPerf = this.metrics.performance.filter(m => m.timestamp > cutoff);
    const recentCache = this.metrics.cache.filter(m => m.timestamp > cutoff);
    const recentCost = this.metrics.cost.filter(m => m.timestamp > cutoff);
    const recentHealth = this.metrics.systemHealth.filter(m => m.timestamp > cutoff);

    const analytics = {
      performance: this.analyzePerformance(recentPerf),
      cache: this.analyzeCache(recentCache),
      cost: this.analyzeCost(recentCost),
      systemHealth: this.analyzeSystemHealth(recentHealth),
      recommendations: this.generateRecommendations(recentPerf, recentCache, recentCost, recentHealth)
    };

    return analytics;
  }

  private analyzePerformance(metrics: PerformanceMetrics[]) {
    if (metrics.length === 0) return null;

    const processingTimes = metrics.map(m => m.processingTimeMs);
    const clientOnlyCount = metrics.filter(m => m.processingMode === 'client').length;
    const serverCount = metrics.filter(m => m.processingMode === 'server').length;
    const errorCount = metrics.filter(m => m.errorOccurred).length;

    return {
      totalRequests: metrics.length,
      avgProcessingTime: processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length,
      medianProcessingTime: this.median(processingTimes),
      p95ProcessingTime: this.percentile(processingTimes, 95),
      clientOnlyPercentage: (clientOnlyCount / metrics.length) * 100,
      serverPercentage: (serverCount / metrics.length) * 100,
      errorRate: (errorCount / metrics.length) * 100,
      avgTextLength: metrics.reduce((sum, m) => sum + m.textLength, 0) / metrics.length,
      avgSuggestions: metrics.reduce((sum, m) => sum + m.suggestionsCount, 0) / metrics.length
    };
  }

  private analyzeCache(metrics: CacheMetrics[]) {
    if (metrics.length === 0) return null;

    const hits = metrics.filter(m => m.action === 'hit').length;
    const misses = metrics.filter(m => m.action === 'miss').length;
    const total = hits + misses;

    return {
      hitRate: total > 0 ? (hits / total) * 100 : 0,
      totalOperations: metrics.length,
      avgHitRate: metrics.length > 0
        ? metrics.reduce((sum, m) => sum + m.hitRate, 0) / metrics.length
        : 0,
      avgCacheSize: metrics.length > 0
        ? metrics.reduce((sum, m) => sum + m.size, 0) / metrics.length
        : 0
    };
  }

  private analyzeCost(metrics: CostMetrics[]) {
    if (metrics.length === 0) return null;

    const totalCost = metrics.reduce((sum, m) => sum + m.cost, 0);
    const clientCost = metrics.filter(m => m.provider === 'client').reduce((sum, m) => sum + m.cost, 0);
    const serverCost = metrics.filter(m => m.provider === 'openai').reduce((sum, m) => sum + m.cost, 0);
    const rateLimitHits = metrics.filter(m => m.rateLimitHit).length;

    return {
      totalCost,
      clientCost,
      serverCost,
      avgCostPerRequest: totalCost / metrics.length,
      costSavingsPercentage: totalCost > 0 ? (clientCost / totalCost) * 100 : 0,
      rateLimitHitRate: (rateLimitHits / metrics.length) * 100,
      totalTokens: metrics.reduce((sum, m) => sum + (m.totalTokens || 0), 0)
    };
  }

  private analyzeSystemHealth(metrics: SystemHealthMetrics[]) {
    if (metrics.length === 0) return null;

    return {
      avgActiveRequests: metrics.reduce((sum, m) => sum + m.activeRequests, 0) / metrics.length,
      avgQueueSize: metrics.reduce((sum, m) => sum + m.queueSize, 0) / metrics.length,
      avgErrorRate: metrics.reduce((sum, m) => sum + m.errorRate, 0) / metrics.length,
      avgResponseTime: metrics.reduce((sum, m) => sum + m.avgResponseTime, 0) / metrics.length,
      avgCacheHitRate: metrics.reduce((sum, m) => sum + m.cacheHitRate, 0) / metrics.length
    };
  }

  private generateRecommendations(
    perf: PerformanceMetrics[],
    cache: CacheMetrics[],
    cost: CostMetrics[],
    health: SystemHealthMetrics[]
  ): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    const avgProcessingTime = perf.length > 0
      ? perf.reduce((sum, m) => sum + m.processingTimeMs, 0) / perf.length
      : 0;

    if (avgProcessingTime > this.config.performanceThresholds.maxProcessingTime) {
      recommendations.push('Consider increasing client-side processing to reduce latency');
    }

    // Cache recommendations
    const cacheHits = cache.filter(m => m.action === 'hit').length;
    const cacheMisses = cache.filter(m => m.action === 'miss').length;
    const hitRate = (cacheHits + cacheMisses) > 0 ? (cacheHits / (cacheHits + cacheMisses)) * 100 : 0;

    if (hitRate < this.config.performanceThresholds.minCacheHitRate) {
      recommendations.push('Cache hit rate is low. Consider adjusting cache TTL or key generation strategy');
    }

    // Cost recommendations
    const serverCost = cost.filter(m => m.provider === 'openai').reduce((sum, m) => sum + m.cost, 0);
    const totalCost = cost.reduce((sum, m) => sum + m.cost, 0);

    if (totalCost > 0 && (serverCost / totalCost) > 0.3) {
      recommendations.push('High server processing costs detected. Consider increasing client-side processing');
    }

    // Queue recommendations
    const avgQueueSize = health.length > 0
      ? health.reduce((sum, m) => sum + m.queueSize, 0) / health.length
      : 0;

    if (avgQueueSize > 5) {
      recommendations.push('Request queue size is high. Consider increasing concurrent request limits');
    }

    return recommendations;
  }

  // Utility methods
  private median(arr: number[]): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  private percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  // Cleanup and maintenance
  private cleanupOldMetrics(): void {
    const now = Date.now();
    const maxAge = this.config.maxMetricsAge;

    this.metrics.performance = this.metrics.performance
      .filter(m => now - m.timestamp < maxAge)
      .slice(-this.config.maxStoredMetrics);

    this.metrics.cache = this.metrics.cache
      .filter(m => now - m.timestamp < maxAge)
      .slice(-this.config.maxStoredMetrics);

    this.metrics.cost = this.metrics.cost
      .filter(m => now - m.timestamp < maxAge)
      .slice(-this.config.maxStoredMetrics);

    this.metrics.systemHealth = this.metrics.systemHealth
      .filter(m => now - m.timestamp < maxAge)
      .slice(-this.config.maxStoredMetrics);
  }

  // Event listeners for real-time updates
  addListener(callback: (metrics: any) => void): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(type: string, metric: any): void {
    if (this.config.enableRealTimeUpdates) {
      this.listeners.forEach(listener => {
        try {
          listener({ type, metric });
        } catch (error) {
          console.error('Error in performance monitor listener:', error);
        }
      });
    }
  }

  // Monitoring lifecycle
  private startMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      this.recordSystemHealthMetric();
      this.cleanupOldMetrics();
      this.resetDailyCounts();
    }, this.config.collectInterval);
  }

  private resetDailyCounts(): void {
    // Reset daily counters at midnight
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      this.dailyCosts.clear();
      this.dailyRequestCounts.clear();
    }
  }

  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  // Export data for analysis
  exportMetrics(): {
    performance: PerformanceMetrics[];
    cache: CacheMetrics[];
    cost: CostMetrics[];
    systemHealth: SystemHealthMetrics[];
    config: MonitoringConfig;
  } {
    return {
      performance: [...this.metrics.performance],
      cache: [...this.metrics.cache],
      cost: [...this.metrics.cost],
      systemHealth: [...this.metrics.systemHealth],
      config: { ...this.config }
    };
  }

  // Reset all metrics
  reset(): void {
    this.metrics = {
      performance: [],
      cache: [],
      cost: [],
      systemHealth: []
    };
    this.dailyCosts.clear();
    this.dailyRequestCounts.clear();
    this.requestQueue.length = 0;
    this.activeRequests.clear();
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();

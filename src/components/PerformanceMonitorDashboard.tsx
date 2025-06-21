import React, { useState, useEffect } from 'react';
import { performanceMonitor } from '../services/performance-monitor';
import { grammarCache, systemCache } from '../services/enhanced-cache';

interface DashboardProps {
  onClose?: () => void;
}

export const PerformanceMonitorDashboard: React.FC<DashboardProps> = ({ onClose }) => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [timeRange, setTimeRange] = useState<number>(3600000); // 1 hour default
  const [isLoading, setIsLoading] = useState(true);

  // Fetch analytics data
  const fetchAnalytics = async () => {
    setIsLoading(true);
    try {
      const data = performanceMonitor.getAnalytics(timeRange);
      setAnalytics(data);

      const grammarCacheStats = grammarCache.getStats();
      const systemCacheStats = systemCache.getStats();

      setCacheStats({
        grammar: grammarCacheStats,
        system: systemCacheStats
      });

      setSystemStats({
        grammarCacheSize: grammarCacheStats.size,
        systemCacheSize: systemCacheStats.size,
        totalCacheSize: grammarCacheStats.totalSize + systemCacheStats.totalSize
      });

    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Set up real-time updates
  useEffect(() => {
    fetchAnalytics();

    const unsubscribe = performanceMonitor.addListener((update) => {
      // Refresh analytics when new metrics arrive
      fetchAnalytics();
    });

    // Refresh every 30 seconds
    const interval = setInterval(fetchAnalytics, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [timeRange]);

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(3)}`;
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-center">Loading performance data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-semibold">Performance Monitor Dashboard</h2>
          <div className="flex items-center gap-4">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(Number(e.target.value))}
              className="border border-gray-300 rounded px-3 py-1"
            >
              <option value={300000}>Last 5 minutes</option>
              <option value={900000}>Last 15 minutes</option>
              <option value={3600000}>Last hour</option>
              <option value={86400000}>Last 24 hours</option>
            </select>
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Performance Overview */}
          {analytics?.performance && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2">Processing Performance</h3>
                <div className="space-y-1 text-sm">
                  <div>Total Requests: <span className="font-mono">{analytics.performance.totalRequests}</span></div>
                  <div>Avg Time: <span className="font-mono">{formatTime(analytics.performance.avgProcessingTime)}</span></div>
                  <div>Client Only: <span className="font-mono">{analytics.performance.clientOnlyPercentage.toFixed(1)}%</span></div>
                  <div>Error Rate: <span className="font-mono">{analytics.performance.errorRate.toFixed(1)}%</span></div>
                </div>
              </div>

              {analytics.cache && (
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-medium text-green-900 mb-2">Cache Performance</h3>
                  <div className="space-y-1 text-sm">
                    <div>Hit Rate: <span className="font-mono">{analytics.cache.hitRate.toFixed(1)}%</span></div>
                    <div>Total Ops: <span className="font-mono">{analytics.cache.totalOperations}</span></div>
                  </div>
                </div>
              )}

              {analytics.cost && (
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h3 className="font-medium text-yellow-900 mb-2">Cost Analysis</h3>
                  <div className="space-y-1 text-sm">
                    <div>Total Cost: <span className="font-mono">{formatCurrency(analytics.cost.totalCost)}</span></div>
                    <div>Server Cost: <span className="font-mono">{formatCurrency(analytics.cost.serverCost)}</span></div>
                    <div>Savings: <span className="font-mono">{analytics.cost.costSavingsPercentage.toFixed(1)}%</span></div>
                    <div>Avg/Request: <span className="font-mono">{formatCurrency(analytics.cost.avgCostPerRequest)}</span></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Detailed Cache Statistics */}
          {cacheStats && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-3">Cache Statistics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-sm text-gray-700 mb-2">Grammar Cache</h4>
                  <div className="space-y-1 text-xs">
                    <div>Size: {cacheStats.grammar.size}/{cacheStats.grammar.maxSize}</div>
                    <div>Hit Rate: {cacheStats.grammar.hitRate.toFixed(1)}%</div>
                    <div>Total Size: {formatSize(cacheStats.grammar.totalSize)}</div>
                    <div>Avg Access: {cacheStats.grammar.averageAccessCount.toFixed(1)}</div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-sm text-gray-700 mb-2">System Cache</h4>
                  <div className="space-y-1 text-xs">
                    <div>Size: {cacheStats.system.size}/{cacheStats.system.maxSize}</div>
                    <div>Hit Rate: {cacheStats.system.hitRate.toFixed(1)}%</div>
                    <div>Total Size: {formatSize(cacheStats.system.totalSize)}</div>
                    <div>Avg Access: {cacheStats.system.averageAccessCount.toFixed(1)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {analytics?.recommendations && analytics.recommendations.length > 0 && (
            <div className="bg-purple-50 p-4 rounded-lg">
              <h3 className="font-medium text-purple-900 mb-3">Optimization Recommendations</h3>
              <ul className="space-y-2">
                {analytics.recommendations.map((rec: string, index: number) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <span className="text-purple-600 mt-0.5">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  grammarCache.clear();
                  systemCache.clear();
                  fetchAnalytics();
                }}
                className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
              >
                Clear All Caches
              </button>
              <button
                onClick={() => {
                  const data = performanceMonitor.exportMetrics();
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `performance-metrics-${new Date().toISOString()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                Export Metrics
              </button>
            </div>
            <div className="text-xs text-gray-500">
              Last updated: {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

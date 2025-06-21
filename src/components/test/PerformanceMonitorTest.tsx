import React, { useState, useEffect } from 'react';
import { performanceMonitor } from '../../services/performance-monitor';
import { grammarCache, systemCache } from '../../services/enhanced-cache';
import { hybridGrammarService } from '../../services/grammar-hybrid';

const PerformanceMonitorTest: React.FC = () => {
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [analytics, setAnalytics] = useState<any>(null);
  const [cacheStats, setCacheStats] = useState<any>(null);

  // Sample test texts of varying complexity
  const testTexts = [
    "Hello world!", // Simple
    "This is a test sentence with some basic grammar and spelling to check.", // Medium
    "The quick brown fox jumps over the lazy dog. This pangram contains every letter of the alphabet and is commonly used for testing.", // Complex
    "I have alot of things to do today. Its going to be a busy day and I need to make sure everything gets done on time.", // With errors
    "The performance monitoring system should track metrics like processing time, cache hit rates, and cost optimization. It needs to provide real-time analytics and recommendations for improving system efficiency." // Long with technical terms
  ];

  const runPerformanceTests = async () => {
    setIsRunning(true);
    setTestResults([]);

    try {
      const results = [];

      for (let i = 0; i < testTexts.length; i++) {
        const text = testTexts[i];
        const testName = `Test ${i + 1} (${text.length} chars)`;

        console.log(`Running ${testName}...`);

        const startTime = Date.now();

        try {
          // Test the hybrid grammar service
          const result = await hybridGrammarService.checkGrammar(text, {
            includeStyle: true,
            priority: 'balanced',
            userTier: 'free'
          });

          const endTime = Date.now();
          const processingTime = endTime - startTime;

          results.push({
            testName,
            text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
            processingTime,
            suggestionsCount: result.suggestions.length,
            processingMode: result.processingMode,
            cached: false, // First run won't be cached
            success: true
          });

          // Test cache by running the same text again
          const cacheStartTime = Date.now();
          const cachedResult = await hybridGrammarService.checkGrammar(text, {
            includeStyle: true,
            priority: 'balanced',
            userTier: 'free'
          });
          const cacheEndTime = Date.now();
          const cacheProcessingTime = cacheEndTime - cacheStartTime;

          results.push({
            testName: `${testName} (Cached)`,
            text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
            processingTime: cacheProcessingTime,
            suggestionsCount: cachedResult.suggestions.length,
            processingMode: cachedResult.processingMode,
            cached: true,
            success: true
          });

        } catch (error: any) {
          results.push({
            testName,
            text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
            processingTime: 0,
            suggestionsCount: 0,
            processingMode: 'error',
            cached: false,
            success: false,
            error: error.message
          });
        }

        // Add a small delay between tests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      setTestResults(results);

      // Get analytics after all tests
      const analyticsData = performanceMonitor.getAnalytics(300000); // Last 5 minutes
      setAnalytics(analyticsData);

      // Get cache statistics
      const grammarCacheStats = grammarCache.getStats();
      const systemCacheStats = systemCache.getStats();
      setCacheStats({
        grammar: grammarCacheStats,
        system: systemCacheStats
      });

    } catch (error) {
      console.error('Test suite failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const clearCaches = () => {
    grammarCache.clear();
    systemCache.clear();
    setTestResults([]);
    setAnalytics(null);
    setCacheStats(null);
  };

  const exportMetrics = () => {
    const data = performanceMonitor.exportMetrics();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-test-metrics-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Performance Monitor Test Suite
        </h1>
        <p className="text-gray-600 mb-6">
          This test suite verifies the performance monitoring system by running various grammar checks
          and measuring processing times, cache efficiency, and cost metrics.
        </p>

        <div className="flex gap-4 mb-6">
          <button
            onClick={runPerformanceTests}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? 'Running Tests...' : 'Run Performance Tests'}
          </button>
          <button
            onClick={clearCaches}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Clear Caches
          </button>
          <button
            onClick={exportMetrics}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Export Metrics
          </button>
        </div>

        {isRunning && (
          <div className="flex items-center gap-3 mb-6">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="text-gray-600">Running performance tests...</span>
          </div>
        )}
      </div>

      {/* Test Results */}
      {testResults.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Test Results</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Test
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Text Sample
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Processing Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Suggestions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mode
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {testResults.map((result, index) => (
                  <tr key={index} className={result.cached ? 'bg-green-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {result.testName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {result.text}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {result.processingTime}ms
                      {result.cached && (
                        <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Cached
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {result.suggestionsCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {result.processingMode}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {result.success ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analytics Summary */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {analytics.performance && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Requests:</span>
                  <span className="font-mono">{analytics.performance.totalRequests}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Avg Processing Time:</span>
                  <span className="font-mono">{analytics.performance.avgProcessingTime.toFixed(1)}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Client Only %:</span>
                  <span className="font-mono">{analytics.performance.clientOnlyPercentage.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Error Rate:</span>
                  <span className="font-mono">{analytics.performance.errorRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}

          {analytics.cache && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Cache Performance</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Hit Rate:</span>
                  <span className="font-mono">{analytics.cache.hitRate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Operations:</span>
                  <span className="font-mono">{analytics.cache.totalOperations}</span>
                </div>
              </div>
            </div>
          )}

          {analytics.cost && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost Analysis</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Cost:</span>
                  <span className="font-mono">${analytics.cost.totalCost.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Server Cost:</span>
                  <span className="font-mono">${analytics.cost.serverCost.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Savings:</span>
                  <span className="font-mono">{analytics.cost.costSavingsPercentage.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cache Statistics */}
      {cacheStats && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Cache Statistics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Grammar Cache</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Size:</span>
                  <span className="font-mono">{cacheStats.grammar.size}/{cacheStats.grammar.maxSize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Hit Rate:</span>
                  <span className="font-mono">{cacheStats.grammar.hitRate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Size:</span>
                  <span className="font-mono">{(cacheStats.grammar.totalSize / 1024).toFixed(1)}KB</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-3">System Cache</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Size:</span>
                  <span className="font-mono">{cacheStats.system.size}/{cacheStats.system.maxSize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Hit Rate:</span>
                  <span className="font-mono">{cacheStats.system.hitRate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Size:</span>
                  <span className="font-mono">{(cacheStats.system.totalSize / 1024).toFixed(1)}KB</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {analytics?.recommendations && analytics.recommendations.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Optimization Recommendations</h3>
          <ul className="space-y-2">
            {analytics.recommendations.map((rec: string, index: number) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-blue-600 mt-1">•</span>
                <span className="text-gray-700">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PerformanceMonitorTest;

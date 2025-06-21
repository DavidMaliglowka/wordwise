// Simple test script for performance monitoring
// Run with: node src/test-performance.js

const testTexts = [
  "Hello world!",
  "This is a test sentence with some basic grammar and spelling to check.",
  "The quick brown fox jumps over the lazy dog.",
  "I have alot of things to do today. Its going to be a busy day.",
  "The performance monitoring system should track metrics like processing time and cache hit rates."
];

async function testPerformanceMonitoring() {
  console.log('🧪 Testing Performance Monitoring System\n');

  // Note: This would need to be adapted based on your actual service imports
  // and may need to run in a browser environment instead of Node.js

  try {
    // Import your services (adjust paths as needed)
    const { performanceMonitor } = require('./services/performance-monitor');
    const { grammarCache } = require('./services/enhanced-cache');
    const { hybridGrammarService } = require('./services/grammar-hybrid');

    console.log('📊 Initial cache stats:');
    console.log(grammarCache.getStats());

    console.log('\n🚀 Running grammar checks...');

    for (let i = 0; i < testTexts.length; i++) {
      const text = testTexts[i];
      console.log(`\nTest ${i + 1}: "${text.substring(0, 30)}..."`);

      const startTime = Date.now();

      try {
        const result = await hybridGrammarService.checkGrammar(text, {
          includeStyle: true,
          priority: 'balanced',
          userTier: 'free'
        });

        const endTime = Date.now();
        const processingTime = endTime - startTime;

        console.log(`  ✅ Processed in ${processingTime}ms`);
        console.log(`  📝 Found ${result.suggestions.length} suggestions`);
        console.log(`  🔧 Mode: ${result.processingMode}`);

      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
      }
    }

    console.log('\n📈 Final Analytics:');
    const analytics = performanceMonitor.getAnalytics(300000);
    console.log(JSON.stringify(analytics, null, 2));

    console.log('\n💾 Final Cache Stats:');
    console.log(grammarCache.getStats());

    console.log('\n✨ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Note: This script may need to run in a browser environment');
    console.log('   Consider using the PerformanceMonitorTest component instead.');
  }
}

if (require.main === module) {
  testPerformanceMonitoring();
}

module.exports = { testPerformanceMonitoring };

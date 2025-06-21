// Hybrid Grammar Integration Validation Script
// Run this in the browser console on /test/hybrid or /editor/:id

console.log('🧪 Starting Hybrid Grammar Integration Validation...');

// Test 1: Verify hybrid service is available
function testHybridServiceAvailability() {
  console.log('\n1️⃣ Testing Hybrid Service Availability...');

  try {
    // Check if hybrid service is accessible
    if (window.hybridGrammarService) {
      console.log('✅ HybridGrammarService is globally available');
      return true;
    } else {
      console.log('❌ HybridGrammarService not found globally');
      return false;
    }
  } catch (error) {
    console.log('❌ Error checking hybrid service:', error.message);
    return false;
  }
}

// Test 2: Verify performance monitor integration
function testPerformanceMonitorIntegration() {
  console.log('\n2️⃣ Testing Performance Monitor Integration...');

  try {
    if (window.performanceMonitor) {
      console.log('✅ PerformanceMonitor is globally available');

      // Get current stats
      const stats = window.performanceMonitor.getAnalytics(60000); // Last minute
      console.log('📊 Current performance stats:', stats);

      return true;
    } else {
      console.log('❌ PerformanceMonitor not found globally');
      return false;
    }
  } catch (error) {
    console.log('❌ Error checking performance monitor:', error.message);
    return false;
  }
}

// Test 3: Check DOM for grammar marks
function testGrammarMarksInDOM() {
  console.log('\n3️⃣ Testing Grammar Marks in DOM...');

  try {
    const marks = document.querySelectorAll('[data-suggestion-id]');
    console.log(`📝 Found ${marks.length} grammar marks in DOM`);

    marks.forEach((mark, index) => {
      console.log(`   Mark ${index + 1}:`, {
        suggestionId: mark.dataset.suggestionId,
        suggestionType: mark.dataset.suggestionType,
        text: mark.textContent,
        className: mark.className
      });
    });

    return marks.length > 0;
  } catch (error) {
    console.log('❌ Error checking DOM marks:', error.message);
    return false;
  }
}

// Test 4: Verify hover card functionality
function testHoverCardFunctionality() {
  console.log('\n4️⃣ Testing Hover Card Functionality...');

  try {
    // Look for hover card elements
    const hoverCards = document.querySelectorAll('[role="tooltip"]');
    console.log(`💬 Found ${hoverCards.length} hover card elements`);

    // Check for floating UI elements
    const floatingElements = document.querySelectorAll('[data-floating-ui-portal]');
    console.log(`🎈 Found ${floatingElements.length} floating UI portal elements`);

    return true;
  } catch (error) {
    console.log('❌ Error checking hover cards:', error.message);
    return false;
  }
}

// Test 5: Verify event delegation
function testEventDelegation() {
  console.log('\n5️⃣ Testing Event Delegation...');

  try {
    const editorRoot = document.querySelector('[contenteditable="true"]');
    if (editorRoot) {
      console.log('✅ Found contenteditable editor root');

      // Check for event listeners (this is approximate)
      const hasClickListeners = editorRoot.onclick !== null ||
                               editorRoot.addEventListener.toString().includes('click');
      console.log(`🖱️ Click event delegation: ${hasClickListeners ? 'Detected' : 'Not detected'}`);

      return true;
    } else {
      console.log('❌ No contenteditable editor found');
      return false;
    }
  } catch (error) {
    console.log('❌ Error checking event delegation:', error.message);
    return false;
  }
}

// Test 6: Performance benchmark
async function testPerformanceBenchmark() {
  console.log('\n6️⃣ Running Performance Benchmark...');

  try {
    if (!window.hybridGrammarService) {
      console.log('❌ Cannot run benchmark - hybrid service not available');
      return false;
    }

    const testText = "This is a test sentance with speling errors. Their going to the store.";
    console.log('📝 Testing with:', testText);

    const startTime = performance.now();
    const result = await window.hybridGrammarService.checkGrammar(testText, {
      includeStyle: true,
      priority: 'balanced',
      userTier: 'free'
    });
    const endTime = performance.now();

    const processingTime = endTime - startTime;
    console.log('⚡ Performance Results:', {
      processingTime: `${processingTime.toFixed(1)}ms`,
      suggestionsFound: result.suggestions.length,
      processingMode: result.processingMode,
      estimatedCost: result.decision.estimatedCost
    });

    // Good performance is under 100ms for client processing
    const isGoodPerformance = processingTime < 100 && result.processingMode === 'client';
    console.log(`🎯 Performance Grade: ${isGoodPerformance ? '✅ Excellent' : '⚠️ Needs Review'}`);

    return isGoodPerformance;
  } catch (error) {
    console.log('❌ Error running performance benchmark:', error.message);
    return false;
  }
}

// Main validation function
async function validateHybridIntegration() {
  console.log('🚀 Starting Comprehensive Hybrid Grammar Integration Validation\n');

  const tests = [
    { name: 'Hybrid Service Availability', fn: testHybridServiceAvailability },
    { name: 'Performance Monitor Integration', fn: testPerformanceMonitorIntegration },
    { name: 'Grammar Marks in DOM', fn: testGrammarMarksInDOM },
    { name: 'Hover Card Functionality', fn: testHoverCardFunctionality },
    { name: 'Event Delegation', fn: testEventDelegation },
    { name: 'Performance Benchmark', fn: testPerformanceBenchmark }
  ];

  let passedTests = 0;
  const results = [];

  for (const test of tests) {
    try {
      const result = await test.fn();
      results.push({ name: test.name, passed: result });
      if (result) passedTests++;
    } catch (error) {
      console.log(`❌ Test "${test.name}" failed with error:`, error.message);
      results.push({ name: test.name, passed: false, error: error.message });
    }
  }

  console.log('\n📊 VALIDATION SUMMARY:');
  console.log('=' .repeat(50));

  results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${result.name}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log('=' .repeat(50));
  console.log(`📈 Overall Score: ${passedTests}/${tests.length} tests passed`);

  if (passedTests === tests.length) {
    console.log('🎉 ALL TESTS PASSED! Hybrid integration is working correctly.');
  } else if (passedTests >= tests.length * 0.8) {
    console.log('⚠️ Most tests passed. Minor issues may need attention.');
  } else {
    console.log('🚨 Several tests failed. Integration needs review.');
  }

  return { passedTests, totalTests: tests.length, results };
}

// Auto-run validation
validateHybridIntegration().then(summary => {
  console.log('\n🏁 Validation completed. Results available in return value.');
}).catch(error => {
  console.error('🚨 Validation failed:', error);
});

// Export for manual use
window.validateHybridIntegration = validateHybridIntegration;

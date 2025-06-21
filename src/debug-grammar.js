// Debug script to test grammar processing
import { hybridGrammarService } from './services/grammar-hybrid.js';

const testTexts = [
  'This is a test sentance with speling errors.',
  'Their going to the store.',
  'A elephant is big.',
  'I recieve many emails.',
  'This is seperate from that.',
  'It occured yesterday.',
  'That is definately wrong.'
];

async function debugGrammarProcessing() {
  console.log('🔍 Starting grammar processing debug...');

  for (const text of testTexts) {
    try {
      console.log(`\n📝 Testing: "${text}"`);
      const result = await hybridGrammarService.checkGrammar(text, {
        includeStyle: false,
        priority: 'fast',
        userTier: 'free'
      });

      console.log(`✅ Result:`, {
        processingMode: result.processingMode,
        suggestionsCount: result.suggestions.length,
        processingTime: result.processingTimeMs,
        suggestions: result.suggestions.map(s => ({
          type: s.type,
          flaggedText: s.flaggedText,
          replacement: s.replacement,
          message: s.message,
          range: s.range
        }))
      });

      if (result.suggestions.length === 0) {
        console.log('⚠️  No suggestions found for text with obvious errors');
      }

    } catch (error) {
      console.error(`❌ Error processing "${text}":`, error);
    }
  }
}

// Run if called directly
if (typeof window !== 'undefined') {
  window.debugGrammarProcessing = debugGrammarProcessing;
  console.log('Debug function available as window.debugGrammarProcessing()');
} else {
  debugGrammarProcessing().catch(console.error);
}

export { debugGrammarProcessing };

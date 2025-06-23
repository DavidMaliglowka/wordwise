import React, { useState, useEffect } from 'react';
import { HybridGrammarService } from '../../services/grammar-hybrid';

export const GrammarTest: React.FC = () => {
  const [testText, setTestText] = useState('The book was written by the author. This is a misspeled word.');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingMode, setProcessingMode] = useState<string>('');

  const runTest = async () => {
    setLoading(true);
    setSuggestions([]);
    setProcessingMode('');

    try {
      console.log('🧪 Testing grammar with text:', testText);

      const grammarService = HybridGrammarService.getInstance();
      const result = await grammarService.checkGrammar(testText, {
        enhancePassiveVoice: true,
        includeStyle: false,
        priority: 'balanced'
      });

      console.log('🧪 Grammar test result:', result);

      setSuggestions(result.suggestions);
      setProcessingMode(result.processingMode);
    } catch (error) {
      console.error('🧪 Grammar test failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runTest();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Grammar System Test</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Test Text:</label>
        <textarea
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          className="w-full p-3 border rounded-lg h-24"
          placeholder="Enter text to test..."
        />
      </div>

      <button
        onClick={runTest}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Testing...' : 'Test Grammar'}
      </button>

      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-2">
          Results ({suggestions.length} suggestions) - Mode: {processingMode}
        </h3>

        {suggestions.length === 0 && !loading && (
          <p className="text-gray-500">No suggestions found</p>
        )}

        {suggestions.map((suggestion, index) => (
          <div key={index} className="border rounded-lg p-4 mb-2 bg-gray-50">
            <div className="font-medium text-sm text-gray-600 mb-1">
              {suggestion.type} • {suggestion.rule}
            </div>
            <div className="mb-2">
              <strong>Issue:</strong> {suggestion.message}
            </div>
            <div className="mb-2">
              <strong>Text:</strong> "{suggestion.flaggedText}"
              <span className="text-gray-500 ml-2">
                (pos: {suggestion.range.start}-{suggestion.range.end})
              </span>
            </div>
            {suggestion.replacement && (
              <div className="mb-2">
                <strong>Suggestion:</strong> "{suggestion.replacement}"
              </div>
            )}
            <div className="text-sm text-gray-500">
              Confidence: {suggestion.confidence}% •
              {suggestion.canRegenerate && ' Can Regenerate •'}
              Severity: {suggestion.severity}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

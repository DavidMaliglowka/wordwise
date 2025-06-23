import React, { useState, useEffect } from 'react';
import { HybridGrammarService } from '../../services/grammar-hybrid';

export const GrammarTest: React.FC = () => {
  const [testText, setTestText] = useState('The ball was thrown by John.');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingMode, setProcessingMode] = useState<string>('');
  const [cloudFunctionResult, setCloudFunctionResult] = useState<any>(null);

  const runTest = async () => {
    setLoading(true);
    setSuggestions([]);
    setProcessingMode('');
    setCloudFunctionResult(null);

    try {
      console.log('🧪 Testing grammar with text:', testText);

      const grammarService = HybridGrammarService.getInstance();
      const result = await grammarService.checkGrammar(testText, {
        enhancePassiveVoice: true,
        includeStyle: true,
        priority: 'quality',
        userTier: 'premium'
      });

      console.log('📊 Test Results:', result);
      setSuggestions(result.suggestions);
      setProcessingMode(result.processingMode);

    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const testSpellingRefinement = async () => {
    setLoading(true);
    setSuggestions([]);
    setProcessingMode('');
    setCloudFunctionResult(null);

    try {
      console.log('🔤 Testing spelling refinement with misspelled text...');

      // Test text with deliberate spelling errors that should get context-aware corrections
      const spellingTestText = "I need to check the currect spelings in this sentance.";
      setTestText(spellingTestText);

      const grammarService = HybridGrammarService.getInstance();
      const result = await grammarService.checkGrammar(spellingTestText, {
        enhancePassiveVoice: false,
        includeStyle: false,
        priority: 'quality',
        userTier: 'premium'
      });

      console.log('📊 Spelling Test Results:', result);
      setSuggestions(result.suggestions);
      setProcessingMode(result.processingMode);

      // Filter to show only spelling suggestions
      const spellingSuggestions = result.suggestions.filter(s => s.type === 'spelling');
      console.log('🔤 Spelling suggestions found:', spellingSuggestions);

    } catch (error) {
      console.error('❌ Spelling test failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const testCloudFunctionDirectly = async () => {
    setLoading(true);
    setCloudFunctionResult(null);

    try {
      console.log('🌐 Testing Cloud Function directly...');

      // Import Firebase functions
      const { functions } = await import('../../lib/firebase');
      const { httpsCallable } = await import('firebase/functions');

      const enhancePassiveVoice = httpsCallable(functions, 'enhancePassiveVoice');

      const result = await enhancePassiveVoice({
        sentences: [testText],
        language: 'en'
      });

      console.log('📨 Cloud Function Result:', result.data);
      setCloudFunctionResult(result.data);

    } catch (error: any) {
      console.error('❌ Cloud Function test failed:', error);
      setCloudFunctionResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const testSpellingCloudFunction = async () => {
    setLoading(true);
    setCloudFunctionResult(null);

    try {
      console.log('🌐 Testing checkGrammar Cloud Function for spelling...');

      // Import Firebase functions
      const { functions } = await import('../../lib/firebase');
      const { httpsCallable } = await import('firebase/functions');

      const checkGrammar = httpsCallable(functions, 'checkGrammar');

      const result = await checkGrammar({
        text: "I need to check the currect spelings in this sentance.",
        includeSpelling: true,
        includeGrammar: false,
        includeStyle: false,
        enhancePassiveVoice: false
      });

      console.log('📨 Spelling Cloud Function Result:', result.data);
      setCloudFunctionResult(result.data);

    } catch (error: any) {
      console.error('❌ Spelling Cloud Function test failed:', error);
      setCloudFunctionResult({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Grammar System Diagnostic Test</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Test Text:</label>
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className="w-full p-2 border rounded"
            rows={3}
          />
        </div>

        <div className="flex gap-4 flex-wrap">
          <button
            onClick={runTest}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Full Grammar System'}
          </button>

          <button
            onClick={testSpellingRefinement}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Spelling Refinement'}
          </button>

          <button
            onClick={testCloudFunctionDirectly}
            disabled={loading}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Passive Voice Function'}
          </button>

          <button
            onClick={testSpellingCloudFunction}
            disabled={loading}
            className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Spelling Cloud Function'}
          </button>
        </div>

        {processingMode && (
          <div className="p-4 bg-gray-100 rounded">
            <strong>Processing Mode:</strong> {processingMode}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="p-4 bg-green-100 rounded">
            <h3 className="font-bold mb-2">Grammar Suggestions ({suggestions.length}):</h3>
            <div className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <div key={index} className="p-2 bg-white rounded border">
                  <div className="font-medium text-sm">
                    <span className="text-blue-600">{suggestion.type}</span>
                    {suggestion.canRegenerate && (
                      <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        Can Regenerate
                      </span>
                    )}
                  </div>
                  <div className="text-sm mt-1">
                    <strong>Original:</strong> "{suggestion.flaggedText || suggestion.original}"
                  </div>
                  <div className="text-sm">
                    <strong>Replacement:</strong> "{suggestion.replacement || suggestion.proposed}"
                  </div>
                  <div className="text-sm text-gray-600">
                    <strong>Message:</strong> {suggestion.message || suggestion.explanation}
                  </div>
                  <div className="text-xs text-gray-500">
                    Confidence: {suggestion.confidence}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {cloudFunctionResult && (
          <div className="p-4 bg-blue-100 rounded">
            <h3 className="font-bold mb-2">Cloud Function Direct Result:</h3>
            <pre className="text-sm overflow-auto">
              {JSON.stringify(cloudFunctionResult, null, 2)}
            </pre>
          </div>
        )}

        {suggestions.length === 0 && !loading && processingMode && (
          <div className="p-4 bg-yellow-100 rounded">
            <strong>No suggestions found</strong> - This indicates the issue we're investigating
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useGrammarCheck } from '../../hooks/useGrammarCheck';
import { EditorSuggestion } from '../../types/grammar';

const GrammarTest: React.FC = () => {
  const [testText, setTestText] = useState('She dont like apples and their going to the store.');

  const {
    suggestions,
    isLoading,
    error,
    lastCheckedText,
    checkText,
    clearSuggestions,
    dismissSuggestion,
    applySuggestion,
    retryLastCheck,
    cacheStats
  } = useGrammarCheck({
    delay: 1000,
    minLength: 3,
    includeSpelling: true,
    includeGrammar: true,
    includeStyle: false,
    enableCache: true
  });

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setTestText(text);
    checkText(text);
  };

  const handleApplySuggestion = (suggestion: EditorSuggestion) => {
    const result = applySuggestion(suggestion.id, testText);
    if (result) {
      // Apply the suggestion to the text using the smart replacement result
      setTestText(result.newText);

      // Re-check the new text after a short delay to get updated suggestions
      setTimeout(() => {
        checkText(result.newText);
      }, 100);
    }
  };

  const getSuggestionTypeColor = (type: string) => {
    switch (type) {
      case 'grammar': return 'text-red-600 bg-red-50 border-red-200';
      case 'spelling': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'punctuation': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'style': return 'text-purple-600 bg-purple-50 border-purple-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">Grammar Check Test</h2>

        {/* Test Input */}
        <div className="mb-6">
          <label htmlFor="test-text" className="block text-sm font-medium text-gray-700 mb-2">
            Test Text (type to trigger grammar checking)
          </label>
          <textarea
            id="test-text"
            value={testText}
            onChange={handleTextChange}
            className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={4}
            placeholder="Type some text with grammar errors..."
          />
          <p className="text-sm text-gray-500 mt-1">
            Try: "She dont like apples and their going to the store."
          </p>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-4 mb-6">
          <div className={`px-3 py-1 rounded-full text-sm ${isLoading ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
            {isLoading ? '🔄 Checking...' : '✅ Ready'}
          </div>

          <div className="text-sm text-gray-600">
            Cache: {cacheStats.size} items
          </div>

          {lastCheckedText && (
            <div className="text-sm text-gray-600">
              Last checked: {lastCheckedText.length} chars
            </div>
          )}

          <button
            onClick={() => {
              // Clear cache and re-check current text
              import('../../services/grammar').then(({ GrammarService }) => {
                GrammarService.clearCache();
                if (testText) {
                  checkText(testText);
                }
              });
            }}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Clear Cache & Recheck
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center">
              <span className="text-red-600 font-medium">Error ({error.type}):</span>
              <span className="ml-2 text-red-700">{error.message}</span>
              {error.code && (
                <span className="ml-2 text-red-500 text-sm">[{error.code}]</span>
              )}
            </div>
            <button
              onClick={retryLastCheck}
              className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}

        {/* Suggestions Display */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-800">
              Suggestions ({suggestions.length})
            </h3>
            {suggestions.length > 0 && (
              <button
                onClick={clearSuggestions}
                className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
              >
                Clear All
              </button>
            )}
          </div>

          {suggestions.length === 0 ? (
            <div className="p-4 bg-gray-50 rounded-md text-gray-600 text-center">
              {isLoading ? 'Checking for suggestions...' : 'No suggestions found'}
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((suggestion, index) => (
                <div
                  key={suggestion.id}
                  className={`p-4 border rounded-md ${getSuggestionTypeColor(suggestion.type)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-medium uppercase">
                          {suggestion.type}
                        </span>
                        <span className="text-sm opacity-75">
                          Confidence: {Math.round(suggestion.confidence * 100)}%
                        </span>
                        <span className="text-xs opacity-60">
                          Position: {suggestion.range.start}-{suggestion.range.end}
                        </span>
                        <span className="text-xs opacity-60 bg-gray-100 px-1 rounded">
                          Found: "{testText.substring(suggestion.range.start, suggestion.range.end)}"
                        </span>
                      </div>

                      <div className="mb-2">
                        <span className="line-through text-red-600 font-medium">
                          "{suggestion.original}"
                        </span>
                        <span className="mx-2">→</span>
                        <span className="text-green-600 font-medium">
                          "{suggestion.proposed}"
                        </span>
                      </div>

                      <p className="text-sm opacity-80">
                        {suggestion.explanation}
                      </p>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleApplySuggestion(suggestion)}
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => dismissSuggestion(suggestion.id)}
                        className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Test Scenarios */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Quick Test Scenarios</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              "She dont like apples.",
              "Their going to the store tommorow.",
              "I have alot of work to do.",
              "The weather is realy nice today.",
              "Let me know if you have any question.",
              "This is a perfect sentence with no errors."
            ].map((scenario, index) => (
              <button
                key={index}
                onClick={() => {
                  setTestText(scenario);
                  checkText(scenario);
                }}
                className="p-2 text-left bg-gray-100 hover:bg-gray-200 rounded border text-sm"
              >
                {scenario}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GrammarTest;

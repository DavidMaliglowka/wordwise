import React, { useState, useEffect } from 'react';
import { useHybridGrammarCheck } from '../../hooks/useHybridGrammarCheck';

const TEST_TEXTS = {
  basic: "This is a test with some erors and grammar mistakes.",
  advanced: "The cat dont like water. A elephant is big. She is very very happy. The report was written by me.",
  unicode: "I 💖 this café! The naïve résumé was très good.",
  long: "This is a longer text that contains multiple errors. The student dont understand the lesson. A apple fell from the tree. The book was readed by everyone. She is very very excited about the project. The analysis shows shows that results are promising."
};

export default function HybridGrammarTest() {
  const [selectedText, setSelectedText] = useState('basic');
  const [currentText, setCurrentText] = useState(TEST_TEXTS.basic);

  const {
    suggestions,
    isLoading,
    isRefining,
    error,
    checkText,
    clearSuggestions,
    dismissSuggestion,
    applySuggestion,
    refineSuggestion,
    stats
  } = useHybridGrammarCheck({
    delay: 500,
    includeSpelling: true,
    includeGrammar: true,
    includeStyle: true
  });

  // Auto-check when text changes
  useEffect(() => {
    if (currentText.trim()) {
      checkText(currentText);
    }
  }, [currentText, checkText]);

  const handleTextChange = (text: string) => {
    setCurrentText(text);
  };

  const handlePresetSelect = (preset: keyof typeof TEST_TEXTS) => {
    setSelectedText(preset);
    setCurrentText(TEST_TEXTS[preset]);
  };

  const handleApplySuggestion = (suggestionId: string) => {
    const result = applySuggestion(suggestionId, currentText);
    if (result) {
      setCurrentText(result.newText);
    }
  };

  const renderSuggestion = (suggestion: any, index: number) => {
    const flaggedText = currentText.slice(suggestion.range.start, suggestion.range.end);

    return (
      <div key={suggestion.id} className="border border-gray-200 rounded-lg p-4 mb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                suggestion.type === 'spelling' ? 'bg-red-100 text-red-800' :
                suggestion.type === 'grammar' ? 'bg-orange-100 text-orange-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {suggestion.type}
              </span>
              <span className={`px-2 py-1 rounded text-xs ${
                suggestion.severity === 'high' ? 'bg-red-50 text-red-600' :
                suggestion.severity === 'medium' ? 'bg-yellow-50 text-yellow-600' :
                'bg-gray-50 text-gray-600'
              }`}>
                {suggestion.severity}
              </span>
              <span className="text-xs text-gray-500">
                {Math.round(suggestion.confidence * 100)}% confidence
              </span>
            </div>
            <p className="text-sm text-gray-700 mb-2">{suggestion.explanation}</p>
            <div className="text-sm">
              <span className="text-red-600 line-through mr-2">"{flaggedText}"</span>
              {suggestion.proposed && (
                <span className="text-green-600">→ "{suggestion.proposed}"</span>
              )}
            </div>
          </div>
          <div className="flex gap-2 ml-4">
            <button
              onClick={() => handleApplySuggestion(suggestion.id)}
              className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition-colors"
            >
              Apply
            </button>
            <button
              onClick={() => refineSuggestion(suggestion.id)}
              disabled={isRefining}
              className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {isRefining ? 'AI...' : 'Refine'}
            </button>
            <button
              onClick={() => dismissSuggestion(suggestion.id)}
              className="px-3 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">🔬 Hybrid Grammar Engine Test</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{stats.clientSuggestions}</div>
          <div className="text-sm text-blue-800">Client Suggestions</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{stats.refinedSuggestions}</div>
          <div className="text-sm text-green-800">Refined Suggestions</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-purple-600">{stats.totalProcessingTime.toFixed(1)}ms</div>
          <div className="text-sm text-purple-800">Processing Time</div>
        </div>
      </div>

      {/* Test Presets */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Test Presets:</h2>
        <div className="flex gap-2 flex-wrap">
          {Object.keys(TEST_TEXTS).map((preset) => (
            <button
              key={preset}
              onClick={() => handlePresetSelect(preset as keyof typeof TEST_TEXTS)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedText === preset
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {preset.charAt(0).toUpperCase() + preset.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Text Input */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Text Input:</h2>
          <textarea
            value={currentText}
            onChange={(e) => handleTextChange(e.target.value)}
            className="w-full h-64 p-4 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Type or paste text to check..."
          />

          <div className="mt-4 flex gap-2">
            <button
              onClick={clearSuggestions}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            >
              Clear All
            </button>
            <div className="flex items-center gap-2">
              {isLoading && (
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm">Analyzing...</span>
                </div>
              )}
              {isRefining && (
                <div className="flex items-center gap-2 text-purple-600">
                  <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm">AI refining...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Suggestions */}
        <div>
          <h2 className="text-lg font-semibold mb-3">
            Suggestions ({suggestions.length})
            {error && <span className="text-red-500 text-sm ml-2">⚠️ {error.message}</span>}
          </h2>

          <div className="h-64 overflow-y-auto border border-gray-200 rounded-lg p-4">
            {suggestions.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                {isLoading ? 'Analyzing text...' : 'No suggestions found'}
              </div>
            ) : (
              suggestions.map((suggestion, index) => renderSuggestion(suggestion, index))
            )}
          </div>
        </div>
      </div>

      {/* Debug Info */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold mb-2">Debug Info:</h3>
        <div className="text-sm text-gray-600 space-y-1">
          <div>Text Length: {currentText.length} characters</div>
          <div>Active Suggestions: {suggestions.filter(s => !s.isDismissed).length}</div>
          <div>Loading: {isLoading ? 'Yes' : 'No'}</div>
          <div>Refining: {isRefining ? 'Yes' : 'No'}</div>
          <div>Error: {error ? error.message : 'None'}</div>
        </div>
      </div>
    </div>
  );
}

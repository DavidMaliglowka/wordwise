import React, { useState, useRef, useCallback } from 'react';
import { LexicalEditor, LexicalEditorRef } from '../editor';
import { useGrammarCheck } from '../../hooks/useGrammarCheck';
import { EditorSuggestion } from '../../types/grammar';

const GrammarIntegrationTest: React.FC = () => {
  const editorRef = useRef<LexicalEditorRef>(null);
  const isApplyingMarks = useRef(false);
  const [testText, setTestText] = useState(
    // Deliberate errors for testing
    'This is a test document with some grammar errors. She dont like apples, and their going to the store. ' +
    'We need to test the grammar checking system with various types of errors including spelling mistakes, ' +
    'punctuation errors, and grammatical issues. The quick brown fox jumps over the lazy dog. ' +
    'This sentance has a speling error. We should be able to see these errors highlighted in the editor ' +
    'and interact with them through hover cards.'
  );
  const [stats, setStats] = useState({
    wordCount: 0,
    characterCount: 0,
    isEmpty: true
  });

  const {
    suggestions,
    isLoading,
    error,
    checkText,
    clearSuggestions,
    dismissSuggestion,
    applySuggestion,
    retryLastCheck
  } = useGrammarCheck({
    delay: 500, // Faster for testing
    minLength: 3,
    includeSpelling: true,
    includeGrammar: true,
    includeStyle: false,
    enableCache: true
  });

  const handleEditorChange = useCallback((stateData: any) => {
    setTestText(stateData.content);
    setStats({
      wordCount: stateData.wordCount,
      characterCount: stateData.characterCount,
      isEmpty: stateData.isEmpty
    });

    // Skip grammar checking if marks are being applied
    if (isApplyingMarks.current) {
      console.log('⏸️ Test: Skipping grammar check - applying marks');
      return;
    }

    // Trigger grammar check
    if (stateData.content && stateData.content.trim().length > 0) {
      checkText(stateData.content);
    } else {
      clearSuggestions();
    }
  }, [checkText, clearSuggestions]);

  const handleApplySuggestion = useCallback((suggestion: EditorSuggestion) => {
    const result = applySuggestion(suggestion.id, testText);
    if (result && editorRef.current) {
      // Update the editor content
      editorRef.current.updateContent(result.newText);
      setTestText(result.newText);
    }
  }, [applySuggestion, testText]);

  const handleDismissSuggestion = useCallback((suggestionId: string) => {
    dismissSuggestion(suggestionId);
  }, [dismissSuggestion]);

  // Handle clicking on a grammar mark (should NOT auto-apply)
  const handleGrammarMarkClick = useCallback((suggestion: EditorSuggestion) => {
    console.log('🖱️ Test: Grammar mark clicked:', suggestion.id);
    // Just log the click - don't auto-apply the suggestion
  }, []);

  // Handle mark application coordination
  const handleMarkApplicationStart = useCallback(() => {
    console.log('🔧 Test: Mark application started');
    isApplyingMarks.current = true;
  }, []);

  const handleMarkApplicationEnd = useCallback(() => {
    console.log('🔧 Test: Mark application ended');
    isApplyingMarks.current = false;
  }, []);

  const getSuggestionTypeColor = (type: string) => {
    switch (type) {
      case 'spelling':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'grammar':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'punctuation':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'style':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const resetTest = () => {
    const testContent =
      'This is a test document with some grammar errors. She dont like apples, and their going to the store. ' +
      'We need to test the grammar checking system with various types of errors including spelling mistakes, ' +
      'punctuation errors, and grammatical issues. The quick brown fox jumps over the lazy dog. ' +
      'This sentance has a speling error. We should be able to see these errors highlighted in the editor ' +
      'and interact with them through hover cards.';

    if (editorRef.current) {
      editorRef.current.updateContent(testContent);
    }
    setTestText(testContent);
    clearSuggestions();
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Grammar Integration Test
        </h1>

        <div className="mb-4 p-4 bg-blue-50 rounded-lg">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">Test Instructions</h2>
          <p className="text-blue-800">
            This test verifies the full integration of the grammar checking system with the Lexical editor.
            The text below contains deliberate errors. You should see:
          </p>
          <ul className="list-disc ml-6 mt-2 text-blue-800">
            <li>Grammar errors highlighted with colored underlines</li>
            <li>Hover cards appearing when you hover over highlighted text</li>
            <li>Ability to apply suggestions from hover cards</li>
            <li>Ability to dismiss suggestions</li>
            <li>Real-time grammar checking as you type</li>
          </ul>
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              {stats.wordCount} words • {stats.characterCount} chars
            </span>
            <div className="h-4 w-px bg-gray-300" />
            <span className={`text-sm ${
              isLoading ? 'text-blue-600' :
              suggestions.length > 0 ? 'text-amber-600' :
              'text-green-600'
            }`}>
              {isLoading ? 'Checking grammar...' :
               suggestions.length > 0 ? `${suggestions.length} suggestions` :
               'Grammar OK'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={resetTest}
              className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
            >
              Reset Test
            </button>
            <button
              onClick={clearSuggestions}
              className="px-3 py-1 text-sm bg-red-200 hover:bg-red-300 text-red-700 rounded"
            >
              Clear All
            </button>
            {error && (
              <button
                onClick={retryLastCheck}
                className="px-3 py-1 text-sm bg-blue-200 hover:bg-blue-300 text-blue-700 rounded"
              >
                Retry
              </button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start">
              <span className="text-red-400 mr-2">⚠️</span>
              <div>
                <h3 className="text-sm font-medium text-red-800">Grammar Check Error</h3>
                <p className="text-sm text-red-700 mt-1">{error.message}</p>
                <p className="text-xs text-red-600 mt-1">Type: {error.type}</p>
              </div>
            </div>
          </div>
        )}

        {/* Editor */}
        <div className="border rounded-lg bg-white">
          <LexicalEditor
            ref={editorRef}
            initialContent={testText}
            placeholder="Type here to test grammar checking..."
            onChange={handleEditorChange}
            className="min-h-[300px] p-4"
            grammarSuggestions={suggestions}
            onGrammarSuggestionClick={handleGrammarMarkClick}
            onApplyGrammarSuggestion={handleApplySuggestion}
            onDismissGrammarSuggestion={handleDismissSuggestion}
            onGrammarMarkApplicationStart={handleMarkApplicationStart}
            onGrammarMarkApplicationEnd={handleMarkApplicationEnd}
          />
        </div>

        {/* Suggestions List */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Current Suggestions ({suggestions.length})
          </h3>

          {suggestions.length === 0 ? (
            <p className="text-gray-500 italic">No suggestions found.</p>
          ) : (
            <div className="space-y-3">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="border rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className={`px-2 py-1 text-xs font-medium rounded border ${getSuggestionTypeColor(suggestion.type)}`}>
                          {suggestion.type}
                        </span>
                        <span className="text-sm text-gray-600">
                          Position: {suggestion.range.start}-{suggestion.range.end}
                        </span>
                        <span className="text-sm text-gray-600">
                          Confidence: {(suggestion.confidence * 100).toFixed(0)}%
                        </span>
                      </div>

                      <p className="text-sm text-gray-800 mb-2">
                        {suggestion.explanation}
                      </p>

                      <div className="flex items-center space-x-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-600">Original:</span>
                          <span className="ml-1 bg-red-100 text-red-800 px-1 rounded">
                            "{suggestion.original}"
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">Suggested:</span>
                          <span className="ml-1 bg-green-100 text-green-800 px-1 rounded">
                            "{suggestion.proposed}"
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => handleApplySuggestion(suggestion)}
                        className="px-3 py-1 text-sm bg-green-200 hover:bg-green-300 text-green-800 rounded"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => handleDismissSuggestion(suggestion.id)}
                        className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
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

        {/* Debug Information */}
        <div className="mt-6 p-4 bg-gray-100 rounded-lg">
          <h4 className="font-semibold text-gray-900 mb-2">Debug Information</h4>
          <div className="text-sm text-gray-700 space-y-1">
            <p>Editor Content Length: {testText.length}</p>
            <p>Is Loading: {isLoading ? 'Yes' : 'No'}</p>
            <p>Error: {error ? error.message : 'None'}</p>
            <p>Suggestions Count: {suggestions.length}</p>
            <p>Suggestion Types: {[...new Set(suggestions.map(s => s.type))].join(', ') || 'None'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GrammarIntegrationTest;

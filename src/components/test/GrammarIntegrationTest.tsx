import React, { useState, useRef, useCallback, useEffect } from 'react';
import { LexicalEditor, LexicalEditorRef } from '../editor';
import { useGrammarCheck } from '../../hooks/useGrammarCheck';
import { EditorSuggestion } from '../../types/grammar';
import { GrammarService } from '../../services/grammar';
import { HybridGrammarService } from '../../services/grammar-hybrid';
import PersonalDictionaryManager from '../PersonalDictionaryManager';
import { personalDictionary } from '../../services/personal-dictionary';

interface TestResult {
  mode: 'Legacy' | 'Hybrid';
  suggestions: any[];
  processingTime: number;
  error?: string;
}

const GrammarIntegrationTest: React.FC = () => {
  const editorRef = useRef<LexicalEditorRef>(null);
  const isApplyingMarks = useRef(false);
  const [testText, setTestText] = useState(
    // Enhanced test text with Unicode edge cases per grammar-refactor.md
    `This is a test sentance with speling errors. Their going to the store. A elephant is big.

    Unicode edge cases:
    • Emoji: I 💖 AI and coding! 👍🏽
    • RTL: שלום, John! Mixed direction text.
    • Combining: café (é = e + ́ ) vs café (é as single char)
    • Smart quotes: "Hello" and 'world'
    • Repeated and and words.
    • The document was written by the author (passive voice).`
  );
  const [stats, setStats] = useState({
    wordCount: 0,
    characterCount: 0,
    isEmpty: true
  });
  const [results, setResults] = useState<TestResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [legacyResults, setLegacyResults] = useState<any>(null);
  const [hybridResults, setHybridResults] = useState<any>(null);
  const [isTestingLegacy, setIsTestingLegacy] = useState(false);
  const [isTestingHybrid, setIsTestingHybrid] = useState(false);
  const [positionMapTest, setPositionMapTest] = useState<any>(null);

  const {
    suggestions,
    isLoading: grammarCheckLoading,
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

  const handleGrammarMarkClick = useCallback((suggestion: EditorSuggestion) => {
    console.log('🖱️ Test: Grammar mark clicked:', suggestion.id);
    // Just log the click - don't auto-apply the suggestion
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
      'A elephant walked by and and the cat was fed by the dog. This is is a repeated word problem. ' +
      'We need to test the grammar checking system with various types of errors including spelling mistakes, ' +
      'punctuation errors, and grammatical issues. This sentance has a speling error and dont forget to check there spelling. ' +
      'We should be able to see these errors highlighted in the editor and interact with them through hover cards.';

    if (editorRef.current) {
      editorRef.current.updateContent(testContent);
    }
    setTestText(testContent);
    clearSuggestions();
  };

  const runTests = async () => {
    setIsLoading(true);
    setResults([]);

    // Test Legacy GPT-4o approach
    try {
      const startTime = Date.now();
      const legacyResponse = await GrammarService.checkGrammar({
        text: testText,
        language: 'en',
        includeSpelling: true,
        includeGrammar: true,
        includeStyle: false
      }, false);  // force no cache for testing
      const legacyTime = Date.now() - startTime;

      setResults(prev => [...prev, {
        mode: 'Legacy',
        suggestions: legacyResponse.suggestions,
        processingTime: legacyTime
      }]);
    } catch (error) {
      setResults(prev => [...prev, {
        mode: 'Legacy',
        suggestions: [],
        processingTime: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }]);
    }

    // Test Hybrid approach
    try {
      const startTime = Date.now();
      const hybridResult = await HybridGrammarService.getInstance().checkGrammar(testText, {
        includeStyle: false,
        priority: 'balanced',
        userTier: 'free'
      });
      const hybridTime = Date.now() - startTime;

      setResults(prev => [...prev, {
        mode: 'Hybrid',
        suggestions: hybridResult.suggestions,
        processingTime: hybridTime
      }]);
    } catch (error) {
      setResults(prev => [...prev, {
        mode: 'Hybrid',
        suggestions: [],
        processingTime: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      }]);
    }

    setIsLoading(false);
  };

  const testPositionMapping = () => {
    try {
      const testCases = [
        'Simple text',
        'I 💖 AI',
        'שלום, John!',
        'café vs café',
        '"Smart quotes"',
        '👍🏽 skin tone emoji',
        'e\u0301 combining accent' // e + combining acute accent
      ];

      const results = testCases.map(text => {
        const mapper = new (window as any).UnicodePositionMapper(text);
        const debugInfo = mapper.getDebugInfo();

        return {
          text,
          normalizedText: mapper.getNormalizedText(),
          ...debugInfo,
          // Test some position conversions
          firstCharUtf16ToGrapheme: mapper.utf16ToGrapheme(0),
          firstGraphemeToUtf16: mapper.graphemeToUtf16(0),
          lastCharUtf16ToGrapheme: mapper.utf16ToGrapheme(text.length - 1),
          lastGraphemeToUtf16: mapper.graphemeToUtf16(debugInfo.totalGraphemes - 1)
        };
      });

      setPositionMapTest(results);
    } catch (error) {
      console.error('Position mapping test failed:', error);
      setPositionMapTest({ error: error instanceof Error ? error.message : String(error) });
    }
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
              grammarCheckLoading ? 'text-blue-600' :
              suggestions.length > 0 ? 'text-amber-600' :
              'text-green-600'
            }`}>
              {grammarCheckLoading ? 'Checking grammar...' :
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
            <p>Is Loading: {grammarCheckLoading ? 'Yes' : 'No'}</p>
            <p>Error: {error ? error.message : 'None'}</p>
            <p>Suggestions Count: {suggestions.length}</p>
            <p>Suggestion Types: {[...new Set(suggestions.map(s => s.type))].join(', ') || 'None'}</p>
          </div>
        </div>

        {/* Debug Position Test */}
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">Debug: Position Mapping Test</h3>
          <div className="flex gap-4 mb-4">
            <button
              onClick={testPositionMapping}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded"
            >
              Test Position Mapping
            </button>
            <button
              onClick={async () => {
                // Simple debug test to see retext message structure
                const testText = "This is a test sentance.";
                console.log('=== SIMPLE DEBUG TEST ===');
                console.log('Input text:', testText);

                try {
                  const hybridService = (window as any).hybridGrammarService;
                  if (hybridService) {
                    const result = await hybridService.checkGrammar(testText);
                    console.log('Hybrid result:', result);
                  } else {
                    console.log('Hybrid service not available on window');
                  }
                } catch (error) {
                  console.error('Debug test failed:', error);
                }
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              Debug Message Structure
            </button>
          </div>

          {positionMapTest && (
            <div className="mt-4">
              <h4 className="font-medium text-yellow-800 mb-2">Position Mapping Results:</h4>
              {positionMapTest.error ? (
                <div className="text-red-600 text-sm">{positionMapTest.error}</div>
              ) : (
                <div className="space-y-2 text-sm">
                  {Array.isArray(positionMapTest) ? (
                    positionMapTest.map((result: any, idx: number) => (
                      <div key={idx} className="bg-white p-2 rounded border">
                        <div className="font-mono text-xs">
                          <div><strong>Text:</strong> "{result.text}"</div>
                          <div><strong>Normalized:</strong> "{result.normalizedText}"</div>
                          <div><strong>Graphemes:</strong> {result.totalGraphemes}, <strong>UTF-16:</strong> {result.totalUtf16Units}, <strong>Bytes:</strong> {result.totalBytes}</div>
                          <div><strong>Position Tests:</strong>
                            UTF16→Grapheme(0): {result.firstCharUtf16ToGrapheme},
                            Grapheme→UTF16(0): {result.firstGraphemeToUtf16}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <pre className="text-xs bg-white p-2 rounded border overflow-auto">
                      {JSON.stringify(positionMapTest, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 p-4 bg-white rounded-lg shadow-md max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-4">Grammar Engine Comparison Test</h2>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Test Text:</label>
            <textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-md h-32"
              placeholder="Enter text to test grammar checking..."
            />
          </div>

          <button
            onClick={runTests}
            disabled={isLoading}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded-md mb-6"
          >
            {isLoading ? 'Running Tests...' : 'Run Comparison Test'}
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {results.map((result, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <h3 className={`text-lg font-semibold mb-2 ${
                  result.mode === 'Legacy' ? 'text-orange-600' : 'text-green-600'
                }`}>
                  {result.mode} Engine
                </h3>

                <div className="mb-3">
                  <span className="text-sm text-gray-600">Processing Time: </span>
                  <span className={`font-medium ${
                    result.processingTime < 100 ? 'text-green-600' :
                    result.processingTime < 1000 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {result.processingTime}ms
                  </span>
                </div>

                {result.error ? (
                  <div className="text-red-600 text-sm mb-3">
                    Error: {result.error}
                  </div>
                ) : (
                  <div className="mb-3">
                    <span className="text-sm text-gray-600">Suggestions Found: </span>
                    <span className="font-medium">{result.suggestions.length}</span>
                  </div>
                )}

                <div className="max-h-64 overflow-y-auto">
                  <h4 className="text-sm font-medium mb-2">Suggestions:</h4>
                  {result.suggestions.length === 0 ? (
                    <p className="text-gray-500 text-sm">No suggestions found</p>
                  ) : (
                    <ul className="space-y-2">
                      {result.suggestions.map((suggestion, idx) => (
                        <li key={idx} className="text-sm border-l-2 border-gray-300 pl-3">
                          <div className="font-medium text-gray-800">
                            {suggestion.rule || suggestion.type || 'Grammar'}
                          </div>
                          <div className="text-gray-600">{suggestion.message}</div>
                          {suggestion.replacement && (
                            <div className="text-blue-600">
                              Suggested: "{suggestion.replacement}"
                            </div>
                          )}
                          <div className="text-xs text-gray-500">
                            Position: {suggestion.range?.start}-{suggestion.range?.end}
                            {suggestion.confidence && ` | Confidence: ${Math.round(suggestion.confidence * 100)}%`}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-sm text-gray-600">
            <h4 className="font-medium mb-2">Test Information:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Legacy: Uses GPT-4o via Cloud Functions (current production approach)</li>
              <li>Hybrid: Uses client-side processing with optional GPT refinement</li>
              <li>Performance comparison includes processing time and suggestion quality</li>
              <li>Test text includes common errors: spelling, grammar, and passive voice</li>
            </ul>
          </div>
        </div>

        {/* Personal Dictionary Test Section */}
        <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="text-lg font-semibold text-green-800 mb-4">Personal Dictionary Integration Test</h3>

          <div className="mb-4 p-3 bg-white rounded border">
            <h4 className="font-medium text-gray-900 mb-2">Quick Test</h4>
            <p className="text-sm text-gray-600 mb-3">
              Add some misspelled words to your personal dictionary, then run the grammar test to see them filtered out.
            </p>

            <div className="flex gap-2 mb-3">
              <button
                onClick={async () => {
                  try {
                    await personalDictionary.addWord('sentance', { category: 'custom', notes: 'Test word for demo' });
                    await personalDictionary.addWord('speling', { category: 'custom', notes: 'Test word for demo' });
                    await personalDictionary.addWord('wordwise', { category: 'technical', notes: 'Our app name' });
                    alert('Added test words: sentance, speling, wordwise');
                  } catch (error) {
                    alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                  }
                }}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
              >
                Add Test Words
              </button>

              <button
                onClick={async () => {
                  try {
                    await personalDictionary.removeWord('sentance');
                    await personalDictionary.removeWord('speling');
                    await personalDictionary.removeWord('wordwise');
                    alert('Removed test words');
                  } catch (error) {
                    alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                  }
                }}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
              >
                Remove Test Words
              </button>

              <button
                onClick={async () => {
                  const stats = await personalDictionary.getStats();
                  alert(`Dictionary Stats:\n- Total words: ${stats.totalWords}\n- Cache size: ${personalDictionary.getCacheSize()}\n- Categories: ${Object.keys(stats.categories).join(', ')}`);
                }}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
              >
                Show Stats
              </button>
            </div>

            <div className="text-xs text-gray-500">
              <p><strong>Expected behavior:</strong></p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Before adding: "sentance" and "speling" should appear in hybrid suggestions</li>
                <li>After adding: These words should be filtered out from spelling suggestions</li>
                <li>Other grammar suggestions (passive voice, articles) should still appear</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Personal Dictionary Manager */}
        <div className="mb-8">
          <PersonalDictionaryManager />
        </div>

        {/* Comparison Test */}
        <div className="mb-6">
          <button
            onClick={runTests}
            disabled={isLoading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium"
          >
            {isLoading ? 'Running Tests...' : 'Run Comparison Test'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GrammarIntegrationTest;

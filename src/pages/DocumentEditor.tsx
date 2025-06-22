import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LexicalEditor, EditorStateData, LexicalEditorRef } from '../components/editor';
import GrammarSidebar from '../components/editor/GrammarSidebar';
import { FirestoreService } from '../services/firestore';
import { useAuthContext } from '../contexts/AuthContext';
import { useHybridGrammarCheck } from '../hooks/useHybridGrammarCheck';
import { Document } from '../types/firestore';
import { EditorSuggestion, CategorizedSuggestions } from '../types/grammar';
import { GrammarService } from '../services/grammar';
import { ArrowLeft, Save, Clock, Zap, Brain } from 'lucide-react';
import { DocumentLengthDropdown, EstimatedTimeDropdown, ReadabilityTooltip } from '../components/MetricsComponents';
import { calculateTextMetrics } from '../utils/textMetrics';

const DocumentEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const editorRef = useRef<LexicalEditorRef>(null);
  const isApplyingSuggestion = useRef(false);
  const isApplyingMarks = useRef(false);
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editorState, setEditorState] = useState<EditorStateData>({
    content: '',
    html: '',
    wordCount: 0,
    characterCount: 0,
    isEmpty: true,
  });

  // Calculate comprehensive text metrics
  const textMetrics = React.useMemo(() => {
    return calculateTextMetrics(editorState.content);
  }, [editorState.content]);

  // Hybrid grammar checking integration - faster and more cost-effective!
  const {
    suggestions,
    isLoading: isGrammarLoading,
    isRefining: isGrammarRefining,
    error: grammarError,
    checkText: checkGrammar,
    clearSuggestions,
    dismissSuggestion,
    applySuggestion,
    refineSuggestion,
    retryLastCheck,
    stats
  } = useHybridGrammarCheck({
    delay: 300, // Faster debounce for hybrid approach
    minLength: 3,
    includeSpelling: true,
    includeGrammar: true,
    includeStyle: true, // Enable style suggestions with hybrid
    enableCache: true
  });

  // Categorize suggestions for UI display
  const categorizedSuggestions: CategorizedSuggestions = React.useMemo(() => {
    return GrammarService.categorizeSuggestions(suggestions);
  }, [suggestions]);

    // Handle applying a suggestion
  const handleApplySuggestion = useCallback((suggestion: EditorSuggestion) => {
    console.log('🔧 HYBRID APPLY DEBUG: Starting suggestion application', {
      suggestionId: suggestion.id,
      original: suggestion.original,
      proposed: suggestion.proposed,
      currentContentLength: editorState.content.length,
      timestamp: new Date().toISOString()
    });

    try {
      const result = applySuggestion(suggestion.id, editorState.content);

      if (result && editorRef.current) {
        console.log('🔧 HYBRID APPLY DEBUG: Suggestion applied successfully', {
          oldTextLength: editorState.content.length,
          newTextLength: result.newText.length,
          textChanged: result.newText !== editorState.content
        });

        // Set flag to prevent grammar checking during programmatic update
        isApplyingSuggestion.current = true;

        // Update the actual Lexical editor content
        editorRef.current.updateContent(result.newText);

        // Update the editor state
        setEditorState(prev => ({
          ...prev,
          content: result.newText,
          html: result.newText,
          wordCount: result.newText.trim().split(/\s+/).filter(Boolean).length,
          characterCount: result.newText.length,
          isEmpty: result.newText.trim().length === 0,
        }));

        // Mark as having unsaved changes
        setHasUnsavedChanges(true);

        // Reset flag and trigger new grammar check after content is updated
        setTimeout(() => {
          console.log('🔧 HYBRID APPLY DEBUG: Resetting flag and triggering recheck');
          isApplyingSuggestion.current = false;

          // Trigger a fresh grammar check to update marks for the new content
          if (result.newText && result.newText.trim().length > 0) {
            console.log('🔄 HYBRID APPLY DEBUG: Triggering grammar recheck after suggestion application');
            checkGrammar(result.newText);
          } else {
            console.log('🧹 HYBRID APPLY DEBUG: Clearing suggestions - no content remaining');
            clearSuggestions();
          }
        }, 100); // Faster for hybrid approach
      } else {
        console.error('🚨 HYBRID APPLY DEBUG: Failed to apply suggestion or no editor ref', {
          hasResult: !!result,
          hasEditorRef: !!editorRef.current
        });
      }
    } catch (error) {
      console.error('🚨 HYBRID APPLY DEBUG: Error in handleApplySuggestion:', error);
      // Reset flag in case of error
      isApplyingSuggestion.current = false;
    }
  }, [applySuggestion, editorState.content, checkGrammar, clearSuggestions]);

  // Handle refining a suggestion with GPT-4o
  const handleRefineSuggestion = useCallback(async (suggestion: EditorSuggestion) => {
    console.log('✨ REFINE DEBUG: Starting GPT-4o refinement', {
      suggestionId: suggestion.id,
      original: suggestion.original
    });

    try {
      await refineSuggestion(suggestion.id);
      console.log('✅ REFINE DEBUG: Refinement completed successfully');
    } catch (error) {
      console.error('❌ REFINE DEBUG: Refinement failed:', error);
    }
  }, [refineSuggestion]);

  // Handle dismissing a suggestion
  const handleDismissSuggestion = useCallback((suggestionId: string) => {
    dismissSuggestion(suggestionId);
  }, [dismissSuggestion]);

  // Handle clicking on a grammar mark (should NOT auto-apply)
  const handleGrammarMarkClick = useCallback((suggestion: EditorSuggestion) => {
    console.log('🖱️ HYBRID CLICK DEBUG: DocumentEditor handleGrammarMarkClick called', {
      suggestionId: suggestion.id,
      suggestionText: suggestion.original,
      suggestionProposed: suggestion.proposed,
      timestamp: new Date().toISOString()
    });

    // Just log the click - don't auto-apply the suggestion
    // The hover card should handle showing details and user can choose to apply
    console.log('✅ HYBRID CLICK DEBUG: Click handled - no auto-apply triggered');
  }, []);

  // Handle clearing all suggestions
  const handleClearAllSuggestions = useCallback(() => {
    clearSuggestions();
  }, [clearSuggestions]);

  // Handle mark application start
  const handleMarkApplicationStart = useCallback(() => {
    console.log('🔧 Hybrid mark application started - blocking grammar checks');
    isApplyingMarks.current = true;
  }, []);

  // Handle mark application end
  const handleMarkApplicationEnd = useCallback(() => {
    console.log('🔧 Hybrid mark application ended - allowing grammar checks');
    isApplyingMarks.current = false;
  }, []);

  // Load document on mount
  useEffect(() => {
    const loadDocument = async () => {
      if (!id || !user) return;

      try {
        setLoading(true);
        if (id === 'new') {
          // Create a new document
          const newDocId = await FirestoreService.Document.createDocument({
            uid: user.uid,
            title: 'Untitled Document',
            content: '',
            contentType: 'other',
            status: 'draft',
            goals: [],
          });

          // Navigate to the new document
          navigate(`/editor/${newDocId}`, { replace: true });
          return;
        }

        const docData = await FirestoreService.Document.getDocument(id);
        if (!docData) {
          console.error('Document not found');
          navigate('/dashboard');
          return;
        }

        setDocument(docData);
        const content = docData.content || '';
        setEditorState({
          content,
          html: content,
          wordCount: 0,
          characterCount: content.length,
          isEmpty: !content || content.trim().length === 0,
        });

        // Clear suggestions and reset grammar check cache when loading document
        clearSuggestions();

        // Trigger initial grammar check if document has content
        if (content && content.trim().length > 0) {
          console.log('🚀 Triggering initial grammar check for loaded document');
          setTimeout(() => {
            checkGrammar(content);
          }, 500); // Small delay to ensure editor is ready
        }
      } catch (error) {
        console.error('Error loading document:', error);
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [id, user, navigate, clearSuggestions, checkGrammar]);

    // Handle editor content changes
  const handleEditorChange = useCallback((stateData: EditorStateData) => {
    setEditorState(stateData);
    setHasUnsavedChanges(true);

    // Skip grammar checking if we're currently applying a suggestion or marks to prevent infinite loops
    if (isApplyingSuggestion.current || isApplyingMarks.current) {
      console.log('⏸️ Skipping grammar check - applying changes:', {
        isApplyingSuggestion: isApplyingSuggestion.current,
        isApplyingMarks: isApplyingMarks.current
      });
      return;
    }

    // Debug: Log text content details
    if (stateData.content && stateData.content.trim().length > 0) {
      console.log('🔧 Editor content changed:');
      console.log('Content length:', stateData.content.length);
      console.log('Trimmed length:', stateData.content.trim().length);
      console.log('First 100 chars:', JSON.stringify(stateData.content.substring(0, 100)));
      console.log('Character codes (first 20):', stateData.content.substring(0, 20).split('').map(c => c.charCodeAt(0)));

      checkGrammar(stateData.content);
    } else {
      // Clear suggestions if content is empty
      clearSuggestions();
    }
  }, [checkGrammar, clearSuggestions]);

  // Save document
  const saveDocument = useCallback(async (stateData?: EditorStateData) => {
    if (!document || !user || saving) return;

    const dataToSave = stateData || editorState;

    try {
      setSaving(true);

            await FirestoreService.Document.updateDocument(document.id, {
        content: dataToSave.content,
        updatedAt: new Date() as any,
      });

      setHasUnsavedChanges(false);
      setLastSaved(new Date());

      // Update local document state
      setDocument(prev => prev ? {
        ...prev,
        content: dataToSave.content,
        updatedAt: new Date() as any,
      } : null);

    } catch (error) {
      console.error('Error saving document:', error);
      // TODO: Show error toast
    } finally {
      setSaving(false);
    }
  }, [document, user, saving, editorState]);

  // Auto-save handler
  const handleAutoSave = useCallback((stateData: EditorStateData) => {
    saveDocument(stateData);
  }, [saveDocument]);

  // Manual save handler
  const handleManualSave = useCallback(() => {
    saveDocument();
  }, [saveDocument]);

  // Update document title
  const updateTitle = useCallback(async (newTitle: string) => {
    if (!document || !user || !newTitle.trim()) return;

    try {
      await FirestoreService.Document.updateDocument(document.id, {
        title: newTitle.trim(),
        updatedAt: new Date() as any,
      });

      setDocument(prev => prev ? {
        ...prev,
        title: newTitle.trim(),
        updatedAt: new Date() as any,
      } : null);
    } catch (error) {
      console.error('Error updating title:', error);
    }
  }, [document, user]);

  // Navigate back to dashboard
  const handleBackToDashboard = useCallback(() => {
    if (hasUnsavedChanges) {
      const shouldSave = window.confirm('You have unsaved changes. Save before leaving?');
      if (shouldSave) {
        saveDocument().then(() => navigate('/dashboard'));
      } else {
        navigate('/dashboard');
      }
    } else {
      navigate('/dashboard');
    }
  }, [hasUnsavedChanges, saveDocument, navigate]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        handleManualSave();
      }
    };

    window.document.addEventListener('keydown', handleKeyDown);
    return () => window.document.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading document...</p>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Document not found</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
        {/* Mobile Layout */}
        <div className="sm:hidden">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={handleBackToDashboard}
              className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 mr-1" />
              <span className="text-sm">Back</span>
            </button>

            <button
              onClick={handleManualSave}
              disabled={saving || !hasUnsavedChanges}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>

          <input
            type="text"
            value={document.title}
            onChange={(e) => setDocument(prev => prev ? { ...prev, title: e.target.value } : null)}
            onBlur={(e) => updateTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            className="w-full text-lg font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
            placeholder="Document title..."
          />

          <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
            <div>
              <span>{textMetrics.wordCount} words</span>
              <span className="mx-2">•</span>
              <span>{textMetrics.characterCount} chars</span>
              <span className="mx-2">•</span>
              <span>Grade {textMetrics.fleschKincaidGrade.toFixed(1)}</span>
            </div>

            <div className="flex items-center">
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-1"></div>
                  <span>Saving...</span>
                </>
              ) : hasUnsavedChanges ? (
                <>
                  <Clock className="w-3 h-3 mr-1 text-amber-500" />
                  <span>Unsaved</span>
                </>
              ) : (
                <>
                  <Save className="w-3 h-3 mr-1 text-green-500" />
                  <span>Saved</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleBackToDashboard}
              className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Dashboard
            </button>

            <div className="h-6 w-px bg-gray-300" />

            <input
              type="text"
              value={document.title}
              onChange={(e) => setDocument(prev => prev ? { ...prev, title: e.target.value } : null)}
              onBlur={(e) => updateTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              className="text-xl font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
              placeholder="Document title..."
            />
          </div>

                      <div className="flex items-center space-x-4">
              {/* Document metrics with fixed widths to prevent layout shift */}
              <div className="w-32">
                <DocumentLengthDropdown metrics={textMetrics} />
              </div>
              <span className="text-gray-300">•</span>
              <div className="w-20">
                <EstimatedTimeDropdown metrics={textMetrics} />
              </div>
              <span className="text-gray-300">•</span>
              <div className="w-16">
                <ReadabilityTooltip grade={textMetrics.fleschKincaidGrade} />
              </div>

            {/* Save status */}
            <div className="flex items-center text-sm text-gray-600">
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Saving...
                </>
              ) : hasUnsavedChanges ? (
                <>
                  <Clock className="w-4 h-4 mr-2 text-amber-500" />
                  Unsaved changes
                </>
              ) : lastSaved ? (
                <>
                  <Save className="w-4 h-4 mr-2 text-green-500" />
                  Saved {lastSaved.toLocaleTimeString()}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2 text-green-500" />
                  All changes saved
                </>
              )}
            </div>

            {/* Manual save button */}
            <button
              onClick={handleManualSave}
              disabled={saving || !hasUnsavedChanges}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Grammar Error Display */}
      {grammarError && (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2 flex-shrink-0">
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <span className="text-red-400">⚠️</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Grammar Check Error</h3>
                <div className="mt-1 text-sm text-red-700">
                  {grammarError.message}
                  {grammarError.type === 'auth' && (
                    <span className="block mt-1">Please ensure you're signed in to use grammar checking.</span>
                  )}
                </div>
                <div className="mt-2">
                  <button
                    onClick={retryLastCheck}
                    className="text-sm bg-red-100 hover:bg-red-200 text-red-800 px-2 py-1 rounded"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area with Editor and Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Section */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
            <div>
              <LexicalEditor
                ref={editorRef}
                initialContent={document.content || ''}
                placeholder="Start writing your document..."
                onChange={handleEditorChange}
                onSave={handleAutoSave}
                autoSave={true}
                autoSaveDelay={2000}
                className="min-h-[500px] sm:min-h-[600px]"
                grammarSuggestions={suggestions}
                onGrammarSuggestionClick={handleGrammarMarkClick}
                onApplyGrammarSuggestion={handleApplySuggestion}
                onDismissGrammarSuggestion={handleDismissSuggestion}
                onGrammarMarkApplicationStart={handleMarkApplicationStart}
                onGrammarMarkApplicationEnd={handleMarkApplicationEnd}
              />
            </div>
          </div>
        </div>

        {/* Grammar Sidebar */}
        <GrammarSidebar
          categorizedSuggestions={categorizedSuggestions}
          isLoading={isGrammarLoading}
          isRefining={isGrammarRefining}
          onApplySuggestion={handleApplySuggestion}
          onDismissSuggestion={handleDismissSuggestion}
          onRefineSuggestion={handleRefineSuggestion}
          onClearAll={handleClearAllSuggestions}
        />
      </div>
    </div>
  );
};

export default DocumentEditor;

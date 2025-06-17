import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LexicalEditor, EditorStateData } from '../components/editor';
import { FirestoreService } from '../services/firestore';
import { useAuthContext } from '../contexts/AuthContext';
import { Document } from '../types/firestore';
import { ArrowLeft, Save, Clock } from 'lucide-react';

const DocumentEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
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
        setEditorState({
          content: docData.content || '',
          html: docData.content || '',
          wordCount: 0,
          characterCount: docData.content?.length || 0,
          isEmpty: !docData.content || docData.content.trim().length === 0,
        });
      } catch (error) {
        console.error('Error loading document:', error);
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, [id, user, navigate]);

  // Handle editor content changes
  const handleEditorChange = useCallback((stateData: EditorStateData) => {
    setEditorState(stateData);
    setHasUnsavedChanges(true);
  }, []);

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
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
            {/* Document stats */}
            <div className="text-sm text-gray-600">
              <span>{editorState.wordCount} words</span>
              <span className="mx-2">•</span>
              <span>{editorState.characterCount} characters</span>
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

      {/* Editor */}
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm">
          <LexicalEditor
            initialContent={document.content || ''}
            placeholder="Start writing your document..."
            onChange={handleEditorChange}
            onSave={handleAutoSave}
            autoSave={true}
            autoSaveDelay={2000}
            className="min-h-[600px]"
          />
        </div>
      </div>
    </div>
  );
};

export default DocumentEditor;

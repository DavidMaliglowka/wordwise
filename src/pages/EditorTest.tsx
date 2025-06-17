import React, { useState } from 'react';
import { LexicalEditor, EditorStateData } from '../components/editor';

const EditorTest: React.FC = () => {
  const [editorState, setEditorState] = useState<EditorStateData>({
    content: '',
    html: '',
    wordCount: 0,
    characterCount: 0,
    isEmpty: true,
  });

  const handleContentChange = (stateData: EditorStateData) => {
    setEditorState(stateData);
    console.log('Editor state changed:', stateData);
  };

  const handleSave = (stateData: EditorStateData) => {
    console.log('Auto-save triggered:', stateData);
    // Here you would save to localStorage, API, etc.
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Lexical Editor Test</h1>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Rich Text Editor</h2>
            <div className="text-sm text-gray-600">
              Words: {editorState.wordCount} | Characters: {editorState.characterCount}
            </div>
          </div>

          <LexicalEditor
            placeholder="Type or paste (⌘+V)…"
            onChange={handleContentChange}
            onSave={handleSave}
            autoSave={true}
            autoSaveDelay={3000}
            initialContent="Welcome to WordWise! Start typing to see the editor in action."
          />

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Editor State (Debug):</h3>
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-32">
                {JSON.stringify(editorState, null, 2)}
              </pre>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Content Preview:</h3>
              <div className="bg-gray-100 p-3 rounded text-sm max-h-32 overflow-auto">
                {editorState.isEmpty ? (
                  <span className="text-gray-400">No content yet...</span>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: editorState.html }} />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-sm text-gray-600">
          <p><strong>Enhanced Features to test:</strong></p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Real-time word and character counting</li>
            <li>Auto-save functionality (every 3 seconds)</li>
            <li>State management with comprehensive data</li>
            <li>Initial content loading</li>
            <li>Empty state detection</li>
            <li>Keyboard shortcuts (Ctrl/Cmd+S for save)</li>
            <li>Undo/Redo with Ctrl/Cmd+Z and Ctrl/Cmd+Y</li>
            <li>All formatting options from the toolbar</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default EditorTest;

import React, { useCallback, useRef, useEffect } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { LinkNode, AutoLinkNode } from '@lexical/link';
import { $generateHtmlFromNodes } from '@lexical/html';
import { $getRoot, EditorState, $createParagraphNode, $createTextNode } from 'lexical';
import EditorToolbar from './EditorToolbar';

export interface EditorStateData {
  content: string;
  html: string;
  wordCount: number;
  characterCount: number;
  isEmpty: boolean;
}

interface LexicalEditorProps {
  initialContent?: string;
  placeholder?: string;
  onChange?: (stateData: EditorStateData) => void;
  onSave?: (stateData: EditorStateData) => void;
  className?: string;
  autoSave?: boolean;
  autoSaveDelay?: number;
  readOnly?: boolean;
}

// Hook to initialize content
function InitialContentPlugin({ content }: { content: string }) {
  const [editor] = useLexicalComposerContext();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current && content) {
      isFirstRender.current = false;
      editor.update(() => {
        const root = $getRoot();
        root.clear();

        if (content.trim()) {
          // Simple text content initialization
          const paragraph = $createParagraphNode();
          const text = $createTextNode(content);
          paragraph.append(text);
          root.append(paragraph);
        }
      });
    }
  }, [content, editor]);

  return null;
}

// Hook for auto-save functionality
function AutoSavePlugin({
  onSave,
  delay = 2000,
  enabled = false
}: {
  onSave?: (stateData: EditorStateData) => void;
  delay?: number;
  enabled?: boolean;
}) {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const [editor] = useLexicalComposerContext();

  const triggerAutoSave = useCallback(() => {
    if (!onSave || !enabled) return;

         editor.getEditorState().read(() => {
       const root = $getRoot();
       const textContent = root.getTextContent();

       const stateData: EditorStateData = {
         content: textContent,
         html: textContent, // Simplified - using text content for now
         wordCount: textContent.trim().split(/\s+/).filter(Boolean).length,
         characterCount: textContent.length,
         isEmpty: textContent.trim().length === 0,
       };

       onSave(stateData);
     });
  }, [editor, onSave, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const removeListener = editor.registerUpdateListener(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(triggerAutoSave, delay);
    });

    return () => {
      removeListener();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [editor, triggerAutoSave, delay, enabled]);

  return null;
}

const theme = {
  // Define the theme for the editor
  ltr: 'ltr',
  rtl: 'rtl',
  placeholder: 'text-gray-400 text-sm',
  paragraph: 'mb-2',
  quote: 'border-l-4 border-gray-300 pl-4 italic',
  heading: {
    h1: 'text-2xl font-bold mb-4',
    h2: 'text-xl font-semibold mb-3',
    h3: 'text-lg font-medium mb-2',
  },
  list: {
    nested: {
      listitem: 'list-none',
    },
    ol: 'list-decimal list-inside',
    ul: 'list-disc list-inside',
    listitem: 'mb-1',
  },
  link: 'text-blue-600 underline hover:text-blue-800',
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    code: 'bg-gray-100 px-1 py-0.5 rounded text-sm font-mono',
  },
};

const LexicalEditor: React.FC<LexicalEditorProps> = ({
  initialContent = '',
  placeholder = 'Type or paste (⌘+V)…',
  onChange,
  onSave,
  className = '',
  autoSave = false,
  autoSaveDelay = 2000,
  readOnly = false,
}) => {
  const initialConfig = {
    namespace: 'WordWiseEditor',
    theme,
    onError: (error: Error) => {
      console.error('Lexical Editor Error:', error);
    },
    nodes: [
      HeadingNode,
      ListNode,
      ListItemNode,
      QuoteNode,
      LinkNode,
      AutoLinkNode,
    ],
    editable: !readOnly,
  };

  const handleChange = useCallback((editorState: EditorState, editor: any) => {
    if (onChange) {
            editorState.read(() => {
        const root = $getRoot();
        const textContent = root.getTextContent();

        const stateData: EditorStateData = {
          content: textContent,
          html: textContent, // Simplified - using text content for now
          wordCount: textContent.trim().split(/\s+/).filter(Boolean).length,
          characterCount: textContent.length,
          isEmpty: textContent.trim().length === 0,
        };

        onChange(stateData);
      });
    }
  }, [onChange]);

  // Keyboard shortcuts for save
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (onSave) {
          // Trigger immediate save
          console.log('Manual save triggered');
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSave]);

  return (
    <div className={`relative border border-gray-300 rounded-lg overflow-hidden ${className} ${readOnly ? 'bg-gray-50' : 'bg-white'}`}>
      <LexicalComposer initialConfig={initialConfig}>
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={`min-h-[200px] p-4 focus:outline-none resize-none ${readOnly ? 'cursor-default' : ''}`}
                aria-placeholder={placeholder}
                placeholder={
                  <div className="absolute top-4 left-4 text-gray-400 text-sm pointer-events-none">
                    {placeholder}
                  </div>
                }
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <OnChangePlugin onChange={handleChange} />
          <HistoryPlugin />
          <InitialContentPlugin content={initialContent} />
          <AutoSavePlugin
            onSave={onSave}
            delay={autoSaveDelay}
            enabled={autoSave}
          />
          {!readOnly && <EditorToolbar />}
        </div>
      </LexicalComposer>
    </div>
  );
};

export default LexicalEditor;

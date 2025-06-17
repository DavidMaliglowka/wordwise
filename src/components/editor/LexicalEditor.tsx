import React, { useCallback, useRef, useEffect } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
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
  placeholder: 'text-gray-400 text-sm sm:text-base',
  paragraph: 'mb-2 text-base leading-relaxed',
  quote: 'border-l-4 border-gray-300 pl-4 italic text-base leading-relaxed',
  heading: {
    h1: 'text-xl sm:text-2xl font-bold mb-3 sm:mb-4 leading-tight',
    h2: 'text-lg sm:text-xl font-semibold mb-2 sm:mb-3 leading-tight',
    h3: 'text-base sm:text-lg font-medium mb-2 leading-tight',
  },
  list: {
    nested: {
      listitem: 'list-none',
    },
    ol: 'list-decimal list-inside text-base leading-relaxed',
    ul: 'list-disc list-inside text-base leading-relaxed',
    listitem: 'mb-1',
  },
  link: 'text-blue-600 underline hover:text-blue-800 break-words',
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
    <div className={`relative ${className} ${readOnly ? '' : ''}`}>
      <LexicalComposer initialConfig={initialConfig}>
        <div className="relative flex flex-col h-full">
          <div className="flex-1 relative">
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className={`min-h-[200px] p-3 sm:p-4 focus:outline-none resize-none ${!readOnly ? 'pb-16 sm:pb-20' : ''} ${readOnly ? 'cursor-default' : ''} text-base leading-relaxed`}
                  aria-placeholder={placeholder}
                  placeholder={
                    <div className="absolute top-3 sm:top-4 left-3 sm:left-4 text-gray-400 text-sm pointer-events-none">
                      {placeholder}
                    </div>
                  }
                />
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <OnChangePlugin onChange={handleChange} />
            <HistoryPlugin />
            <ListPlugin />
            <LinkPlugin />
            <InitialContentPlugin content={initialContent} />
            <AutoSavePlugin
              onSave={onSave}
              delay={autoSaveDelay}
              enabled={autoSave}
            />
          </div>
          {!readOnly && (
            <div className="fixed bottom-0 left-0 right-0 z-10">
              <EditorToolbar />
            </div>
          )}
        </div>
      </LexicalComposer>
    </div>
  );
};

export default LexicalEditor;

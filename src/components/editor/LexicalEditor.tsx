import React, { useCallback, useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
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
import { $getRoot, EditorState, $createParagraphNode, $createTextNode, LexicalEditor as LexicalEditorType } from 'lexical';
import EditorToolbar from './EditorToolbar';
import { GrammarMarkNode } from './GrammarMarkNode';
import { GrammarPlugin } from './GrammarPlugin';
import { SuggestionHoverCard } from './SuggestionHoverCard';
import { EditorSuggestion } from '../../types/grammar';

export interface EditorStateData {
  content: string;
  html: string;
  wordCount: number;
  characterCount: number;
  isEmpty: boolean;
}

export interface LexicalEditorRef {
  updateContent: (content: string) => void;
  getEditor: () => LexicalEditorType | null;
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
  // Grammar-related props
  grammarSuggestions?: EditorSuggestion[];
  lastCheckedTextForGrammar?: string;
  onGrammarSuggestionHover?: (suggestionId: string | null) => void;
  onGrammarSuggestionClick?: (suggestion: EditorSuggestion) => void;
  onApplyGrammarSuggestion?: (suggestion: EditorSuggestion) => void;
  onDismissGrammarSuggestion?: (suggestionId: string) => void;
  onRegenerateGrammarSuggestion?: (suggestionId: string) => void;
  onAddToDictionary?: (word: string) => void;
  isRegenerating?: boolean;
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

// Hook for programmatic content updates
function UpdateContentPlugin({
  updateTrigger,
  onUpdate
}: {
  updateTrigger: { content: string; timestamp: number } | null;
  onUpdate?: () => void;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (updateTrigger) {
      // Use discrete update to prevent triggering onChange
      editor.update(() => {
        const root = $getRoot();
        root.clear();

        if (updateTrigger.content.trim()) {
          // Simple text content update
          const paragraph = $createParagraphNode();
          const text = $createTextNode(updateTrigger.content);
          paragraph.append(text);
          root.append(paragraph);
        }
      });

      // Call the callback after update
      if (onUpdate) {
        setTimeout(onUpdate, 0);
      }
    }
  }, [updateTrigger, editor, onUpdate]);

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
  placeholder: 'text-gray-500 text-base sm:text-lg select-none pointer-events-none',
  paragraph: 'mb-4 text-base sm:text-lg leading-relaxed text-gray-900 font-normal',
  quote: 'border-l-4 border-indigo-400 pl-6 py-2 my-6 italic text-base sm:text-lg leading-relaxed text-gray-700 bg-gray-50 rounded-r-lg',
  heading: {
    h1: 'text-2xl sm:text-3xl lg:text-4xl font-bold mb-6 sm:mb-8 leading-tight text-gray-900 border-b border-gray-200 pb-3',
    h2: 'text-xl sm:text-2xl lg:text-3xl font-semibold mb-4 sm:mb-6 leading-tight text-gray-900 mt-8 first:mt-0',
    h3: 'text-lg sm:text-xl lg:text-2xl font-medium mb-3 sm:mb-4 leading-tight text-gray-900 mt-6 first:mt-0',
  },
  list: {
    nested: {
      listitem: 'list-none',
    },
    ol: 'list-decimal list-outside ml-6 text-base sm:text-lg leading-relaxed text-gray-900 space-y-2',
    ul: 'list-disc list-outside ml-6 text-base sm:text-lg leading-relaxed text-gray-900 space-y-2',
    listitem: 'mb-2 pl-2',
  },
  link: 'text-indigo-600 underline decoration-2 underline-offset-2 hover:text-indigo-800 hover:decoration-indigo-800 break-words transition-colors duration-150 cursor-pointer',
  text: {
    bold: 'font-bold text-gray-900',
    italic: 'italic',
    underline: 'underline decoration-2 underline-offset-2',
    strikethrough: 'line-through decoration-2',
    code: 'bg-gray-100 text-gray-800 px-2 py-1 rounded-md text-sm font-mono border border-gray-200',
  },
  // Enhanced grammar mark styles with better visual hierarchy
  grammarMark: {
    base: 'cursor-pointer rounded-sm transition-all duration-200 hover:shadow-sm',
    spelling: 'bg-red-50 text-red-900 border-b-2 border-red-400 hover:bg-red-100 hover:border-red-500',
    grammar: 'bg-amber-50 text-amber-900 border-b-2 border-amber-400 hover:bg-amber-100 hover:border-amber-500',
    punctuation: 'bg-orange-50 text-orange-900 border-b-2 border-orange-400 hover:bg-orange-100 hover:border-orange-500',
    style: 'bg-blue-50 text-blue-900 border-b-2 border-blue-400 hover:bg-blue-100 hover:border-blue-500',
  },
};

// Plugin to capture editor instance
function EditorRefPlugin({ onEditorRef }: { onEditorRef: (editor: LexicalEditorType) => void }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    onEditorRef(editor);
  }, [editor, onEditorRef]);

  return null;
}

const LexicalEditor = forwardRef<LexicalEditorRef, LexicalEditorProps>(({
  initialContent = '',
  placeholder = 'Type or paste (⌘+V)…',
  onChange,
  onSave,
  className = '',
  autoSave = false,
  autoSaveDelay = 2000,
  readOnly = false,
  grammarSuggestions = [],
  lastCheckedTextForGrammar = '',
  onGrammarSuggestionHover,
  onGrammarSuggestionClick,
  onApplyGrammarSuggestion,
  onDismissGrammarSuggestion,
  onRegenerateGrammarSuggestion,
  onAddToDictionary,
  isRegenerating = false,
}, ref) => {
  const [updateTrigger, setUpdateTrigger] = React.useState<{ content: string; timestamp: number } | null>(null);
  const [editorElement, setEditorElement] = useState<HTMLElement | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<LexicalEditorType | null>(null);

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
      GrammarMarkNode, // Add custom grammar mark node
    ],
    editable: !readOnly,
  };

  const handleChange = useCallback((editorState: EditorState, editor: LexicalEditorType) => {
    if (onChange) {
      // FIX: Use editor.read() instead of editorState.read() to get an active context.
      editor.read(() => {
        // Now this call to $getRoot() is safe.
        const root = $getRoot();
        const textContent = root.getTextContent();

        const stateData: EditorStateData = {
          content: textContent,
          html: textContent, // Simplified - using text content for now
          wordCount: textContent.trim().split(/\s+/).filter(Boolean).length,
          characterCount: textContent.length,
          isEmpty: textContent.trim().length === 0,
        };
        // Pass the derived data up to the parent component.
        onChange(stateData);
      });
    }
  }, [onChange]);

  // Capture editor element for hover card event delegation
  useEffect(() => {
    if (editorRef.current) {
      const contentEditableElement = editorRef.current.querySelector('[contenteditable="true"]');
      setEditorElement(contentEditableElement as HTMLElement);
    }
  }, []);

  // Helper function to get suggestion by ID
  const getSuggestionById = useCallback((id: string) => {
    return grammarSuggestions.find(suggestion => suggestion.id === id);
  }, [grammarSuggestions]);

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

  // Callback to capture editor instance
  const handleEditorRef = useCallback((editor: LexicalEditorType) => {
    editorInstanceRef.current = editor;
  }, []);

  useImperativeHandle(ref, () => ({
    updateContent: (content: string) => {
      setUpdateTrigger({ content, timestamp: Date.now() });
    },
    getEditor: () => editorInstanceRef.current,
  }));

  return (
    <div className={`relative ${className} ${readOnly ? '' : ''}`}>
      <LexicalComposer initialConfig={initialConfig}>
        <div ref={editorRef} className="relative flex flex-col h-full">
          <div className="flex-1 relative">
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className={`
                    min-h-[300px] sm:min-h-[400px]
                    p-6 sm:p-8 lg:p-12
                    focus:outline-none resize-none
                    ${!readOnly ? 'pb-20 sm:pb-24' : ''}
                    ${readOnly ? 'cursor-default' : 'cursor-text'}
                    text-base sm:text-lg leading-relaxed
                    bg-white
                    selection:bg-indigo-100 selection:text-indigo-900
                    prose prose-lg max-w-none
                    font-serif
                  `}
                  aria-placeholder={placeholder}
                  spellCheck={false}
                  placeholder={
                    <div className="absolute top-6 sm:top-8 lg:top-12 left-6 sm:left-8 lg:left-12 text-gray-500 text-base sm:text-lg pointer-events-none select-none font-serif">
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
            <UpdateContentPlugin
              updateTrigger={updateTrigger}
              onUpdate={() => {
                setUpdateTrigger(null);
              }}
            />
            {/* Plugin to capture editor instance for ref */}
            <EditorRefPlugin onEditorRef={handleEditorRef} />
            {/* Grammar Plugin for custom marks and interactions */}
            <GrammarPlugin
              suggestions={grammarSuggestions}
              lastCheckedText={lastCheckedTextForGrammar}
              onSuggestionHover={onGrammarSuggestionHover}
              onSuggestionClick={onGrammarSuggestionClick}
            />
          </div>
          {!readOnly && (
            <div className="fixed bottom-0 left-0 z-10 lg:right-80 right-0">
              <EditorToolbar />
            </div>
          )}
        </div>
        {/* Grammar Hover Card - rendered outside editor to prevent DOM mutations */}
        <SuggestionHoverCard
          editorElement={editorElement}
          getSuggestion={getSuggestionById}
          onApplySuggestion={onApplyGrammarSuggestion}
          onDismissSuggestion={onDismissGrammarSuggestion}
          onRegenerateSuggestion={onRegenerateGrammarSuggestion}
          onAddToDictionary={onAddToDictionary}
          isRegenerating={isRegenerating}
        />
      </LexicalComposer>
    </div>
  );
  });

export default LexicalEditor;

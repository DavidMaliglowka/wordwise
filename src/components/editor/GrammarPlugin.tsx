import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot, $isRangeSelection, $isTextNode, TextNode, $createTextNode, LexicalEditor
} from 'lexical';
import { $createOffsetView } from '@lexical/offset';
import { $dfs } from '@lexical/utils';
import {
  $createGrammarMarkNode,
  $isGrammarMarkNode
} from './GrammarMarkNode';
import { EditorSuggestion } from '../../types/grammar';

interface GrammarPluginProps {
  suggestions: EditorSuggestion[];
  lastCheckedText: string;
  onSuggestionHover?: (suggestionId: string | null) => void;
  onSuggestionClick?: (suggestion: EditorSuggestion) => void;
}

export function GrammarPlugin({
  suggestions,
  lastCheckedText,
  onSuggestionHover,
  onSuggestionClick
}: GrammarPluginProps) {
  const [editor] = useLexicalComposerContext();
  const activeMarkIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentText = editor.getEditorState().read(() => $getRoot().getTextContent());

    // === THE FINAL FIX ===
    if (currentText !== lastCheckedText) {
      // If suggestions are stale, DO NOTHING. The system will self-correct
      // when the next valid suggestion set arrives for the current text.
      // We no longer run a destructive "clear all" operation here.
      return;
    }
    // ======================

    const newSuggestionIds = new Set(suggestions.map(s => s.id));
    const previousMarkIds = activeMarkIds.current;

    editor.update(() => {
      // Calculate which marks to REMOVE and which suggestions to ADD
      const idsToRemove = new Set(
        [...previousMarkIds].filter(id => !newSuggestionIds.has(id))
      );
      const suggestionsToAdd = suggestions.filter(s => !previousMarkIds.has(s.id));

      if (idsToRemove.size === 0 && suggestionsToAdd.length === 0) {
        return;
      }

      console.log(`MARK DIFF: Removing ${idsToRemove.size}, Adding ${suggestionsToAdd.length}`);

      // Get all grammar marks in the document once for efficiency
      const grammarMarks = $dfs().map(({ node }) => node).filter($isGrammarMarkNode);

      // Perform the removal
      grammarMarks.forEach(mark => {
        const id = mark.getSuggestionId();
        if (idsToRemove.has(id)) {
          const children = mark.getChildren();
          children.forEach(child => mark.insertBefore(child));
          mark.remove();
        }
      });

      // --- FIX: Pass the editor instance into the loop ---
      if (suggestionsToAdd.length > 0) {
        suggestionsToAdd.forEach(suggestion => {
          if (suggestion.isVisible !== false && suggestion.isDismissed !== true) {
            // Pass the editor so a fresh OffsetView can be created for each suggestion.
            applyGrammarMark(editor, suggestion);
          }
        });
      }

      activeMarkIds.current = newSuggestionIds;
    }, {
      tag: 'apply-grammar-marks',
    });
  }, [suggestions, editor, lastCheckedText]);

  // Register TextNode transform to handle text changes within marked regions.
  useEffect(() => {
    const unregisterTransform = editor.registerNodeTransform(TextNode, (textNode: TextNode) => {
      const parent = textNode.getParent();
      if (!$isGrammarMarkNode(parent)) {
        return;
      }

      // If a user deletes all the text in a mark, remove the now-empty mark node.
      if (parent.getTextContentSize() === 0) {
        console.log('🗑️ TRANSFORM DEBUG: Removing empty grammar mark.');
        parent.remove();
      }
    });

    return () => {
      unregisterTransform();
    };
  }, [editor]);

  // Set up event delegation for hover interactions
  useEffect(() => {
    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.dataset.suggestionId) {
        onSuggestionHover?.(target.dataset.suggestionId);
      }
    };

    const handleMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const relatedTarget = event.relatedTarget as HTMLElement;

      // Only clear hover if leaving the editor area entirely
      if (!rootElement.contains(relatedTarget)) {
        onSuggestionHover?.(null);
      }
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.dataset.suggestionId) {
        const suggestionId = target.dataset.suggestionId;
        const suggestion = suggestions.find(s => s.id === suggestionId);
        if (suggestion) {
          onSuggestionClick?.(suggestion);
        }
      }
    };

    rootElement.addEventListener('mouseover', handleMouseOver);
    rootElement.addEventListener('mouseout', handleMouseOut);
    rootElement.addEventListener('click', handleClick);

    return () => {
      rootElement.removeEventListener('mouseover', handleMouseOver);
      rootElement.removeEventListener('mouseout', handleMouseOut);
      rootElement.removeEventListener('click', handleClick);
    };
  }, [editor, suggestions, onSuggestionHover, onSuggestionClick]);

  return null;
}

// --- FIX: Update the function signature and create the OffsetView inside ---
function applyGrammarMark(editor: LexicalEditor, suggestion: EditorSuggestion): void {
  const { start, end } = suggestion.range;

  try {
    // Create a fresh OffsetView snapshot for THIS specific suggestion.
    // This ensures our positional data is perfectly accurate at the moment of application.
    const offsetView = $createOffsetView(editor);
    const selection = offsetView.createSelectionFromOffsets(start, end);

    if (selection && $isRangeSelection(selection)) {
      const nodesToMark = selection.extract();
      for (const node of nodesToMark) {
        if ($isTextNode(node)) {
          const markNode = $createGrammarMarkNode(suggestion.type, suggestion.id);
          node.replace(markNode);
          markNode.append(node);
        }
      }
    } else {
      console.warn(`Could not create selection for suggestion ${suggestion.id} at range ${start}-${end}`);
    }
  } catch (error) {
    console.error(`Failed to apply grammar mark for suggestion ${suggestion.id}:`, error);
  }
}

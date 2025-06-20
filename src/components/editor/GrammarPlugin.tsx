import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $getSelection, $isRangeSelection, $createTextNode } from 'lexical';
import { $createGrammarMarkNode, $isGrammarMarkNode, $removeGrammarMark } from './GrammarMarkNode';
import { EditorSuggestion } from '../../types/grammar';

interface GrammarPluginProps {
  suggestions: EditorSuggestion[];
  onSuggestionHover?: (suggestionId: string | null) => void;
  onSuggestionClick?: (suggestion: EditorSuggestion) => void;
  onMarkApplicationStart?: () => void;
  onMarkApplicationEnd?: () => void;
}

export function GrammarPlugin({
  suggestions,
  onSuggestionHover,
  onSuggestionClick,
  onMarkApplicationStart,
  onMarkApplicationEnd
}: GrammarPluginProps) {
  const [editor] = useLexicalComposerContext();
  const isApplyingMarks = useRef(false);

  // Debug: Log suggestions when they change
  useEffect(() => {
    console.log(`🎯 GrammarPlugin received ${suggestions.length} suggestions:`, suggestions);
  }, [suggestions]);

  // Apply grammar marks when suggestions change
  useEffect(() => {
    if (isApplyingMarks.current) {
      console.log('⏸️ Skipping mark application - already in progress');
      return;
    }

    isApplyingMarks.current = true;

    // Notify parent that we're starting mark application
    onMarkApplicationStart?.();

    editor.update(() => {
      console.log('🔄 Starting mark application cycle');

      // Always clear existing marks first
      clearAllGrammarMarks();

      // Apply new marks for visible suggestions (only if we have suggestions)
      if (suggestions.length > 0) {
        suggestions.forEach(suggestion => {
          if (suggestion.isVisible !== false && suggestion.isDismissed !== true) {
            applyGrammarMark(suggestion);
          }
        });
      }

      console.log('✅ Mark application cycle complete');
    }, {
      onUpdate: () => {
        // Reset flag after update is complete
        setTimeout(() => {
          isApplyingMarks.current = false;
          onMarkApplicationEnd?.();
        }, 10);
      }
    });
  }, [suggestions, editor, onMarkApplicationStart, onMarkApplicationEnd]);

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
        const suggestion = suggestions.find(s => s.id === target.dataset.suggestionId);
        if (suggestion) {
          onSuggestionClick?.(suggestion);
        }
      }
    };

    // Use event delegation on root element
    rootElement.addEventListener('mouseover', handleMouseOver);
    rootElement.addEventListener('mouseout', handleMouseOut);
    rootElement.addEventListener('click', handleClick);

    return () => {
      rootElement.removeEventListener('mouseover', handleMouseOver);
      rootElement.removeEventListener('mouseout', handleMouseOut);
      rootElement.removeEventListener('click', handleClick);
    };
  }, [editor, suggestions, onSuggestionHover, onSuggestionClick]);

  return null; // This is a headless plugin
}

// Helper function to clear all grammar marks
function clearAllGrammarMarks(): void {
  const root = $getRoot();

  function traverseAndClear(node: any): void {
    if ($isGrammarMarkNode(node)) {
      node.remove();
      return;
    }

    // Only traverse if the node has children
    if (typeof node.getChildren === 'function') {
      const children = node.getChildren();
      // Create a copy of children array to avoid modification during iteration
      const childrenCopy = [...children];
      for (const child of childrenCopy) {
        traverseAndClear(child);
      }
    }
  }

  traverseAndClear(root);
}

// Helper function to apply a grammar mark for a suggestion
function applyGrammarMark(suggestion: EditorSuggestion): void {
  console.log(`📝 Applying grammar mark for suggestion:`, {
    id: suggestion.id,
    type: suggestion.type,
    range: suggestion.range,
    original: suggestion.original,
    proposed: suggestion.proposed
  });

  const root = $getRoot();
  const textContent = root.getTextContent();

  // Validate range
  if (suggestion.range.start < 0 ||
      suggestion.range.end > textContent.length ||
      suggestion.range.start >= suggestion.range.end) {
    console.warn(`Invalid range for suggestion ${suggestion.id}:`, suggestion.range);
    return;
  }

  // Simple approach: Find the first text node that contains our target text
  function findAndMarkText(node: any): boolean {
    if (node.getType && node.getType() === 'text') {
      const nodeText = node.getTextContent();
      const targetText = suggestion.original;

      // Simple text matching for now - look for the exact original text
      const textIndex = nodeText.indexOf(targetText);
      if (textIndex !== -1) {
        try {
          // Split the text node at the start and end of our target
          const beforeText = nodeText.substring(0, textIndex);
          const afterText = nodeText.substring(textIndex + targetText.length);

          // Create the mark node
          const markNode = $createGrammarMarkNode(
            ['grammar-mark'],
            suggestion.type,
            suggestion.id
          );

          // Create a text node for the marked content
          const markedTextNode = $createTextNode(targetText);
          markNode.append(markedTextNode);

          // Replace the original node with our new structure
          if (beforeText || afterText) {
            // Need to split
            if (beforeText) {
              const beforeNode = $createTextNode(beforeText);
              node.insertBefore(beforeNode);
            }

            node.insertBefore(markNode);

            if (afterText) {
              const afterNode = $createTextNode(afterText);
              node.insertBefore(afterNode);
            }

            node.remove();
          } else {
            // Replace entirely
            node.replace(markNode);
          }

          console.log(`✅ Successfully applied mark for "${targetText}"`);
          return true;
        } catch (error) {
          console.error(`Error applying mark for "${targetText}":`, error);
          return false;
        }
      }
    }

    // Recursively check children if the node has them
    if (node.getChildren && typeof node.getChildren === 'function') {
      try {
        const children = [...node.getChildren()]; // Create copy to avoid modification issues
        for (const child of children) {
          if (findAndMarkText(child)) {
            return true; // Stop after first match
          }
        }
      } catch (error) {
        console.error('Error traversing children:', error);
      }
    }

    return false;
  }

  findAndMarkText(root);
}

// Helper function to remove a specific grammar mark
export function removeGrammarMark(suggestionId: string): void {
  $removeGrammarMark(suggestionId);
}

// Helper function to check if marks are currently being applied
export function isApplyingGrammarMarks(): boolean {
  return false; // This will be managed by the plugin instance
}

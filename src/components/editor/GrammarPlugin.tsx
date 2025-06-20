import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $getSelection, $isRangeSelection } from 'lexical';
import { $createGrammarMarkNode, $isGrammarMarkNode, $removeGrammarMark } from './GrammarMarkNode';
import { EditorSuggestion } from '../../types/grammar';

interface GrammarPluginProps {
  suggestions: EditorSuggestion[];
  onSuggestionHover?: (suggestionId: string | null) => void;
  onSuggestionClick?: (suggestion: EditorSuggestion) => void;
}

export function GrammarPlugin({
  suggestions,
  onSuggestionHover,
  onSuggestionClick
}: GrammarPluginProps) {
  const [editor] = useLexicalComposerContext();

  // Apply grammar marks when suggestions change
  useEffect(() => {
    if (!suggestions.length) {
      return;
    }

    editor.update(() => {
      // Clear existing marks first
      clearAllGrammarMarks();

      // Apply new marks for visible suggestions
      suggestions.forEach(suggestion => {
        if (suggestion.isVisible && !suggestion.isDismissed) {
          applyGrammarMark(suggestion);
        }
      });
    });
  }, [suggestions, editor]);

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
  // TODO: Implement proper traversal to clear all marks
  // This will be enhanced with proper node traversal
  console.log('Clearing all grammar marks');
}

// Helper function to apply a grammar mark for a suggestion
function applyGrammarMark(suggestion: EditorSuggestion): void {
  const root = $getRoot();
  const textContent = root.getTextContent();

  // Validate range
  if (suggestion.range.start < 0 ||
      suggestion.range.end > textContent.length ||
      suggestion.range.start >= suggestion.range.end) {
    console.warn(`Invalid range for suggestion ${suggestion.id}:`, suggestion.range);
    return;
  }

  // TODO: Implement proper text range marking with position mapping
  // For now, just log the application
  console.log(`Applied grammar mark for suggestion ${suggestion.id} (${suggestion.type}):`, {
    range: suggestion.range,
    original: suggestion.original,
    proposed: suggestion.proposed
  });

  // This is a simplified implementation - proper text selection and marking
  // will be implemented in the next iteration with position mapping
}

// Helper function to remove a specific grammar mark
export function removeGrammarMark(suggestionId: string): void {
  $removeGrammarMark(suggestionId);
}

// Helper function to update mark visibility
export function updateMarkVisibility(suggestionId: string, isVisible: boolean): void {
  // TODO: Implement mark visibility toggling
  console.log(`Update mark visibility for ${suggestionId}: ${isVisible}`);
}

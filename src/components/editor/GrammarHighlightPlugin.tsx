import React, { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createTextNode,
  TextNode,
  $isTextNode,
} from 'lexical';
import { $isMarkNode, $unwrapMarkNode, $wrapSelectionInMarkNode } from '@lexical/mark';
import { $createGrammarMarkNode, $isGrammarMarkNode, GrammarMarkNode } from './GrammarMarkNode';
import { EditorSuggestion, CategorizedSuggestions } from '../../types/grammar';
import { GrammarService } from '../../services/grammar';

interface GrammarHighlightPluginProps {
  suggestions: EditorSuggestion[];
  categorizedSuggestions: CategorizedSuggestions;
  isApplying?: boolean;
}

interface TextPosition {
  start: number;
  end: number;
  text: string;
}

// Debug logging function
const debugLog = (action: string, details: any = {}) => {
  console.log(`🔍 [HighlightPlugin] ${action}:`, {
    timestamp: new Date().toISOString().split('T')[1],
    ...details
  });
};

export const GrammarHighlightPlugin: React.FC<GrammarHighlightPluginProps> = ({
  suggestions,
  categorizedSuggestions,
  isApplying = false,
}) => {
  const [editor] = useLexicalComposerContext();
  const isApplyingHighlights = useRef(false);
  const lastSuggestionsRef = useRef<string>(''); // Track suggestions to prevent unnecessary updates

  useEffect(() => {
    debugLog('Effect triggered', {
      isApplying,
      isApplyingHighlights: isApplyingHighlights.current,
      suggestionsCount: suggestions.length
    });

    // Skip if we're currently applying suggestions to prevent infinite loops
    if (isApplying || isApplyingHighlights.current) {
      debugLog('Skipping - currently applying');
      return;
    }

    // Create a hash of current suggestions to avoid unnecessary updates
    const currentSuggestionsHash = JSON.stringify(
      suggestions.map(s => ({ id: s.id, range: s.range, original: s.original }))
    );

    // Skip if suggestions haven't changed
    if (currentSuggestionsHash === lastSuggestionsRef.current) {
      debugLog('Skipping - suggestions unchanged');
      return;
    }

    debugLog('Applying new suggestions', {
      previousHash: lastSuggestionsRef.current.slice(0, 50),
      currentHash: currentSuggestionsHash.slice(0, 50)
    });

    lastSuggestionsRef.current = currentSuggestionsHash;

    // Apply highlights within editor transaction
    editor.update(() => {
      try {
        isApplyingHighlights.current = true;

        // Clear existing grammar marks first
        clearExistingGrammarMarks();

        // Apply new highlights if we have suggestions
        if (suggestions.length > 0) {
          applyGrammarHighlights(suggestions);
        }
      } catch (error) {
        console.error('Error applying grammar highlights:', error);
      } finally {
        isApplyingHighlights.current = false;
      }
    });
  }, [editor, suggestions, isApplying]);

  const clearExistingGrammarMarks = () => {
    const root = $getRoot();
    const textNodes = root.getAllTextNodes();

    textNodes.forEach((textNode) => {
      const parent = textNode.getParent();
      if ($isGrammarMarkNode(parent)) {
        $unwrapMarkNode(parent);
      }
    });
  };

  const applyGrammarHighlights = (suggestions: EditorSuggestion[]) => {
    const root = $getRoot();
    const fullText = root.getTextContent();

    if (!fullText) return;

    // Sort suggestions by position to apply them correctly
    const sortedSuggestions = [...suggestions].sort((a, b) => a.range.start - b.range.start);

    // Group overlapping suggestions to handle them properly
    const nonOverlappingSuggestions = removeOverlappingSuggestions(sortedSuggestions);

    // Apply each suggestion as a highlight
    nonOverlappingSuggestions.forEach((suggestion) => {
      applySuggestionHighlight(suggestion, fullText);
    });
  };

  const removeOverlappingSuggestions = (suggestions: EditorSuggestion[]): EditorSuggestion[] => {
    const result: EditorSuggestion[] = [];

    for (const suggestion of suggestions) {
      const hasOverlap = result.some(existing =>
        (suggestion.range.start < existing.range.end && suggestion.range.end > existing.range.start)
      );

      if (!hasOverlap) {
        result.push(suggestion);
      }
    }

    return result;
  };

  const applySuggestionHighlight = (suggestion: EditorSuggestion, fullText: string) => {
    try {
      // Find the text to highlight using multiple strategies
      const targetText = findTextToHighlight(suggestion, fullText);

      if (!targetText) {
        console.warn('Could not find text to highlight for suggestion:', suggestion);
        return;
      }

      // Find and highlight the text nodes that contain this text
      highlightTextInNodes(targetText, suggestion);
    } catch (error) {
      console.error('Error applying suggestion highlight:', error, suggestion);
    }
  };

  const findTextToHighlight = (suggestion: EditorSuggestion, fullText: string): TextPosition | null => {
    const { range, original } = suggestion;

    // Strategy 1: Use original positions
    if (range.start >= 0 && range.end <= fullText.length) {
      const textAtPosition = fullText.substring(range.start, range.end);
      if (textAtPosition === original) {
        return {
          start: range.start,
          end: range.end,
          text: original,
        };
      }
    }

    // Strategy 2: Search for the text
    const index = fullText.indexOf(original);
    if (index !== -1) {
      return {
        start: index,
        end: index + original.length,
        text: original,
      };
    }

    // Strategy 3: Fuzzy search within a reasonable range
    const searchStart = Math.max(0, range.start - 20);
    const searchEnd = Math.min(fullText.length, range.end + 20);
    const searchArea = fullText.substring(searchStart, searchEnd);
    const fuzzyIndex = searchArea.indexOf(original);

    if (fuzzyIndex !== -1) {
      const actualStart = searchStart + fuzzyIndex;
      return {
        start: actualStart,
        end: actualStart + original.length,
        text: original,
      };
    }

    return null;
  };

  const highlightTextInNodes = (targetText: TextPosition, suggestion: EditorSuggestion) => {
    const root = $getRoot();
    const textNodes = root.getAllTextNodes();

    let currentPosition = 0;

    for (const textNode of textNodes) {
      const nodeText = textNode.getTextContent();
      const nodeStart = currentPosition;
      const nodeEnd = currentPosition + nodeText.length;

      // Check if this node contains part of our target text
      if (nodeStart < targetText.end && nodeEnd > targetText.start) {
        // Calculate the portion of this node that needs highlighting
        const highlightStart = Math.max(0, targetText.start - nodeStart);
        const highlightEnd = Math.min(nodeText.length, targetText.end - nodeStart);

        if (highlightStart < highlightEnd) {
          highlightPortionOfTextNode(textNode, highlightStart, highlightEnd, suggestion);
        }
      }

      currentPosition = nodeEnd;

      // If we've passed the target text, we can stop
      if (currentPosition > targetText.end) {
        break;
      }
    }
  };

  const highlightPortionOfTextNode = (
    textNode: TextNode,
    start: number,
    end: number,
    suggestion: EditorSuggestion
  ) => {
    try {
      const nodeText = textNode.getTextContent();

      // If highlighting the entire node, wrap it directly
      if (start === 0 && end === nodeText.length) {
        const grammarMark = $createGrammarMarkNode(
          ['grammar-highlight'],
          suggestion.category,
          suggestion.id,
          suggestion
        );
        textNode.replace(grammarMark);
        grammarMark.append(textNode);
        return;
      }

      // For partial highlighting, we need to split the text node
      const beforeText = nodeText.substring(0, start);
      const highlightText = nodeText.substring(start, end);
      const afterText = nodeText.substring(end);

      const newNodes: (TextNode | GrammarMarkNode)[] = [];

      // Add before text if it exists
      if (beforeText) {
        newNodes.push($createTextNode(beforeText));
      }

      // Add highlighted text
      if (highlightText) {
        const grammarMark = $createGrammarMarkNode(
          ['grammar-highlight'],
          suggestion.category,
          suggestion.id,
          suggestion
        );
        const highlightTextNode = $createTextNode(highlightText);
        grammarMark.append(highlightTextNode);
        newNodes.push(grammarMark);
      }

      // Add after text if it exists
      if (afterText) {
        newNodes.push($createTextNode(afterText));
      }

            // Replace the original text node with the new nodes
      if (newNodes.length > 0) {
        const parent = textNode.getParent();
        if (parent) {
          // Insert new nodes after the current text node
          newNodes.reverse().forEach((node) => {
            textNode.insertAfter(node);
          });
          // Remove the original text node
          textNode.remove();
        }
      }
    } catch (error) {
      console.error('Error highlighting portion of text node:', error);
    }
  };

  // This plugin doesn't render anything - it just applies highlights
  return null;
};

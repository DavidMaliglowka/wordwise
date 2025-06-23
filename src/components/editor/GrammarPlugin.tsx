import { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $getSelection, $setSelection, $isRangeSelection, $createTextNode, $createRangeSelection, $isTextNode, TextNode } from 'lexical';
import { $wrapSelectionInMarkNode } from '@lexical/mark';
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
  const reanalysisTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Function to trigger debounced grammar reanalysis
  const triggerReanalysis = () => {
    // Clear existing timeout
    if (reanalysisTimeoutRef.current) {
      clearTimeout(reanalysisTimeoutRef.current);
    }

    // Set new timeout for debounced reanalysis
    reanalysisTimeoutRef.current = setTimeout(() => {
      console.log('🔄 REANALYSIS DEBUG: Triggering grammar reanalysis after mark changes');

      // Trigger a custom event that the parent component can listen to
      const event = new CustomEvent('grammarReanalysisNeeded', {
        detail: { reason: 'markInvalidation' }
      });

      const rootElement = editor.getRootElement();
      if (rootElement) {
        rootElement.dispatchEvent(event);
      }
    }, 1000); // 1 second debounce
  };

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
      const selection = $getSelection()?.clone();
      const rootElement = editor.getRootElement();
      const isFocused = rootElement && document.activeElement && rootElement.contains(document.activeElement);
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

      // Restore selection if the editor was focused to prevent cursor jumping
      if (isFocused && selection) {
        $setSelection(selection);
      }

      console.log('✅ Mark application cycle complete');
    }, {
      tag: 'history-merge', // Merge with previous history state to help with undo
      onUpdate: () => {
        // Reset flag after update is complete
        setTimeout(() => {
          isApplyingMarks.current = false;
          onMarkApplicationEnd?.();
        }, 10);
      }
    });
  }, [suggestions, editor, onMarkApplicationStart, onMarkApplicationEnd]);

  // Register TextNode transform to handle text changes within marked regions
  useEffect(() => {
    const unregisterTransform = editor.registerNodeTransform(TextNode, (textNode: TextNode) => {
      // Check if this text node is within a grammar mark
      const parent = textNode.getParent();

      if ($isGrammarMarkNode(parent)) {
        console.log('🔄 TRANSFORM DEBUG: Text changed within grammar mark:', {
          suggestionId: parent.getSuggestionId(),
          suggestionType: parent.getSuggestionType(),
          newText: textNode.getTextContent(),
          parentTextContent: parent.getTextContent()
        });

        // Check if the text change invalidates the mark
        const markText = parent.getTextContent();
        const suggestionId = parent.getSuggestionId();

        // Find the original suggestion to compare
        const originalSuggestion = suggestions.find(s => s.id === suggestionId);

        if (originalSuggestion) {
          // If the marked text no longer matches the original suggestion, remove the mark
          if (markText !== originalSuggestion.original) {
            console.log('⚠️ TRANSFORM DEBUG: Mark text no longer matches original, removing mark:', {
              markText,
              originalText: originalSuggestion.original,
              suggestionId
            });

                         // Unwrap the mark node - replace it with its text content
             try {
               const textContent = parent.getTextContent();
               const newTextNode = $createTextNode(textContent);
               parent.replace(newTextNode);

               console.log('✅ TRANSFORM DEBUG: Successfully unwrapped invalid mark');

               // Trigger reanalysis after a mark is removed due to text changes
               triggerReanalysis();
             } catch (error) {
               console.error('🚨 TRANSFORM DEBUG: Error unwrapping mark:', error);
             }
          }
        }
      }

      // Also check if this text node is adjacent to grammar marks that might need adjustment
      const siblings = textNode.getParent()?.getChildren() || [];
      const textNodeIndex = siblings.indexOf(textNode);

      // Check previous sibling
      if (textNodeIndex > 0) {
        const prevSibling = siblings[textNodeIndex - 1];
        if ($isGrammarMarkNode(prevSibling)) {
          // Could implement logic to extend or adjust marks based on text changes
          console.log('🔍 TRANSFORM DEBUG: Text node adjacent to grammar mark (previous)');
        }
      }

      // Check next sibling
      if (textNodeIndex < siblings.length - 1) {
        const nextSibling = siblings[textNodeIndex + 1];
        if ($isGrammarMarkNode(nextSibling)) {
          // Could implement logic to extend or adjust marks based on text changes
          console.log('🔍 TRANSFORM DEBUG: Text node adjacent to grammar mark (next)');
        }
      }
    });

    return () => {
      unregisterTransform();
      // Clean up any pending reanalysis timeout
      if (reanalysisTimeoutRef.current) {
        clearTimeout(reanalysisTimeoutRef.current);
      }
    };
  }, [editor, suggestions, triggerReanalysis]);

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
      console.log('🖱️ CLICK DEBUG: Click event in GrammarPlugin', {
        target: target.tagName,
        className: target.className,
        suggestionId: target.dataset.suggestionId,
        hasAttribute: target.hasAttribute('data-suggestion-type'),
        dataset: target.dataset,
        eventType: event.type,
        bubbles: event.bubbles,
        cancelable: event.cancelable,
        defaultPrevented: event.defaultPrevented
      });

      if (target.dataset.suggestionId) {
        const suggestion = suggestions.find(s => s.id === target.dataset.suggestionId);
        if (suggestion) {
          console.log('🎯 CLICK DEBUG: Found suggestion, preventing default and calling onSuggestionClick', {
            suggestionId: suggestion.id,
            suggestionText: suggestion.original,
            onSuggestionClickExists: !!onSuggestionClick
          });

          // Prevent default click behavior FIRST
          event.preventDefault();
          event.stopPropagation();

          console.log('🛑 CLICK DEBUG: Event prevented and stopped', {
            defaultPrevented: event.defaultPrevented,
            propagationStopped: event.cancelBubble
          });

          onSuggestionClick?.(suggestion);

          console.log('✅ CLICK DEBUG: onSuggestionClick called successfully');
        } else {
          console.log('❌ CLICK DEBUG: Suggestion not found for ID:', target.dataset.suggestionId);
        }
      } else {
        console.log('ℹ️ CLICK DEBUG: No suggestion ID found on clicked element');
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
  console.log('🧹 CLEAR DEBUG: Starting to clear all grammar marks');
  const root = $getRoot();

  function traverseAndClear(node: any): void {
    if ($isGrammarMarkNode(node)) {
      console.log('🎯 CLEAR DEBUG: Found grammar mark node to unwrap:', {
        suggestionId: node.getSuggestionId(),
        suggestionType: node.getSuggestionType()
      });

      try {
        // Get the text content from the mark node before removing it
        const textContent = node.getTextContent();
        console.log('📝 CLEAR DEBUG: Extracting text content:', textContent);

        if (textContent) {
          // Create a new text node with the content
          const textNode = $createTextNode(textContent);

          // Replace the mark node with the plain text node
          node.replace(textNode);
          console.log('✅ CLEAR DEBUG: Successfully unwrapped mark node');
        } else {
          // If no text content, just remove the empty mark
          node.remove();
          console.log('🗑️ CLEAR DEBUG: Removed empty mark node');
        }
      } catch (error) {
        console.error('🚨 CLEAR DEBUG: Error unwrapping mark node:', error);
        // Fallback to just removing the node if unwrapping fails
        node.remove();
      }
      // Do not return; continue traversal to siblings.
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
  console.log('🧹 CLEAR DEBUG: Finished clearing all grammar marks');
}

// Helper function to apply a grammar mark for a suggestion using Lexical's MarkNode API
function applyGrammarMark(suggestion: EditorSuggestion): void {
  console.log(`📝 MARK DEBUG: Starting mark application for suggestion:`, {
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
    console.warn(`⚠️ MARK DEBUG: Invalid range for suggestion ${suggestion.id}:`, {
      range: suggestion.range,
      textLength: textContent.length
    });
    return;
  }

  // Enhanced approach: For passive voice, mark the entire sentence
  const isPassiveVoice = suggestion.type === 'passive' || suggestion.type === 'style';
  let targetStart = suggestion.range.start;
  let targetEnd = suggestion.range.end;

  if (isPassiveVoice) {
    // Find sentence boundaries for passive voice suggestions
    const sentenceInfo = findContainingSentenceWithRange(textContent, suggestion.range.start, suggestion.range.end);
    targetStart = sentenceInfo.start;
    targetEnd = sentenceInfo.end;

    console.log(`📝 MARK DEBUG: Sentence-level marking for passive voice:`, {
      originalRange: `${suggestion.range.start}-${suggestion.range.end}`,
      sentenceRange: `${targetStart}-${targetEnd}`,
      sentenceText: sentenceInfo.text.substring(0, 100) + (sentenceInfo.text.length > 100 ? '...' : '')
    });
  }

    try {
    // Create a range selection for the target text
    const selection = createSelectionFromTextRange(targetStart, targetEnd);

    if (selection) {
      // Set the selection temporarily
      $setSelection(selection);

      // Create the grammar mark node and wrap the selected text
      const markNode = $createGrammarMarkNode(['grammar-mark'], suggestion.type, suggestion.id);

      // Get the selected text and wrap it in our mark node
      if ($isRangeSelection(selection)) {
        const selectedText = selection.getTextContent();
        const textNode = $createTextNode(selectedText);
        markNode.append(textNode);

        // Replace the selection with our mark node
        selection.insertNodes([markNode]);

        console.log(`✅ MARK DEBUG: Successfully applied mark using range selection:`, {
          suggestionId: suggestion.id,
          selectedText,
          range: `${targetStart}-${targetEnd}`
        });
      }
    } else {
      console.warn(`⚠️ MARK DEBUG: Could not create selection for range ${targetStart}-${targetEnd}`);
    }
  } catch (error) {
    console.error(`🚨 MARK DEBUG: Error applying mark with range selection:`, error);
  }
}

// Helper function to create a RangeSelection from text offsets
function createSelectionFromTextRange(startOffset: number, endOffset: number) {
  const root = $getRoot();

  // Find the text nodes and offsets for start and end positions
  const startPoint = findTextNodeAndOffset(root, startOffset);
  const endPoint = findTextNodeAndOffset(root, endOffset);

  if (!startPoint || !endPoint) {
    console.warn('Could not find text nodes for range', { startOffset, endOffset });
    return null;
  }

  // Create a range selection
  const selection = $createRangeSelection();
  selection.setTextNodeRange(
    startPoint.node,
    startPoint.offset,
    endPoint.node,
    endPoint.offset
  );

  return selection;
}

// Helper function to find text node and offset for a given absolute text position
function findTextNodeAndOffset(node: any, targetOffset: number, currentOffset: number = 0): { node: any; offset: number } | null {
  if ($isTextNode(node)) {
    const nodeLength = node.getTextContent().length;
    if (targetOffset <= currentOffset + nodeLength) {
      // Target is within this text node
      return {
        node,
        offset: targetOffset - currentOffset
      };
    }
    return null;
  }

  // Traverse children
  if (node.getChildren && typeof node.getChildren === 'function') {
    const children = node.getChildren();
    let offset = currentOffset;

    for (const child of children) {
      if ($isTextNode(child)) {
        const childLength = child.getTextContent().length;
        if (targetOffset <= offset + childLength) {
          return {
            node: child,
            offset: targetOffset - offset
          };
        }
        offset += childLength;
      } else {
        const result = findTextNodeAndOffset(child, targetOffset, offset);
        if (result) {
          return result;
        }
        // Update offset by getting the text content of this non-text node
        offset += child.getTextContent().length;
      }
    }
  }

  return null;
}

// Helper function to remove a specific grammar mark by suggestionId
export function removeGrammarMark(suggestionId: string): void {
  console.log(`🗑️ REMOVE DEBUG: Starting removal of grammar mark for suggestion:`, suggestionId);

  const root = $getRoot();
  let markFound = false;

  function traverseAndRemove(node: any): boolean {
    if ($isGrammarMarkNode(node)) {
      const nodeSuggestionId = node.getSuggestionId();

      if (nodeSuggestionId === suggestionId) {
        console.log(`🎯 REMOVE DEBUG: Found matching grammar mark node:`, {
          suggestionId: nodeSuggestionId,
          suggestionType: node.getSuggestionType(),
          textContent: node.getTextContent()
        });

        try {
          // Get the text content from the mark node before removing it
          const textContent = node.getTextContent();

          if (textContent) {
            // Create a new text node with the content
            const textNode = $createTextNode(textContent);

            // Replace the mark node with the plain text node
            node.replace(textNode);
            console.log(`✅ REMOVE DEBUG: Successfully unwrapped mark node for suggestion ${suggestionId}`);
          } else {
            // If no text content, just remove the empty mark
            node.remove();
            console.log(`🗑️ REMOVE DEBUG: Removed empty mark node for suggestion ${suggestionId}`);
          }

          return true; // Mark found and removed
        } catch (error) {
          console.error(`🚨 REMOVE DEBUG: Error removing mark node for suggestion ${suggestionId}:`, error);
          // Fallback to just removing the node if unwrapping fails
          try {
            node.remove();
            console.log(`🗑️ REMOVE DEBUG: Fallback removal successful for suggestion ${suggestionId}`);
            return true;
          } catch (fallbackError) {
            console.error(`🚨 REMOVE DEBUG: Fallback removal also failed for suggestion ${suggestionId}:`, fallbackError);
            return false;
          }
        }
      }
    }

    // Traverse children if the node has them
    if (typeof node.getChildren === 'function') {
      const children = node.getChildren();
      // Create a copy of children array to avoid modification during iteration
      const childrenCopy = [...children];

      for (const child of childrenCopy) {
        if (traverseAndRemove(child)) {
          return true; // Stop after finding and removing the first match
        }
      }
    }

    return false;
  }

  markFound = traverseAndRemove(root);

  if (markFound) {
    console.log(`✅ REMOVE DEBUG: Successfully removed grammar mark for suggestion ${suggestionId}`);
  } else {
    console.warn(`⚠️ REMOVE DEBUG: No grammar mark found for suggestion ${suggestionId}`);
  }
}

// Helper function to check if marks are currently being applied
export function isApplyingGrammarMarks(): boolean {
  return false; // This will be managed by the plugin instance
}

// Helper function to find the containing sentence for passive voice marking
function findContainingSentenceWithRange(text: string, startOffset: number, endOffset: number): { text: string; start: number; end: number } {
  console.log(`🔍 SENTENCE DEBUG: Finding sentence containing range ${startOffset}-${endOffset}`);

  // Simple sentence boundary detection - can be enhanced later
  const sentenceEnders = /[.!?]/g;

  // Find sentence start (look backwards from startOffset)
  let sentenceStart = 0;
  for (let i = startOffset - 1; i >= 0; i--) {
    if (sentenceEnders.test(text[i])) {
      sentenceStart = i + 1;
      break;
    }
  }

  // Skip leading whitespace
  while (sentenceStart < text.length && /\s/.test(text[sentenceStart])) {
    sentenceStart++;
  }

  // Find sentence end (look forwards from endOffset)
  let sentenceEnd = text.length;
  for (let i = endOffset; i < text.length; i++) {
    if (sentenceEnders.test(text[i])) {
      sentenceEnd = i + 1;
      break;
    }
  }

  const sentence = text.substring(sentenceStart, sentenceEnd).trim();

  console.log(`🔍 SENTENCE DEBUG: Found sentence:`, {
    sentenceStart,
    sentenceEnd,
    sentence: sentence.substring(0, 100) + (sentence.length > 100 ? '...' : ''),
    originalRange: `${startOffset}-${endOffset}`
  });

  return {
    text: sentence,
    start: sentenceStart,
    end: sentenceEnd
  };
}

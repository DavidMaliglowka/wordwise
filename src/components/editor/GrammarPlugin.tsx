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
  console.log('🧹 CLEAR DEBUG: Finished clearing all grammar marks');
}

// Helper function to apply a grammar mark for a suggestion
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

  console.log(`📝 MARK DEBUG: Current text content:`, {
    length: textContent.length,
    first100chars: textContent.substring(0, 100),
    targetText: suggestion.original
  });

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
  const isPassiveVoice = suggestion.type === 'passive';
  const targetText = isPassiveVoice ?
    findContainingSentence(textContent, suggestion.range.start, suggestion.range.end) :
    suggestion.original;

  console.log(`📝 MARK DEBUG: ${isPassiveVoice ? 'Sentence-level' : 'Standard'} marking:`, {
    targetText,
    isPassiveVoice
  });

  // Simple approach: Find the first text node that contains our target text
  function findAndMarkText(node: any): boolean {
    if (node.getType && node.getType() === 'text') {
      const nodeText = node.getTextContent();

      console.log(`🔍 MARK DEBUG: Checking text node:`, {
        nodeText: nodeText.substring(0, 50) + (nodeText.length > 50 ? '...' : ''),
        targetText,
        nodeLength: nodeText.length
      });

      // Simple text matching for now - look for the exact original text
      const textIndex = nodeText.indexOf(targetText);
      if (textIndex !== -1) {
        console.log(`🎯 MARK DEBUG: Found target text at index ${textIndex}`);

        try {
          // Split the text node at the start and end of our target
          const beforeText = nodeText.substring(0, textIndex);
          const afterText = nodeText.substring(textIndex + targetText.length);

          console.log(`✂️ MARK DEBUG: Splitting text:`, {
            beforeText: beforeText.substring(Math.max(0, beforeText.length - 20)),
            targetText,
            afterText: afterText.substring(0, 20)
          });

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

          console.log(`✅ MARK DEBUG: Successfully applied mark for "${targetText}"`);
          return true;
        } catch (error) {
          console.error(`🚨 MARK DEBUG: Error applying mark for "${targetText}":`, error);
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
        console.error('🚨 MARK DEBUG: Error traversing children:', error);
      }
    }

    return false;
  }

  const success = findAndMarkText(root);
  console.log(`📝 MARK DEBUG: Mark application result for "${suggestion.original}":`, {
    success,
    suggestionId: suggestion.id
  });
}

// Helper function to remove a specific grammar mark
export function removeGrammarMark(suggestionId: string): void {
  $removeGrammarMark(suggestionId);
}

// Helper function to check if marks are currently being applied
export function isApplyingGrammarMarks(): boolean {
  return false; // This will be managed by the plugin instance
}

// Helper function to find the containing sentence for passive voice marking
function findContainingSentence(text: string, startOffset: number, endOffset: number): string {
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

  return sentence;
}

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { SuggestionHoverCard } from './SuggestionHoverCard';
import { EditorSuggestion } from '../../types/grammar';

interface GrammarHoverPluginProps {
  suggestions: EditorSuggestion[];
  onApplySuggestion: (suggestion: EditorSuggestion) => void;
  onDismissSuggestion: (suggestionId: string) => void;
}

interface HoverState {
  suggestion: EditorSuggestion | null;
  targetElement: HTMLElement | null;
  isVisible: boolean;
}

// Debug logging function
const debugLog = (action: string, details: any = {}) => {
  console.log(`🔍 [HoverPlugin] ${action}:`, {
    timestamp: new Date().toISOString().split('T')[1],
    ...details
  });
};

export const GrammarHoverPlugin: React.FC<GrammarHoverPluginProps> = ({
  suggestions,
  onApplySuggestion,
  onDismissSuggestion,
}) => {
  const [editor] = useLexicalComposerContext();
  const [hoverState, setHoverState] = React.useState<HoverState>({
    suggestion: null,
    targetElement: null,
    isVisible: false,
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);

  const clearTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Find suggestion by element
  const findSuggestionByElement = useCallback((element: HTMLElement): EditorSuggestion | null => {
    const suggestionId = element.getAttribute('data-suggestion-id');
    if (!suggestionId) return null;

    return suggestions.find(s => s.id === suggestionId) || null;
  }, [suggestions]);

  // Show hover card with delay
  const showHoverCard = useCallback((element: HTMLElement, suggestion: EditorSuggestion) => {
    if (isProcessingRef.current) {
      console.log('🔍 [HoverPlugin] Show blocked - already processing:', {
        timestamp: new Date().toISOString().slice(11, 23) + 'Z'
      });
      return;
    }

    console.log('🔍 [HoverPlugin] Show hover card requested:', {
      timestamp: new Date().toISOString().slice(11, 23) + 'Z',
      suggestionId: suggestion.id,
      currentlyVisible: hoverState.isVisible
    });

    clearTimeouts();
    isProcessingRef.current = true;

    // Show with delay to prevent flickering
    timeoutRef.current = setTimeout(() => {
      console.log('🔍 [HoverPlugin] Executing show hover card:', {
        timestamp: new Date().toISOString().slice(11, 23) + 'Z',
        suggestionId: suggestion.id
      });

      setHoverState({
        suggestion,
        targetElement: element,
        isVisible: true,
      });
      isProcessingRef.current = false;
    }, 200);
  }, [hoverState.isVisible, clearTimeouts]);

  // Hide hover card with delay
  const hideHoverCard = useCallback(() => {
    if (isProcessingRef.current) {
      console.log('🔍 [HoverPlugin] Hide blocked - already processing:', {
        timestamp: new Date().toISOString().slice(11, 23) + 'Z'
      });
      return;
    }

    console.log('🔍 [HoverPlugin] Hide hover card requested:', {
      timestamp: new Date().toISOString().slice(11, 23) + 'Z',
      currentlyVisible: hoverState.isVisible
    });

    clearTimeouts();
    isProcessingRef.current = true;

    // Hide with slight delay to allow moving to hover card
    timeoutRef.current = setTimeout(() => {
      console.log('🔍 [HoverPlugin] Executing hide hover card:', {
        timestamp: new Date().toISOString().slice(11, 23) + 'Z'
      });

      setHoverState(prev => ({
        ...prev,
        isVisible: false,
      }));
      isProcessingRef.current = false;
    }, 150);
  }, [hoverState.isVisible, clearTimeouts]);

  // Immediately hide hover card
  const hideHoverCardImmediately = useCallback(() => {
    console.log('🔍 [HoverPlugin] Hide immediately requested:', {
      timestamp: new Date().toISOString().slice(11, 23) + 'Z'
    });

    clearTimeouts();
    isProcessingRef.current = false;

    setHoverState({
      suggestion: null,
      targetElement: null,
      isVisible: false,
    });
  }, [clearTimeouts]);

  // Handle mouse events on grammar highlights
  useEffect(() => {
    const editorElement = editor.getRootElement();
    if (!editorElement) return;

    const handleMouseEnter = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Debug logging can be removed in production
      // console.log('🔍 [HoverPlugin] Mouse enter:', target.tagName);

      // Skip if we're already showing a hover card to prevent conflicts
              if (hoverState.isVisible) {
          return;
        }

      // Check if the target or any parent is a grammar highlight
      let currentElement: HTMLElement | null = target;
      while (currentElement && currentElement !== editorElement) {
        if (currentElement.tagName === 'MARK' && currentElement.hasAttribute('data-suggestion-id')) {
          const suggestion = findSuggestionByElement(currentElement);
          if (suggestion) {
            console.log('🔍 [HoverPlugin] Found grammar highlight:', {
              timestamp: new Date().toISOString().slice(11, 23) + 'Z',
              suggestionId: suggestion.id,
              element: currentElement.tagName
            });
            showHoverCard(currentElement, suggestion);
            return;
          }
        }
        currentElement = currentElement.parentElement;
      }
    };

    const handleMouseLeave = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const relatedTarget = event.relatedTarget as HTMLElement;

      console.log('🔍 [HoverPlugin] Mouse leave:', {
        timestamp: new Date().toISOString().slice(11, 23) + 'Z',
        target: target.tagName,
        relatedTarget: relatedTarget?.tagName || 'null',
        targetClasses: Array.from(target.classList),
        relatedClasses: relatedTarget ? Array.from(relatedTarget.classList) : []
      });

      // Check if we're leaving a grammar highlight
      let currentElement: HTMLElement | null = target;
      while (currentElement && currentElement !== editorElement) {
        if (currentElement.tagName === 'MARK' && currentElement.hasAttribute('data-suggestion-id')) {
          // Check if we're moving to the hover card or staying within the highlight
          if (relatedTarget && (
            relatedTarget.closest('[data-hover-card="true"]') || // Moving to hover card
            relatedTarget.closest('[data-suggestion-id]') || // Moving to another highlight
            currentElement.contains(relatedTarget) // Staying within highlight
          )) {
            console.log('🔍 [HoverPlugin] Mouse leave ignored - moving to valid target');
            return; // Don't hide
          }
          console.log('🔍 [HoverPlugin] Mouse leave triggering hide');
          hideHoverCard();
          return;
        }
        currentElement = currentElement.parentElement;
      }
    };

            // Add event listeners

    editorElement.addEventListener('mouseenter', handleMouseEnter, true);
    editorElement.addEventListener('mouseleave', handleMouseLeave, true);

    return () => {
              // Remove event listeners

      clearTimeouts();
      editorElement.removeEventListener('mouseenter', handleMouseEnter, true);
      editorElement.removeEventListener('mouseleave', handleMouseLeave, true);
    };
  }, [editor, findSuggestionByElement, showHoverCard, hideHoverCard, hoverState.isVisible, clearTimeouts]);

  // Handle accepting a suggestion
  const handleAccept = useCallback(() => {
    if (hoverState.suggestion) {
      console.log('🔍 [HoverPlugin] Accepting suggestion:', { suggestionId: hoverState.suggestion.id });
      onApplySuggestion(hoverState.suggestion);
      hideHoverCardImmediately();
    }
  }, [hoverState.suggestion, onApplySuggestion, hideHoverCardImmediately]);

  // Handle dismissing a suggestion
  const handleDismiss = useCallback(() => {
    if (hoverState.suggestion) {
      console.log('🔍 [HoverPlugin] Dismissing suggestion:', { suggestionId: hoverState.suggestion.id });
      onDismissSuggestion(hoverState.suggestion.id);
      hideHoverCardImmediately();
    }
  }, [hoverState.suggestion, onDismissSuggestion, hideHoverCardImmediately]);

  // Handle keyboard events
  useEffect(() => {
    if (!hoverState.isVisible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      console.log('🔍 [HoverPlugin] Key pressed:', { key: event.key });
      switch (event.key) {
        case 'Enter':
          event.preventDefault();
          handleAccept();
          break;
        case 'Escape':
          event.preventDefault();
          hideHoverCardImmediately();
          break;
        case 'Tab':
          // Allow tab navigation within hover card
          if (!event.target || !(event.target as Element).closest('[data-hover-card="true"]')) {
            hideHoverCardImmediately();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hoverState.isVisible, handleAccept, hideHoverCardImmediately]);

  // Handle visibility changes
  useEffect(() => {
    console.log('🔍 [HoverPlugin] State changed:', {
      timestamp: new Date().toISOString().slice(11, 23) + 'Z',
      isVisible: hoverState.isVisible,
      suggestionId: hoverState.suggestion?.id,
      targetElement: hoverState.targetElement?.tagName
    });
  }, [hoverState.isVisible, hoverState.suggestion?.id, hoverState.targetElement?.tagName]);

  // Render hover card
  return (
    <>
      {hoverState.suggestion && hoverState.targetElement && (
        <SuggestionHoverCard
          suggestion={hoverState.suggestion}
          targetElement={hoverState.targetElement}
          isVisible={hoverState.isVisible}
          onAccept={handleAccept}
          onDismiss={handleDismiss}
          onClose={hideHoverCardImmediately}
        />
      )}
    </>
  );
};

import React, { useEffect, useRef, useCallback } from 'react';
import type { EditorSuggestion } from '../../types/grammar';

interface SuggestionHoverCardProps {
  suggestion: EditorSuggestion;
  targetElement: HTMLElement;
  isVisible: boolean;
  onAccept: () => void;
  onDismiss: () => void;
  onClose: () => void;
}

export const SuggestionHoverCard: React.FC<SuggestionHoverCardProps> = ({
  suggestion,
  targetElement,
  isVisible,
  onAccept,
  onDismiss,
  onClose,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef({ top: 0, left: 0, placement: 'bottom' as 'top' | 'bottom' });

  // Calculate position based on target element
  const calculatePosition = useCallback(() => {
    if (!targetElement) return { top: 0, left: 0, placement: 'bottom' as 'top' | 'bottom' };

    const rect = targetElement.getBoundingClientRect();
    const cardHeight = 240; // Increased for better spacing
    const cardWidth = 320;
    const margin = 12; // Increased margin for better separation

    let top = rect.bottom + margin;
    let left = rect.left;
    let placement: 'top' | 'bottom' = 'bottom';

    // Check if card would go off-screen vertically
    if (top + cardHeight > window.innerHeight - 20) {
      // Position above the text instead
      top = rect.top - cardHeight - margin;
      placement = 'top';

      // If still off-screen, position at top of viewport
      if (top < 20) {
        top = 20;
        placement = 'bottom';
      }
    }

    // Center horizontally relative to the target
    left = rect.left + (rect.width - cardWidth) / 2;

    // Adjust if card would go off-screen horizontally
    if (left + cardWidth > window.innerWidth - 20) {
      left = window.innerWidth - cardWidth - 20;
    }

    if (left < 20) {
      left = 20;
    }

    return { top, left, placement };
  }, [targetElement]);

  // Update position when visible or target changes
  useEffect(() => {
    if (isVisible && targetElement) {
      positionRef.current = calculatePosition();
    }
  }, [isVisible, targetElement, calculatePosition]);

  // Handle visibility changes
  useEffect(() => {
    console.log('🔍 [HoverCard] Visibility changed:', {
      timestamp: new Date().toISOString().slice(11, 23) + 'Z',
      isVisible,
      suggestionId: suggestion.id
    });
  }, [isVisible, suggestion.id]);

  // Handle keyboard events
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isVisible, onClose]);

  // Handle mouse events to prevent disappearing when moving to buttons
  useEffect(() => {
    if (!isVisible || !cardRef.current) return;

    const cardElement = cardRef.current;

    const handleMouseEnter = (event: MouseEvent) => {
      console.log('🔍 [HoverCard] Mouse enter card:', {
        timestamp: new Date().toISOString().slice(11, 23) + 'Z',
        target: (event.target as Element).tagName
      });
      // Stop event propagation to prevent triggering parent handlers
      event.stopPropagation();
    };

    const handleMouseLeave = (event: MouseEvent) => {
      const relatedTarget = event.relatedTarget as Element | null;

      console.log('🔍 [HoverCard] Mouse leave card:', {
        timestamp: new Date().toISOString().slice(11, 23) + 'Z',
        relatedTarget: relatedTarget?.tagName || 'null',
        isWithinCard: relatedTarget ? cardElement.contains(relatedTarget) : false,
        isHighlight: relatedTarget ? !!relatedTarget.closest('[data-suggestion-id]') : false
      });

      // Don't close if:
      // 1. Moving to another element within the card (buttons, etc.)
      // 2. Moving back to the original highlight
      if (relatedTarget && (
        cardElement.contains(relatedTarget) ||
        relatedTarget.closest('[data-suggestion-id]')
      )) {
        console.log('🔍 [HoverCard] Not closing - staying within card or moving to highlight');
        return;
      }

      console.log('🔍 [HoverCard] Closing - left card area');
      onClose();
    };

    cardElement.addEventListener('mouseenter', handleMouseEnter, true);
    cardElement.addEventListener('mouseleave', handleMouseLeave, true);

    return () => {
      cardElement.removeEventListener('mouseenter', handleMouseEnter, true);
      cardElement.removeEventListener('mouseleave', handleMouseLeave, true);
    };
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const { top, left, placement } = positionRef.current;

  return (
    <>
      {/* Backdrop - only for mobile/touch devices */}
      <div
        className="fixed inset-0 z-40 md:hidden"
        onClick={onClose}
      />

      {/* Hover Card */}
      <div
        ref={cardRef}
        data-hover-card="true"
        className="fixed z-50 w-80 bg-white border border-gray-200 rounded-lg shadow-xl"
        style={{
          top: `${top}px`,
          left: `${left}px`,
        }}
        onMouseEnter={(e) => e.stopPropagation()}
        onMouseLeave={(e) => e.stopPropagation()}
      >
        {/* Arrow pointer */}
        <div
          className={`absolute w-3 h-3 bg-white border transform rotate-45 ${
            placement === 'bottom'
              ? '-top-1.5 border-l border-t border-gray-200'
              : '-bottom-1.5 border-r border-b border-gray-200'
          }`}
          style={{
            left: Math.max(16, Math.min(targetElement.getBoundingClientRect().left - left + targetElement.getBoundingClientRect().width / 2 - 6, 304))
          }}
        />

        {/* Content */}
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                suggestion.category === 'correctness' ? 'bg-red-500' :
                suggestion.category === 'clarity' ? 'bg-blue-500' :
                suggestion.category === 'engagement' ? 'bg-purple-500' :
                'bg-green-500'
              }`} />
              <span className="text-sm font-medium text-gray-600 capitalize">
                {suggestion.category}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1 hover:bg-gray-100 rounded"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Original text */}
          <div className="mb-3">
            <div className="text-xs font-medium text-gray-500 mb-1">Original:</div>
            <div className="text-sm text-gray-700 bg-gray-50 rounded px-2 py-1.5 border">
              {suggestion.original}
            </div>
          </div>

          {/* Suggestion */}
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-500 mb-1">Suggestion:</div>
            <div className="text-sm text-gray-900 bg-green-50 rounded px-2 py-1.5 border border-green-200">
              {suggestion.proposed}
            </div>
          </div>

          {/* Explanation */}
          {suggestion.explanation && (
            <div className="mb-4">
              <div className="text-xs font-medium text-gray-500 mb-1">Why:</div>
              <div className="text-xs text-gray-600 leading-relaxed">
                {suggestion.explanation}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={onAccept}
              className="flex-1 bg-blue-600 text-white text-sm font-medium py-2.5 px-3 rounded hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Accept
            </button>
            <button
              onClick={onDismiss}
              className="flex-1 bg-gray-100 text-gray-700 text-sm font-medium py-2.5 px-3 rounded hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  useFloating,
  useHover,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  offset,
  flip,
  shift,
  safePolygon,
  autoUpdate,
} from '@floating-ui/react';
import { EditorSuggestion } from '../../types/grammar';

interface SuggestionHoverCardProps {
  /** The editor container element to attach event delegation to */
  editorElement: HTMLElement | null;
  /** Callback to get suggestion data by ID */
  getSuggestion: (id: string) => EditorSuggestion | undefined;
  /** Callback when user clicks to apply a suggestion */
  onApplySuggestion?: (suggestion: EditorSuggestion) => void;
  /** Callback when user dismisses a suggestion */
  onDismissSuggestion?: (suggestionId: string) => void;
  /** Callback when user wants to regenerate a passive voice suggestion */
  onRegenerateSuggestion?: (suggestionId: string) => void;
  /** Callback when user wants to add a word to personal dictionary */
  onAddToDictionary?: (word: string) => void;
  /** Whether regeneration is currently in progress */
  isRegenerating?: boolean;
}

export const SuggestionHoverCard: React.FC<SuggestionHoverCardProps> = ({
  editorElement,
  getSuggestion,
  onApplySuggestion,
  onDismissSuggestion,
  onRegenerateSuggestion,
  onAddToDictionary,
  isRegenerating = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSuggestion, setCurrentSuggestion] = useState<EditorSuggestion | null>(null);

  const { refs, floatingStyles, context, update } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {

      setIsOpen(open);
      // When the card is closed by any interaction, clear the suggestion data
      if (!open) {
        setCurrentSuggestion(null);
      }
    },
    // Set the preferred placement to 'bottom'
    placement: 'bottom',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      // Flip to the top if there isn't enough space below
      flip({
        padding: 8,
        fallbackPlacements: ['top'],
      }),
      shift({ padding: 8 }),
    ],
  });

  // useHover hook handles the logic for opening and closing the card
  const hover = useHover(context, {
    // safePolygon is the key to preventing premature closing.
    // It creates a virtual polygon connecting the reference and floating elements.
    handleClose: safePolygon({
      requireIntent: false, // User must move towards the card
    }),
    delay: {
      open: 100,
      close: 200,
    },
  });

  // useDismiss handles closing the card on escape key or outside press
  const dismiss = useDismiss(context);

  // useRole adds the appropriate ARIA role
  const role = useRole(context, { role: 'tooltip' });

  // Merge all interactions into props to be passed to the elements
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    dismiss,
    role,
  ]);

  // Attach event delegation listeners to the editor element
  useEffect(() => {
    if (!editorElement) return;

    // Get the event handlers from the useInteractions hook
    const referenceProps = getReferenceProps();
    const onMouseEnter = referenceProps.onMouseEnter as ((event: MouseEvent) => void) | undefined;
    const onMouseLeave = referenceProps.onMouseLeave as ((event: MouseEvent) => void) | undefined;

    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const suggestionId = target.dataset.suggestionId;



      if (suggestionId && target.hasAttribute('data-suggestion-type')) {
        const suggestion = getSuggestion(suggestionId);
        if (suggestion) {
          // Set the dynamic reference element for positioning
          refs.setReference(target);
          // Set the content for the card
          setCurrentSuggestion(suggestion);
          // Manually trigger the onMouseEnter handler from the useHover hook
          onMouseEnter?.(event);
        }
      }
    };

    const handleMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement;



      // Only trigger leave if we are leaving a suggestion element
      if (target.dataset.suggestionId) {
        // Manually trigger the onMouseLeave handler from the useHover hook
        onMouseLeave?.(event);
      }
    };

    // Scroll listener to keep the card positioned correctly
    const handleScroll = () => {
      if (isOpen) {

        update();
      }
    };

    const scrollContainer = editorElement.closest('[data-scroll-container]') ||
                           editorElement.parentElement ||
                           window;

    // Attach all listeners
    editorElement.addEventListener('mouseover', handleMouseOver);
    editorElement.addEventListener('mouseout', handleMouseOut);
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });



    return () => {
      // Cleanup listeners
      editorElement.removeEventListener('mouseover', handleMouseOver);
      editorElement.removeEventListener('mouseout', handleMouseOut);
      scrollContainer.removeEventListener('scroll', handleScroll);

    };
  }, [editorElement, getSuggestion, getReferenceProps, refs, update, isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen || !currentSuggestion) return;

      console.log('⌨️ HOVER DEBUG: Keyboard event', { key: event.key, suggestionId: currentSuggestion.id });

      switch (event.key) {
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (onApplySuggestion) {
            console.log('⌨️ HOVER DEBUG: Applying suggestion via keyboard');
            onApplySuggestion(currentSuggestion);
            setIsOpen(false);
          }
          break;
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          if (onDismissSuggestion) {
            console.log('⌨️ HOVER DEBUG: Dismissing suggestion via keyboard');
            onDismissSuggestion(currentSuggestion.id);
            setIsOpen(false);
          }
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, currentSuggestion, onApplySuggestion, onDismissSuggestion]);

  const getSuggestionTypeIcon = (type: EditorSuggestion['type']) => {
    switch (type) {
      case 'spelling':
        return '📝';
      case 'grammar':
        return '✏️';
      case 'punctuation':
        return '❓';
      case 'style':
        return '🎨';
      case 'passive':
        return '🔄';
      default:
        return '💡';
    }
  };

  const getSuggestionTypeColor = (type: EditorSuggestion['type']) => {
    switch (type) {
      case 'spelling':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'grammar':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'punctuation':
        return 'text-orange-700 bg-orange-50 border-orange-200';
      case 'style':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'passive':
        return 'text-purple-700 bg-purple-50 border-purple-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  if (!isOpen || !currentSuggestion) {
    return null;
  }



  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        {...getFloatingProps()}
        className={`
          z-50 w-80 max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow-lg
          ${getSuggestionTypeColor(currentSuggestion.type)}
        `}
        role="tooltip"
        aria-describedby="grammar-suggestion-content"
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start gap-2">
            <span className="text-lg" role="img" aria-label={currentSuggestion.type}>
              {getSuggestionTypeIcon(currentSuggestion.type)}
            </span>
            <div className="flex-1">
              <h3 className="font-semibold text-sm capitalize">
                {currentSuggestion.type} Suggestion
              </h3>
              {currentSuggestion.confidence && (
                <div className="text-xs text-gray-600 mt-1">
                  Confidence: {Math.round(currentSuggestion.confidence * 100)}%
                </div>
              )}
            </div>
          </div>

          {/* Message */}
          <div id="grammar-suggestion-content" className="text-sm">
            <p className="text-gray-800 mb-2">{currentSuggestion.explanation}</p>

            {/* Original text */}
            {currentSuggestion.original && (
              <div className="mb-2">
                <span className="text-xs font-medium text-gray-600">Original:</span>
                <div className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm mt-1">
                  "{currentSuggestion.original}"
                </div>
              </div>
            )}

            {/* Suggested replacement */}
            {currentSuggestion.proposed && (
              <div className="mb-3">
                <span className="text-xs font-medium text-gray-600">Suggested:</span>
                <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm mt-1">
                  "{currentSuggestion.proposed}"
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-gray-200">
            {currentSuggestion.proposed && onApplySuggestion && (
              <button
                onClick={() => {

                  onApplySuggestion(currentSuggestion);
                  setIsOpen(false);
                }}
                className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                disabled={isRegenerating}
              >
                Apply
              </button>
            )}

            {/* Add to Dictionary button for spelling suggestions */}
            {currentSuggestion.type === 'spelling' && onAddToDictionary && (
              <button
                onClick={() => {
                  console.log('📚 HOVER DEBUG: Add to Dictionary button clicked');
                  onAddToDictionary(currentSuggestion.original);
                  setIsOpen(false);
                }}
                className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
                title="Add word to personal dictionary"
              >
                <div className="flex items-center gap-1">
                  <span>📚</span>
                  <span>Add to Dictionary</span>
                </div>
              </button>
            )}

            {/* Regenerate button for passive voice suggestions */}
            {(currentSuggestion.type === 'style' || currentSuggestion.type === 'passive') &&
             currentSuggestion.canRegenerate &&
             onRegenerateSuggestion && (
              <button
                onClick={() => {

                  onRegenerateSuggestion(currentSuggestion.id);
                  // Keep the card open to show new suggestions
                }}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isRegenerating}
              >
                {isRegenerating ? (
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Regenerating...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span>🔄</span>
                    <span>Regenerate</span>
                  </div>
                )}
              </button>
            )}

            {onDismissSuggestion && (
              <button
                onClick={() => {
                  console.log('🖱️ HOVER DEBUG: Dismiss button clicked');
                  onDismissSuggestion(currentSuggestion.id);
                  setIsOpen(false);
                }}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1"
                disabled={isRegenerating}
              >
                Dismiss
              </button>
            )}
          </div>

          {/* Keyboard shortcuts hint */}
          <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
            <div className="space-y-1">
              <div>Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Enter</kbd> to apply</div>
              <div>Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Delete</kbd> to dismiss</div>
              <div>Press <kbd className="px-1 py-0.5 bg-gray-200 rounded text-xs">Esc</kbd> to close</div>
            </div>
          </div>
        </div>
      </div>
    </FloatingPortal>
  );
};

export default SuggestionHoverCard;

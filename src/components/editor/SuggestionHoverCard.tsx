import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  useFloating,
  useHover,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingArrow,
  offset,
  flip,
  shift,
  arrow,
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
}

// Hover card state machine
type HoverState = 'idle' | 'opening' | 'open' | 'closing';

export const SuggestionHoverCard: React.FC<SuggestionHoverCardProps> = ({
  editorElement,
  getSuggestion,
  onApplySuggestion,
  onDismissSuggestion,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSuggestion, setCurrentSuggestion] = useState<EditorSuggestion | null>(null);
  const [hoverState, setHoverState] = useState<HoverState>('idle');
  const arrowRef = useRef<SVGSVGElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const { refs, floatingStyles, context, update } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [
      offset(8),
      flip({
        fallbackAxisSideDirection: 'start',
      }),
      shift({ padding: 8 }),
      arrow({ element: arrowRef }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, {
    handleClose: safePolygon({
      buffer: 4,
    }),
    delay: {
      open: 300,
      close: 100,
    },
  });

  const dismiss = useDismiss(context, {
    escapeKey: true,
    outsidePress: true,
  });

  const role = useRole(context, {
    role: 'tooltip',
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    dismiss,
    role,
  ]);

    // Event delegation handler for grammar marks - optimized for performance
  const handleEditorMouseOver = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const suggestionId = target.dataset.suggestionId;

    if (suggestionId && target.hasAttribute('data-suggestion-type')) {
      const suggestion = getSuggestion(suggestionId);
      if (suggestion && suggestion.id !== currentSuggestion?.id) {
        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        setHoverState('opening');
        setCurrentSuggestion(suggestion);
        refs.setReference(target);

        // Delay opening to prevent flicker
        timeoutRef.current = setTimeout(() => {
          setIsOpen(true);
          setHoverState('open');
        }, 300);
      }
    }
  }, [getSuggestion, currentSuggestion?.id, refs]);

  const handleEditorMouseLeave = useCallback((event: MouseEvent) => {
    const relatedTarget = event.relatedTarget as HTMLElement;

    // Only close if we're actually leaving the editor area (not moving to hover card)
    if (!editorElement?.contains(relatedTarget)) {
      setHoverState('closing');

      // Clear opening timeout if it exists
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Delay closing to allow moving to hover card
      timeoutRef.current = setTimeout(() => {
        setIsOpen(false);
        setHoverState('idle');
        setCurrentSuggestion(null);
      }, 100);
    }
  }, [editorElement]);

      // Attach event delegation to editor element with scroll handling
  useEffect(() => {
    if (!editorElement) return;

    // Add event listeners
    editorElement.addEventListener('mouseover', handleEditorMouseOver);
    editorElement.addEventListener('mouseleave', handleEditorMouseLeave);

    // Handle scroll to reposition hover card
    const handleScroll = () => {
      if (isOpen && update) {
        update();
      }
    };

    // Find scroll container (editor's parent or window)
    const scrollContainer = editorElement.closest('[data-scroll-container]') ||
                           editorElement.parentElement ||
                           window;

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      editorElement.removeEventListener('mouseover', handleEditorMouseOver);
      editorElement.removeEventListener('mouseleave', handleEditorMouseLeave);
      scrollContainer.removeEventListener('scroll', handleScroll);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [editorElement, handleEditorMouseOver, handleEditorMouseLeave, isOpen, update]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen || !currentSuggestion) return;

      switch (event.key) {
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (onApplySuggestion) {
            onApplySuggestion(currentSuggestion);
            setIsOpen(false);
            setCurrentSuggestion(null);
          }
          break;
        case 'Delete':
        case 'Backspace':
          event.preventDefault();
          if (onDismissSuggestion) {
            onDismissSuggestion(currentSuggestion.id);
            setIsOpen(false);
            setCurrentSuggestion(null);
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
          animate-in fade-in-0 zoom-in-95 duration-200
        `}
        role="tooltip"
        aria-describedby="grammar-suggestion-content"
      >
        <FloatingArrow
          ref={arrowRef}
          context={context}
          className="fill-white stroke-gray-200"
        />

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
                  setCurrentSuggestion(null);
                }}
                className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >
                Apply
              </button>
            )}
            {onDismissSuggestion && (
              <button
                onClick={() => {
                  onDismissSuggestion(currentSuggestion.id);
                  setIsOpen(false);
                  setCurrentSuggestion(null);
                }}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1"
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

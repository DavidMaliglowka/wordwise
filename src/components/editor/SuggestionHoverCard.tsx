import React from 'react';
import { EditorSuggestion } from '../../types/grammar';

interface SuggestionHoverCardProps {
  suggestion: EditorSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  target: HTMLElement;
}

export const SuggestionHoverCard: React.FC<SuggestionHoverCardProps> = ({
  suggestion,
  onAccept,
  onDismiss,
  target,
}) => {
  // Placeholder for the full implementation
  // We will add positioning and styling later
  const style: React.CSSProperties = {
    position: 'absolute',
    top: target.offsetTop + target.offsetHeight,
    left: target.offsetLeft,
    backgroundColor: 'white',
    border: '1px solid #ccc',
    padding: '10px',
    zIndex: 1000,
  };

  return (
    <div style={style}>
      <p>{suggestion.explanation}</p>
      <p>
        Replace <strong>{suggestion.original}</strong> with <strong>{suggestion.proposed}</strong>
      </p>
      <button onClick={onAccept}>Accept</button>
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  );
};

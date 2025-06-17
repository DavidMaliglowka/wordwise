import { createCommand, LexicalCommand } from 'lexical';
import { EditorSuggestion } from '../../types/grammar';

export interface ShowSuggestionPayload {
  suggestionId: string;
  target: HTMLElement;
}

export const SHOW_SUGGESTION_CARD_COMMAND: LexicalCommand<ShowSuggestionPayload> = createCommand('SHOW_SUGGESTION_CARD_COMMAND');
export const HIDE_SUGGESTION_CARD_COMMAND: LexicalCommand<void> = createCommand('HIDE_SUGGESTION_CARD_COMMAND');

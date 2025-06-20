import React from 'react';
import {
  $createMarkNode,
  $isMarkNode,
  MarkNode,
  SerializedMarkNode,
} from '@lexical/mark';
import {
  $applyNodeReplacement,
  EditorConfig,
  LexicalNode,
  NodeKey,
  Spread,
} from 'lexical';
import { GrammarCategory, EditorSuggestion } from '../../types/grammar';

export type SerializedGrammarMarkNode = Spread<
  {
    grammarType: GrammarCategory;
    suggestionId: string;
    suggestion: EditorSuggestion;
  },
  SerializedMarkNode
>;

export class GrammarMarkNode extends MarkNode {
  __grammarType: GrammarCategory;
  __suggestionId: string;
  __suggestion: EditorSuggestion;

  static getType(): string {
    return 'grammar-mark';
  }

  constructor(
    ids: Array<string>,
    grammarType: GrammarCategory,
    suggestionId: string,
    suggestion: EditorSuggestion,
    key?: NodeKey,
  ) {
    super(ids, key);
    this.__grammarType = grammarType;
    this.__suggestionId = suggestionId;
    this.__suggestion = suggestion;
  }

  static clone(node: GrammarMarkNode): GrammarMarkNode {
    return new GrammarMarkNode(
      Array.from(node.__ids),
      node.__grammarType,
      node.__suggestionId,
      node.__suggestion,
      node.__key,
    );
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('mark');
    element.classList.add('grammar-highlight');

    // Apply Tailwind classes based on grammar category
    const categoryStyles = this.getCategoryStyles(this.__grammarType);
    element.className = `grammar-highlight ${categoryStyles}`;

    // Add data attributes for hover functionality
    element.setAttribute('data-suggestion-id', this.__suggestionId);
    element.setAttribute('data-grammar-type', this.__grammarType);
    element.setAttribute('data-original', this.__suggestion.original);
    element.setAttribute('data-proposed', this.__suggestion.proposed);
    element.setAttribute('data-explanation', this.__suggestion.explanation);

    // Add cursor pointer for interactivity
    element.style.cursor = 'pointer';

    return element;
  }

  updateDOM(): false {
    // Grammar marks are immutable, so we never update them
    return false;
  }

  private getCategoryStyles(category: GrammarCategory): string {
    switch (category) {
      case 'correctness':
        return 'bg-red-100 text-red-800 decoration-red-500 underline decoration-wavy decoration-1 hover:bg-red-200 transition-colors duration-200';
      case 'clarity':
        return 'bg-blue-100 text-blue-800 decoration-blue-500 underline decoration-wavy decoration-1 hover:bg-blue-200 transition-colors duration-200';
      case 'engagement':
        return 'bg-purple-100 text-purple-800 decoration-purple-500 underline decoration-wavy decoration-1 hover:bg-purple-200 transition-colors duration-200';
      case 'delivery':
        return 'bg-green-100 text-green-800 decoration-green-500 underline decoration-wavy decoration-1 hover:bg-green-200 transition-colors duration-200';
      default:
        return 'bg-yellow-100 text-yellow-800 decoration-yellow-500 underline decoration-wavy decoration-1 hover:bg-yellow-200 transition-colors duration-200';
    }
  }

  static importJSON(serializedNode: SerializedGrammarMarkNode): GrammarMarkNode {
    const { ids, grammarType, suggestionId, suggestion } = serializedNode;
    const node = $createGrammarMarkNode(ids, grammarType, suggestionId, suggestion);
    return node;
  }

  exportJSON(): SerializedGrammarMarkNode {
    return {
      ...super.exportJSON(),
      grammarType: this.__grammarType,
      suggestionId: this.__suggestionId,
      suggestion: this.__suggestion,
      type: 'grammar-mark',
    };
  }

  getGrammarType(): GrammarCategory {
    return this.__grammarType;
  }

  getSuggestionId(): string {
    return this.__suggestionId;
  }

  getSuggestion(): EditorSuggestion {
    return this.__suggestion;
  }
}

export function $createGrammarMarkNode(
  ids: Array<string>,
  grammarType: GrammarCategory,
  suggestionId: string,
  suggestion: EditorSuggestion,
): GrammarMarkNode {
  return $applyNodeReplacement(new GrammarMarkNode(ids, grammarType, suggestionId, suggestion));
}

export function $isGrammarMarkNode(
  node: LexicalNode | null | undefined,
): node is GrammarMarkNode {
  return node instanceof GrammarMarkNode;
}

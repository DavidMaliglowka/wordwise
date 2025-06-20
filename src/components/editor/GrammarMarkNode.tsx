import React from 'react';
import {
  $createMarkNode,
  $isMarkNode,
  MarkNode,
  SerializedMarkNode,
} from '@lexical/mark';
import {
  $applyNodeReplacement,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import { GrammarSuggestionType } from '../../types/grammar';

export interface SerializedGrammarMarkNode extends SerializedMarkNode {
  suggestionType: GrammarSuggestionType;
  suggestionId: string;
}

export class GrammarMarkNode extends MarkNode {
  __suggestionType: GrammarSuggestionType;
  __suggestionId: string;

  static getType(): string {
    return 'grammar-mark';
  }

  static clone(node: GrammarMarkNode): GrammarMarkNode {
    return new GrammarMarkNode([...node.__ids], node.__suggestionType, node.__suggestionId, node.__key);
  }

  constructor(ids: string[], suggestionType: GrammarSuggestionType, suggestionId: string, key?: NodeKey) {
    super([...ids], key); // Convert readonly to mutable array
    this.__suggestionType = suggestionType;
    this.__suggestionId = suggestionId;
  }

  getSuggestionType(): GrammarSuggestionType {
    return this.__suggestionType;
  }

  getSuggestionId(): string {
    return this.__suggestionId;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('span');

    // Add base grammar mark classes
    element.className = this.getMarkClasses();

    // Add data attributes for interaction
    element.dataset.suggestionId = this.__suggestionId;
    element.dataset.suggestionType = this.__suggestionType;
    element.setAttribute('role', 'mark');
    element.setAttribute('aria-describedby', `grammar-suggestion-${this.__suggestionId}`);

    return element;
  }

  updateDOM(): boolean {
    // Return false to indicate that the DOM should not be updated
    return false;
  }

  private getMarkClasses(): string {
    const baseClasses = 'grammar-mark cursor-pointer';

    // Type-specific styling based on research findings
    switch (this.__suggestionType) {
      case 'spelling':
        return `${baseClasses} bg-red-100 text-red-800 border-b-2 border-red-300 hover:bg-red-200 transition-colors`;
      case 'grammar':
        return `${baseClasses} bg-yellow-100 text-yellow-800 border-b-2 border-yellow-300 hover:bg-yellow-200 transition-colors`;
      case 'punctuation':
        return `${baseClasses} bg-orange-100 text-orange-800 border-b-2 border-orange-300 hover:bg-orange-200 transition-colors`;
      case 'style':
        return `${baseClasses} bg-blue-100 text-blue-800 border-b-2 border-blue-300 hover:bg-blue-200 transition-colors`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800 border-b-2 border-gray-300 hover:bg-gray-200 transition-colors`;
    }
  }

  // Note: MarkNode doesn't support importDOM, so we remove this method

  exportDOM(): DOMExportOutput {
    const element = this.createDOM({} as EditorConfig);
    return { element };
  }

  static importJSON(serializedNode: SerializedGrammarMarkNode): GrammarMarkNode {
    const { ids, suggestionType, suggestionId } = serializedNode;
    const node = $createGrammarMarkNode(ids, suggestionType, suggestionId);
    return node;
  }

  exportJSON(): SerializedGrammarMarkNode {
    return {
      ...super.exportJSON(),
      ids: this.getIDs(),
      suggestionType: this.__suggestionType,
      suggestionId: this.__suggestionId,
      type: 'grammar-mark',
    };
  }
}

function convertGrammarMarkElement(domNode: HTMLElement): DOMConversionOutput {
  const suggestionId = domNode.getAttribute('data-suggestion-id') || '';
  const suggestionType = (domNode.getAttribute('data-suggestion-type') as GrammarSuggestionType) || 'grammar';
  const node = $createGrammarMarkNode(['grammar-mark'], suggestionType, suggestionId);
  return { node };
}

export function $createGrammarMarkNode(
  ids: string[],
  suggestionType: GrammarSuggestionType,
  suggestionId: string
): GrammarMarkNode {
  return $applyNodeReplacement(new GrammarMarkNode(ids, suggestionType, suggestionId));
}

export function $isGrammarMarkNode(node: LexicalNode | null | undefined): node is GrammarMarkNode {
  return node instanceof GrammarMarkNode;
}

// Helper function to remove grammar marks
export function $removeGrammarMark(suggestionId: string): void {
  // TODO: Implement proper node traversal for mark removal
  // This will be enhanced in the next subtask with proper traversal logic
  console.log(`Removing grammar mark with suggestion ID: ${suggestionId}`);
}

// Helper function to apply grammar marks to text ranges
export function $applyGrammarMark(
  startOffset: number,
  endOffset: number,
  suggestionType: GrammarSuggestionType,
  suggestionId: string
): void {
  const root = $getRoot();
  const textContent = root.getTextContent();

  // Validate range
  if (startOffset < 0 || endOffset > textContent.length || startOffset >= endOffset) {
    return;
  }

  // For now, use a simple approach - this will be enhanced with proper position mapping
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    // Create mark node
    const markNode = $createGrammarMarkNode(['grammar-mark'], suggestionType, suggestionId);

    // This is a simplified implementation - proper text range selection will be added
    console.log(`Applied grammar mark for suggestion ${suggestionId} at range ${startOffset}-${endOffset}`);
  }
}

// Import required Lexical functions
import { $getRoot, $getSelection, $isRangeSelection } from 'lexical';

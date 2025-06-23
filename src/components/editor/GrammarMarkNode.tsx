import {
  $applyNodeReplacement,
  LexicalNode,
  NodeKey,
  EditorConfig,
  Spread,
  $isTextNode,
  TextNode,
  BaseSelection,
} from 'lexical';
import {
  MarkNode,
  $isMarkNode,
  $unwrapMarkNode,
  SerializedMarkNode, // Import SerializedMarkNode from @lexical/mark
} from '@lexical/mark';

export type GrammarMarkNodeProps = {
  suggestionType: string;
  suggestionId: string;
};

// Define the shape of the serialized node data
export type SerializedGrammarMarkNode = Spread<
  {
    suggestionType: string;
    suggestionId: string;
  },
  SerializedMarkNode
>;

// We extend the base MarkNode to add our custom properties.
export class GrammarMarkNode extends MarkNode {
  __suggestionType: string;
  __suggestionId: string;

  static getType(): string {
    return 'grammar-mark';
  }

  static clone(node: GrammarMarkNode): GrammarMarkNode {
    return new GrammarMarkNode(node.__suggestionType, node.__suggestionId, [...node.getIDs()], node.getKey());
  }

  // Method to serialize the node to JSON
  exportJSON(): SerializedGrammarMarkNode {
    return {
      ...super.exportJSON(),
      suggestionId: this.getSuggestionId(),
      suggestionType: this.getSuggestionType(),
      type: 'grammar-mark', // Ensure type is included
      version: 1,
    };
  }

  // Method to deserialize the node from JSON
  static importJSON(serializedNode: SerializedGrammarMarkNode): GrammarMarkNode {
    const node = $createGrammarMarkNode(
      serializedNode.suggestionType,
      serializedNode.suggestionId
    );
    // The generic MarkNode handles the 'ids' array itself,
    // so we don't need to manually set it here.
    return node;
  }

  constructor(suggestionType: string, suggestionId: string, ids?: string[], key?: NodeKey) {
    // The first ID in the array is what MarkNode uses internally. We'll use our unique suggestionId.
    super(ids || [suggestionId], key);
    this.__suggestionType = suggestionType;
    this.__suggestionId = suggestionId;
  }

  getSuggestionType(): string {
    return this.__suggestionType;
  }

  getSuggestionId(): string {
    return this.__suggestionId;
  }

  /**
   * This is the key to fixing the "sticky mark" behavior.
   * By returning true, we tell Lexical that this node is a "segment" or "token".
   * When the user types at the end of a segmented node, Lexical will correctly
   * create the new text *outside* of this node, allowing the user to "escape" the mark.
   */
  static isSegmented(): boolean {
    return true;
  }

  /**
   * This is the modern companion to isSegmented(). It ensures that complex
   * operations like copy-pasting from a selection that partially includes this
   * node behave correctly. It tells Lexical how to "extract" a child node
   * when creating a new copy of this parent node.
   */
  extractWithChild(
    child: LexicalNode,
    selection: BaseSelection,
    destination: 'clone' | 'html',
  ): boolean {
    const isText = $isTextNode(child);
    if (!isText) {
      return false;
    }
    // Return true to indicate that the child (the TextNode) can be
    // "pulled out" of this GrammarMarkNode during copy-paste operations.
    return true;
  }

  // This is how Lexical creates the DOM element.
  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    // Add data attributes for the hover card and styling
    element.dataset.suggestionId = this.__suggestionId;
    element.dataset.suggestionType = this.__suggestionType;

    const theme = config.theme.grammarMark;

    // FIX: Split the string of classes and add them one by one.
    if (theme && theme[this.__suggestionType]) {
      const classes = theme[this.__suggestionType].split(' ');
      element.classList.add(...classes);
    }
    if (theme && theme.base) {
      const classes = theme.base.split(' ');
      element.classList.add(...classes);
    }

    return element;
  }

  // This is how Lexical updates the DOM element when the node changes.
  updateDOM(
    prevNode: this,
    dom: HTMLElement,
    config: EditorConfig,
  ): boolean {
    const theme = config.theme.grammarMark;
    let needsUpdate = super.updateDOM(prevNode, dom, config);

    // If suggestion type changes, update the class
    if (prevNode.__suggestionType !== this.__suggestionType) {
      // FIX: Also split classes here for removal and addition.
      if (theme && theme[prevNode.__suggestionType]) {
        const oldClasses = theme[prevNode.__suggestionType].split(' ');
        dom.classList.remove(...oldClasses);
      }
      if (theme && theme[this.__suggestionType]) {
        const newClasses = theme[this.__suggestionType].split(' ');
        dom.classList.add(...newClasses);
      }
      needsUpdate = true;
    }

    return needsUpdate;
  }
}

export function $createGrammarMarkNode(
  suggestionType: string,
  suggestionId: string,
): GrammarMarkNode {
  return $applyNodeReplacement(new GrammarMarkNode(suggestionType, suggestionId));
}

export function $isGrammarMarkNode(node: LexicalNode | null | undefined): node is GrammarMarkNode {
    return node instanceof GrammarMarkNode;
}

// Helper function to remove a specific grammar mark by unwrapping it
export function $removeGrammarMark(suggestionId: string): void {
  // This will be implemented in the GrammarPlugin refactor
  console.log(`Removing grammar mark with suggestion ID: ${suggestionId}`);
}

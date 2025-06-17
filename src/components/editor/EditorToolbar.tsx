import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  $createParagraphNode,
  $isTextNode,
} from 'lexical';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
  $isListNode,
} from '@lexical/list';
import { $setBlocksType } from '@lexical/selection';
import { $createHeadingNode } from '@lexical/rich-text';
import { TOGGLE_LINK_COMMAND, $isLinkNode } from '@lexical/link';
import { $findMatchingParent } from '@lexical/utils';

interface ToolbarProps {
  className?: string;
}

// Link Tooltip Component
interface LinkTooltipProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => void;
  url: string;
}

const LinkTooltip: React.FC<LinkTooltipProps> = ({ isOpen, onClose, onEdit, onRemove, url }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        className="absolute bg-gray-800 text-white text-xs sm:text-sm rounded-lg px-3 py-2 shadow-lg z-50 max-w-xs sm:max-w-sm mx-4"
        style={{
          top: '60px',
          left: '50%',
          transform: 'translateX(-50%)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="truncate mb-2 text-xs sm:text-sm">{url}</div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs sm:text-sm"
          >
            Edit
          </button>
          <button
            onClick={onRemove}
            className="flex-1 px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs sm:text-sm"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
};

// Link Dialog Component
interface LinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
  initialUrl?: string;
}

const LinkDialog: React.FC<LinkDialogProps> = ({ isOpen, onClose, onSubmit, initialUrl = '' }) => {
  const [url, setUrl] = useState(initialUrl);

  // Update URL when initialUrl changes (for editing existing links)
  React.useEffect(() => {
    if (isOpen) {
      setUrl(initialUrl);
    }
  }, [isOpen, initialUrl]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
      onClose();
      setUrl('');
    }
  };

  const handleClose = () => {
    onClose();
    setUrl('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-lg w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-4">Add Link</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
              autoFocus
              required
            />
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 order-2 sm:order-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 order-1 sm:order-2"
            >
              Add Link
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Floating Link Editor Component
interface FloatingLinkEditorProps {
  editor: any;
}

const FloatingLinkEditor: React.FC<FloatingLinkEditorProps> = ({ editor }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [lastSelection, setLastSelection] = useState<any>(null);

  const updateLinkEditor = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const node = selection.anchor.getNode();
      const linkParent = $findMatchingParent(node, $isLinkNode);
      if (linkParent) {
        setLinkUrl(linkParent.getURL());
      } else if (!selection.isCollapsed()) {
        setLinkUrl('');
      }
      setLastSelection(selection);
    }
    const editorElem = editor.getRootElement();
    const nativeSelection = window.getSelection();
    const activeElement = document.activeElement;

    if (editorElem === null || nativeSelection === null) {
      return;
    }

    const rootElement = editor.getRootElement();
    if (
      selection !== null &&
      !nativeSelection.isCollapsed &&
      rootElement !== null &&
      rootElement.contains(nativeSelection.anchorNode)
    ) {
      const domRange = nativeSelection.getRangeAt(0);
      let rect;
      if (nativeSelection.anchorNode === rootElement) {
        let inner = rootElement;
        while (inner.firstElementChild != null) {
          inner = inner.firstElementChild as HTMLElement;
        }
        rect = inner.getBoundingClientRect();
      } else {
        rect = domRange.getBoundingClientRect();
      }

      if (editorRef.current) {
        editorRef.current.style.opacity = '1';
        editorRef.current.style.top = `${rect.top + rect.height + window.pageYOffset + 10}px`;
        editorRef.current.style.left = `${rect.left + window.pageXOffset - editorRef.current.offsetWidth / 2 + rect.width / 2}px`;
      }
    } else {
      if (editorRef.current) {
        editorRef.current.style.opacity = '0';
        editorRef.current.style.top = '-1000px';
        editorRef.current.style.left = '-1000px';
      }
    }
  }, [editor]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }: any) => {
      editorState.read(() => {
        updateLinkEditor();
      });
    });
  }, [editor, updateLinkEditor]);

  useEffect(() => {
    editor.getEditorState().read(() => {
      updateLinkEditor();
    });
  }, [editor, updateLinkEditor]);

  useEffect(() => {
    if (isEditMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditMode]);

  const handleLinkSubmission = () => {
    if (lastSelection !== null) {
      if (linkUrl !== '') {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, linkUrl);
      }
      setIsEditMode(false);
    }
  };

  const handleLinkEdit = () => {
    setIsEditMode(true);
  };

  const handleLinkRemove = () => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    setIsEditMode(false);
  };

  return (
    <div
      ref={editorRef}
      className="absolute bg-white border border-gray-300 rounded-lg shadow-lg p-2 z-50 opacity-0 transition-opacity"
      style={{ top: '-1000px', left: '-1000px' }}
    >
      {isEditMode ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            className="px-2 py-1 border border-gray-300 rounded text-sm w-64"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleLinkSubmission();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setIsEditMode(false);
              }
            }}
            placeholder="Enter URL"
          />
          <button
            className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleLinkSubmission}
          >
            ✓
          </button>
          <button
            className="px-2 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setIsEditMode(false)}
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline text-sm max-w-64 truncate"
          >
            {linkUrl}
          </a>
          <button
            className="px-2 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleLinkEdit}
          >
            Edit
          </button>
          <button
            className="px-2 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleLinkRemove}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
};

const EditorToolbar: React.FC<ToolbarProps> = ({ className = '' }) => {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [blockType, setBlockType] = useState('paragraph');
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isLink, setIsLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [isLinkTooltipOpen, setIsLinkTooltipOpen] = useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      // Update format states
      setIsBold(selection.hasFormat('bold'));
      setIsItalic(selection.hasFormat('italic'));
      setIsUnderline(selection.hasFormat('underline'));
      setIsStrikethrough(selection.hasFormat('strikethrough'));

      // Check for link
      const node = selection.anchor.getNode();
      const linkParent = $findMatchingParent(node, $isLinkNode);
      if (linkParent) {
        setIsLink(true);
        setLinkUrl(linkParent.getURL());
      } else {
        setIsLink(false);
        setLinkUrl('');
      }

      // Update block type
      const anchorNode = selection.anchor.getNode();
      let element =
        anchorNode.getKey() === 'root'
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();
      const elementKey = element.getKey();
      const elementDOM = editor.getElementByKey(elementKey);

      if (elementDOM !== null) {
        if ($isListNode(element)) {
          const parentList = element.getParent();
          const type = parentList && $isListNode(parentList) ? parentList.getListType() : ($isListNode(element) ? element.getListType() : 'bullet');
          setBlockType(type);
        } else {
          const type = element.getType();
          if (type === 'paragraph') {
            setBlockType('paragraph');
          } else if (type === 'heading') {
            const tag = (element as any).getTag();
            setBlockType(tag || 'h1');
          }
        }
      }
    }
  }, [editor]);

  React.useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      (_payload, _newEditor) => {
        updateToolbar();
        return false;
      },
      1
    );
  }, [editor, updateToolbar]);

  const formatText = (format: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  };

  const formatHeading = (headingSize: 'h1' | 'h2') => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createHeadingNode(headingSize));
      }
    });
  };

  const formatParagraph = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
  };

  const insertUnorderedList = () => {
    if (blockType !== 'bullet') {
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
  };

  const insertOrderedList = () => {
    if (blockType !== 'number') {
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
    } else {
      editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
    }
  };

    const clearFormatting = () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const nodes = selection.getNodes();

        // Clear text formatting from all selected nodes
        const formatTypes = ['bold', 'italic', 'underline', 'strikethrough'] as const;

        // Process each node in the selection
        nodes.forEach(node => {
          if ($isTextNode(node)) {
            // Clear all text formats from text nodes
            formatTypes.forEach(format => {
              if (node.hasFormat(format)) {
                node.toggleFormat(format);
              }
            });
          }
        });

        // Clear text formatting from the selection itself
        formatTypes.forEach(format => {
          if (selection.hasFormat(format)) {
            selection.formatText(format);
          }
        });

        // Convert all heading blocks to paragraphs within the selection
        $setBlocksType(selection, () => $createParagraphNode());
      }
    });
  };

  const handleLinkSubmit = (url: string) => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
    setIsLinkTooltipOpen(false);
  };

  const handleLinkButtonClick = () => {
    if (isLink) {
      // If cursor is on a link, show tooltip
      setIsLinkTooltipOpen(true);
    } else {
      // If no link, show dialog to create one
      setIsLinkDialogOpen(true);
    }
  };

  const handleLinkEdit = () => {
    setIsLinkTooltipOpen(false);
    setIsLinkDialogOpen(true);
  };

  const handleLinkRemove = () => {
    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    setIsLinkTooltipOpen(false);
  };

  const ToolbarButton: React.FC<{
    onClick: () => void;
    isActive?: boolean;
    children: React.ReactNode;
    title: string;
  }> = ({ onClick, isActive = false, children, title }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`
        px-2 py-1 rounded border text-sm font-medium
        transition-colors duration-150 min-w-[32px] h-8
        ${isActive
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }
      `}
    >
      {children}
    </button>
  );

  return (
    <>
      <div className={`bg-white shadow-lg ${className}`}>
        {/* Mobile Toolbar */}
        <div className="sm:hidden px-4 py-2 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {/* Essential formatting - always visible */}
            <ToolbarButton
              onClick={() => formatText('bold')}
              isActive={isBold}
              title="Bold"
            >
              <strong>B</strong>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => formatText('italic')}
              isActive={isItalic}
              title="Italic"
            >
              <em>I</em>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => formatHeading('h1')}
              isActive={blockType === 'h1'}
              title="Heading"
            >
              H1
            </ToolbarButton>

            <ToolbarButton
              onClick={insertUnorderedList}
              isActive={blockType === 'bullet'}
              title="List"
            >
              •
            </ToolbarButton>

            <div className="w-px h-6 bg-gray-300 mx-1" />

            <ToolbarButton
              onClick={handleLinkButtonClick}
              isActive={isLink}
              title="Link"
            >
              🔗
            </ToolbarButton>

            <ToolbarButton
              onClick={() => formatText('underline')}
              isActive={isUnderline}
              title="Underline"
            >
              <u>U</u>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => formatText('strikethrough')}
              isActive={isStrikethrough}
              title="Strike"
            >
              <s>S</s>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => formatHeading('h2')}
              isActive={blockType === 'h2'}
              title="Heading 2"
            >
              H2
            </ToolbarButton>

            <ToolbarButton
              onClick={formatParagraph}
              isActive={blockType === 'paragraph'}
              title="Paragraph"
            >
              P
            </ToolbarButton>

            <ToolbarButton
              onClick={insertOrderedList}
              isActive={blockType === 'number'}
              title="Numbered"
            >
              1.
            </ToolbarButton>

            <ToolbarButton
              onClick={clearFormatting}
              title="Clear"
            >
              ✗
            </ToolbarButton>
          </div>
        </div>

        {/* Desktop Toolbar */}
        <div className="hidden sm:block">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-1">
            {/* Text formatting */}
            <ToolbarButton
              onClick={() => formatText('bold')}
              isActive={isBold}
              title="Bold (Ctrl+B)"
            >
              <strong>B</strong>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => formatText('italic')}
              isActive={isItalic}
              title="Italic (Ctrl+I)"
            >
              <em>I</em>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => formatText('underline')}
              isActive={isUnderline}
              title="Underline (Ctrl+U)"
            >
              <u>U</u>
            </ToolbarButton>

            <ToolbarButton
              onClick={() => formatText('strikethrough')}
              isActive={isStrikethrough}
              title="Strikethrough"
            >
              <s>S</s>
            </ToolbarButton>

            {/* Separator */}
            <div className="w-px h-6 bg-gray-300 mx-1" />

            {/* Headings */}
            <ToolbarButton
              onClick={() => formatHeading('h1')}
              isActive={blockType === 'h1'}
              title="Heading 1"
            >
              H1
            </ToolbarButton>

            <ToolbarButton
              onClick={() => formatHeading('h2')}
              isActive={blockType === 'h2'}
              title="Heading 2"
            >
              H2
            </ToolbarButton>

            <ToolbarButton
              onClick={formatParagraph}
              isActive={blockType === 'paragraph'}
              title="Paragraph"
            >
              P
            </ToolbarButton>

            {/* Separator */}
            <div className="w-px h-6 bg-gray-300 mx-1" />

            {/* Lists */}
            <ToolbarButton
              onClick={insertUnorderedList}
              isActive={blockType === 'bullet'}
              title="Bullet List"
            >
              •
            </ToolbarButton>

            <ToolbarButton
              onClick={insertOrderedList}
              isActive={blockType === 'number'}
              title="Numbered List"
            >
              1.
            </ToolbarButton>

            {/* Separator */}
            <div className="w-px h-6 bg-gray-300 mx-1" />

            {/* Link */}
            <ToolbarButton
              onClick={handleLinkButtonClick}
              isActive={isLink}
              title="Insert Link"
            >
              🔗
            </ToolbarButton>

            {/* Clear formatting */}
            <ToolbarButton
              onClick={clearFormatting}
              title="Clear Formatting"
            >
              ✗
            </ToolbarButton>
          </div>
        </div>
      </div>

      <LinkDialog
        isOpen={isLinkDialogOpen}
        onClose={() => setIsLinkDialogOpen(false)}
        onSubmit={handleLinkSubmit}
        initialUrl={linkUrl}
      />
      <FloatingLinkEditor editor={editor} />
      <LinkTooltip
        isOpen={isLinkTooltipOpen}
        onClose={() => setIsLinkTooltipOpen(false)}
        onEdit={handleLinkEdit}
        onRemove={handleLinkRemove}
        url={linkUrl}
      />
    </>
  );
};

export default EditorToolbar;

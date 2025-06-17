import React, { useCallback, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical';
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  REMOVE_LIST_COMMAND,
} from '@lexical/list';
import { TOGGLE_LINK_COMMAND } from '@lexical/link';

interface ToolbarProps {
  className?: string;
}

const EditorToolbar: React.FC<ToolbarProps> = ({ className = '' }) => {
  const [editor] = useLexicalComposerContext();
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      // Update format states
      setIsBold(selection.hasFormat('bold'));
      setIsItalic(selection.hasFormat('italic'));
      setIsUnderline(selection.hasFormat('underline'));
      setIsStrikethrough(selection.hasFormat('strikethrough'));
    }
  }, []);

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

  const insertUnorderedList = () => {
    editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
  };

  const insertOrderedList = () => {
    editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
    }
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
    <div className={`flex items-center gap-1 p-2 bg-gray-50 border-t border-gray-200 ${className}`}>
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

      {/* Lists */}
      <ToolbarButton
        onClick={insertUnorderedList}
        title="Bullet List"
      >
        •
      </ToolbarButton>

      <ToolbarButton
        onClick={insertOrderedList}
        title="Numbered List"
      >
        1.
      </ToolbarButton>

      {/* Separator */}
      <div className="w-px h-6 bg-gray-300 mx-1" />

      {/* Link */}
      <ToolbarButton
        onClick={insertLink}
        title="Insert Link"
      >
        🔗
      </ToolbarButton>
    </div>
  );
};

export default EditorToolbar;

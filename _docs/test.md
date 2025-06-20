# Lexical Grammar Highlighting with Interactive Hover Cards - Implementation Instructions

## Overview

Create a React component that implements grammar highlighting with interactive hover cards using the Lexical editor. This component should highlight grammar errors and display helpful information when users hover over highlighted text.

```
pnpm install lexical @lexical/react @lexical/mark @lexical/text @lexical/utils
```

* **Use `@lexical/mark`package** for text highlighting (proven solution from research)
* **Coordinate with Lexical's reconciliation system** - Use flags to prevent infinite loops
* **Use proper Lexical APIs** - `$createTextNode()`, `$getRoot()`, `$getSelection()`, etc.

* Implement custom marks for different grammar error types (spelling, grammar, style)
* Use different colors/styles for different error categories
* Apply highlighting using `@lexical/mark` package with custom CSS classes via Tailwind
* Ensure highlights persist through Lexical's reconciliation cycles

* Create hover cards that appear when users hover over highlighted text (floating-ui)
* Display relevant information about the grammar issue
* Include suggestions or corrections in the hover card
* Position hover cards appropriately using Tailwind positioning utilities
* Handle edge cases (hover cards going off-screen with floating-ui)

* Use `$createMarkNode()` from `@lexical/mark`
* Apply Tailwind classes for styling: `bg-red-100 text-red-800`
* Create different mark types for different grammar categories
* Implement accessibility features (ARIA labels, keyboard navigation)


Lexical's transaction-based architecture works well for highlighting, but hover interactions create complex DOM event cascades that are difficult to manage cleanly. The most stable approach would likely involve interaction patterns that don't dynamically change DOM layout during mouse hover states.

Keep highlight marks in Lexical (custom MarkNode; created in editor.update()). The hover-card itself lives outside the editor root (a portal) so it never mutates the editable DOM.

Use floating-ui’s safePolygon helper and position the card offset ≥ 8 px so it never overlaps the reference box.useHover(context, { handleClose: safePolygon({ buffer: 4 }) })

Single delegate: attach pointermove/pointerleave to the editor root; on e.target, check dataset.suggestionId. Pass that element to floating-ui’s refs.setReference. No per-span listeners.

Model as a finite-state machine: idle → opening → open → closing. floating-ui’s useHover / useDismiss already emit these transitions; just mirror them in open boolean.

Improvements:
Arrow - arrow({element: arrowRef}) middleware.
Scroll follow - Listen to editor.getRootElement().parentElement scroll; call update() from floating-ui.
Keyboard accessibility - Add useListNavigation if you want arrow-key cycling among suggestions; Esc handled by useDismiss.
Performance guard - requestIdleCallback re-runs buildPositionMap only when the editor is idle.



## Technical Requirements

### 1. Core Dependencies

```
pnpm install lexical @lexical/react @lexical/mark @lexical/text @lexical/utils
```

### 2. Styling Requirements

* **MUST use Tailwind CSS classes only** - No custom CSS files or inline styles
* Use Tailwind utilities for all styling including hover effects, colors, and positioning
* Ensure responsive design using Tailwind's responsive prefixes
### 3. Lexical Implementation Guidelines

#### Critical Implementation Rules:

* **Always work within `editor.update()`transactions** - Never manipulate DOM directly
* **Use `@lexical/mark`package** for text highlighting (proven solution from research)
* **Coordinate with Lexical's reconciliation system** - Use flags to prevent infinite loops
* **Use proper Lexical APIs** - `$createTextNode()`, `$getRoot()`, `$getSelection()`, etc.
#### Core Pattern:

```
editor.update(() => {
  // All DOM modifications must happen here
  // Changes made within this transaction persist
  // Lexical won't remove elements created during its own update cycle
});
```

## Component Requirements

### 1. Grammar Highlighting Features

* Implement custom marks for different grammar error types (spelling, grammar, style)
* Use different colors/styles for different error categories
* Apply highlighting using `@lexical/mark` package with custom CSS classes via Tailwind
* Ensure highlights persist through Lexical's reconciliation cycles
### 2. Interactive Hover Cards

* Create hover cards that appear when users hover over highlighted text
* Display relevant information about the grammar issue
* Include suggestions or corrections in the hover card
* Position hover cards appropriately using Tailwind positioning utilities
* Handle edge cases (hover cards going off-screen)
### 3. Editor Integration

* Initialize Lexical editor with necessary plugins
* Register custom mark nodes for grammar highlighting
* connect to text analysis function that identifies grammar issues
* Apply highlights automatically as users type (with existing debouncing system)
## Implementation Structure

### Required Components:

1. **Main Editor Component** - Lexical editor wrapper with grammar highlighting
2. **Grammar Analyzer** - Connect to existing functions to detect grammar issues in text
3. **Hover Card Component** - Interactive popup for grammar suggestions
4. **Mark Nodes** - Custom Lexical nodes for different highlight types
⠀
## Specific Implementation Details

### 1. Mark Node Creation

* Use `$createMarkNode()` from `@lexical/mark`
* Apply Tailwind classes for styling: `bg-red-100 text-red-800 underline decoration-wavy`
* Create different mark types for different grammar categories
### 2. Hover Card Styling (Tailwind Only)

* Background: `bg-white border border-gray-200 shadow-lg rounded-lg`
* Positioning: `absolute z-50 p-4 max-w-sm`
* Typography: `text-sm text-gray-700`
* Animations: `transition-opacity duration-200`
### 3. Error Prevention

* Use `useRef()` for coordination flags (e.g., `isApplyingHighlights`)
* Implement debouncing for grammar analysis
* Handle edge cases where text nodes are split or merged
## Expected Deliverables

1. **Complete React Component** - Fully functional Lexical editor with grammar highlighting
2. **Working Hover Cards** - Interactive hover functionality with grammar suggestions
3. **Responsive Design** - Mobile-friendly using Tailwind responsive utilities
4. **Error Handling** - Robust implementation that prevents infinite loops and handles edge cases
⠀
## Testing Requirements

* Test highlight persistence through editor operations (typing, deleting, formatting)
* Verify hover cards appear correctly and don't go off-screen
* Ensure performance is acceptable with long documents
* Test on mobile devices for responsive behavior
## Additional Considerations

* Implement accessibility features (ARIA labels, keyboard navigation)
* Consider performance optimizations for large documents
* Handle multiple grammar issues in the same text span
* Provide clear visual feedback for different types of grammar issues
---

**Remember**: The key insight from the research is that Lexical has a reconciliation window - changes made during its `editor.update()` cycle are considered legitimate and persist. Always work within this system, never against it.
// Grammar suggestion types matching the backend API

export interface GrammarRange {
  start: number;
  end: number;
}

export type GrammarSuggestionType = 'grammar' | 'spelling' | 'punctuation' | 'style' | 'passive';

// Grammarly-style categories for UI organization
export type GrammarCategory = 'correctness' | 'clarity' | 'engagement' | 'delivery';

export interface GrammarSuggestion {
  range: GrammarRange;
  type: GrammarSuggestionType;
  category?: GrammarCategory; // Optional for backward compatibility
  original: string;
  proposed: string;
  explanation: string;
  confidence: number; // 0 to 1
  severity?: 'low' | 'medium' | 'high'; // Optional severity indicator
}

export interface GrammarCheckRequest {
  text: string;
  language?: string;
  includeSpelling?: boolean;
  includeGrammar?: boolean;
  includeStyle?: boolean;
  stream?: boolean;
}

export interface GrammarCheckResponse {
  suggestions: GrammarSuggestion[];
  processedText: string;
  cached: boolean;
  processingTimeMs: number;
}

export interface GrammarCheckApiResponse {
  success: boolean;
  data: GrammarCheckResponse;
}

// UI-specific types for editor integration
export interface EditorSuggestion extends GrammarSuggestion {
  id: string; // Unique identifier for tracking
  isVisible: boolean; // Whether highlight is currently shown
  isHovered: boolean; // Whether hover card is active
  isDismissed: boolean; // Whether user dismissed this suggestion
  category: GrammarCategory; // Required for UI - will be auto-assigned if not provided
  // Enhanced functionality for passive voice and spelling
  canRegenerate?: boolean; // Whether this suggestion supports regeneration (passive voice, spelling)
  regenerateId?: string; // Unique ID for regeneration requests
}

// Categorized suggestions for UI display
export interface CategorizedSuggestions {
  correctness: EditorSuggestion[];
  clarity: EditorSuggestion[];
  engagement: EditorSuggestion[];
  delivery: EditorSuggestion[];
}

export interface GrammarCheckOptions {
  delay?: number; // Debounce delay in ms
  minLength?: number; // Minimum text length to trigger check
  includeSpelling?: boolean;
  includeGrammar?: boolean;
  includeStyle?: boolean;
  enableCache?: boolean; // Client-side caching
  enhancePassiveVoice?: boolean; // Enhanced passive voice detection with GPT-4o
  enhanceSpelling?: boolean; // Context-aware spelling correction with GPT-4o
}

// Error types
export interface GrammarCheckError {
  message: string;
  code?: number;
  type: 'network' | 'auth' | 'api' | 'validation';
}

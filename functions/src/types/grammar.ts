// Grammar and Spelling Check Types

export interface TextRange {
  start: number;
  end: number;
}

export interface GrammarSuggestion {
  range: TextRange;
  type: 'grammar' | 'spelling' | 'punctuation' | 'style';
  original: string;
  proposed: string;
  explanation: string;
  confidence: number; // 0-1 scale
}

export interface GrammarCheckRequest {
  text: string;
  language?: string; // default to 'en'
  includeSpelling?: boolean; // default to true
  includeGrammar?: boolean; // default to true
  includeStyle?: boolean; // default to false
}

export interface GrammarCheckResponse {
  suggestions: GrammarSuggestion[];
  processedText: string;
  cached: boolean;
  processingTimeMs: number;
}

export interface CachedResult {
  suggestions: GrammarSuggestion[];
  timestamp: number;
  expiresAt: number;
}

// OpenAI specific types
export interface OpenAIGrammarPrompt {
  text: string;
  systemPrompt: string;
  userPrompt: string;
}

export interface OpenAIStreamChunk {
  choices: Array<{
    delta: {
      content?: string;
    };
    finish_reason?: string;
  }>;
}

export interface FeatureFlags {
  testRoutes: boolean;
  performanceMonitor: boolean;
  updatedAt?: FirebaseFirestore.Timestamp;
  updatedBy?: string;
}

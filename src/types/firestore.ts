import { Timestamp } from 'firebase/firestore';

// User Collection
export interface User {
  uid: string;
  email: string;
  displayName?: string;
  tier: 'free' | 'pro' | 'enterprise';
  settings: UserSettings;
  dictionary: string[]; // Personal dictionary for custom words/acronyms
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserSettings {
  language: string;
  autoSave: boolean;
  showMetrics: boolean;
  defaultContentType: 'email' | 'social' | 'general';
  notifications: {
    email: boolean;
    inApp: boolean;
  };
}

// Brand Profile Collection
export interface BrandProfile {
  id: string;
  uid: string; // User who owns this brand profile
  name: string;
  toneEmbedding?: number[]; // AI-generated tone vector
  styleGuide: StyleGuide;
  samples: BrandSample[]; // Sample content used to train the brand voice
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StyleGuide {
  tone: string; // e.g., "professional", "casual", "authoritative"
  voice: string; // e.g., "first-person", "third-person"
  vocabulary: string[]; // Preferred terms/phrases
  avoidWords: string[]; // Words to avoid
  guidelines: string; // Free-form text guidelines
}

export interface BrandSample {
  id: string;
  content: string;
  contentType: 'email' | 'social' | 'general';
  uploadedAt: Timestamp;
}

// Document Collection
export interface Document {
  id: string;
  uid: string; // Owner
  title: string;
  content: string; // The actual document content
  contentType: 'email' | 'social' | 'general';
  brandProfileId?: string; // Optional brand profile to use
  status: 'draft' | 'published' | 'archived';
  goals?: DocumentGoals;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastAccessedAt: Timestamp;
}

export interface DocumentGoals {
  tone: string;
  audience: string;
  intent: string;
}

// Suggestion Collection
export interface Suggestion {
  id: string;
  docId: string; // Reference to document
  uid: string; // User who owns the document
  range: TextRange; // Position in the document
  type: SuggestionType;
  original: string; // Original text
  proposed: string; // Suggested replacement
  explanation: string; // One-line explanation
  confidence: number; // 0-1 confidence score
  status: 'pending' | 'accepted' | 'dismissed';
  createdAt: Timestamp;
}

export interface TextRange {
  start: number;
  end: number;
}

export type SuggestionType =
  | 'grammar'
  | 'spelling'
  | 'passive-voice'
  | 'tone'
  | 'clarity'
  | 'conciseness'
  | 'brand-voice';

// Metric Snapshot Collection
export interface MetricSnapshot {
  id: string;
  docId: string; // Reference to document
  uid: string; // User who owns the document
  metrics: DocumentMetrics;
  capturedAt: Timestamp;
}

export interface DocumentMetrics {
  wordCount: number;
  characterCount: number;
  readingTime: number; // in minutes
  fleschKincaidGrade: number;
  sentenceCount: number;
  paragraphCount: number;
  passiveVoiceCount: number;
  averageWordsPerSentence: number;
}

// Collection names as constants
export const COLLECTIONS = {
  USERS: 'users',
  BRAND_PROFILES: 'brandProfiles',
  DOCUMENTS: 'documents',
  SUGGESTIONS: 'suggestions',
  METRIC_SNAPSHOTS: 'metricSnapshots'
} as const;

import { Timestamp } from 'firebase/firestore';

// Timestamp types for handling different formats
export type FirestoreTimestamp = Timestamp | { seconds: number; nanoseconds: number };

// Utility function to convert any timestamp format to Date
export function timestampToDate(timestamp: FirestoreTimestamp): Date {
  if (!timestamp) return new Date();

  // Handle Firestore Timestamp from client SDK
  if (typeof timestamp === 'object' && 'toDate' in timestamp) {
    return timestamp.toDate();
  }

  // Handle plain object from Cloud Functions
  if (typeof timestamp === 'object' && 'seconds' in timestamp) {
    return new Date(timestamp.seconds * 1000);
  }

  return new Date();
}

// User Collection
export interface User {
  uid: string;
  email: string;
  displayName?: string;
  tier: 'free' | 'pro' | 'enterprise';
  settings: UserSettings;
  dictionary: string[]; // Personal dictionary for custom words/acronyms
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface UserSettings {
  language: string;
  autoSave: boolean;
  showMetrics: boolean;
  defaultContentType: 'blog' | 'email' | 'social' | 'ad_copy' | 'other';
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
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
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
  contentType: 'blog' | 'email' | 'social' | 'ad_copy' | 'other';
  uploadedAt: FirestoreTimestamp;
}

// Document Collection
export interface Document {
  id: string;
  uid: string; // Owner
  title: string;
  content: string; // The actual document content
  contentType: 'blog' | 'email' | 'social' | 'ad_copy' | 'other';
  brandProfileId?: string; // Optional brand profile to use
  status: 'draft' | 'writing' | 'reviewing' | 'published';
  goals?: string[]; // Array of goal strings
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

// Document creation types
export interface CreateDocumentData {
  title: string;
  content: string;
  contentType: 'blog' | 'email' | 'social' | 'ad_copy' | 'other';
  brandProfileId?: string;
  goals?: string[];
}

export interface UpdateDocumentData {
  title?: string;
  content?: string;
  contentType?: 'blog' | 'email' | 'social' | 'ad_copy' | 'other';
  brandProfileId?: string;
  goals?: string[];
  status?: 'draft' | 'writing' | 'reviewing' | 'published';
}

// Legacy interface for backward compatibility
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
  createdAt: FirestoreTimestamp;
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
  capturedAt: FirestoreTimestamp;
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

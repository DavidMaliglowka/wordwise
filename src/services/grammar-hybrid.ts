import { unified } from 'unified';
import retextEnglish from 'retext-english';
import retextSpell from 'retext-spell';
import retextPassive from 'retext-passive';
import retextIndefiniteArticle from 'retext-indefinite-article';
import retextRepeatedWords from 'retext-repeated-words';
import retextStringify from 'retext-stringify';
import retextSimplify from 'retext-simplify';
import retextContractions from 'retext-contractions';
import retextQuotes from 'retext-quotes';
import * as unorm from 'unorm';
import GraphemeSplitter from 'grapheme-splitter';
import { nanoid } from 'nanoid';
import { auth } from '../lib/firebase';
import { getHunspellDict, type HunspellDict } from '../utils/spellLoader';
import { personalDictionary } from './personal-dictionary';
import { performanceMonitor } from './performance-monitor';
import { grammarCache } from './enhanced-cache';

// retext-usage removed due to deprecation and internal errors

// Types
interface ClientSuggestion {
  id: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning' | 'suggestion';
  range: {
    start: number;
    end: number;
  };
  replacement?: string;
  type: 'spelling' | 'grammar' | 'style' | 'passive';
  confidence: number;
  flaggedText?: string;
  // Enhanced passive voice functionality
  canRegenerate?: boolean;
  regenerateId?: string;
}

interface ProcessingDecision {
  useClientOnly: boolean;
  reason: string;
  estimatedCost: number;
  estimatedLatency: number;
}

// Enhanced position mapping interface per grammar-refactor.md
interface PositionMap {
  clusterToUnit: Uint32Array; // C0 -> C1 (grapheme clusters to UTF-16 code units)
  unitToCluster: Uint32Array; // C1 -> C0 (UTF-16 code units to grapheme clusters)
  text: string; // The normalized text this map applies to
  totalClusters: number;
  totalUnits: number;
  totalBytes: number;
}

// Coordinate system mapping per grammar-refactor.md spec
interface CoordinateMapping {
  graphemeIndex: number;    // C0: User-perceived characters
  utf16Offset: number;      // C1: JS string slicing, Lexical marks
  byteOffset: number;       // C2: GPT tokens, analytics
}

// Decision engine for choosing processing approach
export class GrammarDecisionEngine {
  private static readonly MAX_CLIENT_WORDS = 2000;
  private static readonly MAX_GPT_COST_PER_CHECK = 0.05; // $0.05 max per check
  private static readonly TARGET_LATENCY_MS = 2000;

  static analyzeProcessingNeeds(text: string, options: {
    includeStyle?: boolean;
    priority?: 'fast' | 'quality' | 'balanced';
    userTier?: 'free' | 'premium';
    enhancePassiveVoice?: boolean;
  } = {}): ProcessingDecision {
    const wordCount = text.split(/\s+/).length;
    const charCount = text.length;

    // Estimate costs and latency
    const estimatedTokens = Math.ceil(charCount / 4); // rough estimate
    const estimatedCost = (estimatedTokens / 1000) * 0.005; // GPT-4o pricing
    const estimatedLatency = Math.max(1000, wordCount * 2); // base latency + processing time

    // Decision criteria
    const reasons: string[] = [];

    // Cost-based decisions
    if (estimatedCost > this.MAX_GPT_COST_PER_CHECK) {
      reasons.push(`Estimated cost ($${estimatedCost.toFixed(3)}) exceeds limit`);
      return {
        useClientOnly: true,
        reason: reasons.join('; '),
        estimatedCost,
        estimatedLatency: 50 // client processing is fast
      };
    }

    // Length-based decisions
    if (wordCount > this.MAX_CLIENT_WORDS) {
      reasons.push(`Word count (${wordCount}) exceeds client threshold`);
      return {
        useClientOnly: true,
        reason: reasons.join('; '),
        estimatedCost: 0,
        estimatedLatency: Math.min(200, wordCount * 0.1)
      };
    }

    // User tier restrictions removed - all users get access to enhanced features

    // Priority-based decisions
    if (options.priority === 'fast') {
      reasons.push('Fast priority selected');
      return {
        useClientOnly: true,
        reason: reasons.join('; '),
        estimatedCost: 0,
        estimatedLatency: 50
      };
    }

    // For passive voice enhancement, style analysis, or quality priority, use hybrid mode
    if (options.enhancePassiveVoice || options.includeStyle || options.priority === 'quality') {
      if (options.enhancePassiveVoice) {
        reasons.push('Passive voice enhancement requested');
      }
      if (options.includeStyle) {
        reasons.push('Style analysis requested');
      }
      if (options.priority === 'quality') {
        reasons.push('Quality priority requested');
      }
      return {
        useClientOnly: false,
        reason: reasons.join('; '),
        estimatedCost,
        estimatedLatency
      };
    }

    // Default to client-only for most cases
    reasons.push('Default client-only processing');
    return {
      useClientOnly: true,
      reason: reasons.join('; '),
      estimatedCost: 0,
      estimatedLatency: 100
    };
  }
}

// Unicode position mapper for precise index handling per grammar-refactor.md
export class UnicodePositionMapper {
  private graphemeSplitter = new GraphemeSplitter();
  private positionMap: PositionMap;
  private coordinateMappings: CoordinateMapping[] = [];

  constructor(private text: string) {
    // === CRITICAL FIX: Use raw text directly ===
    // Remove normalization to ensure offsets match exactly with Lexical editor
    this.text = text;
    this.positionMap = this.buildPositionMap();
  }

  private buildPositionMap(): PositionMap {
    const graphemes = this.graphemeSplitter.splitGraphemes(this.text);
    const totalClusters = graphemes.length;
    const totalUnits = this.text.length;
    const totalBytes = new TextEncoder().encode(this.text).length;

    // Build the coordinate mappings as per grammar-refactor.md spec
    const clusterToUnit = new Uint32Array(totalClusters + 1);
    const unitToCluster = new Uint32Array(totalUnits + 1);

    this.coordinateMappings = [];
    let utf16Offset = 0;
    let byteOffset = 0;

    graphemes.forEach((grapheme, clusterIndex) => {
      // Store coordinate mapping for reference
      this.coordinateMappings.push({
        graphemeIndex: clusterIndex,
        utf16Offset,
        byteOffset
      });

      // Build cluster-to-unit mapping
      clusterToUnit[clusterIndex] = utf16Offset;

      // Build unit-to-cluster mapping for each UTF-16 code unit in this grapheme
      for (let i = 0; i < grapheme.length; i++) {
        if (utf16Offset + i < totalUnits) {
          unitToCluster[utf16Offset + i] = clusterIndex;
        }
      }

      utf16Offset += grapheme.length;
      byteOffset += new TextEncoder().encode(grapheme).length;
    });

    // Sentinel values
    clusterToUnit[totalClusters] = totalUnits;
    if (totalUnits < unitToCluster.length) {
      unitToCluster[totalUnits] = totalClusters;
    }

    return {
      clusterToUnit,
      unitToCluster,
      text: this.text,
      totalClusters,
      totalUnits,
      totalBytes
    };
  }

  // Convert UTF-16 offset to grapheme cluster index (C1 -> C0)
  utf16ToGrapheme(utf16Offset: number): number {
    if (utf16Offset >= this.positionMap.unitToCluster.length) {
      return this.positionMap.totalClusters;
    }
    return this.positionMap.unitToCluster[utf16Offset];
  }

  // Convert grapheme cluster index to UTF-16 offset (C0 -> C1)
  graphemeToUtf16(graphemeIndex: number): number {
    if (graphemeIndex >= this.positionMap.clusterToUnit.length) {
      return this.positionMap.totalUnits;
    }
    return this.positionMap.clusterToUnit[graphemeIndex];
  }

  // Get coordinate mapping for a specific grapheme cluster
  getCoordinateMapping(graphemeIndex: number): CoordinateMapping | null {
    return this.coordinateMappings[graphemeIndex] || null;
  }

  // Get the normalized text this mapper applies to
  getNormalizedText(): string {
    return this.text;
  }

  // Validate a UTF-16 range and return corrected bounds
  validateUtf16Range(start: number, end: number): { start: number; end: number } {
    const safeStart = Math.max(0, Math.min(start, this.positionMap.totalUnits));
    const safeEnd = Math.max(safeStart, Math.min(end, this.positionMap.totalUnits));

    return { start: safeStart, end: safeEnd };
  }

  // Get debug info for troubleshooting position issues
  getDebugInfo(): {
    totalGraphemes: number;
    totalUtf16Units: number;
    totalBytes: number;
    sampleMappings: CoordinateMapping[];
  } {
    return {
      totalGraphemes: this.positionMap.totalClusters,
      totalUtf16Units: this.positionMap.totalUnits,
      totalBytes: this.positionMap.totalBytes,
      sampleMappings: this.coordinateMappings.slice(0, 10) // First 10 for debugging
    };
  }
}

// Client-side grammar engine
export class ClientGrammarEngine {
  private dict!: HunspellDict;
  private spellChecker: any = null;
  private processor: any = null;

  private async getProcessor() {
    if (this.processor) return this.processor;

    try {
      this.dict = await getHunspellDict();
      this.spellChecker = await import('nspell').then(m => m.default(this.dict));

      this.processor = unified()
        .use(retextEnglish)
        .use(retextSpell, this.dict as any) // Cast to avoid TypeScript error
        .use(retextPassive)
        .use(retextIndefiniteArticle)
        .use(retextRepeatedWords)
        .use(retextSimplify)
        .use(retextContractions)
        .use(retextQuotes)
        // Note: retext-usage removed due to internal errors (deprecated package)
        .use(retextStringify);

      console.log('✅ Grammar processor initialized');
      return this.processor;
    } catch (error) {
      console.error('❌ Failed to initialize grammar processor:', error);
      throw error;
    }
  }

  async initialize(): Promise<void> {
    // Initialization happens in getProcessor() now
  }

  // Helper function to pick best suggestion (prefer apostrophe additions)
  private pickBestSuggestion(original: string, suggestions: string[]): string {
    if (!suggestions || suggestions.length === 0) return '';

    // Prefer suggestions that only add an apostrophe
    const apostropheMatch = suggestions.find(s =>
      s.replace(/'/g, '') === original.replace(/'/g, '')
    );

    if (apostropheMatch) return apostropheMatch;

    // Otherwise return the first (highest ranked) suggestion
    return suggestions[0];
  }

  async analyzeSuggestions(text: string): Promise<ClientSuggestion[]> {
    // === CRITICAL FIX: Use raw text directly from the editor ===
    // Remove normalization to ensure offsets match exactly with Lexical editor
    const positionMapper = new UnicodePositionMapper(text);
    const textToProcess = text; // Use the original text

    try {
      const processor = await this.getProcessor();
      const file = await processor.process(textToProcess);

      // Only log if there are messages to avoid spam
      if (file.messages.length > 0) {
        console.log(`📝 Found ${file.messages.length} grammar suggestions`);
      }

      const suggestions = file.messages.map((message: any): ClientSuggestion | null => {
        // Extract position information from retext message
        // Based on debug results: retext uses 'place' property for positions
        let rawStart = 0;
        let rawEnd = 0;

        if (message.place?.start?.offset !== undefined) {
          rawStart = message.place.start.offset;
          rawEnd = message.place.end?.offset || rawStart;
        } else if (message.location?.start?.offset !== undefined) {
          rawStart = message.location.start.offset;
          rawEnd = message.location.end?.offset || rawStart;
        } else if (message.position?.start?.offset !== undefined) {
          rawStart = message.position.start.offset;
          rawEnd = message.position.end?.offset || rawStart;
        } else if (message.start !== undefined) {
          rawStart = message.start;
          rawEnd = message.end || rawStart;
        }

        // === THE FIX: VERIFY AND CORRECT THE OFFSETS ===

        // `message.actual` is the exact string retext flagged.
        const expectedText = message.actual;
        // `textToProcess.slice(...)` is what the text *actually* is at that position.
        const textAtReportedPosition = textToProcess.slice(rawStart, rawEnd);

        let start = rawStart;
        let end = rawEnd;

        // If the text at the reported position doesn't match what retext *thinks* it flagged,
        // the offset is wrong. We must correct it.
        if (expectedText && textAtReportedPosition !== expectedText) {
          console.warn(`Retext offset mismatch! Expected "${expectedText}" but found "${textAtReportedPosition}" at offset ${start}. Attempting to correct.`);

          // Search for the expected text in a small window around the reported offset.
          // This is more reliable than searching the whole document.
          const searchWindowStart = Math.max(0, start - 25);
          const correctedStart = textToProcess.indexOf(expectedText, searchWindowStart);

          if (correctedStart !== -1) {
            console.log(`✅ Offset corrected from ${start} to ${correctedStart}`);
            start = correctedStart;
            end = start + expectedText.length;
          } else {
            // If we can't find the text nearby, the suggestion is unreliable. Skip it.
            console.error(`Could not find "${expectedText}" near offset ${start}. Discarding suggestion.`);
            return null;
          }
        }

        // Apply final validation using the position mapper
        const validatedRange = positionMapper.validateUtf16Range(start, end);
        start = validatedRange.start;
        end = validatedRange.end;

        // Extract the actual text being flagged
        const flaggedText = textToProcess.slice(start, end);

        // Determine suggestion type and extract replacement
        const isSpelling = message.source === 'retext-spell' || message.ruleId?.includes('spell');
        const isPassive = message.source === 'retext-passive';
        const isArticle = message.source === 'retext-indefinite-article';
        const isRepeated = message.source === 'retext-repeated-words';
        const isSimplify = message.source === 'retext-simplify';
        const isContractions = message.source === 'retext-contractions';
        const isQuotes = message.source === 'retext-quotes';

        let replacement: string | undefined;
        let confidence = 60; // Default confidence

        if (isArticle && message.expected) {
          replacement = Array.isArray(message.expected) ? message.expected[0] : message.expected;
          confidence = 80;
        } else if (isRepeated && message.expected) {
          replacement = Array.isArray(message.expected) ? message.expected[0] : message.expected;
        } else if (isSpelling && message.expected) {
          const suggestions = Array.isArray(message.expected) ? message.expected : [message.expected];
          replacement = this.pickBestSuggestion(flaggedText, suggestions);
          confidence = 60; // Lower confidence for initial spelling suggestions to trigger auto-refinement
        } else if (isSimplify && message.expected) {
          replacement = Array.isArray(message.expected) ? message.expected[0] : message.expected;
          confidence = 70;
        } else if (isContractions && message.expected) {
          replacement = Array.isArray(message.expected) ? message.expected[0] : message.expected;
          confidence = 85;
        } else if (isQuotes && message.expected) {
          replacement = Array.isArray(message.expected) ? message.expected[0] : message.expected;
          confidence = 75;
        }

        const suggestion = {
          id: nanoid(),
          rule: message.source || message.ruleId || 'unknown',
          message: message.reason || message.message || 'Grammar issue detected',
          severity: isSpelling ? 'error' : (isPassive ? 'suggestion' : 'warning') as 'error' | 'warning' | 'suggestion',
          range: { start, end },
          replacement,
          type: isSpelling ? 'spelling' : (isPassive ? 'passive' : (isArticle || isContractions ? 'grammar' : 'style')) as 'spelling' | 'grammar' | 'style' | 'passive',
          confidence,
          flaggedText // Include the flagged text for personal dictionary filtering
        };

        return suggestion;
      })
      .filter((s: ClientSuggestion | null): s is ClientSuggestion => s !== null); // Filter out any discarded suggestions

      // Filter out suggestions for words in the personal dictionary
      const filteredSuggestions = await this.filterPersonalDictionaryWords(suggestions);

      return filteredSuggestions;

    } catch (error) {
      console.error('❌ Client grammar analysis failed:', error);
      return [];
    }
  }

  // Filter out suggestions for words that exist in the user's personal dictionary
  private async filterPersonalDictionaryWords(suggestions: ClientSuggestion[]): Promise<ClientSuggestion[]> {
    // Initialize personal dictionary if not ready
    if (!personalDictionary.isReady()) {
      try {
        await personalDictionary.initialize();
      } catch (error) {
        console.warn('Personal dictionary not available, skipping filter:', error);
        return suggestions;
      }
    }

    return suggestions.filter(suggestion => {
      // Only filter spelling suggestions
      if (suggestion.type !== 'spelling') {
        return true;
      }

      // Check if the flagged word is in the personal dictionary
      const flaggedWord = (suggestion as any).flaggedText || '';
      if (personalDictionary.hasWord(flaggedWord)) {
        return false;
      }

      return true;
    });
  }
}

// Hybrid grammar service
export class HybridGrammarService {
  private clientEngine = new ClientGrammarEngine();
  private static instance: HybridGrammarService;

  static getInstance(): HybridGrammarService {
    if (!this.instance) {
      this.instance = new HybridGrammarService();
    }
    return this.instance;
  }

  /**
   * Enhance passive voice suggestions with GPT-4o sentence-level rewrites
   */
  private async enhancePassiveVoiceSuggestions(
    text: string,
    suggestions: ClientSuggestion[]
  ): Promise<ClientSuggestion[]> {
    const passiveSuggestions = suggestions.filter(s => s.type === 'passive');

    if (passiveSuggestions.length === 0) {
      return suggestions;
    }

    console.log(`🔄 Enhancing ${passiveSuggestions.length} passive voice suggestions with GPT-4o`);

    // Group passive suggestions by sentence for more efficient processing
    const sentenceRewrites = await this.generatePassiveVoiceRewrites(text, passiveSuggestions);

    // Update passive suggestions with enhanced data
    const enhancedSuggestions = suggestions.map(suggestion => {
      if (suggestion.type === 'passive') {
        const rewrite = sentenceRewrites.get(suggestion.id);
        if (rewrite) {
          return {
            ...suggestion,
            message: `Passive voice detected. Consider active voice for clarity.`,
            replacement: rewrite.rewrittenSentence,
            range: rewrite.sentenceRange,
            confidence: 85,
            flaggedText: rewrite.originalSentence,
            // Add regenerate capability
            canRegenerate: true,
            regenerateId: suggestion.id
          };
        }
      }
      return suggestion;
    });

    return enhancedSuggestions;
  }

  /**
   * Generate passive voice rewrites using Cloud Function
   */
  private async generatePassiveVoiceRewrites(
    text: string,
    passiveSuggestions: ClientSuggestion[]
  ): Promise<Map<string, { originalSentence: string; rewrittenSentence: string; sentenceRange: { start: number; end: number } }>> {
    const results = new Map();

    try {
      // Extract sentences containing passive voice
      const sentences = this.extractSentencesFromPassiveSuggestions(text, passiveSuggestions);

      // Call Cloud Function to get rewrites
      const rewrites = await this.callPassiveVoiceRewriteFunction(sentences);

      // Map results back to suggestion IDs
      passiveSuggestions.forEach((suggestion, index) => {
        const sentence = sentences[index];
        const rewrite = rewrites[index];

        if (sentence && rewrite) {
          results.set(suggestion.id, {
            originalSentence: sentence.text,
            rewrittenSentence: rewrite,
            sentenceRange: sentence.range
          });
        }
      });

    } catch (error) {
      console.error('Failed to generate passive voice rewrites:', error);
      // Return empty map to gracefully degrade
    }

    return results;
  }

  /**
   * Extract sentences containing passive voice from text
   */
  private extractSentencesFromPassiveSuggestions(
    text: string,
    passiveSuggestions: ClientSuggestion[]
  ): Array<{ text: string; range: { start: number; end: number } }> {
    const sentences: Array<{ text: string; range: { start: number; end: number } }> = [];

    // Simple sentence boundary detection
    const sentenceBoundaries = this.findSentenceBoundaries(text);

    for (const suggestion of passiveSuggestions) {
      // Find which sentence contains this passive voice suggestion
      const sentenceInfo = this.findContainingSentence(
        suggestion.range,
        sentenceBoundaries,
        text
      );

      if (sentenceInfo) {
        sentences.push(sentenceInfo);
      }
    }

    return sentences;
  }

  /**
   * Find sentence boundaries in text
   */
  private findSentenceBoundaries(text: string): Array<{ start: number; end: number }> {
    const boundaries: Array<{ start: number; end: number }> = [];
    const sentences = text.split(/[.!?]+/);
    let currentPos = 0;

    for (const sentence of sentences) {
      if (sentence.trim().length > 0) {
        const start = text.indexOf(sentence.trim(), currentPos);
        const end = start + sentence.trim().length;
        boundaries.push({ start, end });
        currentPos = end;
      }
    }

    return boundaries;
  }

  /**
   * Find which sentence contains a passive voice suggestion
   */
  private findContainingSentence(
    suggestionRange: { start: number; end: number },
    sentenceBoundaries: Array<{ start: number; end: number }>,
    text: string
  ): { text: string; range: { start: number; end: number } } | null {
    console.log('🔍 SENTENCE DEBUG: Finding containing sentence', {
      suggestionRange,
      sentenceBoundariesCount: sentenceBoundaries.length,
      textLength: text.length,
      sentenceBoundaries: sentenceBoundaries.slice(0, 3) // Log first few boundaries
    });

    for (const boundary of sentenceBoundaries) {
      if (suggestionRange.start >= boundary.start && suggestionRange.end <= boundary.end) {
        const sentenceText = text.slice(boundary.start, boundary.end).trim();

        console.log('✅ SENTENCE DEBUG: Found matching sentence', {
          boundary,
          sentenceText,
          sentenceLength: sentenceText.length
        });

        return {
          text: sentenceText,
          range: boundary
        };
      }
    }

    console.warn('⚠️ SENTENCE DEBUG: No containing sentence found', {
      suggestionRange,
      availableBoundaries: sentenceBoundaries
    });

    return null;
  }

  /**
   * Call Cloud Function to rewrite passive sentences
   */
  private async callPassiveVoiceRewriteFunction(
    sentences: Array<{ text: string; range: { start: number; end: number } }>
  ): Promise<string[]> {
    // Import Firebase functions
    const { functions } = await import('../lib/firebase');
    const { httpsCallable } = await import('firebase/functions');

    try {
      // Call the dedicated enhancePassiveVoice Cloud Function
      const enhancePassiveVoice = httpsCallable(functions, 'enhancePassiveVoice');

      console.log(`🌐 CLOUD DEBUG: Calling enhancePassiveVoice Cloud Function:`, {
        sentenceCount: sentences.length,
        sentences: sentences.map(s => s.text)
      });

      const result = await enhancePassiveVoice({
        sentences: sentences.map(s => s.text),
        language: 'en'
      });

      // Extract the rewritten sentences from the response
      const response = result.data as any;
      console.log(`📨 CLOUD DEBUG: Received response from enhancePassiveVoice:`, {
        success: response.success,
        totalSentences: response.data?.totalSentences || 0,
        passiveSentencesFound: response.data?.passiveSentencesFound || 0,
        processingTimeMs: response.data?.processingTimeMs || 0
      });

      if (response.success && response.data?.sentences) {
        const rewrittenSentences = response.data.sentences.map((sentenceData: any, index: number) => {
          const originalSentence = sentences[index]?.text || '';

          // Cloud Function suggestions may use either `replacement` or `proposed`
          const bestSuggestion = sentenceData.suggestions?.find((s: any) =>
            s.type === 'passive' && (
              (s.replacement && s.replacement !== originalSentence) ||
              (s.proposed && s.proposed !== originalSentence)
            )
          );

          const rewrittenSentence =
            bestSuggestion?.replacement || bestSuggestion?.proposed || originalSentence;

          console.log(`🔄 CLOUD DEBUG: Sentence ${index} rewrite result:`, {
            original: originalSentence,
            rewritten: rewrittenSentence,
            hasSuggestions: sentenceData.suggestions?.length || 0,
            hasPassiveVoice: sentenceData.hasPassiveVoice,
            isChanged: rewrittenSentence !== originalSentence
          });

          return rewrittenSentence;
        });

        return rewrittenSentences;
      } else {
        console.warn('⚠️ CLOUD DEBUG: enhancePassiveVoice returned unsuccessful response');
        return sentences.map(s => s.text);
      }

    } catch (error) {
      console.error('❌ CLOUD DEBUG: Error calling enhancePassiveVoice function:', error);
      // Return original sentences as fallback
      return sentences.map(s => s.text);
    }
  }

  /**
   * Lightweight refinement method for individual suggestions using Cloud Function
   */
  async refineSuggestion(
    suggestion: ClientSuggestion,
    context: string
  ): Promise<ClientSuggestion | null> {
    if (!suggestion.canRegenerate || (suggestion.type !== 'passive' && suggestion.type !== 'style')) {
      console.warn('🚫 REFINE DEBUG: Suggestion cannot be refined', {
        type: suggestion.type,
        canRegenerate: suggestion.canRegenerate
      });
      return null;
    }

    console.log('🔄 REFINE DEBUG: Starting lightweight refinement', {
      suggestionId: suggestion.id,
      type: suggestion.type,
      flaggedText: suggestion.flaggedText
    });

    try {
      // Extract the sentence containing the suggestion
      const sentenceBoundaries = this.findSentenceBoundaries(context);
      const containingSentence = this.findContainingSentence(
        suggestion.range,
        sentenceBoundaries,
        context
      );

      if (!containingSentence) {
        console.warn('⚠️ REFINE DEBUG: Could not find containing sentence');
        return null;
      }

      console.log('🎯 REFINE DEBUG: Found containing sentence', {
        sentence: containingSentence.text,
        range: containingSentence.range
      });

      // Call the Cloud Function for refinement
      const rewrittenSentences = await this.callPassiveVoiceRewriteFunction([containingSentence]);

      if (rewrittenSentences.length === 0 || rewrittenSentences[0] === containingSentence.text) {
        console.warn('⚠️ REFINE DEBUG: No improvement from Cloud Function');
        return null;
      }

      const rewrittenSentence = rewrittenSentences[0];

      console.log('✨ REFINE DEBUG: Successfully refined suggestion', {
        original: containingSentence.text,
        rewritten: rewrittenSentence
      });

      // Create a new suggestion with the refined content
      return {
        ...suggestion,
        id: `refined_${suggestion.id}_${Date.now()}`,
        message: `Improved sentence structure. Consider this active voice alternative.`,
        replacement: rewrittenSentence,
        range: containingSentence.range,
        confidence: 90,
        flaggedText: containingSentence.text,
        canRegenerate: true,
        regenerateId: `refined_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

    } catch (error) {
      console.error('❌ REFINE DEBUG: Refinement failed:', error);
      return null;
    }
  }

  /**
   * Context-aware spelling refinement using the existing checkGrammar Cloud Function
   */
  async refineSpellingSuggestion(
    suggestion: ClientSuggestion,
    context: string
  ): Promise<ClientSuggestion | null> {
    if (suggestion.type !== 'spelling') {
      console.warn('🚫 SPELLING REFINE DEBUG: Not a spelling suggestion', {
        type: suggestion.type
      });
      return null;
    }

    // Validate input parameters
    if (!context || typeof context !== 'string' || context.trim().length === 0) {
      console.error('❌ SPELLING REFINE DEBUG: Invalid context parameter', {
        context,
        type: typeof context,
        length: context?.length
      });
      return null;
    }

    if (!suggestion.flaggedText || suggestion.flaggedText.trim().length === 0) {
      console.error('❌ SPELLING REFINE DEBUG: Invalid flagged text', {
        flaggedText: suggestion.flaggedText,
        suggestionId: suggestion.id
      });
      return null;
    }

    console.log('🔤 SPELLING REFINE DEBUG: Starting context-aware spelling refinement', {
      suggestionId: suggestion.id,
      flaggedWord: suggestion.flaggedText,
      currentProposed: suggestion.replacement,
      suggestionRange: suggestion.range,
      contextLength: context.length,
      contextPreview: context.slice(0, 100) + (context.length > 100 ? '...' : '')
    });

    try {
      // Extract the sentence containing the spelling error
      const sentenceBoundaries = this.findSentenceBoundaries(context);
      console.log('📏 SPELLING REFINE DEBUG: Sentence boundaries found', {
        boundariesCount: sentenceBoundaries.length,
        firstFewBoundaries: sentenceBoundaries.slice(0, 3)
      });

      const containingSentence = this.findContainingSentence(
        suggestion.range,
        sentenceBoundaries,
        context
      );

      if (!containingSentence || !containingSentence.text || containingSentence.text.trim().length === 0) {
        console.warn('⚠️ SPELLING REFINE DEBUG: Could not find containing sentence, using full context as fallback', {
          containingSentence,
          hasText: !!containingSentence?.text,
          textLength: containingSentence?.text?.length,
          contextLength: context.length
        });

        // Fallback: use the full context if it's not too long (under 500 chars)
        if (context && context.trim().length > 0 && context.length < 500) {
          console.log('🔄 SPELLING REFINE DEBUG: Using full context as fallback');
          const correctedSuggestions = await this.callSpellingCorrectionFunction(context.trim());

          // Find the best spelling suggestion for our flagged word
          const bestCorrection = this.findBestSpellingCorrection(
            suggestion.flaggedText || '',
            correctedSuggestions
          );

          if (!bestCorrection || bestCorrection === suggestion.replacement) {
            console.warn('⚠️ SPELLING REFINE DEBUG: No improvement from fallback approach');
            return null;
          }

          console.log('✨ SPELLING REFINE DEBUG: Successfully refined spelling suggestion via fallback', {
            original: suggestion.flaggedText,
            oldProposed: suggestion.replacement,
            newProposed: bestCorrection
          });

          // Create a new suggestion with the context-aware correction
          return {
            ...suggestion,
            id: `refined_spelling_${suggestion.id}_${Date.now()}`,
            message: `Unknown word. Did you mean "${bestCorrection}"?`,
            replacement: bestCorrection,
            confidence: 90,
            canRegenerate: true,
            regenerateId: `refined_spelling_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          };
        }

        return null;
      }

      console.log('🎯 SPELLING REFINE DEBUG: Found containing sentence', {
        sentence: containingSentence.text,
        sentenceLength: containingSentence.text.length,
        range: containingSentence.range,
        flaggedWord: suggestion.flaggedText
      });

      // Call the checkGrammar Cloud Function for context-aware spelling correction
      const correctedSuggestions = await this.callSpellingCorrectionFunction(containingSentence.text);

      console.log('🔍 SPELLING REFINE DEBUG: Cloud Function suggestions analysis', {
        suggestionsCount: correctedSuggestions.length,
        suggestions: correctedSuggestions,
        flaggedWord: suggestion.flaggedText,
        currentReplacement: suggestion.replacement
      });

      // Find the best spelling suggestion for our flagged word
      const bestCorrection = this.findBestSpellingCorrection(
        suggestion.flaggedText || '',
        correctedSuggestions
      );

      console.log('🎯 SPELLING REFINE DEBUG: Best correction analysis', {
        flaggedWord: suggestion.flaggedText,
        currentReplacement: suggestion.replacement,
        bestCorrection,
        isImprovement: bestCorrection && bestCorrection !== suggestion.replacement
      });

      if (!bestCorrection || bestCorrection === suggestion.replacement) {
        console.warn('⚠️ SPELLING REFINE DEBUG: No improvement from Cloud Function', {
          bestCorrection,
          currentReplacement: suggestion.replacement,
          isEqual: bestCorrection === suggestion.replacement
        });
        return null;
      }

      console.log('✨ SPELLING REFINE DEBUG: Successfully refined spelling suggestion', {
        original: suggestion.flaggedText,
        oldProposed: suggestion.replacement,
        newProposed: bestCorrection
      });

      // Create a new suggestion with the context-aware correction
      return {
        ...suggestion,
        id: `refined_spelling_${suggestion.id}_${Date.now()}`,
        message: `Unknown word. Did you mean "${bestCorrection}"?`,
        replacement: bestCorrection,
        confidence: 90,
        canRegenerate: true,
        regenerateId: `refined_spelling_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

    } catch (error) {
      console.error('❌ SPELLING REFINE DEBUG: Spelling refinement failed:', error);
      return null;
    }
  }

  /**
   * Call the checkGrammar Cloud Function for spelling-only corrections
   */
  private async callSpellingCorrectionFunction(sentence: string): Promise<ClientSuggestion[]> {
    try {
      // Validate that sentence is not empty or undefined
      if (!sentence || typeof sentence !== 'string' || sentence.trim().length === 0) {
        console.error('❌ SPELLING CLOUD DEBUG: Invalid sentence parameter', {
          sentence,
          type: typeof sentence,
          length: sentence?.length
        });
        return [];
      }

      // Use fetch directly since checkGrammar is an onRequest function, not onCall
      const auth = await import('firebase/auth');
      const { getAuth } = auth;
      const user = getAuth().currentUser;

      if (!user) {
        console.error('❌ SPELLING CLOUD DEBUG: User not authenticated');
        return [];
      }

      // Get the auth token
      const token = await user.getIdToken();

      const payload = {
        text: sentence.trim(),
        includeSpelling: true,
        includeGrammar: false,
        includeStyle: false,
        enhancePassiveVoice: false
      };

      console.log('🌐 SPELLING CLOUD DEBUG: Calling checkGrammar for spelling correction', {
        sentence,
        sentenceLength: sentence.length,
        sentenceType: typeof sentence,
        trimmedText: sentence.trim(),
        trimmedLength: sentence.trim().length,
        payload: JSON.stringify(payload)
      });

            console.log('🚀 SPELLING CLOUD DEBUG: About to call Firebase function with payload:', payload);
      console.log('🚀 SPELLING CLOUD DEBUG: Payload stringified:', JSON.stringify(payload));
      console.log('🚀 SPELLING CLOUD DEBUG: Payload.text type:', typeof payload.text);
      console.log('🚀 SPELLING CLOUD DEBUG: Payload.text value:', payload.text);

      // Make HTTP request to checkGrammar endpoint
      const response = await fetch('https://us-central1-wordwise-4234.cloudfunctions.net/checkGrammar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error('❌ SPELLING CLOUD DEBUG: HTTP request failed', {
          status: response.status,
          statusText: response.statusText
        });
        return [];
      }

      const result = await response.json();

      console.log('📨 SPELLING CLOUD DEBUG: Received response from checkGrammar', {
        success: result.success,
        suggestionsCount: result.data?.suggestions?.length || 0,
        allSuggestions: result.data?.suggestions
      });

      if (result.success && result.data?.suggestions) {
        // Convert Cloud Function suggestions to ClientSuggestion format
        return result.data.suggestions
          .filter((s: any) => s.type === 'spelling')
          .map((s: any) => ({
            id: nanoid(),
            rule: 'spelling',
            message: s.explanation || 'Spelling correction',
            severity: 'error' as const,
            range: {
              start: s.range?.start || 0,
              end: s.range?.end || 0
            },
            replacement: s.proposed || '',
            type: 'spelling' as const,
            confidence: Math.round((s.confidence || 0.9) * 100),
            flaggedText: s.original || '',
            canRegenerate: true
          }));
      }

      return [];

    } catch (error) {
      console.error('❌ SPELLING CLOUD DEBUG: Error calling checkGrammar for spelling:', error);
      return [];
    }
  }

  /**
   * Find the best spelling correction from Cloud Function suggestions
   */
  private findBestSpellingCorrection(
    flaggedWord: string,
    suggestions: ClientSuggestion[]
  ): string | null {
    if (!suggestions || suggestions.length === 0) {
      return null;
    }

    // Find suggestions that match our flagged word
    const matchingSuggestions = suggestions.filter(s =>
      s.flaggedText &&
      s.flaggedText.toLowerCase().trim() === flaggedWord.toLowerCase().trim()
    );

    if (matchingSuggestions.length > 0) {
      // Return the first (best) match
      return matchingSuggestions[0].replacement || null;
    }

    // If no exact match, look for partial matches or similar words
    const similarSuggestions = suggestions.filter(s =>
      s.flaggedText && (
        s.flaggedText.toLowerCase().includes(flaggedWord.toLowerCase()) ||
        flaggedWord.toLowerCase().includes(s.flaggedText.toLowerCase())
      )
    );

    if (similarSuggestions.length > 0) {
      return similarSuggestions[0].replacement || null;
    }

    // Fall back to the first spelling suggestion
    return suggestions[0].replacement || null;
  }

  async checkGrammar(
    text: string,
    options: {
      includeStyle?: boolean;
      priority?: 'fast' | 'quality' | 'balanced';
      userTier?: 'free' | 'premium';
      enhancePassiveVoice?: boolean;
    } = {}
  ): Promise<{
    suggestions: ClientSuggestion[];
    processingMode: 'client' | 'hybrid' | 'server';
    processingTimeMs: number;
    decision: ProcessingDecision;
  }> {
    const startTime = Date.now();
    const userId = auth.currentUser?.uid;
    const userTier = options.userTier || 'free';
    let errorOccurred = false;
    let errorType: string | undefined;

    // Check cache first
    const cacheKey = grammarCache.generateGrammarKey(text, options);
    const cachedResult = grammarCache.getGrammarResult(text, options);

    if (cachedResult) {
      const processingTime = Date.now() - startTime;

      // Record performance metrics for cache hit
      performanceMonitor.recordPerformanceMetric({
        userId,
        processingMode: cachedResult.processingMode,
        textLength: text.length,
        wordCount: text.split(/\s+/).length,
        processingTimeMs: processingTime,
        suggestionsCount: cachedResult.suggestions.length,
        cached: true,
        cacheHit: true,
        estimatedCost: 0,
        actualCost: 0,
        userTier,
        errorOccurred: false
      });

      return {
        ...cachedResult,
        processingTimeMs: processingTime
      };
    }

    // Make processing decision
    const decision = GrammarDecisionEngine.analyzeProcessingNeeds(text, options);

    console.log('🤖 DECISION DEBUG: Processing decision made', {
      enhancePassiveVoice: options.enhancePassiveVoice,
      includeStyle: options.includeStyle,
      priority: options.priority,
      useClientOnly: decision.useClientOnly,
      reason: decision.reason,
      textLength: text.length
    });

    // Record cost metrics for the decision
    performanceMonitor.recordCostMetric({
      userId,
      provider: decision.useClientOnly ? 'client' : 'openai',
      cost: decision.estimatedCost,
      currency: 'USD',
      userTier,
      rateLimitHit: false,
      costThresholdExceeded: false
    });

    try {
      if (decision.useClientOnly) {
        // Client-only processing
        const suggestions = await this.clientEngine.analyzeSuggestions(text);

        const processingTime = Date.now() - startTime;

        // Record performance metrics
        performanceMonitor.recordPerformanceMetric({
          userId,
          processingMode: 'client',
          textLength: text.length,
          wordCount: text.split(/\s+/).length,
          processingTimeMs: processingTime,
          suggestionsCount: suggestions.length,
          cached: false,
          estimatedCost: decision.estimatedCost,
          actualCost: 0, // Client processing is free
          userTier,
          errorOccurred: false
        });

        const result = {
          suggestions,
          processingMode: 'client' as const,
          processingTimeMs: processingTime,
          decision
        };

        // Cache the result
        grammarCache.setGrammarResult(text, options, result);

        return result;
      } else {
        // Hybrid processing: client first, then GPT enhancement
        const clientSuggestions = await this.clientEngine.analyzeSuggestions(text);

        const processingTime = Date.now() - startTime;

        // Record performance metrics for hybrid mode
        performanceMonitor.recordPerformanceMetric({
          userId,
          processingMode: 'hybrid',
          textLength: text.length,
          wordCount: text.split(/\s+/).length,
          processingTimeMs: processingTime,
          suggestionsCount: clientSuggestions.length,
          cached: false,
          estimatedCost: decision.estimatedCost,
          actualCost: decision.estimatedCost, // For hybrid, we use the estimate
          userTier,
          errorOccurred: false
        });

        const result = {
          suggestions: clientSuggestions,
          processingMode: 'hybrid' as const,
          processingTimeMs: processingTime,
          decision
        };

        // Cache the result
        grammarCache.setGrammarResult(text, options, result);

        // Enhance passive voice suggestions with GPT-4o sentence rewrites if enabled
        if (options.enhancePassiveVoice) {
          console.log('🔄 HYBRID DEBUG: Starting passive voice enhancement', {
            enhancePassiveVoice: options.enhancePassiveVoice,
            clientSuggestionsCount: clientSuggestions.length,
            passiveSuggestions: clientSuggestions.filter(s => s.type === 'passive').length
          });

          const enhancedSuggestions = await this.enhancePassiveVoiceSuggestions(text, clientSuggestions);

          console.log('✅ HYBRID DEBUG: Passive voice enhancement complete', {
            originalCount: clientSuggestions.length,
            enhancedCount: enhancedSuggestions.length,
            changedSuggestions: enhancedSuggestions.filter((s, i) =>
              s.replacement !== clientSuggestions[i]?.replacement
            ).length
          });

          const finalResult = {
            ...result,
            suggestions: enhancedSuggestions
          };

          // Cache the enhanced result
          grammarCache.setGrammarResult(text, options, finalResult);

          return finalResult;
        }

        return result;
      }
    } catch (error) {
      console.error('Hybrid grammar check failed:', error);
      errorOccurred = true;
      errorType = error instanceof Error ? error.name : 'UnknownError';

      // Fallback to client-only processing
      try {
        const suggestions = await this.clientEngine.analyzeSuggestions(text);
        const processingTime = Date.now() - startTime;

        // Record performance metrics for fallback
        performanceMonitor.recordPerformanceMetric({
          userId,
          processingMode: 'client',
          textLength: text.length,
          wordCount: text.split(/\s+/).length,
          processingTimeMs: processingTime,
          suggestionsCount: suggestions.length,
          cached: false,
          estimatedCost: 0,
          actualCost: 0,
          userTier,
          errorOccurred: true,
          errorType
        });

        return {
          suggestions,
          processingMode: 'client',
          processingTimeMs: processingTime,
          decision: {
            ...decision,
            reason: 'Fallback to client processing due to error'
          }
        };
      } catch (fallbackError) {
        const processingTime = Date.now() - startTime;

        // Record complete failure
        performanceMonitor.recordPerformanceMetric({
          userId,
          processingMode: 'client',
          textLength: text.length,
          wordCount: text.split(/\s+/).length,
          processingTimeMs: processingTime,
          suggestionsCount: 0,
          cached: false,
          estimatedCost: 0,
          actualCost: 0,
          userTier,
          errorOccurred: true,
          errorType: 'FallbackFailure'
        });

        throw fallbackError;
      }
    }
  }
}

// Export singleton instance
export const hybridGrammarService = HybridGrammarService.getInstance();

// Expose classes globally for testing
if (typeof window !== 'undefined') {
  (window as any).UnicodePositionMapper = UnicodePositionMapper;
  (window as any).GrammarDecisionEngine = GrammarDecisionEngine;
  (window as any).hybridGrammarService = hybridGrammarService;

  // Test function for cache integration
  (window as any).testPassiveVoiceCache = async () => {
    const testText = "The report was written by the team. Mistakes were made during the process.";

    console.log('🧪 Testing Passive Voice Cache Integration...');

    // First call - should miss cache and enhance passive voice
    console.time('First call (cache miss)');
    const result1 = await hybridGrammarService.checkGrammar(testText, {
      enhancePassiveVoice: true,
      includeStyle: true
    });
    console.timeEnd('First call (cache miss)');
    console.log('First result:', result1);

    // Second call - should hit cache
    console.time('Second call (cache hit)');
    const result2 = await hybridGrammarService.checkGrammar(testText, {
      enhancePassiveVoice: true,
      includeStyle: true
    });
    console.timeEnd('Second call (cache hit)');
    console.log('Second result:', result2);

    // Third call without passive voice enhancement - should miss cache (different options)
    console.time('Third call (different options)');
    const result3 = await hybridGrammarService.checkGrammar(testText, {
      enhancePassiveVoice: false,
      includeStyle: true
    });
    console.timeEnd('Third call (different options)');
    console.log('Third result:', result3);

    console.log('🎯 Cache test complete! Check timing differences above.');

    return { result1, result2, result3 };
  };
}

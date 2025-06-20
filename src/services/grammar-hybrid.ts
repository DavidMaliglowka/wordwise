import { unified } from 'unified';
import retextEnglish from 'retext-english';
import retextSpell from 'retext-spell';
import retextPassive from 'retext-passive';
import retextIndefiniteArticle from 'retext-indefinite-article';
import retextRepeatedWords from 'retext-repeated-words';
import retextStringify from 'retext-stringify';
import * as unorm from 'unorm';
import GraphemeSplitter from 'grapheme-splitter';
import { nanoid } from 'nanoid';
import { auth } from '../lib/firebase';
import { getHunspellDict, type HunspellDict } from '../utils/spellLoader';

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

    // User tier considerations
    if (options.userTier === 'free' && estimatedCost > 0.01) {
      reasons.push('Free tier cost optimization');
      return {
        useClientOnly: true,
        reason: reasons.join('; '),
        estimatedCost: 0,
        estimatedLatency: 100
      };
    }

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

    // For style analysis or quality priority, consider GPT
    if (options.includeStyle || options.priority === 'quality') {
      reasons.push('Style analysis or quality priority requested');
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
    // Always normalize to NFC first as per grammar-refactor.md
    this.text = unorm.nfc(text);
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

    this.dict = await getHunspellDict();
    this.spellChecker = await import('nspell').then(m => m.default(this.dict));

    this.processor = unified()
      .use(retextEnglish)
      .use(retextSpell, this.dict as any) // Cast to avoid TypeScript error
      .use(retextPassive)
      .use(retextIndefiniteArticle)
      .use(retextRepeatedWords)
      // Note: retext-usage removed due to internal errors (deprecated package)
      .use(retextStringify);

    return this.processor;
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
    // Normalize text first and build position map per grammar-refactor.md
    const normalizedText = unorm.nfc(text);
    const positionMapper = new UnicodePositionMapper(normalizedText);

    try {
      const processor = await this.getProcessor();
      const file = await processor.process(normalizedText);

      return file.messages.map((message: any) => {
        // Extract position information from retext message
        // Based on debug results: retext uses 'place' property for positions
        let rawStart = 0;
        let rawEnd = 0;

        if (message.place?.start?.offset !== undefined) {
          rawStart = message.place.start.offset;
          rawEnd = message.place.end?.offset ?? rawStart;
        } else if (message.location?.start?.offset !== undefined) {
          // Fallback to location if place is not available
          rawStart = message.location.start.offset;
          rawEnd = message.location.end?.offset ?? rawStart;
        } else if (message.position?.start?.offset !== undefined) {
          // Alternative position format
          rawStart = message.position.start.offset;
          rawEnd = message.position.end?.offset ?? rawStart;
        } else if (message.start !== undefined) {
          // Direct start/end properties
          rawStart = message.start;
          rawEnd = message.end ?? rawStart;
        }

        // Validate and correct positions using the position mapper
        const { start, end } = positionMapper.validateUtf16Range(rawStart, rawEnd);

        // Get better suggestions for spelling errors
        let replacement = undefined;
        if (message.source === 'retext-spell' && this.spellChecker) {
          const word = normalizedText.slice(start, end);
          const suggestions = this.spellChecker.suggest(word, { max: 10 });
          replacement = this.pickBestSuggestion(word, suggestions);
        } else {
          replacement = (message as any).expected?.[0] || undefined;
        }

        return {
          id: nanoid(),
          rule: message.ruleId || message.source || 'unknown',
          message: message.reason || message.message || 'Grammar issue detected',
          severity: this.mapSeverity(message.ruleId || message.source),
          range: { start, end },
          replacement,
          type: this.mapType(message.ruleId || message.source),
          confidence: this.mapConfidence(message.ruleId || message.source)
        };
      });
    } catch (error) {
      console.error('Client grammar analysis failed:', error);
      return [];
    }
  }

  private mapType(rule: string): 'spelling' | 'grammar' | 'style' | 'passive' {
    if (rule.includes('spell')) return 'spelling';
    if (rule.includes('passive')) return 'passive';
    if (rule.includes('usage') || rule.includes('article')) return 'grammar';
    if (rule.includes('repeated') || rule.includes('redundant')) return 'style';
    return 'grammar';
  }

  private mapSeverity(rule: string): 'error' | 'warning' | 'suggestion' {
    if (rule.includes('spell')) return 'error';
    if (rule.includes('usage') || rule.includes('article')) return 'warning';
    return 'suggestion';
  }

  private mapConfidence(rule: string): number {
    if (rule.includes('spell')) return 0.9;
    if (rule.includes('usage') || rule.includes('article')) return 0.8;
    if (rule.includes('passive')) return 0.7;
    return 0.6;
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

  async checkGrammar(
    text: string,
    options: {
      includeStyle?: boolean;
      priority?: 'fast' | 'quality' | 'balanced';
      userTier?: 'free' | 'premium';
    } = {}
  ): Promise<{
    suggestions: ClientSuggestion[];
    processingMode: 'client' | 'hybrid' | 'server';
    processingTimeMs: number;
    decision: ProcessingDecision;
  }> {
    const startTime = Date.now();

    // Make processing decision
    const decision = GrammarDecisionEngine.analyzeProcessingNeeds(text, options);

    try {
      if (decision.useClientOnly) {
        // Client-only processing
        const suggestions = await this.clientEngine.analyzeSuggestions(text);

        return {
          suggestions,
          processingMode: 'client',
          processingTimeMs: Date.now() - startTime,
          decision
        };
      } else {
        // Hybrid processing: client first, then GPT enhancement
        const clientSuggestions = await this.clientEngine.analyzeSuggestions(text);

        // TODO: Implement GPT enhancement for style suggestions
        // For now, return client suggestions
        return {
          suggestions: clientSuggestions,
          processingMode: 'hybrid',
          processingTimeMs: Date.now() - startTime,
          decision
        };
      }
    } catch (error) {
      console.error('Hybrid grammar check failed:', error);

      // Fallback to client-only processing
      const suggestions = await this.clientEngine.analyzeSuggestions(text);

      return {
        suggestions,
        processingMode: 'client',
        processingTimeMs: Date.now() - startTime,
        decision: {
          ...decision,
          reason: 'Fallback to client processing due to error'
        }
      };
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
}

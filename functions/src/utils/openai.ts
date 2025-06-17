import OpenAI from 'openai';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { GrammarSuggestion } from '../types/grammar';

// Define the OpenAI API key as a secret
const openaiApiKey = defineSecret('OPENAI_API_KEY');

// Initialize OpenAI client
let openaiClient: OpenAI | null = null;

/**
 * Get or initialize OpenAI client
 * @returns OpenAI client instance
 */
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const apiKey = openaiApiKey.value();

    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY secret.');
    }

    openaiClient = new OpenAI({
      apiKey: apiKey,
    });
  }

  return openaiClient;
}

/**
 * Create a system prompt for grammar and spelling correction
 * @param includeSpelling - Whether to include spelling corrections
 * @param includeGrammar - Whether to include grammar corrections
 * @param includeStyle - Whether to include style suggestions
 * @returns System prompt string
 */
function createSystemPrompt(
  includeSpelling: boolean = true,
  includeGrammar: boolean = true,
  includeStyle: boolean = false
): string {
  const capabilities = [];
  if (includeGrammar) capabilities.push('grammar errors');
  if (includeSpelling) capabilities.push('spelling mistakes');
  if (includeStyle) capabilities.push('style improvements');

  return `You are an expert grammar and language checker. Analyze the provided text and identify ${capabilities.join(', ')}.

CRITICAL: Always consider the full grammatical context, especially subject-verb agreement. Analyze the ENTIRE sentence before making suggestions.

Key priorities in order:
1. SUBJECT-VERB AGREEMENT: Check if verbs match their subjects (singular/plural, person)
2. CONTEXTUAL WORD CHOICE: Ensure words fit the grammatical context (e.g., "their" vs "they're")
3. CONTRACTIONS: Suggest appropriate contractions based on subject-verb agreement
4. SPELLING: Only flag actual misspellings, not contextual word choice errors

Common patterns to watch for:
- "She dont" → "She doesn't" (NOT "She don't" - third person singular requires "doesn't")
- "He dont" → "He doesn't" (NOT "He don't")
- "They dont" → "They don't" (correct for plural)
- "I dont" → "I don't" (correct for first person)
- "You dont" → "You don't" (correct for second person)
- "their going" → "they're going" (contraction of "they are")
- "your going" → "you're going" (contraction of "you are")
- "its vs it's" → Check if possessive or contraction is needed

ALWAYS verify subject-verb agreement BEFORE suggesting contractions. The subject determines the correct verb form.

For each issue found, provide a JSON object with:
- "range": {"start": number, "end": number} (exact character positions)
- "type": "grammar" | "spelling" | "punctuation" | "style"
- "original": "exact text to replace"
- "proposed": "grammatically correct replacement"
- "explanation": "clear explanation focusing on the grammatical rule"
- "confidence": number between 0.8 and 1.0 (be confident in grammar rules)

Return only: {"suggestions": [array of suggestion objects]}
If no issues are found, return: {"suggestions": []}`;
}

/**
 * Create a user prompt with the text to check
 * @param text - Text to analyze
 * @returns User prompt string
 */
function createUserPrompt(text: string): string {
  return `Analyze this text for grammar and language errors. Pay special attention to subject-verb agreement and ensure all suggestions are contextually appropriate:

"${text}"

Remember: Consider the full grammatical context of each sentence before making suggestions.`;
}

/**
 * Parse OpenAI response into structured suggestions
 * @param content - OpenAI response content
 * @returns Array of grammar suggestions
 */
function parseOpenAIResponse(content: string): GrammarSuggestion[] {
  try {
    // Clean up the response (remove any markdown formatting)
    const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const parsed = JSON.parse(cleanContent);

    // Handle both old and new formats
    let suggestions: any[];
    if (Array.isArray(parsed)) {
      // Old format: direct array
      suggestions = parsed;
    } else if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
      // New format: object with suggestions key
      suggestions = parsed.suggestions;
    } else {
      logger.warn('OpenAI response format unrecognized:', parsed);
      return [];
    }

    // Validate each suggestion
    return suggestions.filter((suggestion: any) => {
      if (!suggestion.range || !suggestion.type || !suggestion.original || !suggestion.proposed) {
        logger.warn('Invalid suggestion structure:', suggestion);
        return false;
      }

      // Ensure confidence is between 0 and 1
      if (typeof suggestion.confidence !== 'number' || suggestion.confidence < 0 || suggestion.confidence > 1) {
        suggestion.confidence = 0.8; // Default confidence
      }

      return true;
    }) as GrammarSuggestion[];

  } catch (error) {
    logger.error('Error parsing OpenAI response:', error);
    logger.error('Response content:', content);
    return [];
  }
}

/**
 * Check text for grammar and spelling issues using OpenAI
 * @param text - Text to analyze
 * @param options - Check options
 * @returns Promise<GrammarSuggestion[]>
 */
export async function checkGrammarWithOpenAI(
  text: string,
  options: {
    includeSpelling?: boolean;
    includeGrammar?: boolean;
    includeStyle?: boolean;
    maxTokens?: number;
  } = {}
): Promise<GrammarSuggestion[]> {
  const {
    includeSpelling = true,
    includeGrammar = true,
    includeStyle = false,
    maxTokens = 1000
  } = options;

  try {
    const client = getOpenAI();

    const systemPrompt = createSystemPrompt(includeSpelling, includeGrammar, includeStyle);
    const userPrompt = createUserPrompt(text);

    logger.info('Calling OpenAI API for grammar check', {
      textLength: text.length,
      includeSpelling,
      includeGrammar,
      includeStyle
    });

    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature: 0.1, // Low temperature for consistent results
      response_format: { type: 'json_object' } // Ensure JSON response
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      logger.warn('No content received from OpenAI');
      return [];
    }

    logger.info('OpenAI API call successful', {
      usage: completion.usage,
      responseLength: content.length
    });

    return parseOpenAIResponse(content);

  } catch (error: any) {
    logger.error('Error calling OpenAI API:', error);

    // Handle specific OpenAI errors
    if (error.status === 401) {
      throw new Error('OpenAI API authentication failed');
    } else if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded');
    } else if (error.status === 400) {
      throw new Error('Invalid request to OpenAI API');
    }

    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

/**
 * Check text for grammar and spelling issues with streaming
 * @param text - Text to analyze
 * @param options - Check options
 * @param onChunk - Callback for streaming chunks
 * @returns Promise<GrammarSuggestion[]>
 */
export async function checkGrammarWithOpenAIStreaming(
  text: string,
  options: {
    includeSpelling?: boolean;
    includeGrammar?: boolean;
    includeStyle?: boolean;
    maxTokens?: number;
  } = {},
  onChunk?: (chunk: string) => void
): Promise<GrammarSuggestion[]> {
  const {
    includeSpelling = true,
    includeGrammar = true,
    includeStyle = false,
    maxTokens = 1000
  } = options;

  try {
    const client = getOpenAI();

    const systemPrompt = createSystemPrompt(includeSpelling, includeGrammar, includeStyle);
    const userPrompt = createUserPrompt(text);

    logger.info('Calling OpenAI API for streaming grammar check', {
      textLength: text.length
    });

    const stream = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature: 0.1,
      stream: true
    });

    let fullContent = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        if (onChunk) {
          onChunk(content);
        }
      }
    }

    logger.info('OpenAI streaming API call completed', {
      responseLength: fullContent.length
    });

    return parseOpenAIResponse(fullContent);

  } catch (error: any) {
    logger.error('Error in streaming OpenAI API call:', error);
    throw new Error(`OpenAI streaming error: ${error.message}`);
  }
}

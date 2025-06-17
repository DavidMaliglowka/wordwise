import OpenAI from 'openai';
import * as functions from 'firebase-functions';
import * as logger from 'firebase-functions/logger';
import { GrammarSuggestion, OpenAIGrammarPrompt } from '../types/grammar';

// Initialize OpenAI client
let openaiClient: OpenAI | null = null;

/**
 * Get or initialize OpenAI client
 * @returns OpenAI client instance
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = functions.config().openai?.key;

    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Use: firebase functions:config:set openai.key="your-api-key"');
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

  return `You are a professional proofreading assistant. Analyze the provided text and identify ${capabilities.join(', ')}.

For each issue found, provide a JSON object with:
- "range": {"start": number, "end": number} (character positions)
- "type": "grammar" | "spelling" | "punctuation" | "style"
- "original": "original text"
- "proposed": "suggested correction"
- "explanation": "brief explanation of the issue"
- "confidence": number between 0 and 1

Return ONLY a JSON array of suggestion objects. Do not include any other text or markdown formatting.
If no issues are found, return an empty array: []`;
}

/**
 * Create a user prompt with the text to check
 * @param text - Text to analyze
 * @returns User prompt string
 */
function createUserPrompt(text: string): string {
  return `Please analyze this text for errors:\n\n"${text}"`;
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

    const suggestions = JSON.parse(cleanContent);

    if (!Array.isArray(suggestions)) {
      logger.warn('OpenAI response is not an array:', suggestions);
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
    const client = getOpenAIClient();

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
    const client = getOpenAIClient();

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

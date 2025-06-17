import OpenAI, { APIError } from 'openai';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { z } from 'zod';
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

/* ------------------------------------------------------------------ */
/*  Zod schema for runtime validation                                 */
/* ------------------------------------------------------------------ */
const suggestionSchema = z.object({
  range: z.object({
    start: z.number().int().min(0),
    end: z.number().int().min(0)
  }),
  type: z.enum(['grammar', 'spelling', 'punctuation', 'style']),
  original: z.string().min(1),
  proposed: z.string().min(1),
  explanation: z.string().min(1),
  confidence: z.number().min(0.8).max(1.0), // Keep our 0.8-1.0 range
});

const toolResponseSchema = z.object({
  suggestions: z.array(suggestionSchema)
});

/* ------------------------------------------------------------------ */
/*  Function-calling tool definition                                  */
/* ------------------------------------------------------------------ */
const grammarCheckerTool = {
  type: 'function' as const,
  function: {
    name: 'grammar_checker',
    description: 'Analyze text for grammar, spelling, punctuation, and style issues with precise position tracking.',
    parameters: {
      type: 'object',
      properties: {
        suggestions: {
          type: 'array',
          description: 'Array of grammar suggestions with exact character positions',
          items: {
            type: 'object',
            properties: {
              range: {
                type: 'object',
                properties: {
                  start: { type: 'number', description: 'Start character position (0-indexed)' },
                  end: { type: 'number', description: 'End character position (0-indexed)' }
                },
                required: ['start', 'end']
              },
              type: {
                type: 'string',
                enum: ['grammar', 'spelling', 'punctuation', 'style'],
                description: 'Type of language issue'
              },
              original: {
                type: 'string',
                description: 'Exact text to replace (must match text at range positions)'
              },
              proposed: {
                type: 'string',
                description: 'Grammatically correct replacement text'
              },
              explanation: {
                type: 'string',
                description: 'Clear explanation of why this change improves the text'
              },
              confidence: {
                type: 'number',
                minimum: 0.8,
                maximum: 1.0,
                description: 'Confidence level (0.8-1.0, be confident in grammar rules)'
              }
            },
            required: ['range', 'type', 'original', 'proposed', 'explanation', 'confidence']
          }
        }
      },
      required: ['suggestions']
    }
  }
};

/**
 * Create a concise system prompt that works with function-calling
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

  return `You are an expert grammar checker. Analyze text for ${capabilities.join(', ')} with these priorities:

1. SUBJECT-VERB AGREEMENT: Ensure verbs match subjects (singular/plural, person)
2. CONTEXTUAL WORD CHOICE: "their" vs "they're", "its" vs "it's"
3. SPELLING: Only flag actual misspellings
4. PUNCTUATION: Be consistent, avoid contradictory suggestions

CRITICAL RULES:
- CONSISTENCY: Don't suggest adding then removing the same punctuation
- ACCURACY: Ensure explanations match the actual change being made
- PRECISION: Use exact character positions and matching text

Common patterns:
- "She dont" → "She doesn't" (3rd person singular)
- "They dont" → "They don't" (plural)
- "their going" → "they're going" (contraction)

Use the grammar_checker function to return structured results.`;
}

/**
 * Create user prompt with the text to analyze
 */
function createUserPrompt(text: string): string {
  return `Analyze this text for grammar and language errors:

"${text}"

Return precise suggestions with exact character positions.`;
}

/**
 * Parse and validate OpenAI tool response
 */
function parseToolResponse(toolCallArguments: string): GrammarSuggestion[] {
  try {
    const parsed = JSON.parse(toolCallArguments);
    const result = toolResponseSchema.safeParse(parsed);

    if (!result.success) {
      logger.error('Tool response validation failed:', {
        error: result.error.format(),
        rawArguments: toolCallArguments
      });
      return [];
    }

    // Additional validation: ensure range.end > range.start
    const validSuggestions = result.data.suggestions.filter(suggestion => {
      if (suggestion.range.end <= suggestion.range.start) {
        logger.warn('Invalid range in suggestion:', suggestion);
        return false;
      }
      return true;
    });

    return validSuggestions;
  } catch (error) {
    logger.error('Error parsing tool response:', {
      error: error instanceof Error ? error.message : String(error),
      rawArguments: toolCallArguments.length > 1000 ?
        toolCallArguments.substring(0, 1000) + '... (truncated)' :
        toolCallArguments,
      argumentsLength: toolCallArguments.length
    });

    // If it's a JSON parsing error, it might be due to truncation
    if (error instanceof Error && error.message.includes('JSON')) {
      logger.warn('JSON parsing failed - likely due to token limit truncation. Consider increasing maxTokens.');
    }

    return [];
  }
}

/**
 * Handle OpenAI API errors with detailed logging
 */
function handleOpenAIError(error: unknown): never {
  if (error instanceof APIError) {
    logger.error('OpenAI API error:', {
      status: error.status,
      code: error.code,
      message: error.message,
      type: error.type
    });

    switch (error.status) {
      case 401:
        throw new Error('OpenAI API authentication failed');
      case 429:
        throw new Error('OpenAI API rate limit exceeded');
      case 400:
        throw new Error('Invalid request to OpenAI API');
      default:
        throw new Error(`OpenAI API error ${error.status}: ${error.message}`);
    }
  }

  // Non-API errors
  logger.error('Unexpected error in OpenAI call:', {
    error: error instanceof Error ? error.message : String(error)
  });
  throw error instanceof Error ? error : new Error(String(error));
}

/**
 * Check text for grammar and spelling issues using OpenAI with function-calling
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
    maxTokens = 4000 // Increased from 1000 to handle more suggestions
  } = options;

  try {
    const client = getOpenAI();

    const systemPrompt = createSystemPrompt(includeSpelling, includeGrammar, includeStyle);
    const userPrompt = createUserPrompt(text);

    logger.info('Calling OpenAI API for grammar check', {
      textLength: text.length,
      includeSpelling,
      includeGrammar,
      includeStyle,
      model: 'gpt-4o'
    });

    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature: 0, // Deterministic
      top_p: 0, // Deterministic
      seed: 42, // Consistent results
      tools: [grammarCheckerTool],
      tool_choice: { type: 'function', function: { name: 'grammar_checker' } }
    });

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== 'grammar_checker') {
      logger.warn('No valid tool call in OpenAI response');
      return [];
    }

    const suggestions = parseToolResponse(toolCall.function.arguments);

    logger.info('OpenAI API call successful', {
      usage: completion.usage,
      suggestionsCount: suggestions.length,
      requestId: completion.id
    });

    return suggestions;

  } catch (error: any) {
    handleOpenAIError(error);
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
    maxTokens = 4000 // Increased from 1000 to handle more suggestions
  } = options;

  try {
    const client = getOpenAI();

    const systemPrompt = createSystemPrompt(includeSpelling, includeGrammar, includeStyle);
    const userPrompt = createUserPrompt(text);

    logger.info('Calling OpenAI API for streaming grammar check', {
      textLength: text.length,
      model: 'gpt-4o'
    });

    const stream = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature: 0, // Deterministic
      top_p: 0, // Deterministic
      seed: 42, // Consistent results
      stream: true,
      tools: [grammarCheckerTool],
      tool_choice: { type: 'function', function: { name: 'grammar_checker' } }
    });

    let argumentsBuffer = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.tool_calls?.[0]?.function?.arguments) {
        const argumentChunk = delta.tool_calls[0].function.arguments;
        argumentsBuffer += argumentChunk;
        if (onChunk) {
          onChunk(argumentChunk);
        }
      }
    }

    const suggestions = parseToolResponse(argumentsBuffer);

    logger.info('OpenAI streaming API call completed', {
      responseLength: argumentsBuffer.length,
      suggestionsCount: suggestions.length
    });

    return suggestions;

  } catch (error: any) {
    handleOpenAIError(error);
  }
}

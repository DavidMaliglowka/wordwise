/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from 'firebase-functions/params';
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { z } from "zod";
import { checkGrammarWithOpenAI, checkGrammarWithOpenAIStreaming } from "./utils/openai";
import { generateTextHash, getCachedResult, setCachedResult } from "./utils/cache";
import { GrammarCheckResponse } from "./types/grammar";

// Define the OpenAI API key as a secret
const openaiApiKey = defineSecret('OPENAI_API_KEY');

// Configure global settings
setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
});

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Validation schemas
const createDocumentSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(1024 * 1024), // 1MB limit
  contentType: z.enum(['blog', 'email', 'social', 'ad_copy', 'other']),
  brandProfileId: z.string().optional(),
  goals: z.array(z.string()).optional(),
});

const updateDocumentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(1024 * 1024).optional(),
  contentType: z.enum(['blog', 'email', 'social', 'ad_copy', 'other']).optional(),
  brandProfileId: z.string().optional(),
  goals: z.array(z.string()).optional(),
  status: z.enum(['draft', 'writing', 'reviewing', 'published']).optional(),
  editCount: z.number().min(0).optional(),
});

const grammarCheckSchema = z.object({
  text: z.string().min(1).max(10000), // Max 10k characters
  language: z.string().optional().default('en'),
  includeSpelling: z.boolean().optional().default(true),
  includeGrammar: z.boolean().optional().default(true),
  includeStyle: z.boolean().optional().default(false),
  stream: z.boolean().optional().default(false),
  enhancePassiveVoice: z.boolean().optional().default(false),
});

// Personal Dictionary validation schemas
const addDictionaryTermSchema = z.object({
  word: z.string().min(1).max(100).trim(),
  category: z.enum(['technical', 'domain', 'name', 'custom']).optional().default('custom'),
  notes: z.string().max(500).optional(),
});

const removeDictionaryTermSchema = z.object({
  word: z.string().min(1).max(100).trim(),
});



/**
 * Verify Firebase Auth token and return user ID
 */
async function verifyAuth(req: any): Promise<string> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED');
  }

  const token = authHeader.substring(7);
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken.uid;
  } catch (error) {
    logger.error('Token verification failed:', error);
    throw new Error('UNAUTHORIZED');
  }
}

/**
 * Fetch user's personal dictionary from Firestore
 */
async function getUserPersonalDictionary(uid: string): Promise<string[]> {
  try {
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return [];
    }

    const userData = userDoc.data();
    return userData?.dictionary || [];
  } catch (error) {
    logger.warn('Failed to fetch personal dictionary for user:', uid, error);
    return []; // Return empty array if fetch fails - don't block grammar checking
  }
}

/**
 * Normalize apostrophes and quotes in text
 */
function normalizeApostrophes(text: string): string {
  return text
    .replace(/['']/g, "'") // Convert smart quotes to straight apostrophes
    .replace(/[""]/g, '"') // Convert smart quotes to straight quotes
    .replace(/[–—]/g, '-'); // Convert em/en dashes to hyphens
}

/**
 * Extract base word from possessive or contracted forms
 */
function extractBaseWord(word: string): string {
  const normalized = normalizeApostrophes(word.toLowerCase().trim());

  // Handle possessives: "word's" -> "word"
  if (normalized.endsWith("'s") || normalized.endsWith("'")) {
    return normalized.replace(/'s?$/, '');
  }

  // Handle contractions: "don't" -> ["don", "t"], "we'll" -> ["we", "ll"]
  // For now, just return the original word for contractions
  return normalized;
}

/**
 * Filter suggestions based on user's personal dictionary
 */
function filterSuggestionsWithPersonalDictionary(suggestions: any[], personalDictionary: string[]): any[] {
  if (!personalDictionary || personalDictionary.length === 0) {
    return suggestions;
  }

  // Create a Set for faster lookups with normalized words
  const dictionarySet = new Set(personalDictionary.map(word => normalizeApostrophes(word.toLowerCase())));

  return suggestions.filter(suggestion => {
    // Extract the flagged word from the suggestion
    let flaggedWord = '';

    if (suggestion.original) {
      flaggedWord = suggestion.original.toLowerCase().trim();
    } else if (suggestion.context) {
      // If we have context, try to extract the flagged word
      const contextMatch = suggestion.context.match(/\*\*(.*?)\*\*/);
      if (contextMatch) {
        flaggedWord = contextMatch[1].toLowerCase().trim();
      }
    }

    if (flaggedWord) {
      const normalizedFlagged = normalizeApostrophes(flaggedWord);
      const baseFlagged = extractBaseWord(flaggedWord);

      // Check both the full word and the base word
      if (dictionarySet.has(normalizedFlagged) || dictionarySet.has(baseFlagged)) {
        logger.info(`Filtered suggestion for personal dictionary word: "${flaggedWord}" (normalized: "${normalizedFlagged}", base: "${baseFlagged}")`);
        return false; // Filter out this suggestion
      }
    }

    return true; // Keep this suggestion
  });
}

// Helper function to set CORS headers with restricted origins
function setCorsHeaders(res: any, req?: any) {
  // Define allowed origins for different environments
  const allowedOrigins = [
    'http://localhost:5173',           // Local development (default port)
    'http://localhost:5174',           // Local development (alternate ports)
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    'http://localhost:5178',
    'http://localhost:5179',
    'https://wordwise-4234.web.app',  // Firebase Hosting
    'https://wordwise-4234.firebaseapp.com'  // Firebase Hosting alternative
  ];

  const origin = req?.headers?.origin;

  // Check if origin is in allowed list or matches localhost pattern for development
  if (origin) {
    const isLocalhost = /^http:\/\/localhost:\d+$/.test(origin);
    if (allowedOrigins.includes(origin) || isLocalhost) {
      res.set('Access-Control-Allow-Origin', origin);
    } else {
      // For non-allowed origins, don't set CORS header (will cause CORS error)
      res.set('Access-Control-Allow-Origin', 'http://localhost:5173');
    }
  } else {
    // Default to localhost for development when no origin header is present
    res.set('Access-Control-Allow-Origin', 'http://localhost:5173');
  }

  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Credentials', 'true');
}

// Helper function to send error responses
function sendError(res: any, status: number, message: string, details?: any, req?: any) {
  setCorsHeaders(res, req);
  logger.error(`Error ${status}: ${message}`, details);
  res.status(status).json({
    error: {
      message,
      code: status,
      details: details || null,
    },
  });
}

/**
 * Create a new document
 * POST /createDocument
 */
export const createDocument = onRequest({
  invoker: 'public'
}, async (req, res) => {
  try {
    setCorsHeaders(res, req);

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== "POST") {
      return sendError(res, 405, "Method not allowed", null, req);
    }

    // Verify authentication
    const uid = await verifyAuth(req);

    // Validate request body
    const validationResult = createDocumentSchema.safeParse(req.body);
    if (!validationResult.success) {
      return sendError(res, 400, "Invalid request data", validationResult.error.errors, req);
    }

    const documentData = validationResult.data;

    // Create document with timestamps
    const now = admin.firestore.Timestamp.now();
    const docRef = db.collection("documents").doc();

    const newDocument = {
      id: docRef.id,
      uid,
      title: documentData.title,
      content: documentData.content,
      contentType: documentData.contentType,
      brandProfileId: documentData.brandProfileId || null,
      status: "draft" as const,
      goals: documentData.goals || [],
      editCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(newDocument);

    logger.info(`Document created: ${docRef.id} for user: ${uid}`);

    res.status(201).json({
      success: true,
      data: newDocument,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return sendError(res, 401, "Unauthorized", null, req);
    }
    return sendError(res, 500, "Internal server error", error.message, req);
  }
});

/**
 * Get documents for a user (list) or a specific document by ID
 * GET /getDocuments?documentId=<id> (single document)
 * GET /getDocuments (all user documents)
 */
export const getDocuments = onRequest({
  invoker: 'public'
}, async (req, res) => {
  try {
    setCorsHeaders(res, req);

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== "GET") {
      return sendError(res, 405, "Method not allowed", null, req);
    }

    // Verify authentication
    const uid = await verifyAuth(req);

    const documentId = req.query.documentId as string;

    if (documentId) {
      // Get specific document
      const docRef = db.collection("documents").doc(documentId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return sendError(res, 404, "Document not found", null, req);
      }

      const docData = docSnap.data();

      // Verify ownership
      if (docData?.uid !== uid) {
        return sendError(res, 403, "Access denied", null, req);
      }

      logger.info(`Document retrieved: ${documentId} for user: ${uid}`);

      res.status(200).json({
        success: true,
        data: docData,
      });
    } else {
      // Get all documents for user
      const query = db.collection("documents")
        .where("uid", "==", uid)
        .orderBy("updatedAt", "desc");

      const snapshot = await query.get();
      const documents = snapshot.docs.map(doc => doc.data());

      logger.info(`Retrieved ${documents.length} documents for user: ${uid}`);

      res.status(200).json({
        success: true,
        data: documents,
        count: documents.length,
      });
    }
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return sendError(res, 401, "Unauthorized", null, req);
    }
    return sendError(res, 500, "Internal server error", error.message, req);
  }
});

/**
 * Update an existing document
 * PUT /updateDocument/{documentId}
 */
export const updateDocument = onRequest({
  invoker: 'public'
}, async (req, res) => {
  try {
    setCorsHeaders(res, req);

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== "PUT") {
      return sendError(res, 405, "Method not allowed", null, req);
    }

    // Verify authentication
    const uid = await verifyAuth(req);

    // Extract document ID from path
    const pathParts = req.path.split("/");
    const documentId = pathParts[pathParts.length - 1];

    if (!documentId) {
      return sendError(res, 400, "Document ID is required", null, req);
    }

    // Validate request body
    const validationResult = updateDocumentSchema.safeParse(req.body);
    if (!validationResult.success) {
      return sendError(res, 400, "Invalid request data", validationResult.error.errors, req);
    }

    const updateData = validationResult.data;

    // Check if document exists and user owns it
    const docRef = db.collection("documents").doc(documentId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return sendError(res, 404, "Document not found", null, req);
    }

    const docData = docSnap.data();
    if (docData?.uid !== uid) {
      return sendError(res, 403, "Access denied", null, req);
    }

    // Check if this update should increment edit count
    // Increment for content, title, or status changes (not for metadata like lastAccessedAt)
    const shouldIncrementEditCount = updateData.content !== undefined ||
                                   updateData.title !== undefined ||
                                   updateData.status !== undefined ||
                                   updateData.goals !== undefined ||
                                   updateData.contentType !== undefined ||
                                   updateData.brandProfileId !== undefined;

    // Update document with new timestamp and possibly increment edit count
    const updatePayload: any = {
      ...updateData,
      updatedAt: admin.firestore.Timestamp.now(),
    };

    // Use Firestore increment for atomic operation
    if (shouldIncrementEditCount) {
      updatePayload.editCount = admin.firestore.FieldValue.increment(1);
    }

    await docRef.update(updatePayload);

    // Get updated document
    const updatedDocSnap = await docRef.get();
    const updatedDocument = updatedDocSnap.data();

    logger.info(`Document updated: ${documentId} for user: ${uid}`);

    res.status(200).json({
      success: true,
      data: updatedDocument,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return sendError(res, 401, "Unauthorized", null, req);
    }
    return sendError(res, 500, "Internal server error", error.message, req);
  }
});

/**
 * Delete a document
 * DELETE /deleteDocument/{documentId}
 */
export const deleteDocument = onRequest({
  invoker: 'public'
}, async (req, res) => {
  try {
    setCorsHeaders(res, req);

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== "DELETE") {
      return sendError(res, 405, "Method not allowed", null, req);
    }

    // Verify authentication
    const uid = await verifyAuth(req);

    // Extract document ID from path
    const pathParts = req.path.split("/");
    const documentId = pathParts[pathParts.length - 1];

    if (!documentId) {
      return sendError(res, 400, "Document ID is required", null, req);
    }

    // Check if document exists and user owns it
    const docRef = db.collection("documents").doc(documentId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return sendError(res, 404, "Document not found", null, req);
    }

    const docData = docSnap.data();
    if (docData?.uid !== uid) {
      return sendError(res, 403, "Access denied", null, req);
    }

    // Delete related data in a batch
    const batch = db.batch();

    // Delete the document
    batch.delete(docRef);

    // Delete related suggestions
    const suggestionsQuery = db.collection("suggestions").where("docId", "==", documentId);
    const suggestionsSnapshot = await suggestionsQuery.get();
    suggestionsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete related metrics
    const metricsQuery = db.collection("metricSnapshots").where("docId", "==", documentId);
    const metricsSnapshot = await metricsQuery.get();
    metricsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    logger.info(`Document deleted: ${documentId} for user: ${uid}, with ${suggestionsSnapshot.size} suggestions and ${metricsSnapshot.size} metrics`);

    res.status(200).json({
      success: true,
      message: "Document deleted successfully",
      deletedRelatedData: {
        suggestions: suggestionsSnapshot.size,
        metrics: metricsSnapshot.size,
      },
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return sendError(res, 401, "Unauthorized", null, req);
    }
    return sendError(res, 500, "Internal server error", error.message, req);
  }
});

/**
 * Health check endpoint
 * GET /health
 */
export const health = onRequest({
  invoker: 'public'
}, async (req, res) => {
  setCorsHeaders(res, req);

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  res.status(200).json({
    success: true,
    message: "Document API is healthy",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Grammar and spelling check endpoint
 * POST /checkGrammar
 */
export const checkGrammar = onRequest({
  invoker: 'public',
  secrets: [openaiApiKey]
}, async (req, res) => {
  try {
    setCorsHeaders(res, req);

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== "POST") {
      return sendError(res, 405, "Method not allowed", null, req);
    }

    // Verify authentication
    const uid = await verifyAuth(req);

    // Validate request body
    const validationResult = grammarCheckSchema.safeParse(req.body);
    if (!validationResult.success) {
      return sendError(res, 400, "Invalid request data", validationResult.error.errors, req);
    }

    const { text, language, includeSpelling, includeGrammar, includeStyle, stream, enhancePassiveVoice } = validationResult.data;

    const startTime = Date.now();

    // Generate cache key based on text and options
    const cacheKey = generateTextHash(text, {
      language,
      includeSpelling,
      includeGrammar,
      includeStyle,
      enhancePassiveVoice
    });

    // Fetch user's personal dictionary
    const personalDictionary = await getUserPersonalDictionary(uid);

    // Check cache first
    const cachedResult = getCachedResult(cacheKey);
    if (cachedResult) {
      // Apply personal dictionary filter to cached results
      const filteredSuggestions = filterSuggestionsWithPersonalDictionary(cachedResult, personalDictionary);

      const response: GrammarCheckResponse = {
        suggestions: filteredSuggestions,
        processedText: text,
        cached: true,
        processingTimeMs: Date.now() - startTime
      };

      logger.info('Grammar check served from cache with personal dictionary filter', {
        uid,
        textLength: text.length,
        originalSuggestions: cachedResult.length,
        filteredSuggestions: filteredSuggestions.length,
        personalDictionarySize: personalDictionary.length,
        cacheKey: cacheKey.substring(0, 16) + '...'
      });

      res.status(200).json({
        success: true,
        data: response
      });
      return;
    }

    // Handle streaming response
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let suggestions: any[] = [];

      try {
        suggestions = await checkGrammarWithOpenAIStreaming(
          text,
          { includeSpelling, includeGrammar, includeStyle, enhancePassiveVoice },
          (chunk: string) => {
            // Send streaming chunks to client
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
          }
        );

        // Cache the result (unfiltered, so cache is user-agnostic)
        setCachedResult(cacheKey, suggestions);

        // Apply personal dictionary filter
        const originalSuggestionsCount = suggestions.length;
        suggestions = filterSuggestionsWithPersonalDictionary(suggestions, personalDictionary);

        // Send final result
        const response: GrammarCheckResponse = {
          suggestions,
          processedText: text,
          cached: false,
          processingTimeMs: Date.now() - startTime
        };

        res.write(`data: ${JSON.stringify({ type: 'complete', data: response })}\n\n`);
        res.end();

        logger.info('Streaming grammar check completed with personal dictionary filter', {
          uid,
          textLength: text.length,
          originalSuggestions: originalSuggestionsCount,
          filteredSuggestions: suggestions.length,
          personalDictionarySize: personalDictionary.length,
          processingTimeMs: Date.now() - startTime
        });

      } catch (error: any) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
        logger.error('Streaming grammar check failed:', error);
      }

      return;
    }

    // Handle regular (non-streaming) response
    try {
      let suggestions = await checkGrammarWithOpenAI(text, {
        includeSpelling,
        includeGrammar,
        includeStyle,
        enhancePassiveVoice
      });

      // Cache the result (unfiltered, so cache is user-agnostic)
      setCachedResult(cacheKey, suggestions);

      // Apply personal dictionary filter
      const originalSuggestionsCount = suggestions.length;
      suggestions = filterSuggestionsWithPersonalDictionary(suggestions, personalDictionary);

      const response: GrammarCheckResponse = {
        suggestions,
        processedText: text,
        cached: false,
        processingTimeMs: Date.now() - startTime
      };

      logger.info('Grammar check completed with personal dictionary filter', {
        uid,
        textLength: text.length,
        originalSuggestions: originalSuggestionsCount,
        filteredSuggestions: suggestions.length,
        personalDictionarySize: personalDictionary.length,
        processingTimeMs: Date.now() - startTime,
        cacheKey: cacheKey.substring(0, 16) + '...'
      });

      res.status(200).json({
        success: true,
        data: response
      });
      return;

    } catch (error: any) {
      logger.error('Grammar check failed:', error);

      // Handle specific OpenAI errors
      if (error.message.includes('authentication failed')) {
        return sendError(res, 401, "AI service authentication failed", null, req);
      } else if (error.message.includes('rate limit')) {
        return sendError(res, 429, "AI service rate limit exceeded", null, req);
      } else if (error.message.includes('API key not configured')) {
        return sendError(res, 500, "AI service not configured", null, req);
      }

      return sendError(res, 500, "Grammar check failed", error.message, req);
    }

  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return sendError(res, 401, "Unauthorized", null, req);
    }
    return sendError(res, 500, "Internal server error", error.message, req);
  }
});

// Passive Voice Enhancement Schema
const passiveVoiceEnhancementSchema = z.object({
  sentences: z.array(z.string()).min(1).max(10), // Max 10 sentences for performance
  language: z.string().optional().default('en'),
});

/**
 * Enhance passive voice sentences with active voice alternatives
 * Firebase Callable Function
 */
export const enhancePassiveVoice = onCall({
  secrets: [openaiApiKey]
}, async (request: any) => {
  try {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const uid = request.auth.uid;

    // Validate request data
    const validationResult = passiveVoiceEnhancementSchema.safeParse(request.data);
    if (!validationResult.success) {
      throw new HttpsError('invalid-argument', 'Invalid request data', validationResult.error.errors);
    }

    const { sentences } = validationResult.data;
    const startTime = Date.now();

    try {
      // Fetch user's personal dictionary
      const personalDictionary = await getUserPersonalDictionary(uid);

      // Process each sentence for passive voice enhancement
      const enhancedSentences = [];

      for (const sentence of sentences) {
        // Use the existing checkGrammarWithOpenAI function with passive voice enhancement
        let suggestions = await checkGrammarWithOpenAI(sentence, {
          includeSpelling: false,
          includeGrammar: false,
          includeStyle: false,
          enhancePassiveVoice: true
        });

        // Apply personal dictionary filter
        suggestions = filterSuggestionsWithPersonalDictionary(suggestions, personalDictionary);

        // Find passive voice suggestions
        const passiveSuggestions = suggestions.filter(s => s.type === 'passive');

        enhancedSentences.push({
          original: sentence,
          suggestions: passiveSuggestions,
          hasPassiveVoice: passiveSuggestions.length > 0
        });
      }

      const response = {
        sentences: enhancedSentences,
        processingTimeMs: Date.now() - startTime,
        totalSentences: sentences.length,
        passiveSentencesFound: enhancedSentences.filter(s => s.hasPassiveVoice).length
      };

      logger.info('Passive voice enhancement completed with personal dictionary filter', {
        uid,
        totalSentences: sentences.length,
        passiveSentencesFound: response.passiveSentencesFound,
        personalDictionarySize: personalDictionary.length,
        processingTimeMs: response.processingTimeMs
      });

      return {
        success: true,
        data: response
      };

    } catch (error: any) {
      logger.error('Passive voice enhancement failed:', error);

      // Handle specific OpenAI errors
      if (error.message.includes('authentication failed')) {
        throw new HttpsError('unauthenticated', 'AI service authentication failed');
      } else if (error.message.includes('rate limit')) {
        throw new HttpsError('resource-exhausted', 'AI service rate limit exceeded');
      }

      throw new HttpsError('internal', 'Passive voice enhancement failed', error.message);
    }

  } catch (error: any) {
    logger.error('Passive voice enhancement error:', error);
    throw new HttpsError('internal', 'Internal server error', error.message);
  }
});

/**
 * Verify if user is admin (checks admin field in users collection)
 */
async function verifyAdmin(req: any): Promise<string> {
  const uid = await verifyAuth(req);

  // Check admin field in users collection
  const userDoc = await admin.firestore().collection('users').doc(uid).get();

  if (!userDoc.exists) {
    throw new Error('FORBIDDEN');
  }

  const userData = userDoc.data();
  if (!userData?.admin) {
    throw new Error('FORBIDDEN');
  }

  return uid;
}

/**
 * Get feature flags (admin only)
 * GET /getFeatureFlags
 */
export const getFeatureFlags = onRequest({
  invoker: 'public'
}, async (req, res) => {
  try {
    setCorsHeaders(res, req);

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== "GET") {
      return sendError(res, 405, "Method not allowed", null, req);
    }

    // Verify admin authentication
    const uid = await verifyAdmin(req);

    // Get feature flags from Firestore
    const featureFlagsRef = db.collection('admin').doc('featureFlags');
    const doc = await featureFlagsRef.get();

    let featureFlags = {
      testRoutes: false,
      performanceMonitor: false
    };

    if (doc.exists) {
      const data = doc.data();
      featureFlags = { ...featureFlags, ...data };
    }

    // Note: Admin features are now allowed in production for admin users

    logger.info(`Feature flags retrieved by admin: ${uid}`);

    res.status(200).json({
      success: true,
      flags: featureFlags
    });

  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return sendError(res, 401, "Unauthorized", null, req);
    }
    if (error.message === "FORBIDDEN") {
      return sendError(res, 403, "Admin access required", null, req);
    }
    return sendError(res, 500, "Internal server error", error.message, req);
  }
});

/**
 * Update feature flags (admin only)
 * POST /updateFeatureFlags
 */
export const updateFeatureFlags = onRequest({
  invoker: 'public'
}, async (req, res) => {
  try {
    setCorsHeaders(res, req);

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== "POST") {
      return sendError(res, 405, "Method not allowed", null, req);
    }

    // Verify admin authentication
    const uid = await verifyAdmin(req);

    // Validate request body
    const { flags } = req.body;

    if (!flags || (typeof flags.testRoutes !== 'boolean' && typeof flags.performanceMonitor !== 'boolean')) {
      return sendError(res, 400, "Invalid request data - must include flags.testRoutes or flags.performanceMonitor", null, req);
    }

    // Note: Admin users can now toggle features in production

    // Update feature flags in Firestore
    const featureFlagsRef = db.collection('admin').doc('featureFlags');

    const updateData: any = {
      updatedAt: new Date(),
      updatedBy: uid
    };

    if (flags.testRoutes !== undefined) {
      updateData.testRoutes = flags.testRoutes;
    }

    if (flags.performanceMonitor !== undefined) {
      updateData.performanceMonitor = flags.performanceMonitor;
    }

    await featureFlagsRef.set(updateData, { merge: true });

    logger.info(`Feature flags updated by admin: ${uid}`, updateData);

    res.status(200).json({
      success: true,
      message: "Feature flags updated successfully",
      data: updateData
    });

  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return sendError(res, 401, "Unauthorized", null, req);
    }
    if (error.message === "FORBIDDEN") {
      return sendError(res, 403, "Admin access required", null, req);
    }
    return sendError(res, 500, "Internal server error", error.message, req);
  }
});

/**
 * Add a word to user's personal dictionary
 * POST /addDictionaryTerm
 */
export const addDictionaryTerm = onRequest({
  invoker: 'public'
}, async (req, res) => {
  try {
    setCorsHeaders(res, req);

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== "POST") {
      return sendError(res, 405, "Method not allowed", null, req);
    }

    // Verify authentication
    const uid = await verifyAuth(req);

    // Validate request body
    const validationResult = addDictionaryTermSchema.safeParse(req.body);
    if (!validationResult.success) {
      return sendError(res, 400, "Invalid request data", validationResult.error.errors, req);
    }

    const { word, category, notes } = validationResult.data;
    const normalizedWord = word.toLowerCase().trim();

    // Get user document
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Create user document if it doesn't exist
      await userRef.set({
        uid,
        dictionary: [],
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now()
      });
    }

    const userData = userDoc.data();
    const currentDictionary = userData?.dictionary || [];

    // Check if word already exists
    if (currentDictionary.includes(normalizedWord)) {
      return sendError(res, 409, "Word already exists in dictionary", null, req);
    }

    // Add word to dictionary array
    const updatedDictionary = [...currentDictionary, normalizedWord];

    await userRef.update({
      dictionary: updatedDictionary,
      updatedAt: admin.firestore.Timestamp.now()
    });

    logger.info(`Added word to personal dictionary: ${normalizedWord} for user: ${uid}`);

    res.status(201).json({
      success: true,
      data: {
        word: normalizedWord,
        category,
        notes,
        addedAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return sendError(res, 401, "Unauthorized", null, req);
    }
    return sendError(res, 500, "Internal server error", error.message, req);
  }
});

/**
 * Remove a word from user's personal dictionary
 * DELETE /removeDictionaryTerm
 */
export const removeDictionaryTerm = onRequest({
  invoker: 'public'
}, async (req, res) => {
  try {
    setCorsHeaders(res, req);

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== "DELETE") {
      return sendError(res, 405, "Method not allowed", null, req);
    }

    // Verify authentication
    const uid = await verifyAuth(req);

    // Validate request body
    const validationResult = removeDictionaryTermSchema.safeParse(req.body);
    if (!validationResult.success) {
      return sendError(res, 400, "Invalid request data", validationResult.error.errors, req);
    }

    const { word } = validationResult.data;
    const normalizedWord = word.toLowerCase().trim();

    // Get user document
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return sendError(res, 404, "User not found", null, req);
    }

    const userData = userDoc.data();
    const currentDictionary = userData?.dictionary || [];

    // Check if word exists
    if (!currentDictionary.includes(normalizedWord)) {
      return sendError(res, 404, "Word not found in dictionary", null, req);
    }

    // Remove word from dictionary array
    const updatedDictionary = currentDictionary.filter((w: string) => w !== normalizedWord);

    await userRef.update({
      dictionary: updatedDictionary,
      updatedAt: admin.firestore.Timestamp.now()
    });

    logger.info(`Removed word from personal dictionary: ${normalizedWord} for user: ${uid}`);

    res.status(200).json({
      success: true,
      message: "Word removed from dictionary",
      data: {
        word: normalizedWord,
        removedAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return sendError(res, 401, "Unauthorized", null, req);
    }
    return sendError(res, 500, "Internal server error", error.message, req);
  }
});

/**
 * Get user's personal dictionary
 * GET /getDictionary
 */
export const getDictionary = onRequest({
  invoker: 'public'
}, async (req, res) => {
  try {
    setCorsHeaders(res, req);

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== "GET") {
      return sendError(res, 405, "Method not allowed", null, req);
    }

    // Verify authentication
    const uid = await verifyAuth(req);

    // Get user document
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      res.status(200).json({
        success: true,
        data: {
          dictionary: [],
          totalWords: 0,
          lastUpdated: null
        }
      });
      return;
    }

    const userData = userDoc.data();
    const dictionary = userData?.dictionary || [];

    logger.info(`Retrieved personal dictionary for user: ${uid}, words: ${dictionary.length}`);

    res.status(200).json({
      success: true,
      data: {
        dictionary,
        totalWords: dictionary.length,
        lastUpdated: userData?.updatedAt?.toDate()?.toISOString() || null
      }
    });

  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return sendError(res, 401, "Unauthorized", null, req);
    }
    return sendError(res, 500, "Internal server error", error.message, req);
  }
});

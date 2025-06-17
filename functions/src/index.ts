/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { z } from "zod";

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

// Helper function to set CORS headers with restricted origins
function setCorsHeaders(res: any, req?: any) {
  // Define allowed origins for different environments
  const allowedOrigins = [
    'http://localhost:5173',           // Local development
    'https://wordwise-4234.web.app',  // Firebase Hosting
    'https://wordwise-4234.firebaseapp.com'  // Firebase Hosting alternative
  ];

  const origin = req?.headers?.origin;

  // Set origin if it's in the allowed list, otherwise use localhost for development
  if (origin && allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
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

    // Update document with new timestamp
    const updatePayload = {
      ...updateData,
      updatedAt: admin.firestore.Timestamp.now(),
    };

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

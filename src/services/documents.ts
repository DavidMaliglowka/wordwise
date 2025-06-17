import { auth } from '../lib/firebase';
import { Document, CreateDocumentData, UpdateDocumentData } from '../types/firestore';

// Individual function URLs from deployment
const FUNCTION_URLS = {
  createDocument: 'https://createdocument-mlvq44c2lq-uc.a.run.app',
  getDocuments: 'https://getdocuments-mlvq44c2lq-uc.a.run.app',
  updateDocument: 'https://updatedocument-mlvq44c2lq-uc.a.run.app',
  deleteDocument: 'https://deletedocument-mlvq44c2lq-uc.a.run.app',
  health: 'https://health-mlvq44c2lq-uc.a.run.app',
};

// Helper to get auth headers
async function getAuthHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }

  const token = await user.getIdToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// Helper for API calls
async function apiCall<T>(functionName: keyof typeof FUNCTION_URLS, path: string = '', options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const url = `${FUNCTION_URLS[functionName]}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return data;
}

export class DocumentService {
  /**
   * Create a new document
   */
  static async createDocument(documentData: CreateDocumentData): Promise<Document> {
    const response = await apiCall<{ success: boolean; data: Document }>('createDocument', '', {
      method: 'POST',
      body: JSON.stringify(documentData),
    });

    return response.data;
  }

  /**
   * Get all documents for the current user
   */
  static async getDocuments(): Promise<Document[]> {
    const response = await apiCall<{ success: boolean; data: Document[]; count: number }>('getDocuments');
    return response.data;
  }

  /**
   * Get a specific document by ID
   */
  static async getDocument(documentId: string): Promise<Document> {
    const response = await apiCall<{ success: boolean; data: Document }>('getDocuments', `?documentId=${documentId}`);
    return response.data;
  }

  /**
   * Update an existing document
   */
  static async updateDocument(documentId: string, updateData: UpdateDocumentData): Promise<Document> {
    const response = await apiCall<{ success: boolean; data: Document }>('updateDocument', `/${documentId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });

    return response.data;
  }

  /**
   * Delete a document
   */
  static async deleteDocument(documentId: string): Promise<{ success: boolean; message: string; deletedRelatedData: { suggestions: number; metrics: number } }> {
    const response = await apiCall<{ success: boolean; message: string; deletedRelatedData: { suggestions: number; metrics: number } }>('deleteDocument', `/${documentId}`, {
      method: 'DELETE',
    });

    return response;
  }

  /**
   * Check API health
   */
  static async healthCheck(): Promise<{ success: boolean; message: string; timestamp: string }> {
    const response = await apiCall<{ success: boolean; message: string; timestamp: string }>('health');
    return response;
  }
}

// Types are now imported from '../types/firestore'

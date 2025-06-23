// Personal Dictionary Service - IndexedDB Implementation
// Provides instant client-side storage for user-added terms

import { auth } from '../lib/firebase';

export interface PersonalDictionaryEntry {
  id: string;
  word: string;
  addedAt: Date;
  category?: 'technical' | 'domain' | 'name' | 'custom';
  notes?: string;
  userId?: string; // For future sync with server-side (Task 12)
}

export interface PersonalDictionaryStats {
  totalWords: number;
  categories: Record<string, number>;
  lastModified: Date;
  syncStatus: 'synced' | 'pending' | 'offline';
}

// Server-side API endpoints
interface ServerDictionaryResponse {
  success: boolean;
  data: {
    dictionary: string[];
    totalWords: number;
    lastUpdated: string | null;
  };
}

interface ServerAddResponse {
  success: boolean;
  data: {
    word: string;
    category?: string;
    notes?: string;
    addedAt: string;
  };
}

interface ServerRemoveResponse {
  success: boolean;
  message: string;
  data: {
    word: string;
    removedAt: string;
  };
}

class PersonalDictionaryService {
  private dbName = 'wordwise-personal-dictionary';
  private dbVersion = 1;
  private storeName = 'dictionary-entries';
  private db: IDBDatabase | null = null;
  private cache = new Set<string>(); // In-memory cache for fast lookups
  private isInitialized = false;
  private syncInProgress = false;

  // Cloud Functions base URLs
  private readonly baseUrl = 'https://us-central1-wordwise-4234.cloudfunctions.net';

  // Initialize the IndexedDB database
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.isInitialized = true;
        this.loadCacheFromDB().then(() => {
          // Auto-sync on initialization if user is authenticated
          if (auth.currentUser) {
            this.syncFromServer().catch(console.warn);
          }
          resolve();
        });
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store for dictionary entries
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });

          // Create indexes for efficient querying
          store.createIndex('word', 'word', { unique: true });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('addedAt', 'addedAt', { unique: false });
          store.createIndex('userId', 'userId', { unique: false });
        }
      };
    });
  }

  // Get authentication token for API calls
  private async getAuthToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return await user.getIdToken();
  }

  // Make authenticated request to Cloud Functions
  private async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAuthToken();

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  // Sync local dictionary with server
  async syncFromServer(): Promise<void> {
    if (this.syncInProgress || !auth.currentUser) return;

    try {
      this.syncInProgress = true;
      console.log('🔄 Syncing personal dictionary from server...');

      const response = await this.makeAuthenticatedRequest(`${this.baseUrl}/getDictionary`);
      const serverData: ServerDictionaryResponse = await response.json();

      if (serverData.success && serverData.data.dictionary) {
        // Clear local database and rebuild from server data
        await this.clear();

        for (const word of serverData.data.dictionary) {
          await this.addWordLocal({
            id: `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            word: word.toLowerCase(),
            addedAt: new Date(),
            category: 'custom',
            userId: auth.currentUser?.uid
          });
        }

        console.log(`✅ Synced ${serverData.data.dictionary.length} words from server`);
      }
    } catch (error) {
      console.warn('⚠️ Failed to sync from server:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  // Sync local changes to server
  async syncToServer(word: string, action: 'add' | 'remove'): Promise<void> {
    if (!auth.currentUser) return;

    try {
      if (action === 'add') {
        await this.makeAuthenticatedRequest(`${this.baseUrl}/addDictionaryTerm`, {
          method: 'POST',
          body: JSON.stringify({
            word,
            category: 'custom'
          })
        });
      } else if (action === 'remove') {
        await this.makeAuthenticatedRequest(`${this.baseUrl}/removeDictionaryTerm`, {
          method: 'DELETE',
          body: JSON.stringify({ word })
        });
      }

      console.log(`✅ Synced "${word}" ${action} to server`);
    } catch (error) {
      console.warn(`⚠️ Failed to sync "${word}" ${action} to server:`, error);
      // Don't throw - allow local operations to continue even if server sync fails
    }
  }

  // Load all words into memory cache for fast lookups
  private async loadCacheFromDB(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        this.cache.clear();
        const entries: PersonalDictionaryEntry[] = request.result;
        entries.forEach(entry => {
          this.cache.add(entry.word.toLowerCase());
        });
        console.log(`Personal dictionary loaded: ${this.cache.size} words`);
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to load dictionary cache'));
      };
    });
  }

  // Normalize apostrophes and quotes in text
  private normalizeApostrophes(text: string): string {
    return text
      .replace(/['']/g, "'") // Convert smart quotes to straight apostrophes
      .replace(/[""]/g, '"') // Convert smart quotes to straight quotes
      .replace(/[–—]/g, '-'); // Convert em/en dashes to hyphens
  }

  // Extract base word from possessive or contracted forms
  private extractBaseWord(word: string): string {
    const normalized = this.normalizeApostrophes(word.toLowerCase().trim());

    // Handle possessives: "word's" -> "word"
    if (normalized.endsWith("'s") || normalized.endsWith("'")) {
      return normalized.replace(/'s?$/, '');
    }

    // Handle contractions: "don't" -> ["don", "t"], "we'll" -> ["we", "ll"]
    // For now, just return the original word for contractions
    return normalized;
  }

  // Check if a word exists in the personal dictionary (instant lookup, handles apostrophes)
  hasWord(word: string): boolean {
    const normalizedWord = this.normalizeApostrophes(word.toLowerCase().trim());
    const baseWord = this.extractBaseWord(word);

    // Check both the full word and the base word
    return this.cache.has(normalizedWord) || this.cache.has(baseWord);
  }

  // Add a word locally to IndexedDB
  private async addWordLocal(entry: PersonalDictionaryEntry): Promise<PersonalDictionaryEntry> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(entry);

      request.onsuccess = () => {
        this.cache.add(entry.word.toLowerCase());
        resolve(entry);
      };

      request.onerror = () => {
        reject(new Error('Failed to add word to local database'));
      };
    });
  }

  // Add a word to the personal dictionary (with server sync)
  async addWord(
    word: string,
    options: {
      category?: PersonalDictionaryEntry['category'];
      notes?: string;
      userId?: string;
    } = {}
  ): Promise<PersonalDictionaryEntry> {
    await this.initialize();

    // Normalize apostrophes and convert to lowercase
    const normalizedWord = this.normalizeApostrophes(word.toLowerCase().trim());

    if (!normalizedWord) {
      throw new Error('Word cannot be empty');
    }

    if (this.hasWord(normalizedWord)) {
      throw new Error('Word already exists in dictionary');
    }

    const entry: PersonalDictionaryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      word: normalizedWord,
      addedAt: new Date(),
      category: options.category || 'custom',
      notes: options.notes,
      userId: options.userId || auth.currentUser?.uid
    };

    // Add to local database first
    const result = await this.addWordLocal(entry);

    // Then sync to server (non-blocking)
    this.syncToServer(normalizedWord, 'add').catch(console.warn);

    console.log(`Added word to personal dictionary: "${normalizedWord}"`);
    return result;
  }

  // Remove a word from the personal dictionary (with server sync)
  async removeWord(word: string): Promise<boolean> {
    await this.initialize();

    const normalizedWord = word.toLowerCase().trim();

    if (!this.hasWord(normalizedWord)) {
      return false; // Word doesn't exist
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('word');
      const request = index.getKey(normalizedWord);

      request.onsuccess = () => {
        if (request.result) {
          const deleteRequest = store.delete(request.result);
          deleteRequest.onsuccess = () => {
            this.cache.delete(normalizedWord);

            // Sync to server (non-blocking)
            this.syncToServer(normalizedWord, 'remove').catch(console.warn);

            console.log(`Removed word from personal dictionary: "${normalizedWord}"`);
            resolve(true);
          };
          deleteRequest.onerror = () => reject(new Error('Failed to delete word'));
        } else {
          resolve(false);
        }
      };

      request.onerror = () => {
        reject(new Error('Failed to find word for deletion'));
      };
    });
  }

  // Get all words in the dictionary
  async getAllWords(): Promise<PersonalDictionaryEntry[]> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error('Failed to retrieve dictionary entries'));
      };
    });
  }

  // Get words by category
  async getWordsByCategory(category: PersonalDictionaryEntry['category']): Promise<PersonalDictionaryEntry[]> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('category');
      const request = index.getAll(category);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error('Failed to retrieve words by category'));
      };
    });
  }

  // Get dictionary statistics
  async getStats(): Promise<PersonalDictionaryStats> {
    const entries = await this.getAllWords();

    const categories: Record<string, number> = {};
    let lastModified = new Date(0);

    entries.forEach(entry => {
      const category = entry.category || 'custom';
      categories[category] = (categories[category] || 0) + 1;

      if (entry.addedAt > lastModified) {
        lastModified = entry.addedAt;
      }
    });

    return {
      totalWords: entries.length,
      categories,
      lastModified,
      syncStatus: 'offline' // Will be updated when Task 12 integration is complete
    };
  }

  // Clear all entries (useful for testing or reset)
  async clear(): Promise<void> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onsuccess = () => {
        this.cache.clear();
        console.log('Personal dictionary cleared');
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to clear dictionary'));
      };
    });
  }

  // Import words from an array (useful for sync with server-side Task 12)
  async importWords(words: string[], category: PersonalDictionaryEntry['category'] = 'custom'): Promise<number> {
    let imported = 0;

    for (const word of words) {
      try {
        await this.addWord(word, { category });
        imported++;
      } catch (error) {
        // Skip words that already exist or are invalid
        console.warn(`Skipped importing word: "${word}"`, error);
      }
    }

    return imported;
  }

  // Export words as array (useful for sync with server-side Task 12)
  async exportWords(): Promise<string[]> {
    const entries = await this.getAllWords();
    return entries.map(entry => entry.word);
  }

  // Get the cache size for performance monitoring
  getCacheSize(): number {
    return this.cache.size;
  }

  // Check if the service is ready
  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }

  // Manual sync trigger for UI
  async manualSync(): Promise<{ success: boolean; message: string; wordsCount?: number }> {
    if (!auth.currentUser) {
      return { success: false, message: 'User not authenticated' };
    }

    if (this.syncInProgress) {
      return { success: false, message: 'Sync already in progress' };
    }

    try {
      await this.syncFromServer();
      return {
        success: true,
        message: 'Dictionary synced successfully',
        wordsCount: this.cache.size
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Sync failed'
      };
    }
  }

  // Get sync status for UI indicators
  getSyncStatus(): PersonalDictionaryStats['syncStatus'] {
    if (!auth.currentUser) return 'offline';
    if (this.syncInProgress) return 'pending';
    return 'synced'; // Assume synced if no sync in progress and user authenticated
  }

  // Check if user is authenticated for server features
  isUserAuthenticated(): boolean {
    return !!auth.currentUser;
  }

  // Periodic background sync (optional enhancement)
  private syncInterval: NodeJS.Timeout | null = null;

  // Start periodic background sync (every 5 minutes when user is authenticated)
  startPeriodicSync(intervalMinutes: number = 5): void {
    this.stopPeriodicSync(); // Clear any existing interval

    if (!this.isUserAuthenticated()) {
      console.log('⚠️ Cannot start periodic sync - user not authenticated');
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;

    this.syncInterval = setInterval(async () => {
      if (this.isUserAuthenticated() && !this.syncInProgress) {
        console.log(`🔄 Periodic sync starting (every ${intervalMinutes} minutes)`);
        try {
          await this.syncFromServer();
          console.log('✅ Periodic sync completed successfully');
        } catch (error) {
          console.warn('⚠️ Periodic sync failed:', error);
        }
      }
    }, intervalMs);

    console.log(`🔄 Periodic sync started (every ${intervalMinutes} minutes)`);
  }

  // Stop periodic background sync
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('⏹️ Periodic sync stopped');
    }
  }

  // Enhanced cleanup method
  cleanup(): void {
    this.stopPeriodicSync();
    this.cache.clear();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.isInitialized = false;
  }
}

// Export singleton instance
export const personalDictionary = new PersonalDictionaryService();

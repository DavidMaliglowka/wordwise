// Personal Dictionary Service - IndexedDB Implementation
// Provides instant client-side storage for user-added terms

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

class PersonalDictionaryService {
  private dbName = 'wordwise-personal-dictionary';
  private dbVersion = 1;
  private storeName = 'dictionary-entries';
  private db: IDBDatabase | null = null;
  private cache = new Set<string>(); // In-memory cache for fast lookups
  private isInitialized = false;

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
        this.loadCacheFromDB().then(() => resolve());
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

  // Check if a word exists in the personal dictionary (instant lookup)
  hasWord(word: string): boolean {
    return this.cache.has(word.toLowerCase());
  }

  // Add a word to the personal dictionary
  async addWord(
    word: string,
    options: {
      category?: PersonalDictionaryEntry['category'];
      notes?: string;
      userId?: string;
    } = {}
  ): Promise<PersonalDictionaryEntry> {
    await this.initialize();

    const normalizedWord = word.toLowerCase().trim();

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
      userId: options.userId
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(entry);

      request.onsuccess = () => {
        this.cache.add(normalizedWord);
        console.log(`Added word to personal dictionary: "${normalizedWord}"`);
        resolve(entry);
      };

      request.onerror = () => {
        reject(new Error('Failed to add word to dictionary'));
      };
    });
  }

  // Remove a word from the personal dictionary
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
}

// Export singleton instance
export const personalDictionary = new PersonalDictionaryService();

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  WriteBatch,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  User,
  BrandProfile,
  Document,
  Suggestion,
  MetricSnapshot,
  COLLECTIONS,
  UserSettings,
  DocumentGoals
} from '../types/firestore';

// User Service
export class UserService {
  static async createUser(userData: Omit<User, 'createdAt' | 'updatedAt'>): Promise<void> {
    const now = Timestamp.now();
    const userRef = doc(db, COLLECTIONS.USERS, userData.uid);

    await setDoc(userRef, {
      ...userData,
      createdAt: now,
      updatedAt: now
    });
  }

  static async getUser(uid: string): Promise<User | null> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return userSnap.data() as User;
    }
    return null;
  }

  static async updateUser(uid: string, updates: Partial<User>): Promise<void> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    await updateDoc(userRef, {
      ...updates,
      updatedAt: Timestamp.now()
    });
  }

  static async updateUserSettings(uid: string, settings: Partial<UserSettings>): Promise<void> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    await updateDoc(userRef, {
      settings,
      updatedAt: Timestamp.now()
    });
  }

  static async addToDictionary(uid: string, word: string): Promise<void> {
    const user = await this.getUser(uid);
    if (user && !user.dictionary.includes(word)) {
      const updatedDictionary = [...user.dictionary, word];
      await this.updateUser(uid, { dictionary: updatedDictionary });
    }
  }

  static async removeFromDictionary(uid: string, word: string): Promise<void> {
    const user = await this.getUser(uid);
    if (user) {
      const updatedDictionary = user.dictionary.filter(w => w !== word);
      await this.updateUser(uid, { dictionary: updatedDictionary });
    }
  }
}

// Brand Profile Service
export class BrandProfileService {
  static async createBrandProfile(profile: Omit<BrandProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = Timestamp.now();
    const profileRef = await addDoc(collection(db, COLLECTIONS.BRAND_PROFILES), {
      ...profile,
      createdAt: now,
      updatedAt: now
    });
    return profileRef.id;
  }

  static async getBrandProfile(id: string): Promise<BrandProfile | null> {
    const profileRef = doc(db, COLLECTIONS.BRAND_PROFILES, id);
    const profileSnap = await getDoc(profileRef);

    if (profileSnap.exists()) {
      return { id: profileSnap.id, ...profileSnap.data() } as BrandProfile;
    }
    return null;
  }

  static async getUserBrandProfiles(uid: string): Promise<BrandProfile[]> {
    const q = query(
      collection(db, COLLECTIONS.BRAND_PROFILES),
      where('uid', '==', uid),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as BrandProfile));
  }

  static async updateBrandProfile(id: string, updates: Partial<BrandProfile>): Promise<void> {
    const profileRef = doc(db, COLLECTIONS.BRAND_PROFILES, id);
    await updateDoc(profileRef, {
      ...updates,
      updatedAt: Timestamp.now()
    });
  }

  static async deleteBrandProfile(id: string): Promise<void> {
    const profileRef = doc(db, COLLECTIONS.BRAND_PROFILES, id);
    await deleteDoc(profileRef);
  }
}

// Document Service
export class DocumentService {
  static async createDocument(document: Omit<Document, 'id' | 'createdAt' | 'updatedAt' | 'lastAccessedAt'>): Promise<string> {
    const now = Timestamp.now();
    const docRef = await addDoc(collection(db, COLLECTIONS.DOCUMENTS), {
      ...document,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now
    });
    return docRef.id;
  }

  static async getDocument(id: string): Promise<Document | null> {
    const docRef = doc(db, COLLECTIONS.DOCUMENTS, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      // Update last accessed time
      await updateDoc(docRef, { lastAccessedAt: Timestamp.now() });

      return { id: docSnap.id, ...docSnap.data() } as Document;
    }
    return null;
  }

  static async getUserDocuments(uid: string, limitCount: number = 50): Promise<Document[]> {
    const q = query(
      collection(db, COLLECTIONS.DOCUMENTS),
      where('uid', '==', uid),
      orderBy('updatedAt', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Document));
  }

  static async updateDocument(id: string, updates: Partial<Document>): Promise<void> {
    const docRef = doc(db, COLLECTIONS.DOCUMENTS, id);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: Timestamp.now(),
      lastAccessedAt: Timestamp.now()
    });
  }

  static async updateDocumentGoals(id: string, goals: DocumentGoals): Promise<void> {
    await this.updateDocument(id, { goals });
  }

  static async deleteDocument(id: string): Promise<void> {
    const batch = writeBatch(db);

    // Delete the document
    const docRef = doc(db, COLLECTIONS.DOCUMENTS, id);
    batch.delete(docRef);

    // Delete all suggestions for this document
    const suggestionsQuery = query(
      collection(db, COLLECTIONS.SUGGESTIONS),
      where('docId', '==', id)
    );
    const suggestions = await getDocs(suggestionsQuery);
    suggestions.forEach(suggestion => {
      batch.delete(suggestion.ref);
    });

    // Delete all metric snapshots for this document
    const metricsQuery = query(
      collection(db, COLLECTIONS.METRIC_SNAPSHOTS),
      where('docId', '==', id)
    );
    const metrics = await getDocs(metricsQuery);
    metrics.forEach(metric => {
      batch.delete(metric.ref);
    });

    await batch.commit();
  }
}

// Suggestion Service
export class SuggestionService {
  static async createSuggestion(suggestion: Omit<Suggestion, 'id' | 'createdAt'>): Promise<string> {
    const suggestionRef = await addDoc(collection(db, COLLECTIONS.SUGGESTIONS), {
      ...suggestion,
      createdAt: Timestamp.now()
    });
    return suggestionRef.id;
  }

  static async getDocumentSuggestions(docId: string): Promise<Suggestion[]> {
    const q = query(
      collection(db, COLLECTIONS.SUGGESTIONS),
      where('docId', '==', docId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Suggestion));
  }

  static async updateSuggestionStatus(id: string, status: 'accepted' | 'dismissed'): Promise<void> {
    const suggestionRef = doc(db, COLLECTIONS.SUGGESTIONS, id);
    await updateDoc(suggestionRef, { status });
  }

  static async bulkCreateSuggestions(suggestions: Omit<Suggestion, 'id' | 'createdAt'>[]): Promise<void> {
    const batch = writeBatch(db);
    const now = Timestamp.now();

    suggestions.forEach(suggestion => {
      const suggestionRef = doc(collection(db, COLLECTIONS.SUGGESTIONS));
      batch.set(suggestionRef, {
        ...suggestion,
        createdAt: now
      });
    });

    await batch.commit();
  }
}

// Metric Snapshot Service
export class MetricSnapshotService {
  static async createSnapshot(snapshot: Omit<MetricSnapshot, 'id' | 'capturedAt'>): Promise<string> {
    const snapshotRef = await addDoc(collection(db, COLLECTIONS.METRIC_SNAPSHOTS), {
      ...snapshot,
      capturedAt: Timestamp.now()
    });
    return snapshotRef.id;
  }

  static async getLatestSnapshot(docId: string): Promise<MetricSnapshot | null> {
    const q = query(
      collection(db, COLLECTIONS.METRIC_SNAPSHOTS),
      where('docId', '==', docId),
      orderBy('capturedAt', 'desc'),
      limit(1)
    );

    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { id: doc.id, ...doc.data() } as MetricSnapshot;
    }
    return null;
  }

  static async getDocumentMetricHistory(docId: string, limitCount: number = 10): Promise<MetricSnapshot[]> {
    const q = query(
      collection(db, COLLECTIONS.METRIC_SNAPSHOTS),
      where('docId', '==', docId),
      orderBy('capturedAt', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as MetricSnapshot));
  }
}

// Export all services
export const FirestoreService = {
  User: UserService,
  BrandProfile: BrandProfileService,
  Document: DocumentService,
  Suggestion: SuggestionService,
  MetricSnapshot: MetricSnapshotService
};

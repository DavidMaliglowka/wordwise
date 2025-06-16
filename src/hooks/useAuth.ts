import { useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  GoogleAuthProvider,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { FirestoreService } from '../services/firestore';
import { User, UserSettings } from '../types/firestore';

export interface AuthError {
  code: string;
  message: string;
}

export interface AuthState {
  user: FirebaseUser | null;
  userProfile: User | null;
  loading: boolean;
  error: AuthError | null;
}

export interface UseAuthReturn extends AuthState {
  signUp: (email: string, password: string, displayName?: string) => Promise<FirebaseUser>;
  signIn: (email: string, password: string) => Promise<FirebaseUser>;
  signInWithGoogle: () => Promise<FirebaseUser>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
  updateUserProfile: (updates: Partial<User>) => Promise<void>;
}

const googleProvider = new GoogleAuthProvider();

// Default user settings
const defaultUserSettings: UserSettings = {
  language: 'en',
  autoSave: true,
  showMetrics: true,
  defaultContentType: 'general',
  notifications: {
    email: true,
    inApp: true
  }
};

export const useAuth = (): UseAuthReturn => {
  const [state, setState] = useState<AuthState>({
    user: null,
    userProfile: null,
    loading: true,
    error: null
  });

  // Helper function to create or get user profile
  const createOrGetUserProfile = async (firebaseUser: FirebaseUser): Promise<User> => {
    try {
      // Try to get existing user profile
      let userProfile = await FirestoreService.User.getUser(firebaseUser.uid);

      if (!userProfile) {
        // Create new user profile if it doesn't exist
        const newUserData: Omit<User, 'createdAt' | 'updatedAt'> = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || '',
          tier: 'free',
          settings: defaultUserSettings,
          dictionary: []
        };

        await FirestoreService.User.createUser(newUserData);

        // Get the newly created profile
        userProfile = await FirestoreService.User.getUser(firebaseUser.uid);

        if (!userProfile) {
          throw new Error('Failed to create user profile');
        }
      }

      return userProfile;
    } catch (error) {
      console.error('Error creating/getting user profile:', error);
      throw error;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setState(prev => ({ ...prev, loading: true, error: null }));

      try {
        if (firebaseUser) {
          // User is signed in, get or create their profile
          const userProfile = await createOrGetUserProfile(firebaseUser);

          setState({
            user: firebaseUser,
            userProfile,
            loading: false,
            error: null
          });
        } else {
          // User is signed out
          setState({
            user: null,
            userProfile: null,
            loading: false,
            error: null
          });
        }
      } catch (error) {
        console.error('Auth state change error:', error);
        setState({
          user: null,
          userProfile: null,
          loading: false,
          error: {
            code: 'profile-error',
            message: 'Failed to load user profile'
          }
        });
      }
    });

    return () => unsubscribe();
  }, []);

    const signUp = async (email: string, password: string, displayName?: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      // If displayName is provided, update the Firebase user profile
      if (displayName && userCredential.user) {
        const { updateProfile } = await import('firebase/auth');
        await updateProfile(userCredential.user, { displayName });
      }

      // The user profile will be created automatically by the onAuthStateChanged listener
      return userCredential.user;
    } catch (error: any) {
      const authError: AuthError = {
        code: error.code,
        message: error.message
      };
      setState(prev => ({ ...prev, loading: false, error: authError }));
      throw authError;
    }
  };

  const signIn = async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // The user profile will be loaded automatically by the onAuthStateChanged listener
      return userCredential.user;
    } catch (error: any) {
      const authError: AuthError = {
        code: error.code,
        message: error.message
      };
      setState(prev => ({ ...prev, loading: false, error: authError }));
      throw authError;
    }
  };

  const signInWithGoogle = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      // The user profile will be created/loaded automatically by the onAuthStateChanged listener
      return userCredential.user;
    } catch (error: any) {
      const authError: AuthError = {
        code: error.code,
        message: error.message
      };
      setState(prev => ({ ...prev, loading: false, error: authError }));
      throw authError;
    }
  };

  const signOut = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      await firebaseSignOut(auth);
      // The user state will be cleared automatically by the onAuthStateChanged listener
    } catch (error: any) {
      const authError: AuthError = {
        code: error.code,
        message: error.message
      };
      setState(prev => ({ ...prev, loading: false, error: authError }));
      throw authError;
    }
  };

  const resetPassword = async (email: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      const authError: AuthError = {
        code: error.code,
        message: error.message
      };
      setState(prev => ({ ...prev, loading: false, error: authError }));
      throw authError;
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  };

  const clearError = () => {
    setState(prev => ({ ...prev, error: null }));
  };

  const updateUserProfile = async (updates: Partial<User>) => {
    if (!state.user) {
      throw new Error('No authenticated user');
    }

    try {
      await FirestoreService.User.updateUser(state.user.uid, updates);

      // Update local state
      setState(prev => ({
        ...prev,
        userProfile: prev.userProfile ? { ...prev.userProfile, ...updates } : null
      }));
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  };

  return {
    ...state,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    clearError,
    updateUserProfile
  };
};

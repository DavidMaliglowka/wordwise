// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "***REMOVED***",
  authDomain: "wordwise-4234.firebaseapp.com",
  projectId: "wordwise-4234",
  storageBucket: "wordwise-4234.firebasestorage.app",
  messagingSenderId: "286451561404",
  appId: "1:286451561404:web:3ea727f6c30dacd879b1b9"
};



// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Initialize Analytics (only in browser environment)
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;

// Export the app instance
export default app;
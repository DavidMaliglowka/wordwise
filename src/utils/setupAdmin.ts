import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Utility function to set up admin user in Firestore
 * Call this from browser console in production to set admin status
 */
export const setupAdminUser = async (uid: string, email: string) => {
  try {
    console.log(`Setting up admin user: ${email} (${uid})`);

    // Check if user document exists
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      console.log('User document exists:', userDoc.data());
    } else {
      console.log('User document does not exist, creating...');
    }

    // Set admin status
    await setDoc(userDocRef, {
      email: email,
      admin: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });

    console.log('✅ Admin user setup complete!');

    // Verify the setup
    const updatedDoc = await getDoc(userDocRef);
    console.log('Verified admin status:', updatedDoc.data());

    return true;
  } catch (error) {
    console.error('❌ Error setting up admin user:', error);
    return false;
  }
};

// Make it available globally for console access
if (typeof window !== 'undefined') {
  (window as any).setupAdminUser = setupAdminUser;
}

import React, { useState, useEffect } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { FeatureFlagService } from '../../services/feature-flags';

const AdminDebug: React.FC = () => {
  const { user } = useAuthContext();
  const [userDoc, setUserDoc] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Check if user document exists
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setUserDoc(data);
          console.log('User document data:', data);
        } else {
          console.log('User document does not exist');
          setUserDoc(null);
        }

        // Check admin status
        const adminStatus = await FeatureFlagService.isAdmin(user);
        setIsAdmin(adminStatus);
        console.log('Admin status:', adminStatus);
      } catch (error) {
        console.error('Error checking user:', error);
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, [user]);

  const createAdminUser = async () => {
    if (!user) return;

    setCreating(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        email: user.email,
        admin: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { merge: true });

      console.log('Admin user document created!');

      // Refresh the data
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        setUserDoc(userDocSnap.data());
      }

      const adminStatus = await FeatureFlagService.isAdmin(user);
      setIsAdmin(adminStatus);
    } catch (error) {
      console.error('Error creating admin user:', error);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!user) {
    return <div className="p-4">Not authenticated</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h1 className="text-2xl font-bold mb-6">Admin Debug Panel</h1>

      <div className="space-y-4">
        <div className="p-4 bg-gray-50 rounded">
          <h3 className="font-semibold mb-2">User Info</h3>
          <p><strong>UID:</strong> {user.uid}</p>
          <p><strong>Email:</strong> {user.email}</p>
        </div>

        <div className="p-4 bg-gray-50 rounded">
          <h3 className="font-semibold mb-2">User Document in Firestore</h3>
          {userDoc ? (
            <div>
              <p className="text-green-600 mb-2">✅ Document exists</p>
              <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto">
                {JSON.stringify(userDoc, null, 2)}
              </pre>
            </div>
          ) : (
            <div>
              <p className="text-red-600 mb-2">❌ Document does not exist</p>
              <button
                onClick={createAdminUser}
                disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Admin User Document'}
              </button>
            </div>
          )}
        </div>

        <div className="p-4 bg-gray-50 rounded">
          <h3 className="font-semibold mb-2">Admin Status</h3>
          <p className={isAdmin ? 'text-green-600' : 'text-red-600'}>
            {isAdmin ? '✅ Is Admin' : '❌ Not Admin'}
          </p>
        </div>

        {userDoc && !userDoc.admin && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-yellow-800 mb-2">⚠️ User document exists but admin field is missing or false</p>
            <button
              onClick={createAdminUser}
              disabled={creating}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
            >
              {creating ? 'Setting Admin...' : 'Set Admin = true'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDebug;

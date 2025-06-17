import React, { useState, useEffect } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { FirestoreService } from '../../services/firestore';
import { Document, BrandProfile } from '../../types/firestore';

export const FirestoreTest: React.FC = () => {
  const { user, userProfile } = useAuthContext();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const addTestResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const runSimpleTests = async () => {
    if (!user || !userProfile) {
      addTestResult('❌ No authenticated user');
      return;
    }

    setIsLoading(true);
    addTestResult('🚀 Running simple tests (no indexes required)...');

    try {
      // Test 1: Create a test document
      addTestResult('📄 Creating test document...');
      const docId = await FirestoreService.Document.createDocument({
        uid: user.uid,
        title: 'Simple Test Document',
        content: 'Testing basic Firestore operations without composite indexes.',
        contentType: 'other',
        status: 'draft'
      });
      addTestResult(`✅ Document created with ID: ${docId}`);

      // Test 2: Get the document by ID
      addTestResult('📖 Fetching document by ID...');
      const doc = await FirestoreService.Document.getDocument(docId);
      if (doc) {
        addTestResult(`✅ Retrieved document: "${doc.title}"`);
      }

      // Test 3: Update the document
      addTestResult('✏️ Updating document...');
      await FirestoreService.Document.updateDocument(docId, {
        content: 'Updated content - basic operations working!'
      });
      addTestResult(`✅ Document updated successfully`);

      // Test 4: Test user profile operations
      addTestResult('👤 Testing user dictionary...');
      await FirestoreService.User.addToDictionary(user.uid, 'TestWord');
      addTestResult('✅ Added word to dictionary');

      addTestResult('🎉 Simple tests completed! Basic Firestore operations working.');

    } catch (error) {
      console.error('Simple test error:', error);
      addTestResult(`❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const runFirestoreTests = async () => {
    if (!user || !userProfile) {
      addTestResult('❌ No authenticated user');
      return;
    }

    setIsLoading(true);
    addTestResult('🚀 Starting Firestore tests...');

    try {
      // Test 1: Create a test document
      addTestResult('📄 Creating test document...');
      const docId = await FirestoreService.Document.createDocument({
        uid: user.uid,
        title: 'Test Document',
        content: 'This is a test document to verify Firestore is working correctly.',
        contentType: 'other',
        status: 'draft'
      });
      addTestResult(`✅ Document created with ID: ${docId}`);

      // Test 2: Create a test brand profile
      addTestResult('🎨 Creating test brand profile...');
      const profileId = await FirestoreService.BrandProfile.createBrandProfile({
        uid: user.uid,
        name: 'Test Brand',
        styleGuide: {
          tone: 'professional',
          voice: 'first-person',
          vocabulary: ['innovative', 'reliable'],
          avoidWords: ['cheap', 'basic'],
          guidelines: 'Maintain a professional yet approachable tone.'
        },
        samples: []
      });
      addTestResult(`✅ Brand profile created with ID: ${profileId}`);

      // Test 3: Get user documents
      addTestResult('📋 Fetching user documents...');
      const userDocs = await FirestoreService.Document.getUserDocuments(user.uid);
      setDocuments(userDocs.documents);
      addTestResult(`✅ Retrieved ${userDocs.documents.length} documents`);

      // Test 4: Get user brand profiles
      addTestResult('🎨 Fetching user brand profiles...');
      const userProfiles = await FirestoreService.BrandProfile.getUserBrandProfiles(user.uid);
      setBrandProfiles(userProfiles);
      addTestResult(`✅ Retrieved ${userProfiles.length} brand profiles`);

      // Test 5: Update document
      addTestResult('✏️ Updating test document...');
      await FirestoreService.Document.updateDocument(docId, {
        content: 'This document has been updated successfully!'
      });
      addTestResult(`✅ Document ${docId} updated`);

      // Test 6: Test user profile operations
      addTestResult('👤 Testing user profile operations...');
      await FirestoreService.User.addToDictionary(user.uid, 'WordWise');
      await FirestoreService.User.addToDictionary(user.uid, 'AI-powered');
      addTestResult('✅ Added words to user dictionary');

      addTestResult('🎉 All Firestore tests completed successfully!');

    } catch (error) {
      console.error('Firestore test error:', error);
      addTestResult(`❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const clearTests = () => {
    setTestResults([]);
    setDocuments([]);
    setBrandProfiles([]);
  };

  if (!user) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800">Please sign in to test Firestore functionality.</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">🔥 Firestore Integration Test</h2>

      <div className="mb-6">
        <p className="text-gray-600 mb-2">
          <strong>User:</strong> {userProfile?.displayName || userProfile?.email} ({userProfile?.tier})
        </p>
        <p className="text-gray-600">
          <strong>UID:</strong> {user.uid}
        </p>
      </div>

      <div className="flex gap-4 mb-6 flex-wrap">
        <button
          onClick={runSimpleTests}
          disabled={isLoading}
          className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Running...' : 'Run Simple Tests'}
        </button>
        <button
          onClick={runFirestoreTests}
          disabled={isLoading}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Running Tests...' : 'Run Full Tests (Needs Indexes)'}
        </button>
        <button
          onClick={clearTests}
          className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
        >
          Clear Results
        </button>
      </div>

      {testResults.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Test Results:</h3>
          <div className="bg-gray-50 border rounded-lg p-4 h-80 overflow-y-auto">
            {testResults.map((result, index) => (
              <div key={index} className="text-sm font-mono mb-1 break-words">
                {result}
              </div>
            ))}
          </div>
        </div>
      )}

      {documents.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Documents ({documents.length}):</h3>
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <h4 className="font-medium">{doc.title}</h4>
                <p className="text-sm text-gray-600">{doc.content}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Type: {doc.contentType} | Status: {doc.status} | ID: {doc.id}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {brandProfiles.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-2">Brand Profiles ({brandProfiles.length}):</h3>
          <div className="space-y-2">
            {brandProfiles.map((profile) => (
              <div key={profile.id} className="bg-green-50 border border-green-200 rounded-lg p-3">
                <h4 className="font-medium">{profile.name}</h4>
                <p className="text-sm text-gray-600">
                  Tone: {profile.styleGuide.tone} | Voice: {profile.styleGuide.voice}
                </p>
                <p className="text-xs text-gray-500 mt-1">ID: {profile.id}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

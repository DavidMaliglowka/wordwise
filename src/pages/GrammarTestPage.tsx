import React from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import GrammarTest from '../components/test/GrammarTest';

const GrammarTestPage: React.FC = () => {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Authentication Required</h2>
            <p className="text-gray-600 mb-4">
              Please sign in to test the grammar checking functionality.
            </p>
            <a
              href="/auth"
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Sign In
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-800">Grammar Check Test</h1>
              <p className="text-sm text-gray-600">Test the AI-powered grammar checking functionality</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Signed in as {user.email}</span>
              <a
                href="/dashboard"
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
              >
                Back to Dashboard
              </a>
            </div>
          </div>
        </div>
      </div>

      <GrammarTest />
    </div>
  );
};

export default GrammarTestPage;

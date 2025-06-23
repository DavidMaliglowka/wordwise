import React, { useState } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import { GrammarTest } from '../components/test/GrammarTest';
import GrammarIntegrationTest from '../components/test/GrammarIntegrationTest';

const GrammarTestPage: React.FC = () => {
  const { user, loading } = useAuthContext();
  const [activeTest, setActiveTest] = useState<'basic' | 'integration'>('integration');

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
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setActiveTest('integration')}
                  className={`px-3 py-1 text-sm rounded ${
                    activeTest === 'integration'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Integration Test
                </button>
                <button
                  onClick={() => setActiveTest('basic')}
                  className={`px-3 py-1 text-sm rounded ${
                    activeTest === 'basic'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Basic Test
                </button>
              </div>
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

      {activeTest === 'integration' ? <GrammarIntegrationTest /> : <GrammarTest />}
    </div>
  );
};

export default GrammarTestPage;

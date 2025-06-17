import React, { useState } from 'react';
import { DocumentService } from '../../services/documents';
import { Document, CreateDocumentData, UpdateDocumentData, timestampToDate } from '../../types/firestore';
import { useAuth } from '../../hooks/useAuth';

interface TestResult {
  success: boolean;
  message: string;
  data?: any;
  timestamp: string;
}

export const DocumentTest: React.FC = () => {
  const { user } = useAuth();
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');

  // Test form data
  const [createData, setCreateData] = useState<CreateDocumentData>({
    title: 'Test Document',
    content: 'This is a test document for WordWise AI. It contains sample content to test our document management system.',
    contentType: 'blog',
    goals: ['Test document creation', 'Verify CRUD operations']
  });

  const [updateData, setUpdateData] = useState<UpdateDocumentData>({
    title: 'Updated Test Document',
    content: 'This document has been updated through the Cloud Functions API.',
    status: 'reviewing'
  });

  const addTestResult = (result: TestResult) => {
    setTestResults(prev => [result, ...prev]);
  };

  const runTest = async (testName: string, testFn: () => Promise<any>) => {
    setIsLoading(true);
    try {
      const result = await testFn();
      addTestResult({
        success: true,
        message: `✅ ${testName} - Success`,
        data: result,
        timestamp: new Date().toLocaleTimeString()
      });
      return result;
    } catch (error: any) {
      addTestResult({
        success: false,
        message: `❌ ${testName} - Error: ${error.message}`,
        timestamp: new Date().toLocaleTimeString()
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const testHealthCheck = async () => {
    await runTest('Health Check', async () => {
      return await DocumentService.healthCheck();
    });
  };

  const testCreateDocument = async () => {
    const result = await runTest('Create Document', async () => {
      return await DocumentService.createDocument(createData);
    });

    if (result) {
      setDocuments(prev => [result, ...prev]);
      setSelectedDocumentId(result.id);
    }
  };

  const testGetDocuments = async () => {
    const result = await runTest('Get All Documents', async () => {
      return await DocumentService.getDocuments();
    });

    if (result) {
      setDocuments(result);
    }
  };

  const testGetDocument = async () => {
    if (!selectedDocumentId) {
      addTestResult({
        success: false,
        message: '❌ Get Document - No document selected',
        timestamp: new Date().toLocaleTimeString()
      });
      return;
    }

    await runTest('Get Single Document', async () => {
      return await DocumentService.getDocument(selectedDocumentId);
    });
  };

  const testUpdateDocument = async () => {
    if (!selectedDocumentId) {
      addTestResult({
        success: false,
        message: '❌ Update Document - No document selected',
        timestamp: new Date().toLocaleTimeString()
      });
      return;
    }

    const result = await runTest('Update Document', async () => {
      return await DocumentService.updateDocument(selectedDocumentId, updateData);
    });

    if (result) {
      setDocuments(prev => prev.map(doc => doc.id === selectedDocumentId ? result : doc));
    }
  };

  const testDeleteDocument = async () => {
    if (!selectedDocumentId) {
      addTestResult({
        success: false,
        message: '❌ Delete Document - No document selected',
        timestamp: new Date().toLocaleTimeString()
      });
      return;
    }

    await runTest('Delete Document', async () => {
      return await DocumentService.deleteDocument(selectedDocumentId);
    });

    setDocuments(prev => prev.filter(doc => doc.id !== selectedDocumentId));
    setSelectedDocumentId('');
  };

  const runAllTests = async () => {
    try {
      await testHealthCheck();
      await testCreateDocument();
      await testGetDocuments();
      if (selectedDocumentId) {
        await testGetDocument();
        await testUpdateDocument();
      }
    } catch (error) {
      console.error('Test suite failed:', error);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  if (!user) {
    return (
      <div className="p-6 bg-yellow-50 rounded-lg border border-yellow-200">
        <p className="text-yellow-800">Please sign in to test document operations.</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Document CRUD Test Suite</h2>

      {/* Test Controls */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={testHealthCheck}
            disabled={isLoading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Health Check
          </button>
          <button
            onClick={testCreateDocument}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Create Document
          </button>
          <button
            onClick={testGetDocuments}
            disabled={isLoading}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
          >
            Get All Documents
          </button>
          <button
            onClick={testGetDocument}
            disabled={isLoading || !selectedDocumentId}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            Get Single Document
          </button>
          <button
            onClick={testUpdateDocument}
            disabled={isLoading || !selectedDocumentId}
            className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
          >
            Update Document
          </button>
          <button
            onClick={testDeleteDocument}
            disabled={isLoading || !selectedDocumentId}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            Delete Document
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={runAllTests}
            disabled={isLoading}
            className="px-6 py-2 bg-gray-800 text-white rounded hover:bg-gray-900 disabled:opacity-50"
          >
            Run All Tests
          </button>
          <button
            onClick={clearResults}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Clear Results
          </button>
        </div>
      </div>

      {/* Document List */}
      {documents.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Documents:</h3>
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`p-3 border rounded cursor-pointer transition-colors ${
                  selectedDocumentId === doc.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedDocumentId(doc.id)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{doc.title}</p>
                    <p className="text-sm text-gray-600">
                      {doc.contentType} | {doc.status} | ID: {doc.id}
                    </p>
                  </div>
                                    <span className="text-xs text-gray-500">
                    {timestampToDate(doc.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Configuration */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-lg font-semibold mb-3">Create Document Data:</h3>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Title"
              value={createData.title}
              onChange={(e) => setCreateData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full p-2 border rounded"
            />
            <textarea
              placeholder="Content"
              value={createData.content}
              onChange={(e) => setCreateData(prev => ({ ...prev, content: e.target.value }))}
              className="w-full p-2 border rounded h-20"
            />
            <select
              value={createData.contentType}
              onChange={(e) => setCreateData(prev => ({ ...prev, contentType: e.target.value as any }))}
              className="w-full p-2 border rounded"
            >
              <option value="blog">Blog</option>
              <option value="email">Email</option>
              <option value="social">Social</option>
              <option value="ad_copy">Ad Copy</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Update Document Data:</h3>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="New Title"
              value={updateData.title || ''}
              onChange={(e) => setUpdateData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full p-2 border rounded"
            />
            <textarea
              placeholder="New Content"
              value={updateData.content || ''}
              onChange={(e) => setUpdateData(prev => ({ ...prev, content: e.target.value }))}
              className="w-full p-2 border rounded h-20"
            />
            <select
              value={updateData.status || ''}
              onChange={(e) => setUpdateData(prev => ({ ...prev, status: e.target.value as any }))}
              className="w-full p-2 border rounded"
            >
              <option value="">Don't change</option>
              <option value="draft">Draft</option>
              <option value="writing">Writing</option>
              <option value="reviewing">Reviewing</option>
              <option value="published">Published</option>
            </select>
          </div>
        </div>
      </div>

      {/* Test Results */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Test Results:</h3>
        <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
          {testResults.length === 0 ? (
            <p className="text-gray-500 italic">No tests run yet...</p>
          ) : (
            <div className="space-y-2">
              {testResults.map((result, index) => (
                <div key={`test-result-${index}-${result.timestamp}`} className="text-sm">
                  <div className="flex justify-between items-start">
                    <span className={result.success ? 'text-green-600' : 'text-red-600'}>
                      {result.message}
                    </span>
                    <span className="text-gray-500 text-xs">{result.timestamp}</span>
                  </div>
                  {result.data && (
                    <pre className="mt-1 text-xs bg-white p-2 rounded border overflow-x-auto">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Running test...</p>
          </div>
        </div>
      )}
    </div>
  );
};

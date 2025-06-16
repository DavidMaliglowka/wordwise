import React, { useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { auth } from '../../lib/firebase';
import {
  StorageService,
  ProfileImageService,
  BrandAssetService,
  DocumentService,
  StorageUtils,
  UploadProgress,
  StorageFile
} from '../../services/storage';

interface TestResult {
  test: string;
  status: 'running' | 'success' | 'error';
  message: string;
  timestamp: string;
  data?: any;
}

export const StorageTest: React.FC = () => {
  const { user } = useAuth();
  const [results, setResults] = useState<TestResult[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploading, setUploading] = useState(false);
  const [userFiles, setUserFiles] = useState<StorageFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addResult = (test: string, status: 'running' | 'success' | 'error', message: string, data?: any) => {
    const result: TestResult = {
      test,
      status,
      message,
      timestamp: new Date().toISOString(),
      data
    };
    setResults(prev => [result, ...prev]);
    return result;
  };

  const updateResult = (result: TestResult, status: 'success' | 'error', message: string, data?: any) => {
    result.status = status;
    result.message = message;
    if (data) result.data = data;
    setResults(prev => [...prev]);
  };

  const handleFileUpload = async (type: 'profile' | 'brand' | 'document') => {
    if (!fileInputRef.current?.files?.[0] || !user) return;

    const file = fileInputRef.current.files[0];
    setUploading(true);
    setUploadProgress(null);

    const result = addResult(`Upload ${type}`, 'running', `Uploading ${file.name}...`);

    try {
      let downloadURL: string;

      const onProgress = (progress: UploadProgress) => {
        setUploadProgress(progress);
      };

      switch (type) {
        case 'profile':
          downloadURL = await ProfileImageService.uploadProfileImage(user.uid, file, onProgress);
          break;
        case 'brand':
          // Create a test brand ID
          const brandId = 'test-brand-' + Date.now();
          downloadURL = await BrandAssetService.uploadBrandAsset(
            user.uid,
            brandId,
            file,
            'sample',
            onProgress
          );
          break;
        case 'document':
          // Create a test document ID
          const docId = 'test-doc-' + Date.now();
          downloadURL = await DocumentService.uploadDocument(user.uid, docId, file, onProgress);
          break;
        default:
          throw new Error('Invalid upload type');
      }

      updateResult(result, 'success', `Upload successful: ${downloadURL}`, { downloadURL });
      setUploadProgress(null);

      // Refresh file list
      await loadUserFiles();
    } catch (error: any) {
      updateResult(result, 'error', `Upload failed: ${error.message}`);
      setUploadProgress(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const loadUserFiles = async () => {
    if (!user) return;

    const result = addResult('Load Files', 'running', 'Loading user files...');

    try {
      // Try to list files from different directories
      const directories = [
        `users/${user.uid}/profile`,
        `users/${user.uid}/temp`,
        `users/${user.uid}/exports`
      ];

      const allFiles: StorageFile[] = [];

      for (const dir of directories) {
        try {
          const files = await StorageService.listFiles(dir);
          allFiles.push(...files);
        } catch (error) {
          // Directory might not exist, that's ok
        }
      }

      setUserFiles(allFiles);
      updateResult(result, 'success', `Found ${allFiles.length} files`, allFiles);
    } catch (error: any) {
      updateResult(result, 'error', `Failed to load files: ${error.message}`);
    }
  };

  const testFileOperations = async () => {
    if (!user) return;

    console.log('🔍 Debug - Current user:', user);
    console.log('🔍 Debug - User ID:', user.uid);
    console.log('🔍 Debug - User authenticated:', !!user);
    console.log('🔍 Debug - Auth current user:', auth.currentUser);

    // Check if we can get an ID token
    try {
      const token = await auth.currentUser?.getIdToken();
      console.log('🔍 Debug - ID Token exists:', !!token);
      console.log('🔍 Debug - Token preview:', token?.substring(0, 50) + '...');
    } catch (error) {
      console.error('🔍 Debug - Token error:', error);
    }

    // Create a simple test file
    const testContent = 'Hello, WordWise Storage Test!';
    const testFile = new File([testContent], 'test.txt', { type: 'text/plain' });

    // Test 1: Upload file
    const uploadResult = addResult('File Upload', 'running', 'Testing file upload...');
    try {
      const path = `users/${user.uid}/temp/test_${Date.now()}.txt`;
      const { downloadURL } = await StorageService.uploadFileSimple(path, testFile, {
        purpose: 'storage-test',
        createdBy: 'test-component'
      });
      updateResult(uploadResult, 'success', `File uploaded: ${path}`, { downloadURL, path });

      // Test 2: Check if file exists
      const existsResult = addResult('File Exists Check', 'running', 'Checking if file exists...');
      try {
        const exists = await StorageService.fileExists(path);
        updateResult(existsResult, 'success', `File exists: ${exists}`);

        // Test 3: Get file metadata
        const metadataResult = addResult('Get Metadata', 'running', 'Getting file metadata...');
        try {
          const metadata = await StorageService.getFileMetadata(path);
          updateResult(metadataResult, 'success', 'Metadata retrieved', metadata);

          // Test 4: Update metadata
          const updateMetaResult = addResult('Update Metadata', 'running', 'Updating file metadata...');
          try {
            const updatedMeta = await StorageService.updateFileMetadata(path, {
              lastModified: new Date().toISOString(),
              testUpdate: 'true'
            });
            updateResult(updateMetaResult, 'success', 'Metadata updated', updatedMeta.customMetadata);

            // Test 5: Delete file
            const deleteResult = addResult('Delete File', 'running', 'Deleting test file...');
            try {
              await StorageService.deleteFile(path);
              updateResult(deleteResult, 'success', 'File deleted successfully');
            } catch (error: any) {
              updateResult(deleteResult, 'error', `Delete failed: ${error.message}`);
            }
          } catch (error: any) {
            updateResult(updateMetaResult, 'error', `Metadata update failed: ${error.message}`);
          }
        } catch (error: any) {
          updateResult(metadataResult, 'error', `Metadata retrieval failed: ${error.message}`);
        }
      } catch (error: any) {
        updateResult(existsResult, 'error', `Exists check failed: ${error.message}`);
      }
    } catch (error: any) {
      updateResult(uploadResult, 'error', `Upload failed: ${error.message}`);
    }
  };

  const clearResults = () => {
    setResults([]);
    setUploadProgress(null);
    setUserFiles([]);
  };

  if (!user) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800">Please sign in to test Firebase Storage functionality.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 border border-gray-200 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Firebase Storage Test</h2>

        {/* Control Buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={testFileOperations}
            disabled={uploading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Test Basic Operations
          </button>
          <button
            onClick={loadUserFiles}
            disabled={uploading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Load User Files
          </button>
          <button
            onClick={clearResults}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Clear Results
          </button>
        </div>

        {/* File Upload Section */}
        <div className="border-t pt-4">
          <h3 className="text-lg font-medium mb-2">File Upload Test</h3>
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              disabled={uploading}
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleFileUpload('profile')}
                disabled={uploading || !fileInputRef.current?.files?.[0]}
                className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:opacity-50"
              >
                Upload as Profile Image
              </button>
              <button
                onClick={() => handleFileUpload('brand')}
                disabled={uploading || !fileInputRef.current?.files?.[0]}
                className="px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                Upload as Brand Asset
              </button>
              <button
                onClick={() => handleFileUpload('document')}
                disabled={uploading || !fileInputRef.current?.files?.[0]}
                className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
              >
                Upload as Document
              </button>
            </div>
          </div>

          {/* Upload Progress */}
          {uploadProgress && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <div className="flex justify-between text-sm text-blue-800 mb-1">
                <span>Uploading...</span>
                <span>{Math.round(uploadProgress.percentage)}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress.percentage}%` }}
                ></div>
              </div>
              <div className="text-xs text-blue-600 mt-1">
                {StorageUtils.formatFileSize(uploadProgress.bytesTransferred)} / {StorageUtils.formatFileSize(uploadProgress.totalBytes)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* User Files */}
      {userFiles.length > 0 && (
        <div className="bg-white p-6 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">User Files ({userFiles.length})</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {userFiles.map((file, index) => (
              <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{file.name}</div>
                  <div className="text-xs text-gray-500">
                    {StorageUtils.formatFileSize(file.size)} • {file.contentType}
                  </div>
                </div>
                <a
                  href={file.downloadURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                >
                  View
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Results */}
      <div className="bg-white p-6 border border-gray-200 rounded-lg">
        <h3 className="text-lg font-semibold mb-4">Test Results</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No tests run yet. Click a test button to start.</p>
          ) : (
            results.map((result, index) => (
              <div
                key={index}
                className={`p-3 rounded border-l-4 ${
                  result.status === 'success'
                    ? 'bg-green-50 border-green-400'
                    : result.status === 'error'
                    ? 'bg-red-50 border-red-400'
                    : 'bg-blue-50 border-blue-400'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{result.test}</span>
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          result.status === 'success'
                            ? 'bg-green-100 text-green-800'
                            : result.status === 'error'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {result.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{result.message}</p>
                    {result.data && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 cursor-pointer">View Data</summary>
                        <pre className="text-xs bg-gray-100 p-2 mt-1 rounded overflow-x-auto">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 ml-2">
                    {new Date(result.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

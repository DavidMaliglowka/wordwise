import React, { useState, useEffect, useCallback } from 'react';
import {
  PlusIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
  DocumentTextIcon,
  CalendarDaysIcon,
  EllipsisVerticalIcon,
  ArrowDownTrayIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { DocumentService } from '../services/firestore';
import { Document } from '../types/firestore';
import DashboardLayout from '../components/layout/DashboardLayout';
import { AdminFeature } from '../components/AdminRoute';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { createTestDocuments, deleteAllUserDocuments, createSingleTestDocument, simpleDeleteAllDocuments } from '../utils/createTestDocuments';
import { useBatchGrammarSuggestionCount } from '../hooks/useGrammarSuggestionCount';
import { useToast, ToastContainer } from '../components/Toast';

interface DocumentCardProps {
  document: Document;
  onDownload: (doc: Document) => void;
  onDelete: (doc: Document) => void;
  onClick: (doc: Document) => void;
  suggestionCount?: number;
  suggestionLoading?: boolean;
  suggestionError?: string | null;
}

const DocumentCard: React.FC<DocumentCardProps> = ({
  document,
  onDownload,
  onDelete,
  onClick,
  suggestionCount = 0,
  suggestionLoading = false,
  suggestionError = null
}) => {
  // Calculate reading time (assuming 200 words per minute)
  const wordCount = document.content.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 200);

  // Truncate content for snippet
  const snippet = document.content.substring(0, 80) + (document.content.length > 80 ? '...' : '');

  // Format date to match the design (e.g., "5 Jun")
  const formatDate = (timestamp: any) => {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  // Use real-time suggestion count, fallback to document's editCount, then 0
  const displayCount = suggestionCount ?? document.editCount ?? 0;

  return (
    <div
      className="relative bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer w-full"
      style={{ height: '240px' }}
      onClick={() => onClick(document)}
    >
      {/* Date at top */}
      <div className="px-3 pt-3">
        <span className="text-xs text-gray-500">{formatDate(document.updatedAt)}</span>
      </div>

      {/* Title */}
      <div className="px-3 pt-2">
        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-tight">
          {document.title || 'Untitled Document'}
        </h3>
      </div>

      {/* Content snippet */}
      <div className="px-3 pt-2 flex-1">
        <p className="text-xs text-gray-600 line-clamp-4 leading-relaxed">
          {snippet}
        </p>
      </div>

      {/* Bottom section with actions and suggestion count */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
        {/* Suggestion count circle - Task 22.2 */}
        <div
          className={`flex items-center justify-center w-6 h-6 text-white text-xs font-medium rounded-full relative transition-colors ${
            suggestionError ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          title={suggestionError || `${displayCount} suggestions found`}
        >
          {suggestionLoading ? (
            <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
          ) : suggestionError ? (
            '?'
          ) : (
            displayCount
          )}
        </div>

        {/* Action buttons - always visible */}
        <div className="flex space-x-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload(document);
            }}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Download"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(document);
            }}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Delete"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

const DocumentsDashboard: React.FC = () => {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | undefined>();
  const [hasMore, setHasMore] = useState(true);

  // Real-time suggestion counts for all documents - Task 22.2
  const suggestionCounts = useBatchGrammarSuggestionCount(documents);

  // Toast notifications for user feedback - Task 22.3
  const { toasts, removeToast, showSuccess, showError, showWarning } = useToast();

  // Development helpers (accessible via browser console)
  useEffect(() => {
    if (user && process.env.NODE_ENV === 'development') {
      (window as any).createTestDocuments = (count = 50) => createTestDocuments(user.uid, count);
      (window as any).createSingleTestDocument = () => createSingleTestDocument(user.uid);
      (window as any).deleteAllDocuments = () => deleteAllUserDocuments(user.uid);
      (window as any).simpleDeleteAllDocuments = () => simpleDeleteAllDocuments(user.uid);
      console.log('Development helpers available:');
      console.log('- createSingleTestDocument() - Create one test document (for debugging)');
      console.log('- createTestDocuments(count) - Create test documents (default: 50)');
      console.log('- deleteAllDocuments() - Delete all user documents (complex)');
      console.log('- simpleDeleteAllDocuments() - Delete all user documents (simple, recommended)');
    }
  }, [user]);

  // Fetch initial documents
  useEffect(() => {
    const fetchDocuments = async () => {
      if (!user) return;

      try {
        setLoading(true);
        setError(null);
        // Use smaller batch size in development for easier testing
        const batchSize = process.env.NODE_ENV === 'development' ? 8 : 20;
        const result = await DocumentService.getUserDocuments(user.uid, batchSize);
        setDocuments(result.documents);
        setLastDoc(result.lastDoc);
        setHasMore(result.hasMore);
      } catch (err) {
        console.error('Error fetching documents:', err);
        const errorMessage = err instanceof Error
          ? `Failed to load documents: ${err.message}`
          : 'Failed to load documents';
        setError(errorMessage);

        // Show error toast for initial load failures - Task 22.3
        showError(
          'Loading Error',
          errorMessage,
          {
            action: {
              label: 'Retry',
              onClick: () => window.location.reload()
            }
          }
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, [user]);

  // Fetch more documents (for infinite scroll)
  const fetchMoreDocuments = useCallback(async () => {
    if (!user || !lastDoc || !hasMore || loadingMore) return;

    try {
      setLoadingMore(true);
      // Use smaller batch size in development for easier testing
      const batchSize = process.env.NODE_ENV === 'development' ? 8 : 20;
      const result = await DocumentService.getUserDocuments(user.uid, batchSize, lastDoc);
      setDocuments(prev => [...prev, ...result.documents]);
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error('Error fetching more documents:', err);
      const errorMessage = err instanceof Error
        ? `Failed to load more documents: ${err.message}`
        : 'Failed to load more documents';
      setError(errorMessage);

      // Show warning toast for pagination failures - Task 22.3
      showWarning(
        'Loading Error',
        errorMessage,
        {
          action: {
            label: 'Try Again',
            onClick: fetchMoreDocuments
          }
        }
      );
    } finally {
      setLoadingMore(false);
    }
  }, [user, lastDoc, hasMore, loadingMore]);

  // Use infinite scroll hook
  const loadMoreRef = useInfiniteScroll({
    hasNextPage: hasMore,
    isFetchingNextPage: loadingMore,
    fetchNextPage: fetchMoreDocuments,
    rootMargin: '100px',
  });

  // Filter documents based on search
  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleNewDocument = () => {
    navigate('/editor/new');
  };

  const handleUploadFile = () => {
    // TODO: Implement file upload
    console.log('Uploading file...');
  };

  const handleDocumentClick = (document: Document) => {
    navigate(`/editor/${document.id}`);
  };

      const handleDownload = (doc: Document) => {
    try {
      // Create a blob with the document content
      const blob = new Blob([doc.content], { type: 'text/plain' });

      // Create a temporary download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Use document title as filename, fallback to 'document'
      const filename = (doc.title || 'Untitled Document')
        .replace(/[^a-z0-9]/gi, '_')  // Replace special chars with underscore
        .replace(/_+/g, '_')          // Replace multiple underscores with single
        .replace(/^_|_$/g, '')        // Remove leading/trailing underscores
        .toLowerCase();

      link.download = `${filename}.txt`;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      console.log('Document downloaded:', doc.id);

      // Success notification - Task 22.3
      showSuccess(
        'Download Complete',
        `"${doc.title || 'Untitled Document'}" has been downloaded successfully.`
      );

    } catch (error) {
      console.error('Error downloading document:', error);

      // Error notification with enhanced details - Task 22.3
      const errorMessage = error instanceof Error
        ? error.message
        : 'An unexpected error occurred during download.';

      showError(
        'Download Failed',
        `Failed to download "${doc.title || 'Untitled Document'}": ${errorMessage}`,
        {
          action: {
            label: 'Try Again',
            onClick: () => handleDownload(doc)
          }
        }
      );
    }
  };

  const handleDelete = async (doc: Document) => {
    // Enhanced confirmation dialog with document title
    const documentTitle = doc.title || 'Untitled Document';
    const confirmMessage = `Are you sure you want to permanently delete "${documentTitle}"?\n\nThis action cannot be undone.`;

    if (window.confirm(confirmMessage)) {
      try {
        // Show loading state by temporarily disabling the button (we'll handle this in UI later)
        await DocumentService.deleteDocument(doc.id);

        // Remove from local state
        setDocuments(docs => docs.filter(document => document.id !== doc.id));

        // If we have few documents left and there are more available, fetch more
        if (documents.length <= 5 && hasMore && !loadingMore) {
          fetchMoreDocuments();
        }

                console.log('Document deleted successfully:', doc.id);

        // Success notification - Task 22.3
        showSuccess(
          'Document Deleted',
          `"${documentTitle}" has been permanently deleted.`
        );

      } catch (err) {
        console.error('Error deleting document:', err);

        // Enhanced error notification - Task 22.3
        const errorMessage = err instanceof Error
          ? err.message
          : 'An unexpected error occurred while deleting the document.';

        showError(
          'Delete Failed',
          `Failed to delete "${documentTitle}": ${errorMessage}`,
          {
            action: {
              label: 'Try Again',
              onClick: () => handleDelete(doc)
            }
          }
        );
      }
    }
  };

    return (
    <DashboardLayout>
      <div className="h-full flex flex-col">
        {/* Content Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
          <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Documents</h1>

            {/* Mobile Layout */}
            <div className="flex flex-col space-y-3 sm:hidden">
              {/* Search */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-2">
                <button
                  onClick={handleUploadFile}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <ArrowUpTrayIcon className="h-4 w-4 mr-1" />
                  Upload
                </button>

                <button
                  onClick={handleNewDocument}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  New
                </button>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden sm:flex items-center space-x-4">
              {/* Search */}
              <div className="relative w-64 lg:w-80">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>

              {/* Grammar Test button */}
              <AdminFeature feature="testRoutes">
                <Link
                  to="/test/grammar"
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                >
                  🧪 Test Grammar
                </Link>
              </AdminFeature>

              {/* Upload button */}
              <button
                onClick={handleUploadFile}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <ArrowUpTrayIcon className="h-4 w-4 mr-2" />
                Upload file
              </button>

              {/* New document button */}
              <button
                onClick={handleNewDocument}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                New document
              </button>
            </div>
          </div>
        </div>

        {/* Document Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <span className="ml-2 text-gray-600">Loading documents...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <p className="text-red-600">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 text-indigo-600 hover:text-indigo-500"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {!loading && !error && (
            <>
              {filteredDocuments.length === 0 ? (
                // Empty state
                <div className="flex flex-col items-center justify-center h-64 px-4">
                  <DocumentTextIcon className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2 text-center">
                    {searchQuery ? 'No documents found' : 'No documents yet'}
                  </h3>
                  <p className="text-gray-500 text-center mb-6 max-w-sm">
                    {searchQuery
                      ? 'Try adjusting your search terms'
                      : 'Get started by creating your first document'
                    }
                  </p>
                  {!searchQuery && (
                    <button
                      onClick={handleNewDocument}
                      className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Create your first document
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Document grid - mobile optimized */}
                  <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-8 gap-3 sm:gap-4">
                    {filteredDocuments.map((document) => {
                      const suggestionData = suggestionCounts.get(document.id);
                      return (
                        <DocumentCard
                          key={document.id}
                          document={document}
                          onClick={handleDocumentClick}
                          onDownload={handleDownload}
                          onDelete={handleDelete}
                          suggestionCount={suggestionData?.count}
                          suggestionLoading={suggestionData?.loading}
                          suggestionError={suggestionData?.error}
                        />
                      );
                    })}
                  </div>

                  {/* Infinite scroll trigger - only show if not searching */}
                  {!searchQuery && hasMore && (
                    <div ref={loadMoreRef} className="flex justify-center py-8">
                      {loadingMore && (
                        <div className="flex items-center space-x-2">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                          <span className="text-gray-600">Loading more documents...</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Load more button fallback */}
                  {!searchQuery && hasMore && !loadingMore && filteredDocuments.length > 0 && (
                    <div className="flex justify-center py-8">
                      <button
                        onClick={fetchMoreDocuments}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                      >
                        Load More Documents
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Toast notifications - Task 22.3 */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </DashboardLayout>
  );
};

export default DocumentsDashboard;

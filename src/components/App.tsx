import React from 'react';
import { AuthProvider, useAuthContext } from '../contexts/AuthContext';
import { AuthPage } from '../pages/AuthPage';
import DocumentsDashboard from '../pages/DocumentsDashboard';

// Main app content that checks authentication state
const AppContent: React.FC = () => {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return user ? <DocumentsDashboard /> : <AuthPage />;
};

// Root App component with AuthProvider
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

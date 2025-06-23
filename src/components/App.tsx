import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuthContext } from '../contexts/AuthContext';
import { AuthPage } from '../pages/AuthPage';
import DocumentsDashboard from '../pages/DocumentsDashboard';
import DocumentEditor from '../pages/DocumentEditor';
import AccountPage from '../pages/AccountPage';
import GrammarTestPage from '../pages/GrammarTestPage';
import HybridGrammarTest from './test/HybridGrammarTest';
import PerformanceMonitorTest from './test/PerformanceMonitorTest';
import SystemIntegrationTest from './test/SystemIntegrationTest';
import AdminPanel from './test/AdminPanel';
import AdminDebug from './test/AdminDebug';
import { AdminRoute } from './AdminRoute';

// Protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return user ? <>{children}</> : <Navigate to="/auth" replace />;
};

// Auth route wrapper (redirects to dashboard if already authenticated)
const AuthRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return user ? <Navigate to="/dashboard" replace /> : <>{children}</>;
};

// Main app content with routing
const AppContent: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route
          path="/auth"
          element={
            <AuthRoute>
              <AuthPage />
            </AuthRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DocumentsDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/editor/:id"
          element={
            <ProtectedRoute>
              <DocumentEditor />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <AccountPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/test/grammar"
          element={
            <AdminRoute feature="testRoutes">
              <GrammarTestPage />
            </AdminRoute>
          }
        />
        <Route
          path="/test/hybrid"
          element={
            <AdminRoute feature="testRoutes">
              <HybridGrammarTest />
            </AdminRoute>
          }
        />
        <Route
          path="/test/performance"
          element={
            <AdminRoute feature="testRoutes">
              <PerformanceMonitorTest />
            </AdminRoute>
          }
        />
        <Route
          path="/test/integration"
          element={
            <AdminRoute feature="testRoutes">
              <SystemIntegrationTest />
            </AdminRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <AdminRoute feature="testRoutes">
              <AdminPanel />
            </AdminRoute>
          }
        />
        <Route
          path="/admin-debug"
          element={
            <AdminRoute feature="testRoutes">
              <AdminDebug />
            </AdminRoute>
          }
        />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    </Router>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;

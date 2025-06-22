import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthContext } from '../contexts/AuthContext';
import { useFeatureEnabled } from '../hooks/useFeatureFlags';

interface AdminRouteProps {
  children: React.ReactNode;
  feature: 'testRoutes' | 'performanceMonitor';
  fallback?: React.ReactNode;
}

/**
 * Route wrapper that only renders content if user is admin and feature is enabled
 */
export const AdminRoute: React.FC<AdminRouteProps> = ({
  children,
  feature,
  fallback = <Navigate to="/dashboard" replace />
}) => {
  const { user, loading } = useAuthContext();
  const { enabled, loading: featureLoading } = useFeatureEnabled(user, feature);

  // Show loading while checking auth or feature flags
  if (loading || featureLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Render content if feature is enabled, otherwise show fallback
  return enabled ? <>{children}</> : <>{fallback}</>;
};

interface AdminFeatureProps {
  children: React.ReactNode;
  feature: 'testRoutes' | 'performanceMonitor';
  fallback?: React.ReactNode;
}

/**
 * Component wrapper that conditionally renders based on admin feature flags
 * (for use within components, not routes)
 */
export const AdminFeature: React.FC<AdminFeatureProps> = ({
  children,
  feature,
  fallback = null
}) => {
  const { user } = useAuthContext();
  const { enabled, loading } = useFeatureEnabled(user, feature);

  // Show loading state if still checking
  if (loading) {
    return (
      <div className="flex items-center justify-center p-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Render content if feature is enabled, otherwise show fallback
  return enabled ? <>{children}</> : <>{fallback}</>;
};

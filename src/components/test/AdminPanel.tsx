import React, { useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { FeatureFlagService } from '../../services/feature-flags';

const AdminPanel: React.FC = () => {
  const { user } = useAuthContext();
  const { flags, loading, error } = useFeatureFlags(user);
  const [updating, setUpdating] = useState(false);

  const refetchFlags = async () => {
    // Force a component re-render by changing state
    window.location.reload();
  };

  const handleToggleTestRoutes = async () => {
    if (!user || !flags) return;

    setUpdating(true);
    try {
      await FeatureFlagService.updateFeatureFlags(user, {
        testRoutes: !flags.testRoutes
      });
      await refetchFlags();
    } catch (error) {
      console.error('Failed to update test routes:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleTogglePerformanceMonitor = async () => {
    if (!user || !flags) return;

    setUpdating(true);
    try {
      await FeatureFlagService.updateFeatureFlags(user, {
        performanceMonitor: !flags.performanceMonitor
      });
      await refetchFlags();
    } catch (error) {
      console.error('Failed to update performance monitor:', error);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">
            <svg className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!flags) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No feature flags available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Panel</h1>

          <div className="space-y-6">
            {/* Test Routes Feature */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Test Routes</h3>
                  <p className="text-sm text-gray-600">
                    Enable access to development test routes for debugging and testing
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`text-sm font-medium ${flags.testRoutes ? 'text-green-600' : 'text-gray-500'}`}>
                    {flags.testRoutes ? 'Enabled' : 'Disabled'}
                  </span>
                  <button
                    onClick={handleToggleTestRoutes}
                    disabled={updating}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      flags.testRoutes ? 'bg-blue-600' : 'bg-gray-200'
                    } ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        flags.testRoutes ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {flags.testRoutes && (
                <div className="mt-4 p-3 bg-blue-50 rounded-md">
                  <h4 className="text-sm font-medium text-blue-900 mb-2">Available Test Routes:</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• /test/grammar - Grammar checking test interface</li>
                    <li>• /test/hybrid - Hybrid suggestions test interface</li>
                    <li>• /test/performance - Performance monitoring test interface</li>
                    <li>• /test/integration - Integration test interface</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Performance Monitor Feature */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Performance Monitor</h3>
                  <p className="text-sm text-gray-600">
                    Enable performance monitoring and debugging tools
                  </p>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`text-sm font-medium ${flags.performanceMonitor ? 'text-green-600' : 'text-gray-500'}`}>
                    {flags.performanceMonitor ? 'Enabled' : 'Disabled'}
                  </span>
                  <button
                    onClick={handleTogglePerformanceMonitor}
                    disabled={updating}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      flags.performanceMonitor ? 'bg-blue-600' : 'bg-gray-200'
                    } ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        flags.performanceMonitor ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {flags.performanceMonitor && (
                <div className="mt-4 p-3 bg-green-50 rounded-md">
                  <h4 className="text-sm font-medium text-green-900 mb-2">Performance Features:</h4>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>• Real-time performance metrics</li>
                    <li>• Memory usage monitoring</li>
                    <li>• API response time tracking</li>
                    <li>• Error rate monitoring</li>
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Debug Information */}
          <div className="mt-8 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Debug Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">User Email:</span>
                <span className="ml-2 text-gray-600">{user?.email}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Admin Status:</span>
                <span className="ml-2 text-green-600">✓ Admin</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Test Routes:</span>
                <span className={`ml-2 ${flags.testRoutes ? 'text-green-600' : 'text-red-600'}`}>
                  {flags.testRoutes ? '✓ Enabled' : '✗ Disabled'}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Performance Monitor:</span>
                <span className={`ml-2 ${flags.performanceMonitor ? 'text-green-600' : 'text-red-600'}`}>
                  {flags.performanceMonitor ? '✓ Enabled' : '✗ Disabled'}
                </span>
              </div>
            </div>
          </div>

          {updating && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-3"></div>
                <span className="text-sm text-blue-800">Updating feature flags...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;

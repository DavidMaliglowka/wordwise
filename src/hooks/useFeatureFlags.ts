import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { FeatureFlagService, FeatureFlags } from '../services/feature-flags';

export const useFeatureFlags = (user: User | null) => {
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFlags = async () => {
      if (!user) {
        setFlags(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Check if user is admin first
        const isAdmin = await FeatureFlagService.isAdmin(user);
        if (!isAdmin) {
          // Non-admin users get default disabled flags
          setFlags({
            testRoutes: false,
            performanceMonitor: false,
          });
          setLoading(false);
          return;
        }

        // Admin users get actual flags from backend
        const fetchedFlags = await FeatureFlagService.getFeatureFlags(user);
        setFlags(fetchedFlags);
      } catch (err: any) {
        console.error('Error fetching feature flags:', err);
        setError(err.message || 'Failed to fetch feature flags');
        // Default to disabled flags on error
        setFlags({
          testRoutes: false,
          performanceMonitor: false,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchFlags();
  }, [user]);

  return { flags, loading, error };
};

export const useFeatureEnabled = (user: User | null, feature: 'testRoutes' | 'performanceMonitor') => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkFeature = async () => {
      try {
        setLoading(true);
        const isEnabled = await FeatureFlagService.isFeatureEnabled(user, feature);
        setEnabled(isEnabled);
      } catch (error) {
        console.error(`Error checking feature ${feature}:`, error);
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    };

    checkFeature();
  }, [user, feature]);

  return { enabled, loading };
};

export const useIsAdmin = (user: User | null) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        setLoading(true);
        const adminStatus = await FeatureFlagService.isAdmin(user);
        setIsAdmin(adminStatus);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [user]);

  return { isAdmin, loading };
};

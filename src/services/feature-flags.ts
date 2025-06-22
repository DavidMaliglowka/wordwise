import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Types for feature flags (matching backend interface)
export interface FeatureFlags {
  testRoutes: boolean;
  performanceMonitor: boolean;
}

export interface FeatureFlagResponse {
  success: boolean;
  data: FeatureFlags;
}

export interface FeatureFlagUpdateRequest {
  testRoutes?: boolean;
  performanceMonitor?: boolean;
}

export class FeatureFlagService {
  private static readonly BASE_URL = process.env.NODE_ENV === 'development'
    ? 'http://localhost:5001/wordwise-4234/us-central1'
    : 'https://us-central1-wordwise-4234.cloudfunctions.net';

  /**
   * Check if user is admin by checking admin field in users collection
   */
  static async isAdmin(user: User | null): Promise<boolean> {
    if (!user) return false;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        return false;
      }

      const userData = userDoc.data();
      return userData?.admin === true;
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  /**
   * Get feature flags for the current user
   */
  static async getFeatureFlags(user: User): Promise<FeatureFlags> {
    const token = await user.getIdToken();

    const response = await fetch(`${this.BASE_URL}/getFeatureFlags`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to get feature flags');
    }

    const data = await response.json();
    return data.flags;
  }

  /**
   * Update feature flags (admin only)
   */
  static async updateFeatureFlags(user: User, flags: Partial<FeatureFlags>): Promise<void> {
    const token = await user.getIdToken();

    const response = await fetch(`${this.BASE_URL}/updateFeatureFlags`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ flags }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 403) {
        throw new Error('Admin access required');
      }
      throw new Error(errorData.error || 'Failed to update feature flags');
    }
  }

  /**
   * Check if a specific feature is enabled for the current user
   */
  static async isFeatureEnabled(
    user: User | null,
    feature: 'testRoutes' | 'performanceMonitor'
  ): Promise<boolean> {
    // Non-admin users never see development features
    if (!(await this.isAdmin(user))) {
      return false;
    }

    try {
      const flags = await this.getFeatureFlags(user!);
      return flags[feature];
    } catch (error) {
      console.error(`Error checking feature flag for ${feature}:`, error);
      // Default to false if we can't fetch flags
      return false;
    }
  }
}

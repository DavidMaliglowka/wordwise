// Security Configuration and Utilities for WordWise AI

import { auth } from './firebase';
import { User } from 'firebase/auth';

// Security Constants
export const SECURITY_CONFIG = {
  // Session timeout (in milliseconds)
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours

  // Authentication requirements
  REQUIRE_EMAIL_VERIFICATION: false, // Set to true for production

  // Rate limiting (requests per minute)
  RATE_LIMITS: {
    AUTHENTICATION: 10,
    DOCUMENT_UPLOAD: 20,
    API_CALLS: 100,
  },

  // File upload security
  MAX_FILE_SIZES: {
    PROFILE_IMAGE: 5 * 1024 * 1024,    // 5MB
    BRAND_ASSET: 25 * 1024 * 1024,     // 25MB
    DOCUMENT: 50 * 1024 * 1024,        // 50MB
    TEMP_FILE: 100 * 1024 * 1024,      // 100MB
  },

  // Allowed file types
  ALLOWED_FILE_TYPES: {
    IMAGES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    DOCUMENTS: [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/json',
      'application/xml'
    ]
  },

  // Security headers for API requests
  REQUIRED_HEADERS: {
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json',
  }
};

// Security Validation Functions
export class SecurityValidator {

  // Validate user authentication
  static isUserAuthenticated(user: User | null): boolean {
    return user !== null && user.uid !== undefined;
  }

  // Validate user email verification (if required)
  static isEmailVerified(user: User | null): boolean {
    if (!SECURITY_CONFIG.REQUIRE_EMAIL_VERIFICATION) return true;
    return user?.emailVerified ?? false;
  }

  // Validate user session (check if token is still valid)
  static async validateUserSession(user: User | null): Promise<boolean> {
    if (!user) return false;

    try {
      // Get fresh token to verify it's still valid
      const token = await user.getIdToken(false);
      return !!token;
    } catch (error) {
      console.warn('Session validation failed:', error);
      return false;
    }
  }

  // Validate file type
  static isValidFileType(file: File, category: 'images' | 'documents'): boolean {
    const allowedTypes = category === 'images'
      ? SECURITY_CONFIG.ALLOWED_FILE_TYPES.IMAGES
      : [...SECURITY_CONFIG.ALLOWED_FILE_TYPES.IMAGES, ...SECURITY_CONFIG.ALLOWED_FILE_TYPES.DOCUMENTS];

    return allowedTypes.includes(file.type);
  }

  // Validate file size
  static isValidFileSize(file: File, category: keyof typeof SECURITY_CONFIG.MAX_FILE_SIZES): boolean {
    const maxSize = SECURITY_CONFIG.MAX_FILE_SIZES[category];
    return file.size <= maxSize;
  }

  // Sanitize filename
  static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')  // Replace special chars with underscore
      .replace(/_{2,}/g, '_')           // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '')         // Remove leading/trailing underscores
      .substring(0, 100);              // Limit length
  }

  // Validate user input (prevent XSS)
  static sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '')           // Remove potential HTML tags
      .replace(/javascript:/gi, '')   // Remove javascript: URLs
      .replace(/on\w+=/gi, '')        // Remove event handlers
      .trim();
  }

  // Check if URL is safe for redirects
  static isSafeRedirectURL(url: string): boolean {
    try {
      const urlObj = new URL(url);
      // Only allow same origin or specific trusted domains
      const allowedDomains = [
        window.location.hostname,
        'wordwise-4234.firebaseapp.com',
        'wordwise-4234.web.app'
      ];

      return allowedDomains.includes(urlObj.hostname);
    } catch {
      return false;
    }
  }
}

// Rate Limiting (simple client-side implementation)
export class RateLimiter {
  private static requests: Map<string, number[]> = new Map();

  static isAllowed(key: string, limit: number, windowMs: number = 60000): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    // Remove old requests outside the window
    const recentRequests = requests.filter(timestamp => now - timestamp < windowMs);

    if (recentRequests.length >= limit) {
      return false;
    }

    // Add current request
    recentRequests.push(now);
    this.requests.set(key, recentRequests);

    return true;
  }

  static resetKey(key: string): void {
    this.requests.delete(key);
  }
}

// Security Monitoring
export class SecurityMonitor {

  // Log security events
  static logSecurityEvent(event: {
    type: 'auth_success' | 'auth_failure' | 'unauthorized_access' | 'file_upload' | 'suspicious_activity';
    userId?: string;
    details?: any;
    timestamp?: Date;
  }): void {
    const logEntry = {
      ...event,
      timestamp: event.timestamp || new Date(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // In production, send to logging service
    console.log('Security Event:', logEntry);

    // Store locally for debugging (remove in production)
    const logs = JSON.parse(localStorage.getItem('security_logs') || '[]');
    logs.push(logEntry);

    // Keep only last 100 logs
    if (logs.length > 100) {
      logs.splice(0, logs.length - 100);
    }

    localStorage.setItem('security_logs', JSON.stringify(logs));
  }

  // Get security logs (for debugging)
  static getSecurityLogs(): any[] {
    return JSON.parse(localStorage.getItem('security_logs') || '[]');
  }

  // Clear security logs
  static clearSecurityLogs(): void {
    localStorage.removeItem('security_logs');
  }
}

// HTTPS Enforcement
export class HTTPSEnforcer {

  // Ensure HTTPS connection
  static enforceHTTPS(): void {
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      console.warn('Redirecting to HTTPS...');
      location.replace(`https:${location.href.substring(location.protocol.length)}`);
    }
  }

  // Check if connection is secure
  static isSecureConnection(): boolean {
    return location.protocol === 'https:' || location.hostname === 'localhost';
  }
}

// Content Security Policy Helpers
export class CSPHelper {

  // Generate nonce for inline scripts (if needed)
  static generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => ('0' + byte.toString(16)).slice(-2)).join('');
  }

  // Report CSP violations
  static reportViolation(violationReport: any): void {
    SecurityMonitor.logSecurityEvent({
      type: 'suspicious_activity',
      details: {
        type: 'csp_violation',
        report: violationReport
      }
    });
  }
}

// Initialize security on app load
export const initializeSecurity = (): void => {
  // Enforce HTTPS
  HTTPSEnforcer.enforceHTTPS();

  // Log app initialization
  SecurityMonitor.logSecurityEvent({
    type: 'auth_success',
    details: { action: 'app_initialized' }
  });

  // Set up CSP violation reporting
  document.addEventListener('securitypolicyviolation', (e) => {
    CSPHelper.reportViolation({
      blockedURI: e.blockedURI,
      violatedDirective: e.violatedDirective,
      originalPolicy: e.originalPolicy
    });
  });

  console.log('🔒 Security initialized for WordWise AI');
};

// Export default security configuration
export default {
  config: SECURITY_CONFIG,
  validator: SecurityValidator,
  rateLimiter: RateLimiter,
  monitor: SecurityMonitor,
  httpsEnforcer: HTTPSEnforcer,
  cspHelper: CSPHelper,
  initialize: initializeSecurity
};

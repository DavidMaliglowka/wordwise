import React, { useState, useEffect } from 'react';
import {
  SecurityValidator,
  SecurityMonitor,
  RateLimiter,
  HTTPSEnforcer,
  SECURITY_CONFIG
} from '../../lib/security';
import { useAuthContext } from '../../contexts/AuthContext';

interface TestResult {
  test: string;
  status: 'pass' | 'fail' | 'info';
  message: string;
  timestamp: Date;
}

export const SecurityTest: React.FC = () => {
  const { user } = useAuthContext();
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addResult = (test: string, status: 'pass' | 'fail' | 'info', message: string) => {
    setResults(prev => [...prev, { test, status, message, timestamp: new Date() }]);
  };

  const clearResults = () => {
    setResults([]);
    SecurityMonitor.clearSecurityLogs();
  };

  // Test Suite Functions
  const testHTTPSEnforcement = () => {
    addResult(
      'HTTPS Enforcement',
      HTTPSEnforcer.isSecureConnection() ? 'pass' : 'info',
      HTTPSEnforcer.isSecureConnection()
        ? 'Connection is secure (HTTPS or localhost)'
        : 'Running on HTTP (development mode)'
    );
  };

  const testUserAuthentication = () => {
    addResult(
      'User Authentication',
      SecurityValidator.isUserAuthenticated(user) ? 'pass' : 'fail',
      SecurityValidator.isUserAuthenticated(user)
        ? `User authenticated: ${user?.email}`
        : 'No authenticated user found'
    );
  };

  const testEmailVerification = () => {
    addResult(
      'Email Verification',
      SecurityValidator.isEmailVerified(user) ? 'pass' : 'info',
      SecurityValidator.isEmailVerified(user)
        ? 'Email verification not required (dev mode)'
        : 'Email verification would be required in production'
    );
  };

  const testSessionValidation = async () => {
    const isValid = await SecurityValidator.validateUserSession(user);
    addResult(
      'Session Validation',
      isValid ? 'pass' : 'fail',
      isValid ? 'User session is valid' : 'User session is invalid or expired'
    );
  };

  const testRateLimiting = () => {
    // Test multiple rapid requests
    let passedRequests = 0;
    let rateLimited = false;

    for (let i = 0; i < 15; i++) {
      if (RateLimiter.isAllowed('test_rate_limit', 10)) {
        passedRequests++;
      } else {
        rateLimited = true;
        break;
      }
    }

    addResult(
      'Rate Limiting',
      rateLimited ? 'pass' : 'fail',
      rateLimited
        ? `Rate limiting working: ${passedRequests}/15 requests allowed`
        : 'Rate limiting failed: all requests passed'
    );

    // Reset for next test
    RateLimiter.resetKey('test_rate_limit');
  };

  const testInputSanitization = () => {
    const maliciousInputs = [
      '<script>alert("xss")</script>',
      'javascript:alert("xss")',
      '<img onerror="alert(1)" src=x>',
      'onload=alert(1)',
    ];

    let allSanitized = true;
    const results: string[] = [];

    maliciousInputs.forEach(input => {
      const sanitized = SecurityValidator.sanitizeInput(input);
      const isSafe = !sanitized.includes('<script>') &&
                     !sanitized.includes('javascript:') &&
                     !sanitized.includes('onerror=') &&
                     !sanitized.includes('onload=');

      if (!isSafe) allSanitized = false;
      results.push(`"${input}" → "${sanitized}"`);
    });

    addResult(
      'Input Sanitization',
      allSanitized ? 'pass' : 'fail',
      allSanitized
        ? 'All malicious inputs successfully sanitized'
        : `Some inputs not properly sanitized: ${results.join(', ')}`
    );
  };

  const testFilenameSanitization = () => {
    const problematicFilenames = [
      '../../../etc/passwd',
      'file<>name.txt',
      'file|name?.txt',
      'very_long_filename_that_exceeds_normal_limits_and_should_be_truncated.txt'.repeat(3)
    ];

    let allSanitized = true;
    const results: string[] = [];

    problematicFilenames.forEach(filename => {
      const sanitized = SecurityValidator.sanitizeFilename(filename);
      const isSafe = !sanitized.includes('../') &&
                     !sanitized.includes('<') &&
                     !sanitized.includes('>') &&
                     sanitized.length <= 100;

      if (!isSafe) allSanitized = false;
      results.push(`"${filename.substring(0, 20)}..." → "${sanitized}"`);
    });

    addResult(
      'Filename Sanitization',
      allSanitized ? 'pass' : 'fail',
      allSanitized
        ? 'All problematic filenames successfully sanitized'
        : `Some filenames not properly sanitized: ${results.join(', ')}`
    );
  };

  const testURLValidation = () => {
    const testURLs = [
      { url: window.location.origin + '/dashboard', expected: true },
      { url: 'https://wordwise-4234.firebaseapp.com/test', expected: true },
      { url: 'https://evil.com/phishing', expected: false },
      { url: 'javascript:alert(1)', expected: false }
    ];

    let allValid = true;
    const results: string[] = [];

    testURLs.forEach(({ url, expected }) => {
      const isValid = SecurityValidator.isSafeRedirectURL(url);
      if (isValid !== expected) allValid = false;
      results.push(`${url} → ${isValid ? 'allowed' : 'blocked'} (expected: ${expected ? 'allowed' : 'blocked'})`);
    });

    addResult(
      'URL Validation',
      allValid ? 'pass' : 'fail',
      allValid
        ? 'All URL validations passed as expected'
        : `Some URL validations failed: ${results.join(', ')}`
    );
  };

  const testFileTypeValidation = () => {
    // Create mock files for testing
    const testFiles = [
      { type: 'image/jpeg', category: 'images' as const, expected: true },
      { type: 'application/pdf', category: 'documents' as const, expected: true },
      { type: 'application/x-executable', category: 'documents' as const, expected: false },
      { type: 'text/javascript', category: 'images' as const, expected: false }
    ];

    let allValid = true;
    const results: string[] = [];

    testFiles.forEach(({ type, category, expected }) => {
      // Create a mock file object
      const mockFile = new File(['test'], 'test.txt', { type });
      const isValid = SecurityValidator.isValidFileType(mockFile, category);

      if (isValid !== expected) allValid = false;
      results.push(`${type} for ${category} → ${isValid ? 'allowed' : 'blocked'} (expected: ${expected ? 'allowed' : 'blocked'})`);
    });

    addResult(
      'File Type Validation',
      allValid ? 'pass' : 'fail',
      allValid
        ? 'All file type validations passed as expected'
        : `Some file type validations failed: ${results.join(', ')}`
    );
  };

  const testFileSizeValidation = () => {
    // Test different file sizes
    const testCases = [
      { size: 1024 * 1024, category: 'PROFILE_IMAGE' as const, expected: true }, // 1MB
      { size: 10 * 1024 * 1024, category: 'PROFILE_IMAGE' as const, expected: false }, // 10MB
      { size: 20 * 1024 * 1024, category: 'DOCUMENT' as const, expected: true }, // 20MB
      { size: 100 * 1024 * 1024, category: 'DOCUMENT' as const, expected: false } // 100MB
    ];

    let allValid = true;
    const results: string[] = [];

    testCases.forEach(({ size, category, expected }) => {
      const mockFile = new File(['x'.repeat(size)], 'test.txt');
      Object.defineProperty(mockFile, 'size', { value: size });

      const isValid = SecurityValidator.isValidFileSize(mockFile, category);

      if (isValid !== expected) allValid = false;
      results.push(`${(size / 1024 / 1024).toFixed(1)}MB for ${category} → ${isValid ? 'allowed' : 'blocked'} (expected: ${expected ? 'allowed' : 'blocked'})`);
    });

    addResult(
      'File Size Validation',
      allValid ? 'pass' : 'fail',
      allValid
        ? 'All file size validations passed as expected'
        : `Some file size validations failed: ${results.join(', ')}`
    );
  };

  const testSecurityMonitoring = () => {
    // Clear existing logs
    SecurityMonitor.clearSecurityLogs();

    // Generate some test events
    SecurityMonitor.logSecurityEvent({
      type: 'auth_success',
      userId: user?.uid,
      details: { action: 'test_login' }
    });

    SecurityMonitor.logSecurityEvent({
      type: 'file_upload',
      userId: user?.uid,
      details: { fileName: 'test.jpg', fileType: 'image/jpeg' }
    });

    SecurityMonitor.logSecurityEvent({
      type: 'suspicious_activity',
      details: { type: 'test_event', description: 'Test suspicious activity' }
    });

    const logs = SecurityMonitor.getSecurityLogs();

    addResult(
      'Security Monitoring',
      logs.length === 3 ? 'pass' : 'fail',
      logs.length === 3
        ? `Security logging working: ${logs.length} events recorded`
        : `Security logging issue: expected 3 events, got ${logs.length}`
    );
  };

  const runAllTests = async () => {
    setIsRunning(true);
    clearResults();

    addResult('Security Tests', 'info', 'Starting comprehensive security test suite...');

    // Run all tests
    testHTTPSEnforcement();
    testUserAuthentication();
    testEmailVerification();
    await testSessionValidation();
    testRateLimiting();
    testInputSanitization();
    testFilenameSanitization();
    testURLValidation();
    testFileTypeValidation();
    testFileSizeValidation();
    testSecurityMonitoring();

    addResult('Security Tests', 'info', 'All security tests completed!');
    setIsRunning(false);
  };

  // Display security configuration
  const showSecurityConfig = () => {
    clearResults();
    addResult('Security Config', 'info', `Session Timeout: ${SECURITY_CONFIG.SESSION_TIMEOUT / 1000 / 60 / 60} hours`);
    addResult('Security Config', 'info', `Email Verification Required: ${SECURITY_CONFIG.REQUIRE_EMAIL_VERIFICATION}`);
    addResult('Security Config', 'info', `Auth Rate Limit: ${SECURITY_CONFIG.RATE_LIMITS.AUTHENTICATION} requests/minute`);
    addResult('Security Config', 'info', `Upload Rate Limit: ${SECURITY_CONFIG.RATE_LIMITS.DOCUMENT_UPLOAD} requests/minute`);
    addResult('Security Config', 'info', `Max Profile Image Size: ${SECURITY_CONFIG.MAX_FILE_SIZES.PROFILE_IMAGE / 1024 / 1024}MB`);
    addResult('Security Config', 'info', `Max Document Size: ${SECURITY_CONFIG.MAX_FILE_SIZES.DOCUMENT / 1024 / 1024}MB`);
    addResult('Security Config', 'info', `Allowed Image Types: ${SECURITY_CONFIG.ALLOWED_FILE_TYPES.IMAGES.join(', ')}`);
  };

  const getStatusIcon = (status: 'pass' | 'fail' | 'info') => {
    switch (status) {
      case 'pass': return '✅';
      case 'fail': return '❌';
      case 'info': return 'ℹ️';
    }
  };

  const getStatusColor = (status: 'pass' | 'fail' | 'info') => {
    switch (status) {
      case 'pass': return 'text-green-600';
      case 'fail': return 'text-red-600';
      case 'info': return 'text-blue-600';
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
          🔒 Security Test Suite
        </h2>

        <div className="space-y-4 mb-6">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={runAllTests}
              disabled={isRunning}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white px-4 py-2 rounded-md font-medium transition-colors"
            >
              {isRunning ? '🔄 Running Tests...' : '🧪 Run All Security Tests'}
            </button>

            <button
              onClick={showSecurityConfig}
              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md font-medium transition-colors"
            >
              📋 Show Security Config
            </button>

            <button
              onClick={clearResults}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md font-medium transition-colors"
            >
              🗑️ Clear Results
            </button>
          </div>

          <div className="text-sm text-gray-600">
            <strong>Current User:</strong> {user?.email || 'Not authenticated'} |
            <strong> Connection:</strong> {HTTPSEnforcer.isSecureConnection() ? 'Secure (HTTPS/localhost)' : 'Insecure (HTTP)'} |
            <strong> Security Logs:</strong> {SecurityMonitor.getSecurityLogs().length} events
          </div>
        </div>

        {/* Test Results */}
        <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
          <h3 className="font-semibold text-gray-700 mb-3">Test Results:</h3>

          {results.length === 0 ? (
            <p className="text-gray-500 italic">No tests run yet. Click "Run All Security Tests" to start.</p>
          ) : (
            <div className="space-y-2">
              {results.map((result, index) => (
                <div key={index} className="flex items-start space-x-3 text-sm">
                  <span className="text-lg">{getStatusIcon(result.status)}</span>
                  <div className="flex-1">
                    <span className="font-medium text-gray-800">{result.test}:</span>{' '}
                    <span className={getStatusColor(result.status)}>{result.message}</span>
                    <div className="text-xs text-gray-400 mt-1">
                      {result.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security Features Summary */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-semibold text-blue-800 mb-2">🛡️ Implemented Security Features:</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• HTTPS enforcement (production)</li>
            <li>• User authentication validation</li>
            <li>• Session token verification</li>
            <li>• Rate limiting for auth and uploads</li>
            <li>• Input sanitization (XSS prevention)</li>
            <li>• Filename sanitization</li>
            <li>• Safe URL validation</li>
            <li>• File type and size validation</li>
            <li>• Security event monitoring</li>
            <li>• Content Security Policy headers</li>
            <li>• Security headers (HSTS, X-Frame-Options, etc.)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SecurityTest;

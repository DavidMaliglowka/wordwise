# WordWise AI - Grammar Check Cloud Functions

## 🚀 Overview

This directory contains Firebase Cloud Functions for the WordWise AI grammar and spell check functionality, powered by OpenAI's GPT-4o model.

## 📋 Features

- **Grammar & Spell Check**: AI-powered text analysis using OpenAI GPT-4o
- **Real-time Streaming**: Server-sent events for live feedback
- **Smart Caching**: SHA-256 hash-based caching to reduce API costs
- **Authentication**: Firebase Auth token verification
- **Error Handling**: Comprehensive error handling and logging
- **Performance Monitoring**: Detailed metrics and cache statistics

## 🛠️ Setup & Deployment

### 1. Install Dependencies

```bash
cd functions
pnpm install
```

### 2. Configure OpenAI API Key

Set your OpenAI API key using Firebase functions config:

```bash
firebase functions:config:set openai.key="your-openai-api-key-here"
```

Verify the configuration:

```bash
firebase functions:config:get
```

### 3. Build and Deploy

```bash
# Build the functions
pnpm run build

# Deploy to Firebase
pnpm run deploy

# Or deploy only functions
firebase deploy --only functions
```

### 4. Local Development

For local testing with Firebase emulators:

```bash
# Start the emulator
pnpm run serve

# The function will be available at:
# http://localhost:5001/your-project/us-central1/checkGrammar
```

## 📡 API Reference

### Grammar Check Endpoint

**POST** `/checkGrammar`

Analyzes text for grammar, spelling, and style issues.

#### Request Headers
```
Content-Type: application/json
Authorization: Bearer <firebase-auth-token>
```

#### Request Body
```typescript
{
  text: string;              // Text to analyze (max 10,000 chars)
  language?: string;         // Language code (default: 'en')
  includeSpelling?: boolean; // Include spelling checks (default: true)
  includeGrammar?: boolean;  // Include grammar checks (default: true)
  includeStyle?: boolean;    // Include style suggestions (default: false)
  stream?: boolean;          // Enable streaming response (default: false)
}
```

#### Response (Non-streaming)
```typescript
{
  success: boolean;
  data: {
    suggestions: GrammarSuggestion[];
    processedText: string;
    cached: boolean;
    processingTimeMs: number;
  }
}
```

#### Response (Streaming)
Server-sent events with the following message types:
- `chunk`: Partial content from OpenAI
- `complete`: Final result with suggestions
- `error`: Error message

#### GrammarSuggestion Interface
```typescript
{
  range: {
    start: number;    // Character position start
    end: number;      // Character position end
  };
  type: 'grammar' | 'spelling' | 'punctuation' | 'style';
  original: string;   // Original text
  proposed: string;   // Suggested correction
  explanation: string; // Explanation of the issue
  confidence: number; // Confidence score (0-1)
}
```

## 🧪 Testing

### Manual Testing with curl

```bash
# Test the grammar check endpoint
curl -X POST \
  https://your-project.cloudfunctions.net/checkGrammar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -d '{
    "text": "She dont like apples.",
    "includeSpelling": true,
    "includeGrammar": true
  }'
```

### Testing with Firebase Emulator

```bash
# Start the emulator
firebase emulators:start --only functions

# Test locally
curl -X POST \
  http://localhost:5001/your-project/us-central1/checkGrammar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -d '{
    "text": "This is a test sentance with a spelling eror.",
    "includeSpelling": true,
    "includeGrammar": true
  }'
```

## 📊 Performance & Caching

### Cache Strategy
- **Cache Key**: SHA-256 hash of `text + options`
- **TTL**: 1 hour (configurable)
- **Storage**: In-memory (NodeCache)
- **Cleanup**: Automatic expiration handling

### Cache Statistics
Monitor cache performance via logs:
```javascript
// Cache hit example
{
  "message": "Grammar check served from cache",
  "uid": "user123",
  "textLength": 42,
  "suggestionsCount": 2,
  "cacheKey": "abc123def456..."
}
```

### Performance Metrics
- **Processing Time**: Measured end-to-end
- **Cache Hit Rate**: Percentage of requests served from cache
- **API Usage**: OpenAI token consumption tracking

## 🔧 Configuration

### Environment Variables (Functions Config)
```bash
# Required
openai.key=your-openai-api-key

# Optional
openai.model=gpt-4o                    # Model to use (default: gpt-4o)
openai.max_tokens=1000                 # Max response tokens (default: 1000)
openai.temperature=0.1                 # Model temperature (default: 0.1)
```

### Cache Configuration
Modify `functions/src/utils/cache.ts`:
```typescript
const cache = new NodeCache({
  stdTTL: 3600,      // 1 hour TTL
  checkperiod: 120,  // Check every 2 minutes
  useClones: false   // Performance optimization
});
```

## 🚨 Error Handling

The API handles various error scenarios:

### Authentication Errors
- **401 Unauthorized**: Invalid Firebase token
- **403 Forbidden**: User access denied

### Validation Errors
- **400 Bad Request**: Invalid request body
- **413 Payload Too Large**: Text exceeds 10k characters

### OpenAI API Errors
- **401**: OpenAI authentication failed
- **429**: Rate limit exceeded
- **400**: Invalid request to OpenAI
- **500**: Generic OpenAI error

### System Errors
- **500 Internal Server Error**: Function execution error

## 📝 Logging

### Log Levels
- **INFO**: Normal operations, cache hits/misses
- **WARN**: Non-critical issues, invalid responses
- **ERROR**: Critical errors, API failures

### Sample Log Entries
```javascript
// Successful request
{
  "severity": "INFO",
  "message": "Grammar check completed",
  "uid": "user123",
  "textLength": 150,
  "suggestionsCount": 3,
  "processingTimeMs": 2500,
  "cacheKey": "abc123..."
}

// Cache hit
{
  "severity": "INFO",
  "message": "Grammar check served from cache",
  "uid": "user123",
  "cacheHit": true,
  "processingTimeMs": 5
}

// Error
{
  "severity": "ERROR",
  "message": "OpenAI API error",
  "error": "Rate limit exceeded",
  "uid": "user123"
}
```

## 📁 File Structure

```
functions/
├── src/
│   ├── index.ts              # Main function definitions
│   ├── types/
│   │   └── grammar.ts        # TypeScript interfaces
│   ├── utils/
│   │   ├── openai.ts         # OpenAI integration
│   │   └── cache.ts          # Caching utilities
│   └── test/
│       └── grammar.test.ts   # Test suite
├── package.json              # Dependencies
└── README.md                 # This file
```

## 🔒 Security Considerations

1. **API Key Security**: OpenAI keys stored in Firebase config
2. **Authentication**: All requests require valid Firebase tokens
3. **Input Validation**: Comprehensive request validation
4. **Rate Limiting**: Respect OpenAI rate limits
5. **Error Disclosure**: Sanitized error messages

## 💰 Cost Optimization

1. **Caching**: Reduces OpenAI API calls by ~70-80%
2. **Token Limits**: Configurable max tokens per request
3. **Batch Processing**: Future enhancement opportunity
4. **Model Selection**: GPT-4o balances cost and quality

## 🚀 Future Enhancements

- [ ] Batch processing for multiple documents
- [ ] Custom dictionary support
- [ ] Language-specific improvements
- [ ] Advanced style analysis
- [ ] Webhook notifications
- [ ] Analytics dashboard

## 📞 Support

For issues or questions:
1. Check function logs in Firebase Console
2. Verify OpenAI API key configuration
3. Test with Firebase emulator locally
4. Review error codes and messages

## 📄 License

This project is part of WordWise AI and follows the main project license.

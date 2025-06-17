# WordWise AI - Writing Assistant

WordWise AI is an intelligent writing assistant designed for business communications, featuring real-time grammar suggestions, tone analysis, and brand voice consistency.

## What is inside?

This project uses many tools like:

- [Vite](https://vitejs.dev)
- [ReactJS](https://reactjs.org)
- [TypeScript](https://www.typescriptlang.org)
- [Vitest](https://vitest.dev)
- [Testing Library](https://testing-library.com)
- [Tailwindcss](https://tailwindcss.com)
- [Eslint](https://eslint.org)
- [Prettier](https://prettier.io)

## Getting Started

### Install

Install dependencies.

```bash
pnpm install
```

Serve with hot reload at <http://localhost:5173>.

```bash
pnpm run dev
```

### Lint

```bash
pnpm run lint
```

### Typecheck

```bash
pnpm run typecheck
```

### Build

```bash
pnpm run build
```

### Deploy to Production

Build and deploy to Firebase Hosting:

```bash
pnpm run build
firebase deploy --only hosting
```

### Test

```bash
pnpm run test
```

View and interact with your tests via UI.

```bash
pnpm run test:ui
```

## Development Testing

The application includes development-only testing utilities for the infinite scroll functionality in the Documents Dashboard.

### Testing Infinite Scroll

1. **Start the development server:**
   ```bash
   pnpm run dev
   ```

2. **Open the application** in your browser (typically `http://localhost:5173`)

3. **Sign in** to access the Documents Dashboard

4. **Open Developer Console** (F12 → Console tab)

5. **Create test documents:**
   ```javascript
   // Create 25 test documents
   createTestDocuments(25)

   // Or create a custom amount
   createTestDocuments(50)

   // Create a single test document for debugging
   createSingleTestDocument()
   ```

6. **Refresh the page** after creation completes

7. **Test infinite scroll** by scrolling down - new documents should load automatically when you approach the bottom

8. **Clean up test data** when finished:
   ```javascript
   // Recommended - simple cleanup
   simpleDeleteAllDocuments()

   // Alternative - complex cleanup (deletes related data)
   deleteAllDocuments()
   ```

### Security Note

These testing functions are:
- **Development-only**: Only available when `NODE_ENV === 'development'`
- **User-scoped**: Only operate on the authenticated user's documents
- **Firestore-protected**: Subject to all security rules
- **Automatically removed**: Not available in production builds

### Infinite Scroll Configuration

- **Development batch size**: 8 documents per load (for easier testing)
- **Production batch size**: 20 documents per load
- **Trigger distance**: 100px from bottom
- **Fallback**: "Load More" button if Intersection Observer fails

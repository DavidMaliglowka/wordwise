# WordWise AI - Cursor Context Primer

Please analyze the @/wordwise directory to understand this AI-powered writing assistant project. Here's what to focus on:

## Project Overview
WordWise AI is an AI-first writing assistant for marketing professionals, providing real-time grammar checking, brand voice consistency, and content optimization. Read @/.taskmaster/docs/prd.txt for complete product requirements.

## Key Architecture & Tech Stack
- **Frontend**: React 18 + Vite + TypeScript, Zustand state management, React Query
- **Editor**: Lexical rich-text editor with custom suggestion overlays
- **Backend**: Firebase (Auth, Firestore, Cloud Functions)
- **AI**: OpenAI GPT-4o integration for grammar checking and content generation
- **Styling**: Tailwind CSS with custom design system

## Critical Files to Review

### Core Application Structure
- `src/components/App.tsx` - Main application component
- `src/components/editor/LexicalEditor.tsx` - Rich text editor implementation
- `src/components/layout/DashboardLayout.tsx` - Main layout wrapper
- `src/pages/DocumentEditor.tsx` - Document editing interface
- `src/pages/DocumentsDashboard.tsx` - Document management interface

### Services & State Management
- `src/services/grammar.ts` - AI grammar checking service
- `src/services/documents.ts` - Document CRUD operations
- `src/services/firestore.ts` - Firestore database interface
- `src/contexts/AuthContext.tsx` - Authentication state management
- `src/hooks/useGrammarCheck.ts` - Grammar checking hook

### Firebase Configuration
- `firebase.json` - Firebase project configuration
- `firestore.rules` - Database security rules
- `storage.rules` - File storage security rules
- `functions/src/index.ts` - Cloud Functions entry point

### Type Definitions
- `src/types/grammar.ts` - Grammar checking types
- `src/types/firestore.ts` - Database schema types
- `functions/src/types/grammar.ts` - Backend grammar types

## Development Context

### Current Status
This project uses Taskmaster for task management. Check `.taskmaster/` directory for:
- Current tasks and development roadmap
- Project configuration and AI model settings
- Development workflow documentation

### Key Features Implemented
1. Firebase authentication system
2. Rich text editor with Lexical
3. Real-time grammar checking with AI
4. Document storage and management
5. Responsive design with Tailwind CSS

### Key Features In Development
Review current Taskmaster tasks for active development priorities.

## Development Guidelines

### Code Patterns
- Follow TypeScript strict mode
- Use functional components with hooks
- Implement proper error boundaries
- Use Zustand for state management
- Follow Firebase security best practices

### File Organization
- Components organized by feature (auth, editor, layout)
- Services handle external API calls
- Hooks contain reusable stateful logic
- Types are shared between frontend and backend

### Testing Strategy
- Component tests in `__tests__` directories
- Test utilities in `src/components/test/`
- Firebase emulator for integration testing

## Questions to Consider
1. What specific functionality are you working on?
2. Are you focusing on frontend UI, backend services, or AI integration?
3. Do you need to understand the Firebase architecture or just the React components?
4. Are you implementing new features or debugging existing functionality?

## Getting Started
1. Review the PRD at @/.taskmaster/docs/prd.txt for product context
2. Check current Taskmaster tasks for development priorities
3. Examine the main App.tsx and routing structure
4. Look at the editor implementation in src/components/editor/
5. Understand the Firebase integration in src/lib/firebase.ts

